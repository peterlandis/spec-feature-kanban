/**
 * Local Cursor agents load a native N-API addon on send().
 * That addon SIGSEGVs on Node 23 (napi_module_register_by_symbol).
 * Pin the worker to a cached Node 22 LTS binary.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, '..', '.features-node');
const NODE22_VERSION = 'v22.23.2';

function nodeMajor(version) {
  const match = String(version || '').replace(/^v/, '').split('.');
  return Number(match[0]) || 0;
}

function readNodeVersion(execPath) {
  try {
    const out = execFileSync(execPath, ['-p', 'process.version'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return out;
  } catch {
    return '';
  }
}

function isSupportedWorkerNode(version) {
  const major = nodeMajor(version);
  return major === 22;
}

function platformSlug() {
  const plat = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : '';
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : '';
  if (!plat || !arch) {
    throw new Error(`No Node 22 build for ${process.platform}-${process.arch}. Install Node 22 LTS and retry.`);
  }
  return `${plat}-${arch}`;
}

function cachedNodePath() {
  return path.join(CACHE_DIR, NODE22_VERSION, 'bin', 'node');
}

function brewNode22Candidates() {
  return [
    '/opt/homebrew/opt/node@22/bin/node',
    '/usr/local/opt/node@22/bin/node',
  ];
}

export function describeWorkerNode(execPath) {
  const version = execPath === process.execPath ? process.version : readNodeVersion(execPath);
  return { execPath, version };
}

export function resolveWorkerNode() {
  if (process.env.CURSOR_WORKER_NODE) {
    const forced = process.env.CURSOR_WORKER_NODE;
    const version = readNodeVersion(forced);
    if (!isSupportedWorkerNode(version)) {
      throw new Error(`CURSOR_WORKER_NODE must be Node 22 (got ${version || 'unknown'}).`);
    }
    return forced;
  }

  if (isSupportedWorkerNode(process.version)) {
    return process.execPath;
  }

  const cached = cachedNodePath();
  if (fs.existsSync(cached) && isSupportedWorkerNode(readNodeVersion(cached))) {
    return cached;
  }

  for (const candidate of brewNode22Candidates()) {
    if (fs.existsSync(candidate) && isSupportedWorkerNode(readNodeVersion(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `Cursor local agents crash on Node ${process.version}. Install Node 22 LTS, or run the board once so it can download ${NODE22_VERSION}.`
  );
}

export async function ensureWorkerNode() {
  try {
    return resolveWorkerNode();
  } catch (err) {
    if (process.env.CURSOR_WORKER_NODE) throw err;
  }

  const slug = platformSlug();
  const filename = `node-${NODE22_VERSION}-${slug}.tar.gz`;
  const url = `https://nodejs.org/dist/${NODE22_VERSION}/${filename}`;
  const destDir = path.join(CACHE_DIR, NODE22_VERSION);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const archive = path.join(CACHE_DIR, filename);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Node ${NODE22_VERSION} (${response.status}). Install Node 22 LTS manually.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(archive, bytes);
  fs.rmSync(destDir, { recursive: true, force: true });
  execFileSync('tar', ['-xzf', archive, '-C', CACHE_DIR], { stdio: 'ignore' });
  const extracted = path.join(CACHE_DIR, `node-${NODE22_VERSION}-${slug}`);
  if (extracted !== destDir && fs.existsSync(extracted)) {
    fs.renameSync(extracted, destDir);
  }
  try {
    fs.unlinkSync(archive);
  } catch {
    // keep archive if unlink fails
  }
  const execPath = cachedNodePath();
  if (!fs.existsSync(execPath) || !isSupportedWorkerNode(readNodeVersion(execPath))) {
    throw new Error(`Downloaded Node ${NODE22_VERSION} but could not find a working binary.`);
  }
  return execPath;
}
