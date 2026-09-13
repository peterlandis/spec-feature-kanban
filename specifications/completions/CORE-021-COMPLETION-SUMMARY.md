# CORE-021 Completion Summary

**Feature ID:** CORE-021  
**Plan:** `specifications/plans/CORE-021-QUIET-GIT-BRANCH-CHECKS-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-021-IMPLEMENTATION-TASKS.md`  
**Date:** 2026-09-12

## Summary

CORE-016 looks up `feat/<id>` for every feature. Missing branches are expected. Git’s `fatal: Needed a single revision` no longer leaks to the server terminal. Cards still show the convention name when the branch is not local.

## Files changed

| File | Purpose |
|------|---------|
| `workflow/git.js` | Capture git stdio; `rev-parse --verify --quiet refs/heads/…` |
| `workflow/ship.js` | Same stdio capture so Ship git calls stay quiet on allow-fail |
| `specifications/FEATURES.md` | CORE-021 Testing |

## Verification

`branchExists` on a missing name returns false with no terminal fatal; `main` still exists.
