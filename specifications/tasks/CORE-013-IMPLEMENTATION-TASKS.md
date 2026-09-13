# CORE-013 Implementation Tasks
## Spec workflow process graph

**Plan:** `specifications/plans/CORE-013-WORKFLOW-PROCESS-GRAPH-INTENT.md`  
**Feature ID:** CORE-013  
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.
- [ ] Human confirmed parallel agents in CORE-013 **or** approved deferral to AGENT-003 (record choice here: __________).

Implementation must not begin until all approval items are checked or an equivalent
approved signal is linked here.

## Dependency check

- [ ] Dependencies checked in `specifications/FEATURES.md` (AGENT-001, CORE-011, CORE-012).
- [ ] Blockers recorded: AGENT-001 must expose per-feature workflow status the workspace already uses; graph is read-only for runs.
- [ ] Parallel work risks recorded: avoid conflicting header/main-pane edits with unrelated board work; runner changes affect all Start flows.

## Tasks

### Phase 1: Preparation

- [ ] Read the plan and stage mapping table; confirm no new `FEATURES.md` statuses unless mapping fails.
- [ ] Trace `pipelineStage()` in `workflow/artifacts.js` and workspace poll/status usage in `public/app.js`.
- [ ] Confirm search entry point (`uiState.searchQuery`, `applySearch()`) for reuse on Process occupants.
- [ ] List affected files: `public/index.html`, `public/app.js`, `public/style.css`, `workflow/artifacts.js`; conditional `workflow/state.js`, `workflow/runner.js`, `server.js`.

### Phase 2: Implementation

#### Slice 1 — Stage mapping and static graph

- [ ] Add shared graph stage resolver (extend `pipelineStage` or `graphStage(feature, sidecar)`) covering Planned, Planning, Plan review, Coding, Reviewing, Ready to merge, Complete, Blocked, Paused per plan table.
- [ ] Add **Board / Process** toggle in header/actions; persist selection in UI state; default Board.
- [ ] When Process is selected, hide Kanban `#columns` and show Process pane in the main area (and reverse for Board).
- [ ] Render pipeline stage nodes (happy path + revise edges + Blocked/Paused side states) with DOM/CSS—not embedded mermaid.
- [ ] Load features and workflow sidecar data; place each feature as one occupant pill on the correct stage.
- [ ] Show per-stage occupancy count; apply same search filter as Kanban before count and render.
- [ ] Empty/mostly idle board still shows full pipeline skeleton with occupants on Planned/Complete/etc.

#### Slice 2 — Live, waiting, poll, workspace click-through

- [ ] Style **live** stages/occupants when `runStatus` is `starting` or `running` (visible non-color-only cue + accessible label).
- [ ] Style **waiting on human** for Plan review and Reviewing when appropriate (agent not live).
- [ ] Occupant pill: Feature ID, truncated title, run badge when live; optional truncated `lastAssistantText` / latest transcript line (CORE-011 fields).
- [ ] Click occupant opens existing feature workspace for that id; verify no agent start on Process view mount alone.
- [ ] Poll Process + workflow status while any **displayed** feature has live run; align interval with workspace; manual Refresh when none live.

#### Slice 3 — Parallel agents (if approved) or honest single-run UX

**If parallel approved:**

- [ ] Replace singular per-repo `activeRun` with a list/map keyed by feature id in `workflow/state.js`.
- [ ] Update `workflow/runner.js` start/refuse logic: allow concurrent runs on different features; refuse second run on same feature.
- [ ] Adjust workspace messaging if “repo busy” errors change to per-feature conflicts.
- [ ] Verify two features can show live on Process simultaneously.

**If parallel deferred (record AGENT-003 follow-on):**

- [ ] Show single active live run on graph; indicate other features waiting for agent slot where relevant.
- [ ] Document AGENT-003 (parallel agents) scope in plan notes or registry when closing CORE-013.

#### Optional — Summary API (only if N+1 poll is painful)

- [ ] Add read-only local endpoint returning feature id, graph stage, run badge fields for all features (or extend existing bulk status).
- [ ] Wire Process view to summary endpoint; keep secrets out of response.

#### Accessibility and polish

- [ ] Stage names and counts exposed to screen readers (e.g. `aria-label` on nodes: stage name + count).
- [ ] Desktop-first layout with horizontal scroll or wrap on narrow widths.

### Phase 3: Verification

- [ ] Run required checks (manual per plan acceptance list):
  - [ ] Toggle Board ↔ Process; Kanban behavior unchanged on Board.
  - [ ] Spot-check stage placement for Planned, agent stages, Blocked, Paused, Complete.
  - [ ] Search filters occupants and stage counts.
  - [ ] Live run visible on Process; click-through to workspace.
  - [ ] Parallel **or** documented single-run honesty per approval gate.
  - [ ] Opening Process does not start an agent.
- [ ] Record results:
- [ ] Record skipped checks and reasons:

### Phase 4: Security review

- [ ] Create or update `specifications/reviews/SECURITY_REVIEW_CORE-013.md`.
- [ ] Confirm no API keys in graph UI; transcript snippets truncated; summary endpoint read-only.
- [ ] Address blockers or document follow-up.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/CORE-013-COMPLETION-SUMMARY.md`.
- [ ] Use completion summary PR body for draft PR.
- [ ] Commit and push changes.
- [ ] Create or update draft PR.

## Notes

- Do not duplicate stage vocabulary in the browser; server and client should share `workflow/artifacts.js` mapping.
- Kanban stays; drag-and-drop must not start agents (unchanged AGENT-001 rule).
- Registry plan link remains `specifications/plans/CORE-013-WORKFLOW-PROCESS-GRAPH-INTENT.md` until human renames to `-PLAN.md` if desired.
- If parallel work is split out, update `FEATURES.md` with AGENT-003 row when that feature is registered.
