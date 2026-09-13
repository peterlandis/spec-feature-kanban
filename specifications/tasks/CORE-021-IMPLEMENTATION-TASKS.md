# CORE-021 Implementation Tasks
## Quiet missing-branch git checks

**Plan:** `specifications/plans/CORE-021-QUIET-GIT-BRANCH-CHECKS-INTENT.md`  
**Feature ID:** CORE-021

## Tasks

- [x] Capture git stderr in `workflow/git.js` `runGit`.
- [x] Use `rev-parse --verify --quiet` for branch existence.
- [x] Confirmed `branchExists` on a missing branch prints nothing; restart `make run` to pick up the server change.
