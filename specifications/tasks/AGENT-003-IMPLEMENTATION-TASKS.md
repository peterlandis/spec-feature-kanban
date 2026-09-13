# AGENT-003 Implementation Tasks
## Gemini coding agent backend

**Plan:** `specifications/plans/AGENT-003-GEMINI-BACKEND-INTENT.md`  
**Feature ID:** AGENT-003  
**Human approval required before implementation:** Yes

## Human approval gate

- [ ] Human reviewed the feature registry row.
- [ ] Human reviewed the plan.
- [ ] Human reviewed this task list.
- [ ] Human approved implementation.

## Dependency check

- [ ] Dependencies checked (AGENT-001, CORE-008).
- [ ] Blockers recorded: Gemini API key is a runtime requirement.
- [ ] Parallel work risks: do not implement AGENT-004 or AGENT-005 in this branch; do not break Cursor.

## Tasks

### Phase 1: Preparation

- [ ] Load this intent, AGENT-001 `AgentBackend`, `workflow/cursor-adapter.js`, `workflow/secrets.js`, Settings IDE pane.

### Phase 2: Implementation

- [ ] Add Gemini Settings card (key, model if available, save / remove).
- [ ] Persist Gemini secret + selected-backend slot using the CORE-008 pattern.
- [ ] Implement Gemini `AgentBackend` only.
- [ ] Runner launches Gemini when selected; sidecar `backend` is `gemini`.
- [ ] Cursor remains the default when Gemini is not selected or not configured.

### Phase 3: Verification

- [ ] Confirm-before-start still required.
- [ ] Unconfigured Gemini cannot start.
- [ ] Cursor planning still works.

### Phase 4: Security review

- [ ] Create `specifications/reviews/SECURITY_REVIEW_AGENT-003.md`.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/AGENT-003-COMPLETION-SUMMARY.md`.
- [ ] Commit and push on `feat/agent-003` (not `main`).

## Notes

- Branch: `feat/agent-003`.
- Hosted/phone work stays on AGENT-002.
