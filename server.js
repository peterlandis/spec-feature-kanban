/**
 * Lightweight server for Features Kanban - reads/writes FEATURES.md
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import {
  parseFeaturesMd,
  serializeToMarkdown,
  extractPreambleAndPostamble,
} from './parser.js';
import {
  checkPlanApprovalBoxes,
  describeArtifact,
  graphStage,
  graphStageLabel,
  isWaitingOnHuman,
  pipelineStage,
  resolveGitRoot,
  truncateForProcessUi,
  resolveArtifactPaths,
  resolveSpecRoot,
  scaffoldArtifacts,
  STATUS_BLOCKED,
  STATUS_COMPLETE,
  STATUS_READY_TO_MERGE,
  toSpecRelativePath,
  writeText,
} from './workflow/artifacts.js';
import { cursorModel, isCursorConfigured } from './workflow/cursor-adapter.js';
import { applyStoredSecrets, getCursorSetupStatus, getGithubSetupStatus, getOpenAiSetupStatus, getXaiSetupStatus, saveCursorSetup, saveGithubSetup, saveOpenAiSetup, saveXaiSetup } from './workflow/secrets.js';
import { loadModelsCache, modelsPayload, refreshCursorModels } from './workflow/models.js';
import {
  assertNoActiveRun,
  cancelFeatureRun,
  requireCursorConfigured,
  startImplementRun,
  startPlanningRun,
  startRevisionRun,
} from './workflow/runner.js';
import { findActiveRuns, getFeatureWorkflow, readWorkflowState, updateFeatureWorkflow } from './workflow/state.js';
import { checkoutFeatureBranch, describeFeatureBranch } from './workflow/git.js';
import {
  commitTrackingFileIfNeeded,
  createFeatureMergeRequest,
  describeShip,
  mergeNotesWithPrUrl,
} from './workflow/ship.js';
import {
  buildFeatureGraph,
  flattenFeaturesFromCategories,
  loadPlanContentsForFeatures,
} from './workflow/feature-relations.js';
import { briefJarvis } from './workflow/jarvis-brief.js';
import { buildJarvisContext } from './workflow/jarvis-context.js';
import { listJarvisVoices, synthesizeJarvisSpeech } from './workflow/jarvis-voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = __dirname;
const DEFAULT_FEATURES_RELATIVE_PATH = 'FEATURES.md';
const CONFIG_PATH = path.join(PROJECT_ROOT, '.features-kanban.json');

function getTemplateMarkdown() {
  return `# Feature Tracking (MVP)

This document tracks features and tasks for the project. Use this file to coordinate work, assign ownership, and track progress.

## Status Legend

- 🔨 **WorkInProgress** - Currently being developed
- 🧪 **Testing** - Feature is complete and being tested
- 🟢 **ReadyToMerge** - PR approved by reviewer, ready to merge
- ✅ **Complete** - Feature is complete and merged
- 📋 **Planned** - Planned but not started
- 📝 **Planning** - Writing plan and tasks
- 👀 **PlanReview** - Plan and tasks waiting on approval
- 🚫 **Blocked** - Blocked by dependencies or issues
- ⏸️ **Paused** - Temporarily paused

## Feature Categories

### 🔧 Core Features
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|

## How to Use This File

### Adding a New Feature

1. Create a new row in the appropriate category table
2. Assign a unique Feature ID (e.g., \`CAT-001\`)
3. Fill in Title, Description, Status, Assignee, and Notes
4. Set status to \`📋 Planned\` initially

### Updating Feature Status

1. Find the feature in the table
2. Update the Status column
3. Update Assignee if ownership changes
4. Add notes about progress or blockers
`;
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function safeWriteJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function isMarkdownPath(p) {
  const ext = path.extname(p || '').toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

function validateFeaturesMarkdownFormat(content) {
  const hasCategories = content.includes('## Feature Categories');
  const hasHowToUse = content.includes('## How to Use This File');
  const hasTableHeader = content.includes('| Feature ID |') && content.includes('| Status |');

  if (!hasCategories || !hasHowToUse || !hasTableHeader) {
    return {
      ok: false,
      error:
        'Selected file does not match the expected feature-tracking format. It must include "## Feature Categories", at least one feature table with a "| Feature ID |" header, and "## How to Use This File".',
    };
  }
  return { ok: true };
}

function resolveToAbsoluteFeaturesPath(p) {
  const raw = (p || '').trim();
  if (!raw) return null;
  const abs = path.isAbsolute(raw) ? raw : path.join(PROJECT_ROOT, raw);
  return path.normalize(abs);
}

function resolveNewFilePathWithinProjectRoot(fileNameOrPath) {
  const raw = (fileNameOrPath || '').trim();
  if (!raw) return null;

  // For creation, only allow project-relative paths to avoid writing outside the repo.
  if (path.isAbsolute(raw)) return null;

  const withExt = path.extname(raw) ? raw : `${raw}.md`;
  const abs = path.normalize(path.join(PROJECT_ROOT, withExt));
  const rel = path.relative(PROJECT_ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

function toDisplayPath(absPath) {
  const normalized = path.normalize(absPath);
  const rel = path.relative(PROJECT_ROOT, normalized);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel || '.';
  return normalized;
}

function ensureTemplateFileExists(absPath) {
  if (fs.existsSync(absPath)) return;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, getTemplateMarkdown(), 'utf-8');
}

function findFeaturesFiles(rootDir, maxDepth = 6) {
  const results = [];
  const skipDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build']);

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const abs = path.join(dir, entry.name);
        if (!isMarkdownPath(abs)) continue;
        try {
          const content = fs.readFileSync(abs, 'utf-8');
          const validated = validateFeaturesMarkdownFormat(content);
          if (validated.ok) {
            results.push(path.relative(PROJECT_ROOT, abs));
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  walk(rootDir, 0);
  return Array.from(new Set(results)).sort();
}

let runtimeConfig = safeReadJson(CONFIG_PATH) || {};
let activeFeaturesPath = null;

function setActiveFeaturesPath(absPath, { persist } = { persist: true }) {
  activeFeaturesPath = absPath;
  if (!persist) return;
  const displayPath = toDisplayPath(absPath);
  runtimeConfig = { ...runtimeConfig, featuresPath: displayPath };
  safeWriteJson(CONFIG_PATH, runtimeConfig);
}

function initActiveFeaturesPath() {
  const envOverride = process.env.FEATURES_PATH;
  if (envOverride) {
    const abs = resolveToAbsoluteFeaturesPath(envOverride);
    if (!abs) throw new Error('FEATURES_PATH is set but empty/invalid');
    if (!isMarkdownPath(abs)) throw new Error('FEATURES_PATH must point to a markdown file (e.g. .md)');
    ensureTemplateFileExists(abs);
    const validated = validateFeaturesMarkdownFormat(fs.readFileSync(abs, 'utf-8'));
    if (!validated.ok) throw new Error(validated.error);
    setActiveFeaturesPath(abs, { persist: false });
    return;
  }

  const configured = resolveToAbsoluteFeaturesPath(runtimeConfig.featuresPath);
  if (configured && isMarkdownPath(configured)) {
    ensureTemplateFileExists(configured);
    const validated = validateFeaturesMarkdownFormat(fs.readFileSync(configured, 'utf-8'));
    if (!validated.ok) throw new Error(validated.error);
    setActiveFeaturesPath(configured, { persist: false });
    return;
  }

  const candidates = findFeaturesFiles(PROJECT_ROOT);
  if (candidates.length > 0) {
    const abs = resolveToAbsoluteFeaturesPath(candidates[0]);
    ensureTemplateFileExists(abs);
    const validated = validateFeaturesMarkdownFormat(fs.readFileSync(abs, 'utf-8'));
    if (!validated.ok) throw new Error(validated.error);
    setActiveFeaturesPath(abs, { persist: true });
    return;
  }

  // First run: nothing selected and no FEATURES.md found -> create a template at the default location.
  const abs = resolveToAbsoluteFeaturesPath(DEFAULT_FEATURES_RELATIVE_PATH);
  ensureTemplateFileExists(abs);
  const validated = validateFeaturesMarkdownFormat(fs.readFileSync(abs, 'utf-8'));
  if (!validated.ok) throw new Error(validated.error);
  setActiveFeaturesPath(abs, { persist: true });
}

initActiveFeaturesPath();
applyStoredSecrets(PROJECT_ROOT);
loadModelsCache(PROJECT_ROOT);
if (isCursorConfigured()) {
  refreshCursorModels(PROJECT_ROOT).then((catalog) => {
    console.log(`Cursor models: ${catalog.models.length} available`);
    if (catalog.error) console.warn(`Cursor models refresh: ${catalog.error}`);
  });
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/** GET /api/config - Return active FEATURES.md selection */
app.get('/api/config', (req, res) => {
  res.json({
    featuresPath: toDisplayPath(activeFeaturesPath),
    usingEnvOverride: !!process.env.FEATURES_PATH,
    platform: process.platform,
    browseSupported: process.platform === 'darwin' && !process.env.FEATURES_PATH,
    ...getCursorSetupStatus(PROJECT_ROOT),
    ...getGithubSetupStatus(PROJECT_ROOT),
    ...getXaiSetupStatus(PROJECT_ROOT),
    ...getOpenAiSetupStatus(PROJECT_ROOT),
    jarvisVoices: listJarvisVoices(),
    ...modelsPayload(),
    cursorConfigured: isCursorConfigured(),
    cursorModel: cursorModel(),
  });
});

/** POST /api/cursor-models/refresh - Pull the latest Cursor models for this key */
app.post('/api/cursor-models/refresh', async (req, res) => {
  try {
    if (!isCursorConfigured()) {
      return res.status(400).json({
        error: 'Save a Cursor API key first.',
        ...modelsPayload(),
      });
    }
    const catalog = await refreshCursorModels(PROJECT_ROOT);
    res.json({
      ok: !catalog.error,
      error: catalog.error || undefined,
      ...getCursorSetupStatus(PROJECT_ROOT),
      ...modelsPayload(),
      cursorConfigured: isCursorConfigured(),
      cursorModel: cursorModel(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, ...modelsPayload() });
  }
});

/** PUT /api/cursor-settings - Save Cursor API key locally and apply it now */
app.put('/api/cursor-settings', async (req, res) => {
  try {
    const body = req.body || {};
    const status = saveCursorSetup(PROJECT_ROOT, {
      apiKey: body.apiKey,
      model: body.model,
      clear: false,
    });
    if (isCursorConfigured() && body.apiKey) {
      await refreshCursorModels(PROJECT_ROOT);
    }
    res.json({
      ok: true,
      ...status,
      ...modelsPayload(),
      cursorConfigured: isCursorConfigured(),
      cursorModel: cursorModel(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/cursor-settings - Remove the key saved in the app */
app.delete('/api/cursor-settings', (req, res) => {
  try {
    const status = saveCursorSetup(PROJECT_ROOT, { clear: true });
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/github-settings - Save a GitHub token locally for gh / Ship */
app.put('/api/github-settings', (req, res) => {
  try {
    const status = saveGithubSetup(PROJECT_ROOT, {
      token: (req.body || {}).token,
      clear: false,
    });
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/github-settings - Remove the GitHub token saved in the app */
app.delete('/api/github-settings', (req, res) => {
  try {
    const status = saveGithubSetup(PROJECT_ROOT, { clear: true });
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/xai-settings - Save an xAI key for optional Grok Jarvis speech */
app.put('/api/xai-settings', (req, res) => {
  try {
    const body = req.body || {};
    saveXaiSetup(PROJECT_ROOT, {
      apiKey: body.apiKey,
      voiceId: body.voiceId,
      clear: false,
    });
    res.json({
      ok: true,
      ...getXaiSetupStatus(PROJECT_ROOT),
      ...getOpenAiSetupStatus(PROJECT_ROOT),
      jarvisVoices: listJarvisVoices(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/xai-settings - Remove the xAI key saved in the app */
app.delete('/api/xai-settings', (req, res) => {
  try {
    saveXaiSetup(PROJECT_ROOT, { clear: true });
    res.json({
      ok: true,
      ...getXaiSetupStatus(PROJECT_ROOT),
      ...getOpenAiSetupStatus(PROJECT_ROOT),
      jarvisVoices: listJarvisVoices(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/openai-settings - Save an OpenAI key for optional Jarvis speech */
app.put('/api/openai-settings', (req, res) => {
  try {
    const body = req.body || {};
    saveOpenAiSetup(PROJECT_ROOT, {
      apiKey: body.apiKey,
      voiceId: body.voiceId,
      clear: false,
    });
    res.json({
      ok: true,
      ...getXaiSetupStatus(PROJECT_ROOT),
      ...getOpenAiSetupStatus(PROJECT_ROOT),
      jarvisVoices: listJarvisVoices(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/openai-settings - Remove the OpenAI key saved in the app */
app.delete('/api/openai-settings', (req, res) => {
  try {
    saveOpenAiSetup(PROJECT_ROOT, { clear: true });
    res.json({
      ok: true,
      ...getXaiSetupStatus(PROJECT_ROOT),
      ...getOpenAiSetupStatus(PROJECT_ROOT),
      jarvisVoices: listJarvisVoices(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/features-files - List candidate FEATURES.md files under the project root */
app.get('/api/features-files', (req, res) => {
  res.json({
    candidates: findFeaturesFiles(PROJECT_ROOT),
    active: toDisplayPath(activeFeaturesPath),
  });
});

/** PUT /api/config - Update active FEATURES.md selection */
app.put('/api/config', (req, res) => {
  try {
    if (process.env.FEATURES_PATH) {
      return res.status(409).json({ error: 'FEATURES_PATH env override is set; cannot change selection via UI.' });
    }
    const { featuresPath } = req.body || {};
    const abs = resolveToAbsoluteFeaturesPath(featuresPath);
    if (!abs) return res.status(400).json({ error: 'featuresPath is required' });
    if (!isMarkdownPath(abs)) return res.status(400).json({ error: 'featuresPath must point to a markdown file (e.g. .md)' });
    ensureTemplateFileExists(abs);
    const validated = validateFeaturesMarkdownFormat(fs.readFileSync(abs, 'utf-8'));
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    setActiveFeaturesPath(abs, { persist: true });
    res.json({ ok: true, featuresPath: toDisplayPath(activeFeaturesPath) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/create-features-file - Create a new feature tracking file (project-relative) and switch to it */
app.post('/api/create-features-file', (req, res) => {
  try {
    if (process.env.FEATURES_PATH) {
      return res.status(409).json({ error: 'FEATURES_PATH env override is set; cannot create/switch files via UI.' });
    }

    const { fileName } = req.body || {};
    const abs = resolveNewFilePathWithinProjectRoot(fileName);
    if (!abs) return res.status(400).json({ error: 'fileName must be a project-relative path (e.g. FEATURES_MVP.md)' });
    if (!isMarkdownPath(abs)) return res.status(400).json({ error: 'fileName must be a markdown file (e.g. .md)' });
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'File already exists' });

    ensureTemplateFileExists(abs);
    const validated = validateFeaturesMarkdownFormat(fs.readFileSync(abs, 'utf-8'));
    if (!validated.ok) return res.status(500).json({ error: 'Template validation failed' });

    setActiveFeaturesPath(abs, { persist: true });
    res.json({ ok: true, featuresPath: toDisplayPath(activeFeaturesPath) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/browse-features - Open OS file picker and select a FEATURES.md file (macOS only) */
app.post('/api/browse-features', (req, res) => {
  try {
    if (process.env.FEATURES_PATH) {
      return res.status(409).json({ error: 'FEATURES_PATH env override is set; cannot change selection via UI.' });
    }
    if (process.platform !== 'darwin') {
      return res.status(501).json({ error: 'Browsing is currently supported only on macOS.' });
    }

    // AppleScript: show native file picker and return POSIX path.
    let selectedPath;
    try {
      selectedPath = execFileSync('osascript', [
        '-e',
        'POSIX path of (choose file with prompt "Select FEATURES.md")',
      ], { encoding: 'utf-8' }).trim();
    } catch (err) {
      // User cancelled: AppleScript typically returns error -128.
      return res.json({ cancelled: true });
    }

    const abs = resolveToAbsoluteFeaturesPath(selectedPath);
    if (!abs) return res.status(400).json({ error: 'No file selected' });
    if (!isMarkdownPath(abs)) return res.status(400).json({ error: 'Selected file must be a markdown file (e.g. .md)' });
    ensureTemplateFileExists(abs);
    const validated = validateFeaturesMarkdownFormat(fs.readFileSync(abs, 'utf-8'));
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    setActiveFeaturesPath(abs, { persist: true });
    res.json({ ok: true, featuresPath: toDisplayPath(activeFeaturesPath) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function readFeaturesFile() {
  return fs.readFileSync(activeFeaturesPath, 'utf-8');
}

function writeFeaturesFile(content) {
  fs.writeFileSync(activeFeaturesPath, content, 'utf-8');
}

function findFeatureInParsed(parsed, featureId) {
  for (const category of parsed.categories) {
    const feature = category.features.find((item) => item.featureId === featureId);
    if (feature) return { feature, category };
  }
  return null;
}

function loadRegistry() {
  const content = readFeaturesFile();
  const { preamble, postamble } = extractPreambleAndPostamble(content);
  const parsed = parseFeaturesMd(content);
  return { content, preamble, postamble, parsed };
}

function saveRegistry(parsed, preamble, postamble) {
  writeFeaturesFile(serializeToMarkdown(parsed, preamble || '', postamble || ''));
}

function processFieldsForFeature(feature, workflow) {
  const wf = workflow || {};
  const stageId = graphStage(feature.status, wf);
  const lastLine = truncateForProcessUi(wf.lastAssistantText);
  const transcript = Array.isArray(wf.transcript) ? wf.transcript : [];
  const lastTx = transcript.length ? transcript[transcript.length - 1] : null;
  const activityLine = lastLine || truncateForProcessUi(
    lastTx && lastTx.text ? `${lastTx.title || lastTx.kind}: ${lastTx.text}` : '',
  );
  return {
    planApprovedAt: wf.planApprovedAt || null,
    runStatus: wf.runStatus || null,
    workflowKind: wf.kind || null,
    pipeline: pipelineStage(feature.status, wf),
    graphStage: stageId,
    graphStageLabel: graphStageLabel(stageId),
    waitingOnHuman: isWaitingOnHuman(feature.status, wf, stageId),
    activityLine,
    lastError: wf.lastError ? truncateForProcessUi(wf.lastError, 120) : null,
  };
}

function attachWorkflowSummaries(categories) {
  const specRoot = resolveSpecRoot(activeFeaturesPath);
  const cwd = resolveGitRoot(activeFeaturesPath);
  const workflows = readWorkflowState(specRoot).features || {};
  return (categories || []).map((category) => ({
    ...category,
    features: (category.features || []).map((feature) => {
      const workflow = workflows[feature.featureId] || {};
      const git = describeFeatureBranch({
        cwd,
        featureId: feature.featureId,
        storedBranch: workflow.branch,
      });
      return {
        ...feature,
        ...processFieldsForFeature(feature, workflow),
        branch: git.branch,
        branchCurrent: git.isCurrent,
        branchExists: git.exists,
        branchSource: git.source,
      };
    }),
  }));
}

function updateFeatureFields(featureId, patch) {
  const { preamble, postamble, parsed } = loadRegistry();
  const found = findFeatureInParsed(parsed, featureId);
  if (!found) return null;
  Object.assign(found.feature, patch);
  saveRegistry(parsed, preamble, postamble);
  return found.feature;
}

function buildWorkspacePayload(feature) {
  const specRoot = resolveSpecRoot(activeFeaturesPath);
  const paths = resolveArtifactPaths(specRoot, feature);
  const workflow = getFeatureWorkflow(specRoot, feature.featureId);
  const artifacts = {
    plan: describeArtifact(paths.planPath, paths.defaultPlanPath),
    tasks: describeArtifact(paths.tasksPath, paths.defaultTasksPath),
    review: describeArtifact(paths.reviewPath, paths.reviewPath),
    completion: describeArtifact(paths.completionPath, paths.completionPath),
  };
  return {
    feature,
    stage: pipelineStage(feature.status, workflow),
    workflow,
    git: describeFeatureBranch({
      cwd: resolveGitRoot(activeFeaturesPath),
      featureId: feature.featureId,
      storedBranch: workflow && workflow.branch,
    }),
    specRoot: path.basename(specRoot),
    artifacts,
    ship: describeShip({
      feature,
      completionContent: artifacts.completion.content,
      reviewContent: artifacts.review.content,
      workflow,
      cwd: resolveGitRoot(activeFeaturesPath),
    }),
  };
}

/** GET /api/workflow/process-summary - Read-only fleet snapshot for Process view */
app.get('/api/workflow/process-summary', (req, res) => {
  try {
    const content = readFeaturesFile();
    const parsed = parseFeaturesMd(content);
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const workflows = readWorkflowState(specRoot).features || {};
    const features = [];
    for (const category of parsed.categories || []) {
      for (const feature of category.features || []) {
        const workflow = workflows[feature.featureId] || {};
        features.push({
          featureId: feature.featureId,
          title: feature.title,
          status: feature.status,
          ...processFieldsForFeature(feature, workflow),
        });
      }
    }
    res.json({ features, activeRunCount: Object.keys(findActiveRuns(specRoot)).length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/features - Parse and return features as JSON */
app.get('/api/features', (req, res) => {
  try {
    const content = readFeaturesFile();
    const { preamble, postamble } = extractPreambleAndPostamble(content);
    const parsed = parseFeaturesMd(content);
    const categories = attachWorkflowSummaries(parsed.categories);
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const flat = flattenFeaturesFromCategories(categories);
    const planContentsById = loadPlanContentsForFeatures(specRoot, flat);
    const graph = buildFeatureGraph(flat, { planContentsById });
    res.json({
      categories,
      graph,
      preamble,
      postamble,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jarvis/speak — local Mac, browser fallback, or optional Grok / OpenAI neural speech.
 * Local `say` text is an execFile argument, never a shell string.
 */
app.post('/api/jarvis/speak', async (req, res) => {
  try {
    const body = req.body || {};
    const text = String(body.text || '');
    const xai = getXaiSetupStatus(PROJECT_ROOT);
    const { buffer, mime, voice, engine } = await synthesizeJarvisSpeech(text, {
      voiceId: body.voiceId || xai.jarvisVoiceId,
      natural: !!body.natural,
    });
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Jarvis-Voice', voice);
    res.setHeader('X-Jarvis-Engine', engine || 'local');
    res.send(buffer);
  } catch (err) {
    const status = err && (err.code === 'EMPTY' || err.code === 'NO_GROK' || err.code === 'NO_OPENAI') ? 400
      : err && err.code === 'BROWSER' ? 409
      : 501;
    res.status(status).json({
      error: err.message || 'Jarvis voice unavailable.',
      fallback: true,
    });
  }
});

/**
 * POST /api/jarvis/chat — brief from a frozen graph snapshot only.
 * Grok / OpenAI voices get a conversational brief; otherwise local snapshot.
 * Never starts planning, implement, or ship.
 */
app.post('/api/jarvis/chat', async (req, res) => {
  try {
    const body = req.body || {};
    const features = Array.isArray(body.features) ? body.features : [];
    const graph = body.graph && typeof body.graph === 'object' ? body.graph : { edges: [] };
    const context = buildJarvisContext(features, graph);
    if (!context.nodes.length) {
      return res.status(400).json({ error: 'Jarvis needs a live graph snapshot.' });
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((item) => item && item.role === 'user');
    const result = await briefJarvis(lastUser && lastUser.content, context, {
      voiceId: body.voiceId,
      messages,
    });
    res.json({
      reply: result.reply,
      mentionIds: result.mentionIds || [],
      confirm: result.confirm || null,
      source: result.source || 'graph-snapshot',
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Jarvis could not answer.' });
  }
});

/** PUT /api/features - Update FEATURES.md from JSON body */
app.put('/api/features', (req, res) => {
  try {
    const { categories, preamble, postamble } = req.body;
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories array required' });
    }
    const parsed = { categories };
    const content = serializeToMarkdown(parsed, preamble || '', postamble || '');
    writeFeaturesFile(content);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/features/:featureId/workspace - Feature plus plan/task/review artifacts */
app.get('/api/features/:featureId/workspace', (req, res) => {
  try {
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });
    res.json(buildWorkspacePayload(found.feature));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/features/:featureId/start-planning
 * Requires { confirmed: true }. Scaffolds templates, then starts a local Cursor agent.
 */
app.post('/api/features/:featureId/start-planning', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Start planning requires an explicit confirmed: true payload.' });
    }
    requireCursorConfigured();
    const { preamble, postamble, parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });

    const specRoot = resolveSpecRoot(activeFeaturesPath);
    assertNoActiveRun(specRoot, found.feature.featureId);
    const { paths, created } = scaffoldArtifacts(specRoot, found.feature);
    found.feature.planDocument = toSpecRelativePath(specRoot, paths.planPath);
    saveRegistry(parsed, preamble, postamble);
    startPlanningRun({
      specRoot,
      feature: found.feature,
      featuresAbsPath: activeFeaturesPath,
      updateFeatureStatus: (status) => updateFeatureFields(found.feature.featureId, { status }),
    });
    const reloaded = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
    res.json({
      ok: true,
      created,
      workspace: buildWorkspacePayload(reloaded ? reloaded.feature : found.feature),
    });
  } catch (err) {
    const status = /CURSOR_API_KEY|confirmed/.test(err.message) ? 400
      : /already active/.test(err.message) ? 409
      : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  }
});

/** PUT /api/features/:featureId/artifacts - Save plan or tasks markdown */
app.put('/api/features/:featureId/artifacts', (req, res) => {
  try {
    const kind = (req.body || {}).kind;
    const content = (req.body || {}).content;
    if (kind !== 'plan' && kind !== 'tasks') {
      return res.status(400).json({ error: 'kind must be "plan" or "tasks"' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });

    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const paths = resolveArtifactPaths(specRoot, found.feature);
    const targetPath = kind === 'plan'
      ? (paths.planPath || paths.defaultPlanPath)
      : (paths.tasksPath || paths.defaultTasksPath);
    writeText(targetPath, content);
    res.json({ ok: true, workspace: buildWorkspacePayload(found.feature) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/features/:featureId/approve-plan
 * Records human approval. Does not start implementation.
 */
app.post('/api/features/:featureId/approve-plan', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Approve plan requires an explicit confirmed: true payload.' });
    }
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });

    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const paths = resolveArtifactPaths(specRoot, found.feature);
    const tasksPath = paths.tasksPath || paths.defaultTasksPath;
    const currentTasks = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, 'utf-8') : null;
    if (!currentTasks) {
      return res.status(400).json({ error: 'Task file does not exist yet. Start planning first.' });
    }
    writeText(tasksPath, checkPlanApprovalBoxes(currentTasks));
    const workflow = updateFeatureWorkflow(specRoot, found.feature.featureId, {
      stage: 'planApproved',
      planApprovedAt: new Date().toISOString(),
    });
    res.json({
      ok: true,
      workflow,
      workspace: buildWorkspacePayload(found.feature),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/features/:featureId/revise - Resume the same agent with a revision note */
app.post('/api/features/:featureId/revise', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Revise requires an explicit confirmed: true payload.' });
    }
    const note = String((req.body.note || '')).trim();
    if (!note) return res.status(400).json({ error: 'Revision note is required.' });
    requireCursorConfigured();
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    assertNoActiveRun(specRoot, found.feature.featureId);
    updateFeatureWorkflow(specRoot, found.feature.featureId, { planApprovedAt: null });
    startRevisionRun({
      specRoot,
      feature: found.feature,
      featuresAbsPath: activeFeaturesPath,
      note,
      updateFeatureStatus: (status) => updateFeatureFields(found.feature.featureId, { status }),
    });
    const reloaded = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
    res.json({ ok: true, workspace: buildWorkspacePayload(reloaded ? reloaded.feature : found.feature) });
  } catch (err) {
    const status = /CURSOR_API_KEY|confirmed|Revision note/.test(err.message) ? 400
      : /already active/.test(err.message) ? 409
      : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  }
});

/** POST /api/features/:featureId/implement - Starts coding only after plan approval */
app.post('/api/features/:featureId/implement', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Implement requires an explicit confirmed: true payload.' });
    }
    requireCursorConfigured();
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const workflow = getFeatureWorkflow(specRoot, found.feature.featureId);
    if (!workflow || !workflow.planApprovedAt) {
      return res.status(400).json({ error: 'Approve the plan before starting implementation.' });
    }
    assertNoActiveRun(specRoot, found.feature.featureId);
    startImplementRun({
      specRoot,
      feature: found.feature,
      featuresAbsPath: activeFeaturesPath,
      updateFeatureStatus: (status) => updateFeatureFields(found.feature.featureId, { status }),
    });
    const reloaded = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
    res.json({ ok: true, workspace: buildWorkspacePayload(reloaded ? reloaded.feature : found.feature) });
  } catch (err) {
    const status = /CURSOR_API_KEY|confirmed|Approve the plan/.test(err.message) ? 400
      : /already active/.test(err.message) ? 409
      : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/features/:featureId/ship
 * Requires { confirmed: true }. Approves review artifacts and opens a draft MR.
 * Does not merge.
 */
app.post('/api/features/:featureId/ship', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Ship requires an explicit confirmed: true payload.' });
    }
    const prTitle = String(req.body.title || '').trim();
    const prBody = String(req.body.body || '').trim();
    if (!prTitle || !prBody) {
      return res.status(400).json({ error: 'Review and edit the draft PR title and description before creating the merge request.' });
    }
    const { parsed, preamble, postamble } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });

    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const cwd = resolveGitRoot(activeFeaturesPath);
    const paths = resolveArtifactPaths(specRoot, found.feature);
    const completion = describeArtifact(paths.completionPath, paths.completionPath);
    const review = describeArtifact(paths.reviewPath, paths.reviewPath);
    const shipInfo = describeShip({
      feature: found.feature,
      completionContent: completion.content,
      reviewContent: review.content,
      workflow: getFeatureWorkflow(specRoot, found.feature.featureId),
    });

    if (shipInfo.missing.length) {
      return res.status(400).json({
        error: `Review artifacts are incomplete: missing ${shipInfo.missing.join(' and ')}.`,
      });
    }
    if (shipInfo.securityBlocked) {
      updateFeatureFields(found.feature.featureId, { status: STATUS_BLOCKED });
      updateFeatureWorkflow(specRoot, found.feature.featureId, {
        stage: 'blocked',
        lastError: shipInfo.securityReason,
      });
      const blocked = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
      return res.status(409).json({
        error: shipInfo.securityReason,
        workspace: buildWorkspacePayload(blocked ? blocked.feature : found.feature),
      });
    }

    updateFeatureWorkflow(specRoot, found.feature.featureId, {
      stage: 'shipping',
      shipApprovedAt: new Date().toISOString(),
      lastError: null,
    });

    const created = createFeatureMergeRequest({
      cwd,
      feature: found.feature,
      completionContent: completion.content,
      reviewContent: review.content,
      title: prTitle,
      body: prBody,
    });

    found.feature.notes = mergeNotesWithPrUrl(found.feature.notes, created.url);
    found.feature.status = STATUS_READY_TO_MERGE;
    saveRegistry(parsed, preamble, postamble);
    commitTrackingFileIfNeeded(cwd, activeFeaturesPath, found.feature);
    updateFeatureWorkflow(specRoot, found.feature.featureId, {
      stage: 'ready',
      mrUrl: created.url,
      branch: describeFeatureBranch({
        cwd,
        featureId: found.feature.featureId,
        storedBranch: created.branch || null,
      }).branch,
      lastError: null,
    });

    const reloaded = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
    res.json({
      ok: true,
      mrUrl: created.url,
      reused: created.reused,
      committed: created.committed,
      workspace: buildWorkspacePayload(reloaded ? reloaded.feature : found.feature),
    });
  } catch (err) {
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    updateFeatureWorkflow(specRoot, req.params.featureId, {
      lastError: err.message,
    });
    const status = /confirmed|incomplete|missing|feature branch|named git branch/i.test(err.message) ? 400
      : /gh |git push|not installed|auth/i.test(err.message) ? 400
      : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/features/:featureId/checkout-branch
 * Requires { confirmed: true }. Checks out the feature branch locally.
 */
app.post('/api/features/:featureId/checkout-branch', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Checkout requires an explicit confirmed: true payload.' });
    }
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const cwd = resolveGitRoot(activeFeaturesPath);
    const workflow = getFeatureWorkflow(specRoot, found.feature.featureId) || {};
    const git = describeFeatureBranch({
      cwd,
      featureId: found.feature.featureId,
      storedBranch: workflow.branch,
    });
    const result = checkoutFeatureBranch(cwd, git.branch);
    updateFeatureWorkflow(specRoot, found.feature.featureId, {
      branch: result.branch,
      lastError: null,
    });
    const reloaded = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
    res.json({
      ok: true,
      ...result,
      workspace: buildWorkspacePayload(reloaded ? reloaded.feature : found.feature),
    });
  } catch (err) {
    const status = /working tree has local changes|Branch name is required/i.test(err.message) ? 409 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/features/:featureId/complete
 * Requires { confirmed: true }. Marks the feature Complete in FEATURES.md.
 * Does not merge on GitHub.
 */
app.post('/api/features/:featureId/complete', (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Mark complete requires an explicit confirmed: true payload.' });
    }
    const { parsed } = loadRegistry();
    const found = findFeatureInParsed(parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });

    const specRoot = resolveSpecRoot(activeFeaturesPath);
    const updated = updateFeatureFields(found.feature.featureId, { status: STATUS_COMPLETE });
    updateFeatureWorkflow(specRoot, found.feature.featureId, {
      stage: 'complete',
      completedAt: new Date().toISOString(),
      lastError: null,
    });
    const reloaded = findFeatureInParsed(loadRegistry().parsed, found.feature.featureId);
    res.json({
      ok: true,
      workspace: buildWorkspacePayload(reloaded ? reloaded.feature : updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/features/:featureId/cancel - Cancel the in-flight Cursor run */
app.post('/api/features/:featureId/cancel', async (req, res) => {
  try {
    if (!req.body || req.body.confirmed !== true) {
      return res.status(400).json({ error: 'Cancel requires an explicit confirmed: true payload.' });
    }
    const specRoot = resolveSpecRoot(activeFeaturesPath);
    await cancelFeatureRun(specRoot, req.params.featureId, activeFeaturesPath);
    const found = findFeatureInParsed(loadRegistry().parsed, req.params.featureId);
    if (!found) return res.status(404).json({ error: 'Feature not found' });
    res.json({ ok: true, workspace: buildWorkspacePayload(found.feature) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = parseInt(process.env.PORT || '3456', 10);

function tryListen(port) {
  const server = app.listen(port, () => {
    console.log(`Features Kanban running at http://localhost:${server.address().port}`);
    console.log(`FEATURES.md path: ${activeFeaturesPath}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      tryListen(port + 1);
    } else {
      throw err;
    }
  });
}

tryListen(PORT);
