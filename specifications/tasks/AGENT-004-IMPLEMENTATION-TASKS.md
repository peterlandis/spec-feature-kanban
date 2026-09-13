# AGENT-004 Implementation Tasks
## GitHub Copilot coding agent backend

**Plan:** `specifications/plans/AGENT-004-GITHUB-COPILOT-BACKEND-INTENT.md`  
**Feature ID:** AGENT-004  
**Human approval required before implementation:** Yes

## Human approval gate

- [ ] Human reviewed the feature registry row.
- [ ] Human reviewed the plan.
- [ ] Human reviewed this task list.
- [ ] Human approved implementation.

## Dependency check

- [ ] Dependencies checked (AGENT-001, CORE-008; AGENT-003 only if using its backend slot).
- [ ] Blockers recorded: Copilot credentials are a runtime requirement.
- [ ] Parallel work risks: do not implement Gemini or Claude on `feat/agent-004`.

## Tasks

### Phase 1: Preparation

- [ ] Load this intent, Settings Copilot stub, Ship GitHub token path, `AgentBackend`.

### Phase 2: Implementation

- [ ] Replace the Copilot “Coming later” card with configure / save / remove.
- [ ] Persist Copilot secret; reuse selected-backend slot if AGENT-003 already added it.
- [ ] Implement Copilot `AgentBackend` only.
- [ ] Runner launches Copilot when selected; sidecar records the Copilot backend id.
- [ ] Keep Ship/`gh` token separate in the UI unless a written decision unifies them.

### Phase 3: Verification

- [ ] Confirm-before-start still required.
- [ ] Unconfigured Copilot cannot start.
- [ ] Cursor (and Gemini if present) still work when selected.

### Phase 4: Security review

- [ ] Create `specifications/reviews/SECURITY_REVIEW_AGENT-004.md`.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/AGENT-004-COMPLETION-SUMMARY.md`.
- [ ] Commit and push on `feat/agent-004` (not `main`).

## Notes

- Branch: `feat/agent-004`.
- Do not treat the Ship GitHub token as Copilot by default.
