/**
 * Resolve and read/write specification artifacts for a feature.
 */

import fs from 'fs';
import path from 'path';

export const STATUS_PLANNING = '📝 Planning';
export const STATUS_PLAN_REVIEW = '👀 PlanReview';
export const STATUS_WIP = '🔨 WorkInProgress';
export const STATUS_TESTING = '🧪 Testing';
export const STATUS_READY_TO_MERGE = '🟢 ReadyToMerge';
export const STATUS_BLOCKED = '🚫 Blocked';
export const STATUS_PAUSED = '⏸️ Paused';

function applyPlaceholders(text, feature) {
  return String(text)
    .split('<FEATURE-ID>').join(feature.featureId)
    .split('<Feature Title>').join(feature.title || feature.featureId);
}

export function resolveGitRoot(startPath) {
  let current = startPath;
  try {
    if (!fs.statSync(current).isDirectory()) current = path.dirname(current);
  } catch {
    current = path.dirname(startPath);
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.dirname(resolveSpecRoot(startPath));
}

export function resolveSpecRoot(featuresAbsPath) {
  const featuresDir = path.dirname(featuresAbsPath);
  if (path.basename(featuresDir) === 'specifications') {
    return featuresDir;
  }
  let current = featuresDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(current, 'specifications');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(featuresDir, 'specifications');
}

export function safeJoin(root, ...parts) {
  const absolute = path.normalize(path.join(root, ...parts));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

function listMatching(dir, prefix, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => path.join(dir, name))
    .sort();
}

function resolvePlanFromDocument(specRoot, planDocument) {
  const raw = (planDocument || '').trim();
  if (!raw || raw === '-') return null;
  const specParent = path.dirname(specRoot);
  const candidates = [
    safeJoin(specParent, raw),
    safeJoin(specRoot, raw),
    safeJoin(specRoot, 'plans', path.basename(raw)),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveArtifactPaths(specRoot, feature) {
  const plansDir = path.join(specRoot, 'plans');
  const tasksDir = path.join(specRoot, 'tasks');
  const reviewsDir = path.join(specRoot, 'reviews');
  const completionsDir = path.join(specRoot, 'completions');
  const featureId = feature.featureId;

  const planMatches = listMatching(plansDir, `${featureId}-`, '-PLAN.md');
  const planLoose = listMatching(plansDir, `${featureId}-`, '.md');
  const planPath = resolvePlanFromDocument(specRoot, feature.planDocument)
    || planMatches[0]
    || planLoose[0]
    || null;

  const tasksPath = listMatching(tasksDir, `${featureId}-`, '-IMPLEMENTATION-TASKS.md')[0]
    || listMatching(tasksDir, `${featureId}-`, '.md')[0]
    || null;

  const completionMatches = listMatching(completionsDir, `${featureId}-`, '.md')
    .filter((filePath) => path.basename(filePath) !== '.gitkeep');

  return {
    specRoot,
    planPath,
    tasksPath,
    defaultPlanPath: path.join(plansDir, `${featureId}-PLAN.md`),
    defaultTasksPath: path.join(tasksDir, `${featureId}-IMPLEMENTATION-TASKS.md`),
    reviewPath: path.join(reviewsDir, `SECURITY_REVIEW_${featureId}.md`),
    completionPath: completionMatches[0] || path.join(completionsDir, `${featureId}-COMPLETION-SUMMARY.md`),
  };
}

export function toSpecRelativePath(specRoot, absPath) {
  if (!absPath) return '-';
  const specParent = path.dirname(specRoot);
  const fromParent = path.relative(specParent, absPath);
  if (!fromParent.startsWith('..') && !path.isAbsolute(fromParent)) return fromParent;
  const fromSpec = path.relative(specRoot, absPath);
  if (!fromSpec.startsWith('..') && !path.isAbsolute(fromSpec)) return fromSpec;
  return path.basename(absPath);
}

export function readIfExists(absPath) {
  if (!absPath || !fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath, 'utf-8');
}

export function writeText(absPath, content) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
}

export function describeArtifact(absPath, fallbackPath) {
  const resolved = absPath || fallbackPath;
  const content = readIfExists(resolved);
  return {
    path: resolved ? path.basename(resolved) : null,
    relativePath: resolved || null,
    exists: content !== null,
    content: content || '',
  };
}

export function loadTemplates(specRoot) {
  const templatesDir = path.join(specRoot, 'templates');
  const planTemplate = readIfExists(path.join(templatesDir, 'PLAN-TEMPLATE.md'));
  const tasksTemplate = readIfExists(path.join(templatesDir, 'TASKS-TEMPLATE.md'));
  return { planTemplate, tasksTemplate };
}

export function scaffoldArtifacts(specRoot, feature) {
  const paths = resolveArtifactPaths(specRoot, feature);
  const { planTemplate, tasksTemplate } = loadTemplates(specRoot);
  if (!planTemplate || !tasksTemplate) {
    throw new Error('specifications/templates/PLAN-TEMPLATE.md and TASKS-TEMPLATE.md are required. Inflate specifications first.');
  }

  const created = { plan: false, tasks: false };
  if (!paths.planPath) {
    writeText(paths.defaultPlanPath, applyPlaceholders(planTemplate, feature));
    paths.planPath = paths.defaultPlanPath;
    created.plan = true;
  }
  if (!paths.tasksPath) {
    writeText(paths.defaultTasksPath, applyPlaceholders(tasksTemplate, feature));
    paths.tasksPath = paths.defaultTasksPath;
    created.tasks = true;
  }
  return { paths, created };
}

export function checkPlanApprovalBoxes(tasksContent) {
  const replacements = [
    ['- [ ] Human reviewed the feature registry row.', '- [x] Human reviewed the feature registry row.'],
    ['- [ ] Human reviewed the plan.', '- [x] Human reviewed the plan.'],
    ['- [ ] Human reviewed this task list.', '- [x] Human reviewed this task list.'],
    ['- [ ] Human approved implementation.', '- [x] Human approved implementation.'],
  ];
  let next = tasksContent;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return next;
}

export function pipelineStage(status) {
  const value = status || '';
  if (value.includes('Planning')) return 'planning';
  if (value.includes('PlanReview')) return 'awaiting approval';
  if (value.includes('WorkInProgress')) return 'coding';
  if (value.includes('Testing')) return 'review';
  if (value.includes('ReadyToMerge')) return 'ready';
  return null;
}
