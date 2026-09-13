/**
 * Cursor model catalog via Cursor.models.list().
 * Docs: https://cursor.com/docs/sdk/typescript
 */

import fs from 'fs';
import path from 'path';
import { Cursor } from '@cursor/sdk';

const CACHE_NAME = '.features-models.json';

function emptyCatalog() {
  return { models: [], updatedAt: null, error: null };
}

let catalog = emptyCatalog();

function cachePath(projectRoot) {
  return path.join(projectRoot, CACHE_NAME);
}

function normalizeModel(item) {
  if (!item || typeof item !== 'object') return null;
  const nested = item.model && typeof item.model === 'object' ? item.model : null;
  const id = String(item.id || nested?.id || '').trim();
  if (!id) return null;
  return {
    id,
    displayName: String(item.displayName || id),
    description: item.description ? String(item.description) : '',
  };
}

export function getCachedModels() {
  return catalog;
}

export function loadModelsCache(projectRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(projectRoot), 'utf-8'));
    const models = Array.isArray(parsed.models)
      ? parsed.models.map(normalizeModel).filter(Boolean)
      : [];
    catalog = {
      models,
      updatedAt: parsed.updatedAt || null,
      error: null,
    };
  } catch {
    catalog = emptyCatalog();
  }
  return catalog;
}

function persistCache(projectRoot) {
  fs.writeFileSync(
    cachePath(projectRoot),
    JSON.stringify({ models: catalog.models, updatedAt: catalog.updatedAt }, null, 2) + '\n',
    { encoding: 'utf-8', mode: 0o600 }
  );
  try {
    fs.chmodSync(cachePath(projectRoot), 0o600);
  } catch {
    // ignore platforms that cannot chmod
  }
}

export async function refreshCursorModels(projectRoot) {
  const apiKey = (process.env.CURSOR_API_KEY || '').trim();
  if (!apiKey) {
    catalog = {
      models: catalog.models,
      updatedAt: catalog.updatedAt,
      error: 'Save a Cursor API key to load the latest models.',
    };
    return catalog;
  }

  try {
    const listed = await Cursor.models.list({ apiKey });
    const models = (Array.isArray(listed) ? listed : [])
      .map(normalizeModel)
      .filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    catalog = {
      models,
      updatedAt: new Date().toISOString(),
      error: models.length ? null : 'Cursor returned no models for this key.',
    };
    persistCache(projectRoot);
    return catalog;
  } catch (err) {
    catalog = {
      models: catalog.models,
      updatedAt: catalog.updatedAt,
      error: err && err.message ? err.message : 'Failed to refresh Cursor models.',
    };
    return catalog;
  }
}

export function modelsPayload() {
  return {
    cursorModels: catalog.models,
    cursorModelsUpdatedAt: catalog.updatedAt,
    cursorModelsError: catalog.error,
  };
}
