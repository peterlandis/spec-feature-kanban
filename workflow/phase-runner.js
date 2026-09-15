/**
 * Sequential overnight phase runner (CORE-031).
 * One feature at a time — feature branches cannot be checked out in parallel.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  checkPlanApprovalBoxes,
  resolveArtifactPaths,
  resolveGitRoot,
  scaffoldArtifacts,
  toSpecRelativePath,
  writeText,
} from './artifacts.js';
import {
  getPhase,
  normalizePhaseModels,
  setActivePhaseId,
  updatePhase,
  updatePhaseItem,
} from './phases.js';
import {
  findActiveRun,
  getFeatureWorkflow,
  updateFeatureWorkflow,
} from './state.js';
import {
  requireCursorConfigured,
  startImplementRun,
  startPlanningRun,
} from './runner.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let activeJob = null;

function runGit(cwd, args, { allowFail = false } = {}) {
  try {
    const raw = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: String(raw || '').trim() };
  } catch (err) {
    if (allowFail) {
      return {
        ok: false,
        stdout: String(err.stdout || '').trim(),
        stderr: String(err.stderr || err.message || '').trim(),
      };
    }
    throw new Error(String(err.stderr || err.stdout || err.message || 'git failed').trim());
  }
}

async function waitForRunSettled(specRoot, featureId, { timeoutMs = 1000 * 60 * 90, signal } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal && signal.cancelled) {
      throw new Error('Phase run cancelled.');
    }
    const wf = getFeatureWorkflow(specRoot, featureId) || {};
    const status = wf.runStatus || '';
    if (status === 'finished' || status === 'error' || status === 'cancelled') {
      return wf;
    }
    // Also settle if no active run and not starting/running.
    const active = findActiveRun(specRoot);
    if (!active && status !== 'starting' && status !== 'running') {
      return wf;
    }
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for ${featureId} agent run.`);
}

function commitPhaseWork(cwd, featuresAbsPath, specRoot, feature, step) {
  if (!cwd) return { committed: false, reason: 'no-git' };
  const paths = resolveArtifactPaths(specRoot, feature);
  const candidates = [
    featuresAbsPath,
    paths.planPath,
    paths.tasksPath,
    paths.defaultPlanPath,
    paths.defaultTasksPath,
    paths.completionPath,
    paths.reviewPath,
  ].filter(Boolean);

  const relFiles = [];
  for (const abs of candidates) {
    if (!abs || !fs.existsSync(abs)) continue;
    const rel = path.relative(cwd, abs);
    if (!rel || rel.startsWith('..')) continue;
    relFiles.push(rel);
  }
  if (!relFiles.length) return { committed: false, reason: 'nothing' };

  for (const rel of relFiles) {
    runGit(cwd, ['add', '--', rel], { allowFail: true });
  }
  const staged = runGit(cwd, ['diff', '--cached', '--name-only'], { allowFail: true });
  if (!staged.ok || !staged.stdout.trim()) {
    return { committed: false, reason: 'clean' };
  }
  const message = `Phase ${feature.featureId}: ${step}`;
  runGit(cwd, ['commit', '-m', message]);
  return { committed: true, files: staged.stdout.trim().split('\n').filter(Boolean) };
}

export function getPhaseRunnerStatus() {
  if (!activeJob) return { running: false };
  return {
    running: true,
    phaseId: activeJob.phaseId,
    cancelled: Boolean(activeJob.signal.cancelled),
  };
}

export function cancelPhaseRunner() {
  if (!activeJob) return false;
  activeJob.signal.cancelled = true;
  return true;
}

/**
 * @param {object} deps
 * @param {string} deps.specRoot
 * @param {string} deps.featuresAbsPath
 * @param {string} deps.phaseId
 * @param {string} deps.mode
 * @param {(featureId: string) => object|null} deps.loadFeature
 * @param {(featureId: string, fields: object) => void} deps.updateFeatureFields
 * @param {(parsed: object, preamble: string, postamble: string) => void} [deps.saveRegistryHook]
 */
export async function runPhaseJob(deps) {
  const {
    specRoot,
    featuresAbsPath,
    phaseId,
    mode,
    models: modelsInput,
    loadFeature,
    updateFeatureFields,
  } = deps;

  if (activeJob) {
    throw new Error('A phase is already running.');
  }
  requireCursorConfigured();
  const cwd = resolveGitRoot(featuresAbsPath);
  if (!cwd) {
    throw new Error('Phased runs need a git repository. Point FEATURES.md at a git project first.');
  }

  const phase = getPhase(specRoot, phaseId);
  if (!phase) throw new Error(`Phase ${phaseId} not found.`);
  if (phase.status === 'running') throw new Error('This phase is already marked running.');

  const runMode = mode === 'plan-implement' || phase.mode === 'plan-implement'
    ? 'plan-implement'
    : 'plan';
  const models = normalizePhaseModels({
    ...(phase.models || {}),
    ...(modelsInput || {}),
  });
  const signal = { cancelled: false };
  activeJob = { phaseId, signal };
  setActivePhaseId(specRoot, phaseId);
  updatePhase(specRoot, phaseId, {
    status: 'running',
    mode: runMode,
    models,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    currentFeatureId: null,
  });

  try {
    for (const item of phase.items || []) {
      if (signal.cancelled) throw new Error('Phase run cancelled.');
      const featureId = item.featureId;
      let feature = loadFeature(featureId);
      if (!feature) {
        updatePhaseItem(specRoot, phaseId, featureId, {
          status: 'failed',
          error: 'Feature not found in registry',
          finishedAt: new Date().toISOString(),
        });
        continue;
      }

      updatePhase(specRoot, phaseId, { currentFeatureId: featureId });
      updatePhaseItem(specRoot, phaseId, featureId, {
        status: 'running',
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
      });

      try {
        const existing = getFeatureWorkflow(specRoot, featureId) || {};
        const status = String(feature.status || '');
        const alreadyDone = status.includes('Complete')
          || status.includes('Testing')
          || status.includes('ReadyToMerge');
        const needsPlan = !alreadyDone
          && !existing.planApprovedAt
          && !status.includes('PlanReview')
          && !status.includes('WorkInProgress');

        if (needsPlan) {
          updatePhaseItem(specRoot, phaseId, featureId, { step: 'planning' });
          const { paths } = scaffoldArtifacts(specRoot, feature);
          updateFeatureFields(featureId, {
            planDocument: toSpecRelativePath(specRoot, paths.planPath),
          });
          feature = loadFeature(featureId) || feature;

          const planModel = models.plan
            || existing.preferredModel
            || '';
          const planOutcome = await startPlanningRun({
            specRoot,
            feature,
            featuresAbsPath,
            model: planModel,
            updateFeatureStatus: (nextStatus) => updateFeatureFields(featureId, { status: nextStatus }),
          });
          const settled = await waitForRunSettled(specRoot, featureId, { signal });
          if ((planOutcome && planOutcome.status === 'error') || settled.runStatus === 'error') {
            throw new Error(settled.lastError || `Planning failed for ${featureId}`);
          }
          if (settled.runStatus === 'cancelled' || (planOutcome && planOutcome.status === 'cancelled')) {
            throw new Error(`Planning cancelled for ${featureId}`);
          }
          commitPhaseWork(cwd, featuresAbsPath, specRoot, feature, 'planning artifacts');
        }

        if (runMode === 'plan-implement' && !alreadyDone) {
          feature = loadFeature(featureId) || feature;
          let workflow = getFeatureWorkflow(specRoot, featureId) || {};
          const st = String(feature.status || '');
          if (!st.includes('Testing') && !st.includes('ReadyToMerge') && !st.includes('Complete')) {
            if (!workflow.planApprovedAt) {
              updatePhaseItem(specRoot, phaseId, featureId, { step: 'approve-plan' });
              const paths = resolveArtifactPaths(specRoot, feature);
              const tasksPath = paths.tasksPath || paths.defaultTasksPath;
              if (!tasksPath || !fs.existsSync(tasksPath)) {
                throw new Error(`No tasks file for ${featureId}; cannot auto-approve.`);
              }
              const currentTasks = fs.readFileSync(tasksPath, 'utf-8');
              writeText(tasksPath, checkPlanApprovalBoxes(currentTasks));
              updateFeatureWorkflow(specRoot, featureId, {
                stage: 'planApproved',
                planApprovedAt: new Date().toISOString(),
              });
            }

            updatePhaseItem(specRoot, phaseId, featureId, { step: 'implement' });
            feature = loadFeature(featureId) || feature;
            const implModel = models.implement
              || (getFeatureWorkflow(specRoot, featureId) || {}).preferredModel
              || '';
            // Persist review preference for later security/review agents.
            if (models.review) {
              updateFeatureWorkflow(specRoot, featureId, {
                reviewModel: models.review,
              });
            }
            const implOutcome = await startImplementRun({
              specRoot,
              feature,
              featuresAbsPath,
              model: implModel,
              updateFeatureStatus: (nextStatus) => updateFeatureFields(featureId, { status: nextStatus }),
            });
            const settled = await waitForRunSettled(specRoot, featureId, { signal });
            if ((implOutcome && implOutcome.status === 'error') || settled.runStatus === 'error') {
              throw new Error(settled.lastError || `Implementation failed for ${featureId}`);
            }
            if (settled.runStatus === 'cancelled' || (implOutcome && implOutcome.status === 'cancelled')) {
              throw new Error(`Implementation cancelled for ${featureId}`);
            }
            commitPhaseWork(cwd, featuresAbsPath, specRoot, feature, 'implementation artifacts');
          }
        }

        updatePhaseItem(specRoot, phaseId, featureId, {
          status: 'done',
          step: runMode === 'plan-implement' ? 'ready-for-review' : 'plan-review',
          finishedAt: new Date().toISOString(),
          error: null,
        });
      } catch (err) {
        updatePhaseItem(specRoot, phaseId, featureId, {
          status: 'failed',
          error: err.message || String(err),
          finishedAt: new Date().toISOString(),
        });
        updatePhase(specRoot, phaseId, {
          status: 'failed',
          error: err.message || String(err),
          currentFeatureId: featureId,
          finishedAt: new Date().toISOString(),
        });
        throw err;
      }
    }

    updatePhase(specRoot, phaseId, {
      status: 'complete',
      currentFeatureId: null,
      error: null,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const current = getPhase(specRoot, phaseId);
    if (current && current.status === 'running') {
      updatePhase(specRoot, phaseId, {
        status: signal.cancelled ? 'cancelled' : 'failed',
        error: err.message || String(err),
        finishedAt: new Date().toISOString(),
      });
    }
    throw err;
  } finally {
    setActivePhaseId(specRoot, null);
    activeJob = null;
  }
}
