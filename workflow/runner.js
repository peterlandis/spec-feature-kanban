/**
 * Background Cursor runs: one active run per feature (concurrent runs across features).
 */

import {
  STATUS_BLOCKED,
  STATUS_PAUSED,
  STATUS_PLAN_REVIEW,
  STATUS_PLANNING,
  STATUS_TESTING,
  STATUS_WIP,
  resolveArtifactPaths,
  resolveGitRoot,
  toSpecRelativePath,
} from './artifacts.js';
import {
  cancelCursorRun,
  describeCursorError,
  disposeAgent,
  isCursorConfigured,
  resolveCursorModel,
  startCursorRun,
} from './cursor-adapter.js';
import { implementPrompt, planningPrompt, revisionPrompt } from './prompts.js';
import {
  appendTranscript,
  clearActiveRun,
  findActiveRunForFeature,
  getFeatureWorkflow,
  setActiveRun,
  updateFeatureWorkflow,
} from './state.js';
import { ensureFeatureBranch } from './git.js';

const liveRuns = new Map();

const PLAN_TOOLS = ['read', 'edit'];
const IMPLEMENT_TOOLS = ['read', 'edit', 'shell'];

export function requireCursorConfigured() {
  if (!isCursorConfigured()) {
    throw new Error('CURSOR_API_KEY is not set. Save a key in Cursor settings in the app, or export it in the terminal.');
  }
}

export function getRepoCwd(featuresAbsPath) {
  return resolveGitRoot(featuresAbsPath);
}

function artifactRefs(specRoot, feature) {
  const paths = resolveArtifactPaths(specRoot, feature);
  return {
    planRel: toSpecRelativePath(specRoot, paths.planPath || paths.defaultPlanPath),
    tasksRel: toSpecRelativePath(specRoot, paths.tasksPath || paths.defaultTasksPath),
    reviewRel: toSpecRelativePath(specRoot, paths.reviewPath),
    completionRel: toSpecRelativePath(specRoot, paths.completionPath),
  };
}

function clip(value, max) {
  const text = typeof value === 'string' ? value : (value == null ? '' : JSON.stringify(value));
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function transcriptFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'thinking' && event.text) {
    return { kind: 'thinking', title: 'Thinking', text: clip(event.text, 2000) };
  }
  if (event.type === 'assistant' && event.message && Array.isArray(event.message.content)) {
    let text = '';
    for (const block of event.message.content) {
      if (block && block.type === 'text' && block.text) text += block.text;
    }
    if (!text) return null;
    return { kind: 'assistant', title: 'Assistant', text: clip(text, 4000) };
  }
  if (event.type === 'tool_call') {
    const name = event.name || 'tool';
    const status = event.status || 'running';
    const detail = event.result != null ? event.result : event.args;
    return { kind: 'tool', title: `${name} · ${status}`, text: clip(detail, 800) };
  }
  if (event.type === 'status') {
    return { kind: 'status', title: event.status || 'status', text: clip(event.message, 500) };
  }
  if (event.type === 'task' && (event.text || event.status)) {
    return { kind: 'status', title: event.status || 'task', text: clip(event.text, 800) };
  }
  if (event.type === 'system') {
    return { kind: 'status', title: 'Agent ready', text: clip(event.model && event.model.id ? event.model.id : '', 200) };
  }
  return null;
}

function recordEvent(specRoot, featureId, event) {
  const entry = transcriptFromEvent(event);
  if (entry) appendTranscript(specRoot, featureId, entry);
}

async function finishLive(featureId) {
  const live = liveRuns.get(featureId);
  if (!live) return;
  liveRuns.delete(featureId);
  await disposeAgent(live.agent);
}

export function assertNoActiveRun(specRoot, featureId) {
  const active = findActiveRunForFeature(specRoot, featureId);
  if (active) {
    throw new Error(`A Cursor run is already active for ${featureId}.`);
  }
  if (liveRuns.has(featureId)) {
    throw new Error(`A Cursor run is already active for ${featureId}.`);
  }
}

async function executeKind({ specRoot, feature, cwd, kind, prompt, tools, model, onFinishedStatus }) {
  requireCursorConfigured();
  assertNoActiveRun(specRoot, feature.featureId);

  const existing = getFeatureWorkflow(specRoot, feature.featureId) || {};
  const preferred = String(model || existing.preferredModel || '').trim();
  const resolvedModel = resolveCursorModel(preferred);
  const branchInfo = ensureFeatureBranch(cwd, feature.featureId);
  updateFeatureWorkflow(specRoot, feature.featureId, {
    backend: 'cursor-local',
    preferredModel: preferred || null,
    model: resolvedModel,
    agentId: existing.agentId || null,
    kind,
    runStatus: 'starting',
    branch: branchInfo.branch,
    lastError: null,
    lastAssistantText: '',
    transcript: [],
  });
  if (branchInfo.created) {
    appendTranscript(specRoot, feature.featureId, {
      kind: 'status',
      title: 'Branch',
      text: `Created and checked out ${branchInfo.branch}.`,
    });
  } else if (branchInfo.switched) {
    appendTranscript(specRoot, feature.featureId, {
      kind: 'status',
      title: 'Branch',
      text: `Checked out ${branchInfo.branch}.`,
    });
  } else if (branchInfo.warning) {
    appendTranscript(specRoot, feature.featureId, {
      kind: 'status',
      title: 'Branch',
      text: branchInfo.warning,
    });
  }
  appendTranscript(specRoot, feature.featureId, {
    kind: 'status',
    title: 'Starting',
    text: `Launching local Cursor agent (${resolvedModel}) for ${kind}…`,
  });
  const started = await startCursorRun({
    agentId: existing.agentId || null,
    cwd,
    prompt,
    tools,
    model: resolvedModel,
  });
  const workerNote = started.workerNode && started.workerNode.version
    ? ` Using ${started.workerNode.version} for the Cursor SDK worker.`
    : '';
  appendTranscript(specRoot, feature.featureId, {
    kind: 'status',
    title: 'Agent process',
    text: `Cursor agent child process started.${workerNote} Waiting for thinking and tool events…`,
  });

  setActiveRun(specRoot, {
    featureId: feature.featureId,
    agentId: started.agentId,
    runId: started.runId,
    kind,
  });
  updateFeatureWorkflow(specRoot, feature.featureId, {
    backend: 'cursor-local',
    model: resolvedModel,
    agentId: started.agentId,
    runId: started.runId,
    kind,
    runStatus: 'running',
    lastError: null,
    lastAssistantText: '',
  });

  liveRuns.set(feature.featureId, { run: started.run, agent: started.agent, cwd });

  (async () => {
    try {
      if (started.run.stream) {
        for await (const event of started.run.stream()) {
          recordEvent(specRoot, feature.featureId, event);
        }
      }
    } catch {
      // wait() is the source of truth
    }
  })();

  try {
    const result = await started.run.wait();
    const lastText = result.result || '';
    if (result.status === 'cancelled') {
      appendTranscript(specRoot, feature.featureId, {
        kind: 'status',
        title: 'Cancelled',
        text: lastText || 'Run cancelled.',
      });
      updateFeatureWorkflow(specRoot, feature.featureId, {
        runStatus: 'cancelled',
        lastAssistantText: lastText || existing.lastAssistantText || '',
      });
      return { status: 'cancelled' };
    }
    if (result.status === 'error') {
      const message = (result.error && result.error.message) || 'Cursor run failed';
      appendTranscript(specRoot, feature.featureId, { kind: 'error', title: 'Error', text: message });
      updateFeatureWorkflow(specRoot, feature.featureId, {
        runStatus: 'error',
        lastError: message,
        lastAssistantText: lastText,
      });
      return { status: 'error' };
    }
    appendTranscript(specRoot, feature.featureId, {
      kind: 'status',
      title: 'Finished',
      text: lastText || 'Run finished.',
    });
    updateFeatureWorkflow(specRoot, feature.featureId, {
      runStatus: 'finished',
      lastAssistantText: lastText,
      lastError: null,
    });
    return { status: 'finished', nextStatus: onFinishedStatus };
  } catch (err) {
    const described = describeCursorError(err);
    appendTranscript(specRoot, feature.featureId, {
      kind: 'error',
      title: 'Error',
      text: described.message,
    });
    updateFeatureWorkflow(specRoot, feature.featureId, {
      runStatus: 'error',
      lastError: described.message,
    });
    return { status: 'error' };
  } finally {
    clearActiveRun(specRoot, feature.featureId);
    await finishLive(feature.featureId);
  }
}

export function startPlanningRun({ specRoot, feature, featuresAbsPath, updateFeatureStatus, model }) {
  const cwd = getRepoCwd(featuresAbsPath);
  const prompt = planningPrompt(feature, artifactRefs(specRoot, feature));
  updateFeatureStatus(STATUS_PLANNING);
  executeKind({
    specRoot,
    feature,
    cwd,
    kind: 'planning',
    prompt,
    tools: PLAN_TOOLS,
    model,
    onFinishedStatus: STATUS_PLAN_REVIEW,
  }).then((outcome) => {
    if (outcome.status === 'finished') updateFeatureStatus(STATUS_PLAN_REVIEW);
    else if (outcome.status === 'cancelled') updateFeatureStatus(STATUS_PAUSED);
    else updateFeatureStatus(STATUS_BLOCKED);
  }).catch((err) => {
    updateFeatureWorkflow(specRoot, feature.featureId, {
      runStatus: 'error',
      lastError: err.message,
    });
    updateFeatureStatus(STATUS_BLOCKED);
  });
}

export function startRevisionRun({ specRoot, feature, featuresAbsPath, note, updateFeatureStatus, model }) {
  const cwd = getRepoCwd(featuresAbsPath);
  const prompt = revisionPrompt(feature, note);
  updateFeatureStatus(STATUS_PLANNING);
  executeKind({
    specRoot,
    feature,
    cwd,
    kind: 'revise',
    prompt,
    tools: PLAN_TOOLS,
    model,
    onFinishedStatus: STATUS_PLAN_REVIEW,
  }).then((outcome) => {
    if (outcome.status === 'finished') updateFeatureStatus(STATUS_PLAN_REVIEW);
    else if (outcome.status === 'cancelled') updateFeatureStatus(STATUS_PLAN_REVIEW);
    else updateFeatureStatus(STATUS_BLOCKED);
  }).catch((err) => {
    updateFeatureWorkflow(specRoot, feature.featureId, {
      runStatus: 'error',
      lastError: err.message,
    });
    updateFeatureStatus(STATUS_BLOCKED);
  });
}

export function startImplementRun({ specRoot, feature, featuresAbsPath, updateFeatureStatus, model }) {
  const cwd = getRepoCwd(featuresAbsPath);
  const prompt = implementPrompt(feature, artifactRefs(specRoot, feature));
  updateFeatureStatus(STATUS_WIP);
  executeKind({
    specRoot,
    feature,
    cwd,
    kind: 'implement',
    prompt,
    tools: IMPLEMENT_TOOLS,
    model,
    onFinishedStatus: STATUS_TESTING,
  }).then((outcome) => {
    if (outcome.status === 'finished') updateFeatureStatus(STATUS_TESTING);
    else if (outcome.status === 'cancelled') updateFeatureStatus(STATUS_PAUSED);
    else updateFeatureStatus(STATUS_BLOCKED);
  }).catch((err) => {
    updateFeatureWorkflow(specRoot, feature.featureId, {
      runStatus: 'error',
      lastError: err.message,
    });
    updateFeatureStatus(STATUS_BLOCKED);
  });
}

export async function cancelFeatureRun(specRoot, featureId, featuresAbsPath) {
  const live = liveRuns.get(featureId);
  const active = findActiveRunForFeature(specRoot, featureId);
  if (live) {
    await cancelCursorRun(live.run, { runId: live.run.id, cwd: live.cwd });
    return;
  }
  if (active && active.runId) {
    await cancelCursorRun(null, {
      runId: active.runId,
      cwd: getRepoCwd(featuresAbsPath),
    });
  }
}
