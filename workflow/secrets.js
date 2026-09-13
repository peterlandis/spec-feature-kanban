/**
 * Local secrets for Cursor setup. Never expose the raw key over the API.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_MODEL = 'composer-2.5';

function secretsPath(projectRoot) {
  return path.join(projectRoot, '.features-secrets.json');
}

function emptySecrets() {
  return { cursorApiKey: '', cursorModel: '', githubToken: '' };
}

function readSecretsFile(projectRoot) {
  const filePath = secretsPath(projectRoot);
  try {
    if (!fs.existsSync(filePath)) return emptySecrets();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return emptySecrets();
    return {
      cursorApiKey: String(parsed.cursorApiKey || '').trim(),
      cursorModel: String(parsed.cursorModel || '').trim(),
      githubToken: String(parsed.githubToken || '').trim(),
    };
  } catch {
    return emptySecrets();
  }
}

function writeSecretsFile(projectRoot, secrets) {
  const filePath = secretsPath(projectRoot);
  const next = {
    cursorApiKey: String(secrets.cursorApiKey || '').trim(),
    cursorModel: String(secrets.cursorModel || '').trim(),
    githubToken: String(secrets.githubToken || '').trim(),
  };
  if (!next.cursorApiKey && !next.cursorModel && !next.githubToken) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore platforms that cannot chmod
  }
}

function keyHint(key) {
  const value = String(key || '').trim();
  if (value.length < 4) return null;
  return value.slice(-4);
}

export function applyStoredSecrets(projectRoot) {
  const stored = readSecretsFile(projectRoot);
  if (stored.cursorApiKey && !(process.env.CURSOR_API_KEY || '').trim()) {
    process.env.CURSOR_API_KEY = stored.cursorApiKey;
  }
  if (stored.cursorModel && !(process.env.CURSOR_MODEL || '').trim()) {
    process.env.CURSOR_MODEL = stored.cursorModel;
  }
  if (stored.githubToken && !(process.env.GH_TOKEN || '').trim() && !(process.env.GITHUB_TOKEN || '').trim()) {
    process.env.GH_TOKEN = stored.githubToken;
  }
}

export function getCursorSetupStatus(projectRoot) {
  const stored = readSecretsFile(projectRoot);
  const envKey = (process.env.CURSOR_API_KEY || '').trim();
  const envModel = (process.env.CURSOR_MODEL || '').trim();
  const activeKey = envKey || stored.cursorApiKey;
  let source = 'none';
  if (envKey && stored.cursorApiKey && envKey === stored.cursorApiKey) source = 'file';
  else if (envKey && !stored.cursorApiKey) source = 'env';
  else if (envKey && stored.cursorApiKey && envKey !== stored.cursorApiKey) source = 'env';
  else if (stored.cursorApiKey) source = 'file';
  return {
    cursorConfigured: Boolean(activeKey),
    cursorKeySource: source,
    cursorKeyHint: keyHint(activeKey),
    cursorModel: envModel || stored.cursorModel || DEFAULT_MODEL,
    savedInApp: Boolean(stored.cursorApiKey),
  };
}

export function saveCursorSetup(projectRoot, { apiKey, model, clear }) {
  const current = readSecretsFile(projectRoot);
  if (clear) {
    writeSecretsFile(projectRoot, { ...current, cursorApiKey: '', cursorModel: '' });
    delete process.env.CURSOR_API_KEY;
    if (current.cursorModel) delete process.env.CURSOR_MODEL;
    return getCursorSetupStatus(projectRoot);
  }

  const nextKey = apiKey !== undefined && apiKey !== null
    ? String(apiKey).trim()
    : current.cursorApiKey;
  const nextModel = model !== undefined && model !== null
    ? String(model).trim()
    : current.cursorModel;

  if (apiKey !== undefined && apiKey !== null && !nextKey) {
    throw new Error('Paste a Cursor API key, or clear the saved key.');
  }

  writeSecretsFile(projectRoot, {
    cursorApiKey: nextKey,
    cursorModel: nextModel,
    githubToken: current.githubToken,
  });
  if (nextKey) process.env.CURSOR_API_KEY = nextKey;
  if (nextModel) process.env.CURSOR_MODEL = nextModel;
  return getCursorSetupStatus(projectRoot);
}

export function getGithubSetupStatus(projectRoot) {
  const stored = readSecretsFile(projectRoot);
  const envToken = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  const activeToken = envToken || stored.githubToken;
  let source = 'none';
  if (envToken && stored.githubToken && envToken === stored.githubToken) source = 'file';
  else if (envToken && !stored.githubToken) source = 'env';
  else if (envToken && stored.githubToken && envToken !== stored.githubToken) source = 'env';
  else if (stored.githubToken) source = 'file';
  return {
    githubConfigured: Boolean(activeToken),
    githubTokenSource: source,
    githubTokenHint: keyHint(activeToken),
    githubSavedInApp: Boolean(stored.githubToken),
  };
}

export function saveGithubSetup(projectRoot, { token, clear }) {
  const current = readSecretsFile(projectRoot);
  if (clear) {
    writeSecretsFile(projectRoot, { ...current, githubToken: '' });
    if (process.env.GH_TOKEN === current.githubToken) delete process.env.GH_TOKEN;
    return getGithubSetupStatus(projectRoot);
  }
  const nextToken = token !== undefined && token !== null
    ? String(token).trim()
    : current.githubToken;
  if (!nextToken) {
    throw new Error('Paste a GitHub token, or clear the saved token.');
  }
  writeSecretsFile(projectRoot, {
    cursorApiKey: current.cursorApiKey,
    cursorModel: current.cursorModel,
    githubToken: nextToken,
  });
  process.env.GH_TOKEN = nextToken;
  return getGithubSetupStatus(projectRoot);
}
