# CORE-026: Workspace opens without git repo

**Status:** WorkInProgress  
**Feature ID:** CORE-026  
**Tasks:** `specifications/tasks/CORE-026-IMPLEMENTATION-TASKS.md`

## Goal

Opening a feature workspace must succeed when `FEATURES.md` is outside a git repository (for example a specs-only folder). Ship should report that git is missing; it must not throw `fatal: not a git repository` into the server log or break the workspace API.

## Root cause

`resolveGitRoot` fell back to the project folder even when no `.git` existed. `describeShip` → `listChangedFiles` then ran `git status` without `allowFail`, which threw while building the workspace payload.

## Approach

- Return `null` from `resolveGitRoot` when no git root is found.
- Treat missing git as empty shipable files + a clear Ship error message.
- Keep create-PR / agent branch flows failing with an explicit message when git is required.
