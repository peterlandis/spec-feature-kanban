# CORE-017 Implementation Tasks
## Feature relationship knowledge graph

**Plan:** `specifications/plans/CORE-017-FEATURE-KNOWLEDGE-GRAPH-INTENT.md`  
**Feature ID:** CORE-017  
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.

Implementation must not begin until all approval items are checked or an equivalent approved signal is linked here.

## Dependency check

- [ ] Dependencies checked in `specifications/FEATURES.md` (CORE-001, CORE-013).
- [ ] Blockers recorded: none for a read-only graph.
- [ ] Parallel work risks recorded: extend `setMainView` / header without breaking Board or Process; do not implement AGENT-003/004/005 adapters on this branch.

## Tasks

### Phase 1: Preparation

- [ ] Read the plan relationship table and acceptance list.
- [ ] Trace `setMainView`, `renderMainView`, `renderProcess`, and `#columns[hidden]` / `#processView[hidden]` in `public/app.js` and `public/style.css`.
- [ ] Confirm search entry points (`uiState.searchQuery`, `applySearch`, `getAllFeatures`) for reuse on graph nodes.
- [ ] Inventory v1 edge sources in the current tracking file: Notes (“Depends on AGENT-001”), plan **Dependencies** sections, category tables, Blocked + Notes.
- [ ] List affected files: `public/index.html`, `public/app.js`, `public/style.css`; likely `server.js` and new or extended `workflow/feature-relations.js` (or `workflow/artifacts.js`).

### Phase 2: Implementation

#### Slice 1 — Relation extraction

- [ ] Implement shared graph builder: input = parsed features (+ optional plan text map); output = nodes and typed directed edges per plan rules.
- [ ] Parse feature IDs conservatively; ignore references to ids not in the current feature set.
- [ ] Document extraction rules in module comments (Notes patterns, plan Dependencies, category, blocked-by).
- [ ] Wire builder into `GET /api/features` enrichment **or** document client-only v1 gap if plan scanning is deferred.

#### Slice 2 — Graph view toggle and pane

- [ ] Add **Graph** button to header view group; extend `uiState.mainView` to `'board' | 'process' | 'graph'`.
- [ ] Add `#graphView` main pane with lead copy (read-only; never starts agents) and `#featureGraph` region.
- [ ] Update `renderMainView()`: show exactly one of board columns, Process pane, or Graph pane; keep `display: none !important` hidden behavior for inactive panes.

#### Slice 3 — Render graph UI

- [ ] Implement `renderFeatureGraph()`: build from search-filtered features; one node per feature; labeled edges for parsed relations.
- [ ] Node UI: Feature ID, truncated title, category/status cue; live/waiting classes when sidecar fields present (match Process occupant cues where practical).
- [ ] Edge UI: visible type label (depends on, blocked by, same category, plan link if shipped).
- [ ] Optional: select/hover highlights node + incident edges for readability.

#### Slice 4 — Navigation, search, and poll

- [ ] Click node calls existing `openWorkspace(featureId)`; verify no runner start on Graph mount.
- [ ] Re-run graph render when search query changes (same hook as board/Process refresh).
- [ ] While Graph is visible and any displayed node is live (`starting`/`running`), align poll interval with Process; stop poll when leaving Graph or when no live runs.

#### Accessibility and polish

- [ ] Nodes are focusable buttons with `aria-label` (id, title, optional live/waiting).
- [ ] Graph region has `aria-label`; edge types not conveyed by color alone.
- [ ] Desktop-first layout with pan/scroll on narrow widths.

### Phase 3: Verification

- [ ] Run manual checks from the plan:
  - [ ] Board / Process / Graph toggle; Board default unchanged.
  - [ ] All features appear as nodes.
  - [ ] AGENT-002 and AGENT-003/004/005 → AGENT-001 dependency edges when registry/plans document them.
  - [ ] Search hides nodes and attached edges.
  - [ ] Click-through opens correct workspace; Graph open alone does not start an agent.
  - [ ] Process and Board still switch cleanly; columns fully hidden on Graph.
- [ ] Record results:
- [ ] Record skipped checks and reasons:

### Phase 4: Security review

- [ ] Create `specifications/reviews/SECURITY_REVIEW_CORE-017.md`.
- [ ] Confirm graph uses existing feature payload only; no API keys; local plan reads stay within repo; no agent start from view open.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/CORE-017-COMPLETION-SUMMARY.md` (include relation-source summary for future Depends column).
- [ ] Commit and push on `feat/core-017` (not `main`).
- [ ] Open draft PR.

## Notes

- Process = lifecycle **stage**. Graph = feature-to-feature **relations**. Keep both views.
- Do not embed graphify / full-repo graph pipelines in v1.
- Branch: `feat/core-017`.
- Registry plan link: `specifications/plans/CORE-017-FEATURE-KNOWLEDGE-GRAPH-INTENT.md`.
