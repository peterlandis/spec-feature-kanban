/**
 * Feature relationship graph (CORE-017).
 *
 * Relation sources (v1 — no structured Depends column yet):
 * - **depends on:** Registry Notes matching "Depends on …" (feature IDs), or plan ## Dependencies
 *   lines with "Prerequisite:" / "Depends on" (IDs only if target is in the loaded feature set).
 * - **blocked by:** Status contains Blocked and Notes/plan Dependencies name another tracked ID.
 * - **same category:** Pairwise links only when a category has at most SAME_CATEGORY_MAX members
 *   (avoids a complete mesh on large tables).
 * - **plan link:** Notes or plan file text reference another feature's plan/tasks path by ID pattern.
 *
 * Feature IDs: conservative `\b(CORE|AGENT)-\d{3}\b`. References outside the current set are ignored.
 * Does not infer edges from source code or git history.
 */

import { resolveArtifactPaths, readIfExists } from './artifacts.js';

export const FEATURE_ID_PATTERN = /\b(CORE|AGENT)-\d{3}\b/gi;
export const SAME_CATEGORY_MAX = 4;

export const EDGE_DEPENDS_ON = 'depends on';
export const EDGE_BLOCKED_BY = 'blocked by';
export const EDGE_SAME_CATEGORY = 'same category';
export const EDGE_PLAN_LINK = 'plan link';

function resetFeatureIdPattern() {
  FEATURE_ID_PATTERN.lastIndex = 0;
}

export function extractFeatureIds(text, { excludeId } = {}) {
  if (!text) return [];
  resetFeatureIdPattern();
  const seen = new Set();
  const ids = [];
  let match;
  while ((match = FEATURE_ID_PATTERN.exec(text)) !== null) {
    const finalId = normalizeFeatureId(match[0]);
    if (!finalId) continue;
    if (excludeId && finalId === excludeId) continue;
    if (seen.has(finalId)) continue;
    seen.add(finalId);
    ids.push(finalId);
  }
  return ids;
}

function normalizeFeatureId(raw) {
  const m = String(raw || '').trim().match(/^(CORE|AGENT)-(\d+)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${String(m[2]).padStart(3, '0')}`;
}

export function extractDependsOnFromNotes(notes, featureId) {
  if (!notes) return [];
  const text = String(notes);
  const ids = new Set();
  const dependsRe = /depends\s+on\s+([^.;\n]+)/gi;
  let block;
  while ((block = dependsRe.exec(text)) !== null) {
    for (const id of extractFeatureIds(block[1], { excludeId: featureId })) {
      ids.add(id);
    }
  }
  return [...ids];
}

export function extractPlanDependenciesSection(planText) {
  if (!planText) return { prerequisiteIds: [], blockedIds: [] };
  const lines = String(planText).split('\n');
  let inSection = false;
  const sectionLines = [];
  for (const line of lines) {
    if (/^##\s+dependencies\b/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+\S/.test(line.trim())) break;
    if (inSection) sectionLines.push(line);
  }
  const prerequisiteIds = new Set();
  const blockedIds = new Set();
  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (/^-\s+\*\*Prerequisite:\*\*/i.test(trimmed) || /^-\s+Prerequisite:/i.test(trimmed)) {
      for (const id of extractFeatureIds(line)) prerequisiteIds.add(id);
    }
    if (/depends\s+on/i.test(trimmed)) {
      for (const id of extractFeatureIds(line)) prerequisiteIds.add(id);
    }
    if (/blocked\s+by/i.test(trimmed)) {
      for (const id of extractFeatureIds(line)) blockedIds.add(id);
    }
  }
  return {
    prerequisiteIds: [...prerequisiteIds],
    blockedIds: [...blockedIds],
  };
}

export function extractPlanLinkIds(notes, planDocument, planText, featureId) {
  const ids = new Set();
  const combined = [notes, planDocument, planText].filter(Boolean).join('\n');
  if (!/(plans\/|tasks\/|\.md|PLAN|IMPLEMENTATION-TASKS)/i.test(combined)) return [];
  for (const id of extractFeatureIds(combined, { excludeId: featureId })) {
    if (new RegExp(`${id}[-_A-Z]*\\.(md|markdown)`, 'i').test(combined)
      || new RegExp(`plans\\/[^\\s]*${id}`, 'i').test(combined)
      || new RegExp(`tasks\\/[^\\s]*${id}`, 'i').test(combined)) {
      ids.add(id);
    }
  }
  return [...ids];
}

function edgeId(type, from, to) {
  return `${type}:${from}->${to}`;
}

function addEdge(edgeMap, edge) {
  if (!edge.from || !edge.to || edge.from === edge.to) return;
  const key = edge.id || edgeId(edge.type, edge.from, edge.to);
  if (edgeMap.has(key)) return;
  edgeMap.set(key, { ...edge, id: key });
}

/**
 * @param {Array<{ featureId: string, title?: string, notes?: string, status?: string, categoryTitle?: string, planDocument?: string }>} features
 * @param {{ planContentsById?: Record<string, string> }} [options]
 */
export function buildFeatureGraph(features, options = {}) {
  const planContentsById = options.planContentsById || {};
  const idSet = new Set(
    (features || []).map((f) => normalizeFeatureId(f.featureId)).filter(Boolean),
  );
  const featureById = new Map();
  for (const f of features || []) {
    const id = normalizeFeatureId(f.featureId);
    if (id) featureById.set(id, f);
  }

  const nodes = [...idSet].sort().map((id) => {
    const f = featureById.get(id) || {};
    return {
      id,
      featureId: id,
      title: f.title || id,
      categoryTitle: f.categoryTitle || '',
      status: f.status || '',
    };
  });

  const edgeMap = new Map();

  for (const id of idSet) {
    const f = featureById.get(id) || {};
    const planText = planContentsById[id] || '';
    const planDeps = extractPlanDependenciesSection(planText);

    const dependsTargets = new Set([
      ...extractDependsOnFromNotes(f.notes, id),
      ...planDeps.prerequisiteIds,
    ]);
    for (const target of dependsTargets) {
      if (!idSet.has(target) || target === id) continue;
      addEdge(edgeMap, {
        id: edgeId(EDGE_DEPENDS_ON, id, target),
        from: id,
        to: target,
        type: EDGE_DEPENDS_ON,
        directed: true,
      });
    }

    const isBlocked = String(f.status || '').includes('Blocked') || String(f.status || '').includes('🚫');
    if (isBlocked) {
      const blockSources = new Set([
        ...extractFeatureIds(f.notes, { excludeId: id }),
        ...planDeps.blockedIds,
      ]);
      for (const target of blockSources) {
        if (!idSet.has(target) || target === id) continue;
        addEdge(edgeMap, {
          id: edgeId(EDGE_BLOCKED_BY, id, target),
          from: id,
          to: target,
          type: EDGE_BLOCKED_BY,
          directed: true,
        });
      }
    }

    for (const target of extractPlanLinkIds(f.notes, f.planDocument, planText, id)) {
      if (!idSet.has(target) || target === id) continue;
      addEdge(edgeMap, {
        id: edgeId(EDGE_PLAN_LINK, id, target),
        from: id,
        to: target,
        type: EDGE_PLAN_LINK,
        directed: true,
      });
    }
  }

  const byCategory = new Map();
  for (const id of idSet) {
    const cat = (featureById.get(id)?.categoryTitle || '').trim() || 'Uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(id);
  }
  for (const members of byCategory.values()) {
    if (members.length > SAME_CATEGORY_MAX) continue;
    const sorted = [...members].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        addEdge(edgeMap, {
          id: edgeId(EDGE_SAME_CATEGORY, a, b),
          from: a,
          to: b,
          type: EDGE_SAME_CATEGORY,
          directed: false,
        });
      }
    }
  }

  return {
    nodes,
    edges: [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function loadPlanContentsForFeatures(specRoot, features) {
  const planContentsById = {};
  for (const feature of features || []) {
    const id = normalizeFeatureId(feature.featureId);
    if (!id) continue;
    const paths = resolveArtifactPaths(specRoot, feature);
    const content = readIfExists(paths.planPath);
    if (content) planContentsById[id] = content;
  }
  return planContentsById;
}

export function flattenFeaturesFromCategories(categories) {
  const out = [];
  for (const category of categories || []) {
    for (const feature of category.features || []) {
      out.push({
        ...feature,
        categoryTitle: feature.categoryTitle || category.title,
      });
    }
  }
  return out;
}
