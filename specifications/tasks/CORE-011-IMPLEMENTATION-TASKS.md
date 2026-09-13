# CORE-011 Implementation Tasks
## Live agent chain of thought

**Plan:** `specifications/plans/CORE-011-PLAN.md`
**Feature ID:** CORE-011
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.

## Dependency check

- [x] Dependencies checked in `specifications/FEATURES.md`.
- [x] Blockers recorded: Cursor SDK can still crash the child process; the board must stay up and show the error.
- [x] Parallel work risks recorded: do not block CORE-010

## Tasks

### Phase 1: Preparation

- [x] Load runner, adapter, workspace UI, and SDK message types.
- [x] Confirm transcript lives in sidecar state, not FEATURES.md.

### Phase 2: Implementation

- [x] Append normalized thinking / tool / assistant / status / error lines to workflow transcript.
- [x] Show a live Agent activity panel in workspace chrome; poll while starting or running.
- [x] Record a Starting line immediately when a run is confirmed.

### Phase 3: Verification

- [x] Confirm the workspace shows activity or the crash error after Start planning.
- [x] Record results: Agent activity panel visible on CORE-011; leftover crash status surfaces as planning · error.
- [x] Record skipped checks and reasons: no hosted tests; did not wait on a full successful Cursor plan write.

### Phase 4: Security review

- [x] Skip standalone review; truncate tool payloads; never log the API key.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/CORE-011-COMPLETION-SUMMARY.md` only if asked to ship.
- [ ] Commit only if asked.

## Notes

- The empty plan template is not the plan. The activity panel is the source of truth while a run is live.
