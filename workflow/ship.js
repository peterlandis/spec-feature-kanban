/**
 * Optional local merge-request creation via `gh`.
 * Does not merge. Secrets and sidecar workflow files stay uncommitted.
 */

import path from 'path';
import { execFileSync } from 'child_process';

const LOCAL_ONLY_PREFIXES = [
  '.features-secrets.json',
  '.features-workflow.json',
  '.features-models.json',
  '.features-kanban.json',
  '.features-agent-store/',
  '.features-node/',
  'node_modules/',
  '.env',
  '.env.',
];

function runGit(cwd, args, { allowFail = false, trim = true } = {}) {
  try {
    const raw = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 60000,
    });
    const stdout = trim ? raw.trim() : raw.replace(/\n$/, '');
    return { ok: true, stdout };
  } catch (err) {
    if (allowFail) {
      return {
        ok: false,
        stdout: String(err.stdout || ''),
        stderr: String(err.stderr || err.message || '').trim(),
      };
    }
    const detail = String(err.stderr || err.stdout || err.message || 'git failed').trim();
    throw new Error(detail);
  }
}

function runGh(cwd, args, { allowFail = false } = {}) {
  try {
    const stdout = execFileSync('gh', args, {
      cwd,
      encoding: 'utf8',
      timeout: 90000,
    }).trim();
    return { ok: true, stdout };
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (allowFail) {
        return { ok: false, stdout: '', stderr: 'GitHub CLI (gh) is not installed.' };
      }
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com');
    }
    if (allowFail) {
      return {
        ok: false,
        stdout: String(err.stdout || '').trim(),
        stderr: String(err.stderr || err.message || '').trim(),
      };
    }
    const detail = String(err.stderr || err.stdout || err.message || 'gh failed').trim();
    throw new Error(detail);
  }
}

export function draftPrTitle(feature) {
  const id = feature && feature.featureId ? feature.featureId : 'Feature';
  const title = feature && feature.title ? feature.title : id;
  return `${id}: ${title}`;
}

export function extractPrBody(completion) {
  const text = String(completion || '');
  const heading = text.search(/^## PR body\s*$/m);
  if (heading === -1) {
    const summary = text.match(/^## Summary\s+([\s\S]*?)(?:\n## |\s*$)/m);
    const fallback = (summary ? summary[1] : text).trim();
    return fallback || 'Draft PR from Features Kanban Ship.';
  }
  const after = text.slice(heading).replace(/^## PR body\s*/, '');
  const fence = after.match(/```(?:markdown)?\n([\s\S]*?)\n```/);
  if (fence) return fence[1].trim();
  return after.split(/\n## /)[0].trim() || 'Draft PR from Features Kanban Ship.';
}

export function securityReviewHasBlockers(reviewMarkdown) {
  const text = String(reviewMarkdown || '').trim();
  if (!text) {
    return { blocked: true, reason: 'Security review is missing.' };
  }
  const outcomeMatch = text.match(/## Outcome\s+([\s\S]*?)(?:\n## |\s*$)/i);
  const outcome = outcomeMatch ? outcomeMatch[1] : '';
  if (/\b(blocked|blocker)\b/i.test(outcome) && !/\b(not blocked|no blockers?)\b/i.test(outcome)) {
    return { blocked: true, reason: 'Security review outcome is blocked.' };
  }
  const rows = text.split('\n').filter((line) => line.startsWith('|'));
  for (const row of rows) {
    if (/\b(critical|high)\b/i.test(row) && /\b(open|blocker)\b/i.test(row)) {
      return { blocked: true, reason: 'Security review has an open high or critical finding.' };
    }
  }
  return { blocked: false, reason: null };
}

export function extractPrUrlFromNotes(notes) {
  const match = String(notes || '').match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

export function mergeNotesWithPrUrl(notes, url) {
  const line = `PR: ${url}`;
  const current = String(notes || '').trim();
  if (!current || current === '-') return line;
  if (current.includes(url)) return current;
  const replaced = current.replace(/PR:\s*https?:\/\/\S+/g, line);
  if (replaced !== current) return replaced;
  return `${current} · ${line}`;
}

function isLocalOnlyPath(filePath) {
  const normalized = String(filePath || '').replace(/^\.\//, '');
  return LOCAL_ONLY_PREFIXES.some((prefix) => (
    normalized === prefix.replace(/\/$/, '') || normalized.startsWith(prefix)
  ));
}

export function listShipableFiles(cwd) {
  return listChangedFiles(cwd).filter((filePath) => !isLocalOnlyPath(filePath));
}

export function buildDraftPr({ feature, completionContent, files }) {
  const title = draftPrTitle(feature);
  let body = extractPrBody(completionContent);
  const fileList = Array.isArray(files) ? files.filter(Boolean) : [];
  if (fileList.length && !/^## Changes in this draft/m.test(body)) {
    body += '\n\n## Changes in this draft\n\n' + fileList.map((filePath) => `- ${filePath}`).join('\n');
  }
  return {
    title,
    body,
    source: String(completionContent || '').includes('## PR body')
      ? 'completion-summary'
      : 'generated',
  };
}

function parsePorcelainPath(line) {
  const match = String(line || '').match(/^(.{2}) (.*)$/);
  if (!match) return null;
  let filePath = match[2];
  if (filePath.startsWith('"') && filePath.endsWith('"')) {
    try {
      filePath = JSON.parse(filePath);
    } catch {
      filePath = filePath.slice(1, -1);
    }
  }
  if (filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop();
  return filePath || null;
}

function listChangedFiles(cwd) {
  const status = runGit(cwd, ['status', '--porcelain'], { trim: false });
  if (!status.stdout.trim()) return [];
  return status.stdout.split('\n').map(parsePorcelainPath).filter(Boolean);
}

export function describeGhAuth(cwd) {
  const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  if (token) {
    const who = runGh(cwd, ['api', 'user', '--jq', '.login'], { allowFail: true });
    if (who.ok && who.stdout.trim()) {
      return { ready: true, error: null, login: who.stdout.trim() };
    }
    if (/not installed/i.test(who.stderr || '')) {
      return { ready: false, error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com' };
    }
    return {
      ready: false,
      error: 'The saved GitHub token was rejected. Open GitHub in the header and paste a token with repo and pull-request access.',
    };
  }
  const auth = runGh(cwd, ['auth', 'status'], { allowFail: true });
  if (auth.ok) return { ready: true, error: null };
  if (/not installed/i.test(auth.stderr || '')) {
    return { ready: false, error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com' };
  }
  return {
    ready: false,
    error: 'Save a GitHub token in GitHub (header) to create draft PRs from the board.',
  };
}

function existingPrUrl(cwd) {
  const viewed = runGh(cwd, ['pr', 'view', '--json', 'url', '--jq', '.url'], { allowFail: true });
  if (viewed.ok && /^https?:\/\//.test(viewed.stdout)) return viewed.stdout;
  return null;
}

function requireShipBranch(cwd) {
  const branch = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
  if (!branch || branch === 'HEAD') {
    throw new Error('Ship needs a named git branch. Create one before opening a merge request.');
  }
  if (branch === 'main' || branch === 'master') {
    throw new Error('Ship from a feature branch, not main or master.');
  }
  return branch;
}

function commitShipableChanges(cwd, feature) {
  const changed = listChangedFiles(cwd).filter((filePath) => !isLocalOnlyPath(filePath));
  if (!changed.length) return { committed: false, files: [] };
  for (const filePath of changed) {
    runGit(cwd, ['add', '--', filePath]);
  }
  const message = `Ship ${feature.featureId}: ${feature.title || feature.featureId}`;
  runGit(cwd, ['commit', '-m', message]);
  return { committed: true, files: changed };
}

function pushBranch(cwd) {
  const pushed = runGit(cwd, ['push', '-u', 'origin', 'HEAD'], { allowFail: true });
  if (pushed.ok) return;
  throw new Error(pushed.stderr || pushed.stdout || 'git push failed. Check that origin exists and you can push.');
}

function createDraftPr(cwd, title, body) {
  const created = runGh(cwd, [
    'pr', 'create',
    '--draft',
    '--title', title,
    '--body', body,
  ], { allowFail: true });
  const urlMatch = `${created.stdout}\n${created.stderr}`.match(/https?:\/\/\S+/);
  if (created.ok && urlMatch) return urlMatch[0];
  const existing = existingPrUrl(cwd);
  if (existing) return existing;
  throw new Error(created.stderr || created.stdout || 'gh pr create failed.');
}

function updateExistingPr(cwd, title, body) {
  runGh(cwd, ['pr', 'edit', '--title', title, '--body', body], { allowFail: true });
}

export function describeShip({ feature, completionContent, reviewContent, workflow, cwd }) {
  const missing = [];
  if (!String(completionContent || '').trim()) missing.push('completion summary');
  if (!String(reviewContent || '').trim()) missing.push('security review');
  const blockers = securityReviewHasBlockers(reviewContent);
  const files = cwd ? listShipableFiles(cwd) : [];
  const draft = buildDraftPr({ feature, completionContent, files });
  const gh = cwd ? describeGhAuth(cwd) : { ready: false, error: 'Git root not found.' };
  const mrUrl = (workflow && workflow.mrUrl) || extractPrUrlFromNotes(feature && feature.notes);
  return {
    canCreate: missing.length === 0 && !blockers.blocked && gh.ready,
    missing,
    securityBlocked: blockers.blocked && missing.length === 0,
    securityReason: blockers.blocked ? blockers.reason : null,
    approved: Boolean(workflow && workflow.shipApprovedAt),
    mrUrl: mrUrl || null,
    draftTitle: draft.title,
    draftBody: draft.body,
    draftSource: draft.source,
    files,
    ghReady: gh.ready,
    ghError: gh.error,
    ghLogin: gh.login || null,
  };
}

export function createFeatureMergeRequest({ cwd, feature, completionContent, reviewContent, title, body }) {
  if (!String(completionContent || '').trim()) {
    throw new Error('Write the completion summary before creating a merge request.');
  }
  const blockers = securityReviewHasBlockers(reviewContent);
  if (blockers.blocked) {
    const error = new Error(blockers.reason);
    error.code = 'SECURITY_BLOCKED';
    throw error;
  }

  const files = listShipableFiles(cwd);
  const draft = buildDraftPr({ feature, completionContent, files });
  const prTitle = String(title || '').trim() || draft.title;
  const prBody = String(body || '').trim() || draft.body;
  if (!prTitle || !prBody) {
    throw new Error('Edit the draft PR title and description before creating the merge request.');
  }

  requireShipBranch(cwd);
  const gh = describeGhAuth(cwd);
  if (!gh.ready) throw new Error(gh.error);
  const existing = existingPrUrl(cwd);
  const commit = commitShipableChanges(cwd, feature);
  if (!existing) pushBranch(cwd);
  else {
    const ahead = runGit(cwd, ['status', '-sb']).stdout;
    if (ahead.includes('[ahead') || commit.committed) pushBranch(cwd);
  }
  const url = existing
    ? (updateExistingPr(cwd, prTitle, prBody), existing)
    : createDraftPr(cwd, prTitle, prBody);
  return {
    url,
    reused: Boolean(existing),
    committed: commit.committed,
    committedFiles: commit.files,
  };
}

export function commitTrackingFileIfNeeded(cwd, featuresAbsPath, feature) {
  const relative = path.relative(cwd, featuresAbsPath) || featuresAbsPath;
  const changed = listChangedFiles(cwd);
  const match = changed.find((filePath) => (
    filePath === relative || featuresAbsPath.endsWith(filePath)
  ));
  if (!match) return { committed: false };
  runGit(cwd, ['add', '--', match]);
  runGit(cwd, ['commit', '-m', `Ship ${feature.featureId}: record merge request URL`]);
  pushBranch(cwd);
  return { committed: true };
}
