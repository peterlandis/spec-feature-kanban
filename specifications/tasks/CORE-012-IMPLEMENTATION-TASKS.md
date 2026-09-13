# CORE-012 Implementation Tasks
## Column card counts

**Plan:** `specifications/plans/CORE-012-PLAN.md`  
**Feature ID:** CORE-012  
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.

Implementation must not begin until all approval items are checked or an equivalent
approved signal is linked here.

## Dependency check

- [x] Dependencies checked in `specifications/FEATURES.md`.
- [x] Blockers recorded: none.
- [x] Parallel work risks recorded: header-only change in `public/app.js` / `public/style.css`; avoid conflicting edits to `renderColumns()` with unrelated features.

## Tasks

### Phase 1: Preparation

- [x] Read `specifications/plans/CORE-012-PLAN.md` and confirm counts must use `getFeaturesForColumn()` (search-aware).
- [x] Trace all callers of `renderColumns()` to ensure counts update without extra hooks.

### Phase 2: Implementation

- [x] In `renderColumns()`, compute per-column count from the same `features` array used to render cards (length after `getFeaturesForColumn`).
- [x] Render count in each column header next to the title; keep category Delete button behavior unchanged.
- [x] Add `.column-count` (or equivalent) styles in `public/style.css` for muted, compact display including count `0`.
- [x] Add accessibility: e.g. `aria-label` on count or header (“N features”) so screen readers get the number, not only visual text.

### Phase 3: Verification

- [x] Run required checks: manual only (see plan).
- [x] Record results: note search on/off, drag-drop, and empty-column cases exercised.
- [x] Record skipped checks and reasons: no automated tests; no server changes to lint.

### Phase 4: Security review

- [x] Skip standalone review per plan (local aggregate UI only); document in completion summary if shipping.

### Phase 5: Completion summary and PR handoff

- [x] Create `specifications/completions/CORE-012-COMPLETION-SUMMARY.md`.
- [x] Use completion summary PR body for draft PR.
- [ ] Commit and push changes.
- [ ] Create or update draft PR.

## Notes

- Do not duplicate count logic outside `getFeaturesForColumn`; a second filter path will drift from search behavior.
- Registry row CORE-012 in `specifications/FEATURES.md` should move to WorkInProgress when implementation starts and Complete after merge.
