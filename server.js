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
  });
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

/** GET /api/features - Parse and return features as JSON */
app.get('/api/features', (req, res) => {
  try {
    const content = readFeaturesFile();
    const { preamble, postamble } = extractPreambleAndPostamble(content);
    const parsed = parseFeaturesMd(content);
    res.json({
      categories: parsed.categories,
      preamble,
      postamble,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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
