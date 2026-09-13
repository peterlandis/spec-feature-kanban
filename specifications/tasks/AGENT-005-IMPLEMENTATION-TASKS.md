# AGENT-005 Implementation Tasks
## Claude coding agent backend

**Plan:** `specifications/plans/AGENT-005-CLAUDE-BACKEND-INTENT.md`  
**Feature ID:** AGENT-005  
**Human approval required before implementation:** Yes

## Human approval gate

- [ ] Human reviewed the feature registry row.
- [ ] Human reviewed the plan.
- [ ] Human reviewed this task list.
- [ ] Human approved implementation.

## Dependency check

- [ ] Dependencies checked (AGENT-001, CORE-008).
- [ ] Blockers recorded: Anthropic API key is a runtime requirement.
- [ ] Parallel work risks: do not implement Gemini or Copilot on `feat/agent-005`.

## Tasks

### Phase 1: Preparation

- [ ] Load this intent, Settings Claude stub, `AgentBackend`, secrets pattern.

### Phase 2: Implementation

- [ ] Replace the Claude “Coming later” card with configure / save / remove (model picker if available).
- [ ] Persist Claude secret; reuse selected-backend slot if a sibling already added it.
- [ ] Implement Claude `AgentBackend` only.
- [ ] Runner launches Claude when selected; sidecar `backend` is `claude`.

### Phase 3: Verification

- [ ] Confirm-before-start still required.
- [ ] Unconfigured Claude cannot start.
- [ ] Cursor still works when selected.

### Phase 4: Security review

- [ ] Create `specifications/reviews/SECURITY_REVIEW_AGENT-005.md`.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/AGENT-005-COMPLETION-SUMMARY.md`.
- [ ] Commit and push on `feat/agent-005` (not `main`).

## Notes

- Branch: `feat/agent-005`.
