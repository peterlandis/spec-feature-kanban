/**
 * Frozen graph snapshot + local briefing answers for CORE-018.
 * Chat never starts coding agents.
 */

import { rankFocusCandidates } from './focus-suggestions.js';

const FEATURE_ID_RE = /\b((?:CORE|AGENT)-\d{3})\b/gi;

export function nextGateHint(feature) {
  const status = feature.status || '';
  const live = feature.runStatus === 'starting' || feature.runStatus === 'running';
  if (live) return 'Agent is running. Wait or cancel.';
  if (status.includes('Complete')) return '';
  if (status.includes('ReadyToMerge')) return 'Next: mark complete after the PR is merged.';
  if (status.includes('Testing')) return 'Next: review artifacts, then ship.';
  if (status.includes('Blocked')) return 'Blocked. Next: retry the last gate or edit the feature.';
  if (feature.planApprovedAt && !status.includes('WorkInProgress')) return 'Next: start implementation.';
  if (status.includes('PlanReview')) return 'Next: approve the plan.';
  if (status.includes('WorkInProgress')) return 'Next: continue implementation.';
  if (status.includes('Paused')) {
    return feature.planApprovedAt ? 'Paused. Next: start implementation.' : 'Paused.';
  }
  if (status.includes('Planning')) return 'Planning is in progress or the plan is ready to review.';
  return 'Next: start planning.';
}

export function extractFeatureIds(text, knownIds) {
  const known = new Map((knownIds || []).map((id) => [String(id).toUpperCase(), id]));
  const found = [];
  const re = new RegExp(FEATURE_ID_RE.source, 'gi');
  let match = re.exec(String(text || ''));
  while (match) {
    const canon = known.get(match[1].toUpperCase());
    if (canon && !found.includes(canon)) found.push(canon);
    match = re.exec(String(text || ''));
  }
  return found;
}

export function buildJarvisContext(features, graph) {
  const list = Array.isArray(features) ? features : [];
  const nodes = list.map((feature) => ({
    id: feature.featureId,
    title: feature.title || '',
    status: feature.status || '',
    stage: feature.graphStage || '',
    waitingOnHuman: !!feature.waitingOnHuman,
    live: feature.runStatus === 'starting' || feature.runStatus === 'running',
    nextGate: nextGateHint(feature),
    category: feature.categoryTitle || '',
    approved: !!feature.planApprovedAt,
  }));
  const edges = ((graph && graph.edges) || []).map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
  }));
  const rollup = {
    total: nodes.length,
    live: nodes.filter((node) => node.live).length,
    waitingOnHuman: nodes.filter((node) => node.waitingOnHuman).length,
    blocked: nodes.filter((node) => String(node.status).includes('Blocked')).length,
    complete: nodes.filter((node) => String(node.status).includes('Complete')).length,
  };
  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    rollup,
  };
}

function nodeById(context, id) {
  return (context.nodes || []).find((node) => node.id === id) || null;
}

function plainStatus(status) {
  const value = String(status || '');
  if (value.includes('WorkInProgress')) return 'in progress';
  if (value.includes('ReadyToMerge')) return 'ready to merge';
  if (value.includes('PlanReview')) return 'waiting on plan review';
  if (value.includes('Testing')) return 'in testing';
  if (value.includes('Blocked')) return 'blocked';
  if (value.includes('Paused')) return 'paused';
  if (value.includes('Planning')) return 'in planning';
  if (value.includes('Complete')) return 'complete';
  if (value.includes('Planned')) return 'planned';
  return value || 'unspecified';
}

function formatNode(node) {
  if (!node) return 'not in the graph';
  const title = node.title ? ` (${node.title})` : '';
  const gate = node.nextGate ? ` ${node.nextGate}` : '';
  return `${node.id}${title} is ${plainStatus(node.status)}.${gate}`;
}

function relateAnswer(fromId, toId, context) {
  const edges = (context.edges || []).filter((edge) => (
    (edge.from === fromId && edge.to === toId) || (edge.from === toId && edge.to === fromId)
  ));
  if (!nodeById(context, fromId) || !nodeById(context, toId)) {
    return {
      reply: 'One of those IDs is not in the graph.',
      mentionIds: [fromId, toId].filter((id) => nodeById(context, id)),
    };
  }
  if (!edges.length) {
    return {
      reply: `${fromId} and ${toId} have no parsed relation in this graph.`,
      mentionIds: [fromId, toId],
    };
  }
  const lines = edges.map((edge) => `${edge.from} ${edge.type} ${edge.to}`);
  return {
    reply: lines.join(' '),
    mentionIds: [fromId, toId],
  };
}

function listWhere(context, predicate, emptyText) {
  const hits = (context.nodes || []).filter(predicate);
  if (!hits.length) return { reply: emptyText, mentionIds: [] };
  return {
    reply: hits.map(formatNode).join(' '),
    mentionIds: hits.slice(0, 6).map((node) => node.id),
  };
}

function nextWorkAnswer(context) {
  const picks = rankFocusCandidates(context.nodes || [], context.edges || [], { limit: 3 });
  if (!picks.length) {
    return { reply: 'Nothing in the snapshot looks like a good starting point right now.', mentionIds: [] };
  }
  const top = picks[0];
  const title = top.title ? ` (${top.title})` : '';
  const gate = top.nextGate ? ` ${top.nextGate}` : '';
  let reply = `I'd start with ${top.featureId}${title}. It is ${plainStatus(top.status)} — ${top.why}.${gate}`;
  const rest = picks.slice(1);
  if (rest.length) {
    reply += ` Next: ${rest.map((item) => `${item.featureId}${item.title ? ` (${item.title})` : ''} (${item.why})`).join('; ')}.`;
  }
  return {
    reply,
    mentionIds: picks.map((item) => item.featureId),
  };
}

function parseGateAction(text, context) {
  const ids = extractFeatureIds(text, (context.nodes || []).map((node) => node.id));
  const featureId = ids[0];
  if (!featureId) return null;
  const lower = text.toLowerCase();
  let action = null;
  let label = '';
  if (/start planning|write the plan/.test(lower)) {
    action = 'startPlanning';
    label = `start planning for ${featureId}`;
  } else if (/approve (the )?plan/.test(lower)) {
    action = 'approvePlan';
    label = `approve the plan for ${featureId}`;
  } else if (/start implement|implement/.test(lower)) {
    action = 'startImplement';
    label = `start implementation for ${featureId}`;
  }
  if (!action) return null;
  return {
    reply: `I can ${label}, but I will not start a coding agent until you confirm.`,
    mentionIds: [featureId],
    confirm: { action, featureId, label },
  };
}

export function answerJarvis(message, context) {
  const text = String(message || '').trim();
  const snapshot = context && Array.isArray(context.nodes) ? context : { nodes: [], edges: [], rollup: {} };
  if (!text) {
    return { reply: 'Ask about the live feature graph.', mentionIds: [] };
  }
  const gate = parseGateAction(text, snapshot);
  if (gate) return gate;

  const ids = extractFeatureIds(text, snapshot.nodes.map((node) => node.id));
  if (/relat|depend|connect|link|block/.test(text.toLowerCase()) && ids.length >= 2) {
    return relateAnswer(ids[0], ids[1], snapshot);
  }
  if (/blocked/.test(text.toLowerCase())) {
    return listWhere(snapshot, (node) => String(node.status).includes('Blocked'), 'Nothing in the snapshot is blocked.');
  }
  if (/waiting|human/.test(text.toLowerCase())) {
    return listWhere(snapshot, (node) => node.waitingOnHuman, 'Nothing in the snapshot is waiting on a human.');
  }
  if (/in progress|coding|live agent/.test(text.toLowerCase())) {
    return listWhere(
      snapshot,
      (node) => node.live || String(node.status).includes('WorkInProgress'),
      'No live or in-progress features in the snapshot.',
    );
  }
  if (/next|should i|what to work|recommend/.test(text.toLowerCase())) {
    return nextWorkAnswer(snapshot);
  }
  if (ids.length === 1) {
    const node = nodeById(snapshot, ids[0]);
    if (!node) return { reply: `${ids[0]} is not in the graph.`, mentionIds: [] };
    const links = (snapshot.edges || []).filter((edge) => edge.from === node.id || edge.to === node.id);
    const rel = links.length
      ? ` Links: ${links.map((edge) => `${edge.from} ${edge.type} ${edge.to}`).join('; ')}.`
      : ' No parsed links.';
    return { reply: `${formatNode(node)}${rel}`, mentionIds: [node.id] };
  }

  const rollup = snapshot.rollup || {};
  return {
    reply: `Graph snapshot: ${rollup.total || 0} features, ${rollup.live || 0} live, ${rollup.waitingOnHuman || 0} waiting on a human, ${rollup.blocked || 0} blocked. Ask what to work on next, what is blocked, or how two feature IDs relate.`,
    mentionIds: [],
  };
}
