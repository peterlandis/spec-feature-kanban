/**
 * Rank features for "where to start" / suggested focus (CORE-030).
 * Shared by Board strip, Jarvis next-work, and Graph deepen.
 */

const EDGE_DEPENDS_ON = 'depends on';

function statusText(value) {
  return String(value || '');
}

function isComplete(status) {
  return statusText(status).includes('Complete');
}

function isLive(node) {
  return Boolean(node.live) || node.runStatus === 'starting' || node.runStatus === 'running';
}

function uniqueReasons(reasons) {
  const seen = new Set();
  const out = [];
  for (const reason of reasons) {
    const key = String(reason || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * @param {Array<object>} nodes - id, title, status, waitingOnHuman?, live?, nextGate?, approved?, runStatus?
 * @param {Array<object>} edges - from, to, type
 * @param {{ limit?: number }} [options]
 */
export function rankFocusCandidates(nodes, edges, options = {}) {
  const limit = Math.max(1, Math.min(12, Number(options.limit) || 4));
  const list = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  const byId = new Map(list.map((node) => [node.id, node]));

  const prerequisites = new Map();
  const dependents = new Map();
  for (const edge of edgeList) {
    if (!edge || edge.type !== EDGE_DEPENDS_ON) continue;
    const from = edge.from;
    const to = edge.to;
    if (!from || !to || from === to) continue;
    const prereqs = prerequisites.get(from) || [];
    prereqs.push(to);
    prerequisites.set(from, prereqs);
    dependents.set(to, (dependents.get(to) || 0) + 1);
  }

  const scored = [];
  for (const node of list) {
    if (!node || !node.id) continue;
    if (isComplete(node.status)) continue;
    if (isLive(node)) continue;

    const id = node.id;
    const status = statusText(node.status);
    let score = 0;
    const reasons = [];

    const prereqs = prerequisites.get(id) || [];
    const incompletePrereqs = prereqs.filter((pid) => {
      const other = byId.get(pid);
      return other && !isComplete(other.status);
    });
    if (incompletePrereqs.length) {
      score -= 45 * incompletePrereqs.length;
      reasons.push(`blocked by ${incompletePrereqs.slice(0, 2).join(', ')}`);
    } else if (prereqs.length) {
      score += 18;
      reasons.push('dependencies complete');
    } else {
      score += 12;
      reasons.push('no graph blockers');
    }

    if (status.includes('Blocked')) {
      score -= 70;
      reasons.push('marked blocked');
    }

    if (node.waitingOnHuman) {
      score += 110;
      reasons.push('waiting on you');
    }

    const unlocks = dependents.get(id) || 0;
    if (unlocks > 0) {
      score += Math.min(48, unlocks * 14);
      reasons.push(`unlocks ${unlocks} other feature${unlocks === 1 ? '' : 's'}`);
    }

    if (status.includes('PlanReview')) {
      score += 36;
      reasons.push('plan needs review');
    } else if (node.approved && !status.includes('WorkInProgress')) {
      score += 32;
      reasons.push('ready to implement');
    } else if (status.includes('Testing')) {
      score += 30;
      reasons.push('ready to review or ship');
    } else if (status.includes('ReadyToMerge')) {
      score += 34;
      reasons.push('ready to merge');
    } else if (status.includes('WorkInProgress')) {
      score += 26;
      reasons.push('already in progress');
    } else if (status.includes('Planning') || status.includes('Planned')) {
      score += 16;
      reasons.push('ready to plan or continue planning');
    }

    const whyList = uniqueReasons(reasons);
    const why = [
      whyList.find((reason) => reason.includes('waiting on you')),
      whyList.find((reason) => reason.includes('plan needs')),
      whyList.find((reason) => reason.includes('ready to')),
      whyList.find((reason) => reason.includes('already in progress')),
      whyList.find((reason) => reason.includes('unlocks')),
      whyList.find((reason) => reason.includes('blocked')),
      whyList[0],
    ].find(Boolean) || 'actionable work';
    scored.push({
      featureId: id,
      title: node.title || id,
      status: node.status || '',
      score,
      why,
      reasons: whyList.slice(0, 3),
      nextGate: node.nextGate || '',
      unlocks,
      blockedBy: incompletePrereqs,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.featureId).localeCompare(String(b.featureId));
  });

  const preferred = scored.filter((item) => !(item.blockedBy && item.blockedBy.length));
  const fallback = scored.filter((item) => item.blockedBy && item.blockedBy.length);
  const ordered = preferred.length ? [...preferred, ...fallback] : scored;

  return ordered.slice(0, limit).map((item, index) => ({
    ...item,
    rank: index + 1,
    role: index === 0 ? 'start' : 'next',
  }));
}

/**
 * @param {Array<object>} features - registry features with workflow fields
 * @param {object} graph - { edges }
 * @param {{ limit?: number, nextGateFor?: (feature: object) => string }} [options]
 */
export function suggestFocusFeatures(features, graph, options = {}) {
  const nextGateFor = typeof options.nextGateFor === 'function' ? options.nextGateFor : () => '';
  const nodes = (features || []).map((feature) => {
    const id = feature.featureId;
    return {
      id,
      title: feature.title || id,
      status: feature.status || '',
      waitingOnHuman: !!feature.waitingOnHuman,
      live: feature.runStatus === 'starting' || feature.runStatus === 'running',
      runStatus: feature.runStatus || '',
      nextGate: nextGateFor(feature),
      approved: !!feature.planApprovedAt,
    };
  });
  return rankFocusCandidates(nodes, (graph && graph.edges) || [], options);
}
