/**
 * Feature branch naming and local checkout helpers.
 */

import { execFileSync } from 'child_process';

export function featureBranchName(featureId) {
  return `feat/${String(featureId || '').trim().toLowerCase()}`;
}

function runGit(cwd, args, { allowFail = false } = {}) {
  try {
    const raw = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    });
    return { ok: true, stdout: raw.trim() };
  } catch (err) {
    if (allowFail) {
      return {
        ok: false,
        stdout: String(err.stdout || '').trim(),
        stderr: String(err.stderr || err.message || '').trim(),
      };
    }
    throw new Error(String(err.stderr || err.stdout || err.message || 'git failed').trim());
  }
}

export function currentBranch(cwd) {
  const result = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  if (!result.ok || !result.stdout || result.stdout === 'HEAD') return null;
  return result.stdout;
}

export function branchExists(cwd, name) {
  if (!name) return false;
  return runGit(cwd, ['rev-parse', '--verify', name], { allowFail: true }).ok;
}

export function isWorkingTreeDirty(cwd) {
  const result = runGit(cwd, ['status', '--porcelain'], { allowFail: true });
  return Boolean(result.ok && result.stdout);
}

export function describeFeatureBranch({ cwd, featureId, storedBranch }) {
  const expected = featureBranchName(featureId);
  const current = cwd ? currentBranch(cwd) : null;
  const recorded = storedBranch && String(storedBranch).trim() ? String(storedBranch).trim() : null;
  const branch = recorded || expected;
  const exists = cwd ? branchExists(cwd, branch) : false;
  return {
    branch,
    expected,
    recorded,
    current,
    exists,
    isCurrent: Boolean(current && branch && current === branch),
    source: recorded ? 'recorded' : 'convention',
  };
}

export function ensureFeatureBranch(cwd, featureId) {
  const wanted = featureBranchName(featureId);
  const current = currentBranch(cwd);
  if (current === wanted) {
    return { branch: wanted, switched: false, created: false };
  }
  if (branchExists(cwd, wanted)) {
    if (isWorkingTreeDirty(cwd)) {
      return {
        branch: current || wanted,
        switched: false,
        created: false,
        warning: `Staying on ${current}; ${wanted} exists but the working tree has local changes.`,
      };
    }
    runGit(cwd, ['checkout', wanted]);
    return { branch: wanted, switched: true, created: false };
  }
  runGit(cwd, ['checkout', '-b', wanted]);
  return { branch: wanted, switched: true, created: true };
}

export function checkoutFeatureBranch(cwd, branch) {
  const name = String(branch || '').trim();
  if (!name) throw new Error('Branch name is required.');
  const current = currentBranch(cwd);
  if (current === name) {
    return { branch: name, switched: false, created: false };
  }
  if (isWorkingTreeDirty(cwd)) {
    throw new Error(`Cannot switch to ${name} while the working tree has local changes. Commit, stash, or discard them first.`);
  }
  if (branchExists(cwd, name)) {
    runGit(cwd, ['checkout', name]);
    return { branch: name, switched: true, created: false };
  }
  runGit(cwd, ['checkout', '-b', name]);
  return { branch: name, switched: true, created: true };
}
