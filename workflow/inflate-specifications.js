/**
 * Idempotent specifications/ inflate (CORE-032).
 * Creates missing folders and template files; never overwrites existing content.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSpecRoot, writeText } from './artifacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_SCAFFOLD_ASSETS_DIR = path.join(__dirname, 'spec-scaffold-assets');

const SUBDIRS = ['completions', 'plans', 'reviews', 'tasks', 'templates'];
const TEMPLATE_FILES = [
  'PLAN-TEMPLATE.md',
  'TASKS-TEMPLATE.md',
  'SECURITY-REVIEW-TEMPLATE.md',
  'COMPLETION-SUMMARY-TEMPLATE.md',
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function applyPlaceholders(text, options = {}) {
  let next = String(text || '');
  const projectName = String(options.projectName || '').trim();
  const tagline = String(options.tagline || '').trim();
  const maintainer = String(options.maintainer || '').trim();
  if (projectName) next = next.split('<PROJECT_NAME>').join(projectName);
  if (tagline) next = next.split('<PROJECT_TAGLINE>').join(tagline);
  if (maintainer) next = next.split('<MAINTAINER>').join(maintainer);
  next = next.split('<YYYY-MM-DD>').join(todayIsoDate());
  return next;
}

function readAsset(relativePath) {
  const abs = path.join(SPEC_SCAFFOLD_ASSETS_DIR, relativePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing scaffold asset: ${relativePath}`);
  }
  return fs.readFileSync(abs, 'utf-8');
}

function ensureDir(dirPath, created) {
  if (fs.existsSync(dirPath)) return;
  fs.mkdirSync(dirPath, { recursive: true });
  created.push(dirPath);
}

function ensureFile(absPath, content, created) {
  if (fs.existsSync(absPath)) return false;
  writeText(absPath, content);
  created.push(absPath);
  return true;
}

function ensureGitkeep(dirPath, created) {
  const keep = path.join(dirPath, '.gitkeep');
  if (fs.existsSync(keep)) return;
  const hasEntries = fs.existsSync(dirPath)
    && fs.readdirSync(dirPath).some((name) => name !== '.gitkeep');
  if (hasEntries) return;
  writeText(keep, '');
  created.push(keep);
}

/**
 * Ensure the specifications layout exists for a FEATURES.md path.
 * @param {string} featuresAbsPath
 * @param {{ projectName?: string, tagline?: string, maintainer?: string, createFeaturesFile?: boolean }} [options]
 */
export function ensureSpecScaffold(featuresAbsPath, options = {}) {
  if (!featuresAbsPath) {
    throw new Error('featuresAbsPath is required to inflate specifications.');
  }
  const created = [];
  const skipped = [];
  const specRoot = resolveSpecRoot(featuresAbsPath);

  ensureDir(specRoot, created);
  for (const name of SUBDIRS) {
    const dir = path.join(specRoot, name);
    ensureDir(dir, created);
    if (name !== 'templates') ensureGitkeep(dir, created);
  }

  for (const name of TEMPLATE_FILES) {
    const dest = path.join(specRoot, 'templates', name);
    if (fs.existsSync(dest)) {
      skipped.push(dest);
      continue;
    }
    ensureFile(dest, readAsset(path.join('templates', name)), created);
  }

  const readmePath = path.join(specRoot, 'README.md');
  if (fs.existsSync(readmePath)) skipped.push(readmePath);
  else {
    ensureFile(
      readmePath,
      applyPlaceholders(readAsset('README-TEMPLATE.md'), options),
      created,
    );
  }

  const featuresPath = featuresAbsPath;
  if (!fs.existsSync(featuresPath)) {
    if (options.createFeaturesFile === false) {
      skipped.push(featuresPath);
    } else {
      ensureFile(
        featuresPath,
        applyPlaceholders(readAsset('FEATURES-TEMPLATE.md'), {
          projectName: options.projectName || path.basename(path.dirname(specRoot)) || 'Project',
          tagline: options.tagline || 'Spec-driven feature tracking',
          maintainer: options.maintainer || '-',
        }),
        created,
      );
    }
  } else {
    skipped.push(featuresPath);
  }

  // Prefer canonical path when FEATURES lives in specifications/
  const canonicalFeatures = path.join(specRoot, 'FEATURES.md');
  if (path.normalize(featuresPath) !== path.normalize(canonicalFeatures) && !fs.existsSync(canonicalFeatures)) {
    // Do not duplicate FEATURES into specifications/ if the active file is elsewhere.
  }

  return {
    specRoot,
    featuresPath,
    created: created.map((abs) => abs),
    skipped: skipped.map((abs) => abs),
    createdCount: created.length,
  };
}

export function summarizeScaffold(result) {
  if (!result || !result.createdCount) {
    return { message: null, createdCount: 0 };
  }
  const names = result.created
    .map((abs) => {
      const rel = path.relative(result.specRoot, abs);
      if (!rel || rel === '.') return path.basename(result.specRoot);
      return rel.startsWith('..') ? path.basename(abs) : rel;
    })
    .slice(0, 8);
  const more = result.createdCount > names.length ? ` (+${result.createdCount - names.length} more)` : '';
  return {
    message: `Inflated specifications layout (${result.createdCount} new): ${names.join(', ')}${more}`,
    createdCount: result.createdCount,
  };
}
