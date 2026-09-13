/**
 * Sidecar workflow state. Not stored in FEATURES.md.
 */

import fs from 'fs';
import path from 'path';

export function workflowStatePath(specRoot) {
  return path.join(path.dirname(specRoot), '.features-workflow.json');
}

function emptyState() {
  return { features: {}, activeRun: null };
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return emptyState();
    if (!parsed.features || typeof parsed.features !== 'object') {
      return { features: {}, activeRun: parsed.activeRun || null };
    }
    return { features: parsed.features, activeRun: parsed.activeRun || null };
  } catch {
    return emptyState();
  }
}

function writeState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
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

export function findActiveRun(specRoot) {
  const state = readWorkflowState(specRoot);
  if (state.activeRun && state.activeRun.featureId) return state.activeRun;
  for (const [featureId, feature] of Object.entries(state.features)) {
    if (feature && (feature.runStatus === 'running' || feature.runStatus === 'starting')) {
      return { featureId, agentId: feature.agentId, runId: feature.runId, kind: feature.kind };
    }
  }
  return null;
}

export function setActiveRun(specRoot, activeRun) {
  const filePath = workflowStatePath(specRoot);
  const state = safeReadJson(filePath);
  state.activeRun = { ...activeRun, startedAt: new Date().toISOString() };
  writeState(filePath, state);
  return state.activeRun;
}

export function clearActiveRun(specRoot, featureId) {
  const filePath = workflowStatePath(specRoot);
  const state = safeReadJson(filePath);
  if (!state.activeRun || !featureId || state.activeRun.featureId === featureId) {
    state.activeRun = null;
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
