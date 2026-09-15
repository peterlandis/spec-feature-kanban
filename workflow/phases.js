/**
 * Phased overnight feature groups (CORE-031).
 * Sidecar file next to FEATURES.md — not stored in the registry table.
 */

import fs from 'fs';
import path from 'path';

export function phasesStatePath(specRoot) {
  return path.join(path.dirname(specRoot), '.features-phases.json');
}

function emptyState() {
  return { phases: {}, activePhaseId: null };
}

function safeRead(filePath) {
  try {
    if (!fs.existsSync(filePath)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      phases: parsed.phases && typeof parsed.phases === 'object' ? parsed.phases : {},
      activePhaseId: parsed.activePhaseId || null,
    };
  } catch {
    return emptyState();
  }
}

function writeState(filePath, state) {
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({
      phases: state.phases || {},
      activePhaseId: state.activePhaseId || null,
    }, null, 2)}\n`,
    'utf-8',
  );
}

function newPhaseId() {
  return `phase-${Date.now().toString(36)}`;
}

export function listPhases(specRoot) {
  const state = safeRead(phasesStatePath(specRoot));
  const phases = Object.values(state.phases || {}).sort((a, b) => (
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  ));
  return {
    phases,
    activePhaseId: state.activePhaseId || null,
  };
}

export function getPhase(specRoot, phaseId) {
  const state = safeRead(phasesStatePath(specRoot));
  return (state.phases && state.phases[phaseId]) || null;
}

export function getActivePhase(specRoot) {
  const state = safeRead(phasesStatePath(specRoot));
  if (!state.activePhaseId) return null;
  return state.phases[state.activePhaseId] || null;
}

export function createPhase(specRoot, {
  title,
  mode,
  featureIds,
  items,
  models,
} = {}) {
  const ids = Array.isArray(featureIds)
    ? featureIds.map((id) => String(id || '').trim()).filter(Boolean)
    : (Array.isArray(items) ? items.map((item) => item.featureId).filter(Boolean) : []);
  if (!ids.length) {
    throw new Error('A phase needs at least one feature id.');
  }
  const unique = [...new Set(ids)];
  const runMode = mode === 'plan-implement' ? 'plan-implement' : 'plan';
  const id = newPhaseId();
  const now = new Date().toISOString();
  const phase = {
    id,
    title: String(title || '').trim() || `Phase ${unique.length} features`,
    mode: runMode,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    currentFeatureId: null,
    error: null,
    models: normalizePhaseModels(models),
    items: unique.map((featureId, index) => ({
      featureId,
      title: (items && items[index] && items[index].title) || featureId,
      why: (items && items[index] && items[index].why) || '',
      status: 'pending',
      step: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    })),
  };
  const filePath = phasesStatePath(specRoot);
  const state = safeRead(filePath);
  state.phases[id] = phase;
  writeState(filePath, state);
  return phase;
}

export function normalizePhaseModels(models) {
  const src = models && typeof models === 'object' ? models : {};
  return {
    plan: String(src.plan || '').trim(),
    implement: String(src.implement || '').trim(),
    review: String(src.review || '').trim(),
  };
}

export function updatePhase(specRoot, phaseId, patch) {
  const filePath = phasesStatePath(specRoot);
  const state = safeRead(filePath);
  const current = state.phases[phaseId];
  if (!current) throw new Error(`Phase ${phaseId} not found.`);
  const next = {
    ...current,
    ...patch,
    id: phaseId,
    updatedAt: new Date().toISOString(),
  };
  if (Array.isArray(patch.items)) next.items = patch.items;
  if (patch.models) {
    next.models = normalizePhaseModels({
      ...(current.models || {}),
      ...patch.models,
    });
  } else if (!next.models) {
    next.models = normalizePhaseModels(current.models);
  }
  state.phases[phaseId] = next;
  writeState(filePath, state);
  return next;
}

export function updatePhaseItem(specRoot, phaseId, featureId, patch) {
  const phase = getPhase(specRoot, phaseId);
  if (!phase) throw new Error(`Phase ${phaseId} not found.`);
  const items = (phase.items || []).map((item) => (
    item.featureId === featureId ? { ...item, ...patch } : item
  ));
  return updatePhase(specRoot, phaseId, { items });
}

export function setActivePhaseId(specRoot, phaseId) {
  const filePath = phasesStatePath(specRoot);
  const state = safeRead(filePath);
  state.activePhaseId = phaseId || null;
  writeState(filePath, state);
  return state.activePhaseId;
}
