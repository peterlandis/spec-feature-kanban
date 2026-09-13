# CORE-021: Quiet missing-branch git checks

**Status:** Testing  
**Feature ID:** CORE-021  
**Tasks:** `specifications/tasks/CORE-021-IMPLEMENTATION-TASKS.md`

**Intent brief:** CORE-016 looks up `feat/<id>` for every feature. Missing branches are expected; git must not spam the server terminal.

## Goal

Load the board (including `FEATURES_EXAMPLES.md`) without `fatal: Needed a single revision` lines. Branch exists/not-exists still shows correctly on cards.

## Acceptance

- [ ] `branchExists` does not write git fatals to stderr.
- [ ] Features without a local branch still show the expected name and “not created locally.”
