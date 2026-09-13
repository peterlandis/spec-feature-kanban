/**
 * Sidecar workflow state. Not stored in FEATURES.md.
 */

import fs from 'fs';
import path from 'path';

export function workflowStatePath(specRoot) {
  return path.join(path.dirname(specRoot), '.features-workflow.json');
}

function emptyState() {
  return { features: {}, activeRuns: {} };
}

function normalizeActiveRuns(parsed) {
  const activeRuns = {};
  if (parsed.activeRuns && typeof parsed.activeRuns === 'object') {
    for (const [featureId, entry] of Object.entries(parsed.activeRuns)) {
      if (entry && entry.featureId) activeRuns[featureId] = entry;
      else if (entry) activeRuns[featureId] = { ...entry, featureId };
    }
  }
  if (parsed.activeRun && parsed.activeRun.featureId) {
    const id = parsed.activeRun.featureId;
    if (!activeRuns[id]) {
      activeRuns[id] = { ...parsed.activeRun, featureId: id };
    }
  }
  return activeRuns;
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return emptyState();
    const features = parsed.features && typeof parsed.features === 'object'
      ? parsed.features
      : {};
    return { features, activeRuns: normalizeActiveRuns(parsed) };
  } catch {
    return emptyState();
  }
}

function writeState(filePath, state) {
  const payload = {
    features: state.features || {},
    activeRuns: state.activeRuns || {},
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

export function readWorkflowState(specRoot) {
  return safeReadJson(workflowStatePath(specRoot));
}

export function updateFeatureWorkflow(specRoot, featureId, patch) {
  const filePath = workflowStatePath(specRoot);
  const state = safeReadJson(filePath);
  const current = state.features[featureId] || {};
  state.features[featureId] = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeState(filePath, state);
  return state.features[featureId];
}

export function getFeatureWorkflow(specRoot, featureId) {
  const state = readWorkflowState(specRoot);
  return state.features[featureId] || null;
}

function liveRunFromFeature(featureId, feature) {
  if (!feature) return null;
  if (feature.runStatus !== 'running' && feature.runStatus !== 'starting') return null;
  return {
    featureId,
    agentId: feature.agentId,
    runId: feature.runId,
    kind: feature.kind,
  };
}

/** All in-flight runs for this repo (one entry per feature). */
export function findActiveRuns(specRoot) {
  const state = readWorkflowState(specRoot);
  const runs = { ...state.activeRuns };
  for (const [featureId, feature] of Object.entries(state.features)) {
    const live = liveRunFromFeature(featureId, feature);
    if (live) runs[featureId] = { ...runs[featureId], ...live };
  }
  return runs;
}

/** First active run (backward compatibility for cancel paths). */
export function findActiveRun(specRoot) {
  const runs = findActiveRuns(specRoot);
  const ids = Object.keys(runs);
  if (!ids.length) return null;
  const featureId = ids[0];
  return runs[featureId];
}

export function findActiveRunForFeature(specRoot, featureId) {
  const runs = findActiveRuns(specRoot);
  return runs[featureId] || null;
}

export function setActiveRun(specRoot, activeRun) {
  const filePath = workflowStatePath(specRoot);
  const state = safeReadJson(filePath);
  if (!state.activeRuns || typeof state.activeRuns !== 'object') {
    state.activeRuns = {};
  }
  const featureId = activeRun.featureId;
  state.activeRuns[featureId] = {
    ...activeRun,
    featureId,
    startedAt: new Date().toISOString(),
  };
  writeState(filePath, state);
  return state.activeRuns[featureId];
}

export function clearActiveRun(specRoot, featureId) {
  const filePath = workflowStatePath(specRoot);
  const state = safeReadJson(filePath);
  if (!state.activeRuns || typeof state.activeRuns !== 'object') {
    state.activeRuns = {};
  }
  if (featureId && state.activeRuns[featureId]) {
    delete state.activeRuns[featureId];
  }
  writeState(filePath, state);
}

const TRANSCRIPT_CAP = 200;

export function appendTranscript(specRoot, featureId, entry) {
  if (!entry || !entry.kind) return getFeatureWorkflow(specRoot, featureId);
  const filePath = workflowStatePath(specRoot);
  const state = safeReadJson(filePath);
  const current = state.features[featureId] || {};
  const transcript = Array.isArray(current.transcript) ? current.transcript.slice() : [];
  transcript.push({
    at: new Date().toISOString(),
    kind: String(entry.kind),
    title: String(entry.title || entry.kind),
    text: String(entry.text || '').slice(0, 4000),
  });
  state.features[featureId] = {
    ...current,
    transcript: transcript.slice(-TRANSCRIPT_CAP),
    lastAssistantText: entry.kind === 'assistant' && entry.text
      ? String(entry.text).slice(-4000)
      : current.lastAssistantText || '',
    updatedAt: new Date().toISOString(),
  };
  writeState(filePath, state);
  return state.features[featureId];
}
