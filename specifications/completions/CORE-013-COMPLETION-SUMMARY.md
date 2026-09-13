# CORE-013 Completion Summary

**Feature ID:** CORE-013  
**Plan:** `specifications/plans/CORE-013-WORKFLOW-PROCESS-GRAPH-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-013-IMPLEMENTATION-TASKS.md`  
**Security review:** `specifications/reviews/SECURITY_REVIEW_CORE-013.md`  
**Date:** 2026-09-12

## Summary

The control-room **Process** view replaces the Kanban column area when selected (Board remains default). Features appear as pills on named pipeline stages using shared `graphStage()` resolution, with search filtering occupancy counts, live run and human-gate waiting cues, optional truncated activity lines, and click-through to the existing workspace. Concurrent Cursor runs are allowed on different features (still one run per feature). A read-only `GET /api/workflow/process-summary` endpoint mirrors fleet fields for optional clients.

## Files changed

| File | Purpose |
|------|---------|
| `workflow/artifacts.js` | `graphStage`, labels, waiting helper, UI truncation; `STATUS_PLANNED`. |
| `workflow/state.js` | `activeRuns` map per feature; migrate legacy `activeRun`; `findActiveRuns` / `findActiveRunForFeature`. |
| `workflow/runner.js` | Per-feature start guard (`findActiveRunForFeature` + `liveRuns`); cancel targets feature-specific run. |
| `server.js` | Process fields on features list; `GET /api/workflow/process-summary`. |
| `public/index.html` | Board / Process toggle; Process pane shell. |
| `public/app.js` | Process graph render, poll, search integration, main view routing. |
| `public/style.css` | Process graph layout and live/waiting styles. |
| `specifications/reviews/SECURITY_REVIEW_CORE-013.md` | Security review record. |
| `specifications/completions/CORE-013-COMPLETION-SUMMARY.md` | This handoff summary. |

## Task status

- Completed: Slice 1 (stage mapping + static graph), Slice 2 (live/waiting/poll/click-through), Slice 3 **parallel agents** (per-feature `activeRuns`, relaxed repo-wide block), optional summary API, accessibility labels, security review, completion summary.
- Parallel choice: **Implemented in CORE-013** (plan preferred path); no AGENT-003 deferral.
- Deferred: Full browser manual checklist (human validation on Ship tab).
- Not performed: Commit, push, draft PR (human from Ship tab per request).

## Verification evidence

| Check | Result | Notes |
|-------|--------|-------|
| `graphStage()` spot cases (Planned → Complete, Blocked, Paused, live planning/implement) | Pass | Node script |
| `assertNoActiveRun` allows feature C while A and B are running; blocks second start on B | Pass | Node script with temp sidecar + in-memory guard |
| `isWaitingOnHuman` on PlanReview idle | Pass | Node script |
| Automated UI tests | Skipped | None in repo (per plan) |
| `GET /api/workflow/process-summary` returns graph fields | Pass | curl on local server |
| Manual browser (toggle, search, live run, dual concurrent runs) | Pending human | Recommended on Ship tab |

## Security review

Approved in `specifications/reviews/SECURITY_REVIEW_CORE-013.md`. Read-only Process data; truncated activity text; no agent start on view open.

## Known risks or gaps

- Browser-level manual verification not run in this session.
- Legacy `.features-workflow.json` files with only `activeRun` migrate on read to `activeRuns`.

## Human validation checklist

- [ ] Review changed files.
- [ ] Review verification evidence and security review.
- [ ] Board ↔ Process toggle; Kanban unchanged on Board.
- [ ] Search filters Process occupants and stage counts.
- [ ] Start planning on one feature; live state on Process; click opens workspace.
- [ ] Start planning/implement on two different features concurrently; both show live.
- [ ] Second start on same feature still refused.
- [ ] Opening Process alone does not start an agent.

## PR body

```markdown
## Summary

- Add header **Board / Process** toggle (Board default). Process shows a left-to-right spec pipeline with Blocked/Paused side stages, revise-loop hints, and per-stage occupancy counts.
- Place each feature via shared `graphStage()` (server + `/api/features`); search filters occupants and counts like Kanban (CORE-012).
- Live runs and human-gate waiting states on stages/occupants; poll every 1s while any displayed feature is live; click pill opens existing workspace (no agent start from Process).
- Allow concurrent agent runs on different features (`activeRuns` map); refuse second run on the same feature only.
- Add read-only `GET /api/workflow/process-summary` for fleet snapshot fields.

## Verification

- Node: `graphStage` mapping cases; parallel `assertNoActiveRun` behavior.
- Manual (recommended): toggle views, search, live run visibility, dual concurrent runs, click-through, confirm Process mount does not start agents.

## Security

See `specifications/reviews/SECURITY_REVIEW_CORE-013.md` — truncated sidecar snippets, no secrets in graph API, read-only summary.

## Notes

- Registry row CORE-013 can move toward Complete after human merge validation.
- Workspace hint updated to “one concurrent run per feature.”
```
