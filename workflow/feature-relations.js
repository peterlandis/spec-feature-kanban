/**
 * Feature relationship graph (CORE-017 / CORE-028 / CORE-033).
 *
 * Relation sources:
 * - **depends on:** FEATURES.md Depends column (preferred), registry Notes matching
 *   "Depends on …" (legacy), or plan ## Dependencies lines with "Prerequisite:" / "Depends on".
 * - **blocked by:** Status contains Blocked and Notes/plan Dependencies name another tracked ID.
 * - **same category:** Pairwise links only when a category has at most SAME_CATEGORY_MAX members
 *   (avoids a complete mesh on large tables). Larger categories are shown as visual clusters (CORE-028).
 * - **plan link:** Notes or plan file text reference another feature's plan/tasks path by ID pattern.
 *
 * Feature IDs: `\b([A-Z]{2,8})-\d{3}\b` (CORE, AGENT, QF, …). References outside the current set are ignored.
 * Does not infer edges from source code or git history.
 */

import { resolveArtifactPaths, readIfExists } from './artifacts.js';

export const FEATURE_ID_PATTERN = /\b([A-Z]{2,8})-\d{3}\b/gi;
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

export function normalizeFeatureId(raw) {
  const m = String(raw || '').trim().match(/^([A-Z]{2,8})-(\d+)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${String(m[2]).padStart(3, '0')}`;
}

export function extractDependsOnFromFeature(feature) {
  if (!feature) return [];
  const id = feature.featureId;
  const fromColumn = extractFeatureIds(feature.depends || '', { excludeId: id });
  const fromNotes = extractDependsOnFromNotes(feature.notes, id);
  const seen = new Set();
  const out = [];
  for (const dep of [...fromColumn, ...fromNotes]) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    out.push(dep);
  }
  return out;
}

export function extractDependsOnFromNotes(notes, featureId) {
  if (!notes) return [];
  let text = String(notes);
  // Expand compact lists like CORE-017/018/029 into full IDs before extraction.
  text = text.replace(
    /\b([A-Z]{2,8})-(\d{3})((?:\/(?:[A-Z]{2,8}-)?\d{3})+)/gi,
    (full, prefix, first, rest) => {
      const ids = [`${prefix.toUpperCase()}-${first}`];
      for (const part of rest.split('/').filter(Boolean)) {
        if (/^[A-Z]{2,8}-\d{3}$/i.test(part)) {
          ids.push(part.toUpperCase().replace(/^([A-Z]{2,8})-(\d+)$/i, (_, p, n) => `${p.toUpperCase()}-${n.padStart(3, '0')}`));
        } else if (/^\d{3}$/.test(part)) {
          ids.push(`${prefix.toUpperCase()}-${part}`);
        }
      }
      return ids.join(', ');
    },
  );
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

function categoryGroups(featureById, idSet) {
  const byCategory = new Map();
  for (const id of idSet) {
    const cat = (featureById.get(id)?.categoryTitle || '').trim() || 'Uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(id);
  }
  return byCategory;
}

function buildClusters(byCategory) {
  return [...byCategory.entries()]
    .map(([title, memberIds]) => ({
      title,
      memberIds: [...memberIds].sort(),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
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
      ...extractDependsOnFromFeature(f),
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

  const byCategory = categoryGroups(featureById, idSet);
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
    clusters: buildClusters(byCategory),
  };
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'from', 'by',
  'is', 'are', 'as', 'at', 'be', 'into', 'via', 'that', 'this', 'it', 'its', 'app',
]);

function tokenizeFeatureText(...parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  const tokens = text.match(/[a-z][a-z0-9+]{2,}/g) || [];
  return new Set(tokens.filter((t) => !STOP_WORDS.has(t)));
}

function existingDependsPairs(features, planContentsById) {
  const pairs = new Set();
  for (const f of features || []) {
    const id = normalizeFeatureId(f.featureId);
    if (!id) continue;
    const planText = planContentsById[id] || '';
    const planDeps = extractPlanDependenciesSection(planText);
    for (const target of [
      ...extractDependsOnFromFeature(f),
      ...planDeps.prerequisiteIds,
    ]) {
      pairs.add(`${id}->${target}`);
    }
  }
  return pairs;
}

/**
 * Conservative dependency suggestions for human review (CORE-028).
 * @returns {Array<{ from: string, to: string, reason: string, score: number }>}
 */
export function suggestFeatureDependencies(features, options = {}) {
  const planContentsById = options.planContentsById || {};
  const list = (features || [])
    .map((f) => ({ ...f, featureId: normalizeFeatureId(f.featureId) }))
    .filter((f) => f.featureId);
  const idSet = new Set(list.map((f) => f.featureId));
  const existing = existingDependsPairs(list, planContentsById);
  const suggestions = new Map();

  const add = (from, to, reason, score) => {
    if (!from || !to || from === to) return;
    if (!idSet.has(from) || !idSet.has(to)) return;
    if (existing.has(`${from}->${to}`)) return;
    const key = `${from}->${to}`;
    const prev = suggestions.get(key);
    if (prev && prev.score >= score) return;
    suggestions.set(key, { from, to, reason, score });
  };

  const byId = new Map(list.map((f) => [f.featureId, f]));
  const tokensById = new Map();
  for (const f of list) {
    tokensById.set(
      f.featureId,
      tokenizeFeatureText(f.title, f.description, planContentsById[f.featureId]),
    );
  }

  for (const f of list) {
    const blob = [f.title, f.description, f.depends, f.notes, f.planDocument, planContentsById[f.featureId]]
      .filter(Boolean)
      .join('\n');
    for (const mentioned of extractFeatureIds(blob, { excludeId: f.featureId })) {
      add(f.featureId, mentioned, 'Mentioned in title, description, notes, or plan', 0.92);
    }
  }

  for (const f of list) {
    const mine = tokensById.get(f.featureId) || new Set();
    if (mine.size < 2) continue;
    for (const other of list) {
      if (other.featureId <= f.featureId) continue;
      const theirs = tokensById.get(other.featureId) || new Set();
      let overlap = 0;
      const shared = [];
      for (const token of mine) {
        if (theirs.has(token)) {
          overlap += 1;
          if (shared.length < 4) shared.push(token);
        }
      }
      if (overlap < 2) continue;
      const titleHit = [...tokenizeFeatureText(other.title)].some((t) => mine.has(t) && t.length > 4)
        || [...tokenizeFeatureText(f.title)].some((t) => theirs.has(t) && t.length > 4);
      if (!titleHit && overlap < 3) continue;
      const score = Math.min(0.85, 0.45 + (overlap * 0.1) + (titleHit ? 0.12 : 0));
      add(
        other.featureId,
        f.featureId,
        `Shared themes: ${shared.join(', ')}`,
        score,
      );
    }
  }

  const byCategory = categoryGroups(byId, idSet);
  for (const members of byCategory.values()) {
    const sorted = [...members].sort();
    if (sorted.length < 2) continue;
    const foundation = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      add(
        sorted[i],
        foundation,
        `Earlier feature in the same category (${shortCategory(byId.get(foundation)?.categoryTitle)})`,
        0.42,
      );
    }
  }

  return [...suggestions.values()]
    .sort((a, b) => b.score - a.score || a.from.localeCompare(b.from))
    .slice(0, 40);
}

function shortCategory(title) {
  return String(title || 'category').replace(/^[\s\p{Extended_Pictographic}\uFE0F]+/u, '').trim() || 'category';
}

export function appendDependsOnNote(notes, targetId) {
  const id = normalizeFeatureId(targetId);
  if (!id) throw new Error('Invalid dependency feature id');
  const current = String(notes || '').trim();
  if (extractDependsOnFromNotes(current, null).includes(id)) return current || '-';
  if (!current || current === '-') return `Depends on ${id}`;
  if (/depends\s+on\s+/i.test(current)) {
    return current.replace(/depends\s+on\s+([^.;\n]+)/i, (full, list) => {
      const ids = extractFeatureIds(list);
      if (ids.includes(id)) return full;
      return `Depends on ${[...ids, id].join(', ')}`;
    });
  }
  return `${current.replace(/\s+$/, '')}. Depends on ${id}`;
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
