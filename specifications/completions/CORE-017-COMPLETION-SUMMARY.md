# CORE-017 Completion Summary

**Feature ID:** CORE-017  
**Plan:** `specifications/plans/CORE-017-FEATURE-KNOWLEDGE-GRAPH-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-017-IMPLEMENTATION-TASKS.md`  
**Security review:** `specifications/reviews/SECURITY_REVIEW_CORE-017.md`  
**Date:** 2026-09-12

## Summary

The control-room **Graph** view is the third header toggle (Board default). Each tracked feature is a node grouped by category; labeled edges show parsed relationships. Search filters nodes and incident edges like Board and Process. Click a node opens the existing workspace. Graph mount and refresh do not start agents. Live-run polling matches Process when any visible node is `starting`/`running`.

## Relation sources (v1)

Documented in `workflow/feature-relations.js` for a future structured Depends column:

| Edge type | Source |
|-----------|--------|
| **depends on** | Registry Notes phrase `Depends on …` (feature IDs); plan `## Dependencies` lines with `Prerequisite:` or `Depends on`. |
| **blocked by** | Status includes Blocked and Notes or plan Dependencies name another tracked ID. |
| **same category** | Pairwise links when a category has at most four features (avoids large meshes). |
| **plan link** | Notes, Plan Document path, or plan text references another feature’s plan/tasks path by ID. |

Only `\b(CORE|AGENT)-\d{3}\b` targets that exist in the current tracking file become edges. No code-import or git inference.

## Files changed

| File | Purpose |
|------|---------|
| `workflow/feature-relations.js` | `buildFeatureGraph`, plan/notes parsing, plan content loader. |
| `server.js` | Attach `graph` to `GET /api/features`. |
| `public/index.html` | Graph toggle; `#graphView` / `#featureGraph` pane. |
| `public/app.js` | Main view routing, `renderFeatureGraph`, search/poll integration. |
| `public/style.css` | Graph layout, edges, legend, live/waiting node cues. |
| `specifications/reviews/SECURITY_REVIEW_CORE-017.md` | Security review record. |
| `specifications/completions/CORE-017-COMPLETION-SUMMARY.md` | This handoff summary. |

## Task status

- Completed: relation extraction (server-side), Graph toggle/pane, render UI with legend and hover/focus highlight, workspace click-through, search hook, live polling on Graph, accessibility labels on nodes/region, security review, completion summary.
- Not performed: commit, push, draft PR (human from Ship tab per request).

## Verification evidence

| Check | Result | Notes |
|-------|--------|-------|
| `buildFeatureGraph` on `specifications/FEATURES.md` | Pass | 21 nodes; depends-on AGENT-002/003/004/005 → AGENT-001; plan prerequisites for CORE-008 |
| `GET /api/features` includes `graph` | Pass | curl on local server (PORT=8765) |
| Automated UI tests | Skipped | None in repo (per plan) |
| Manual browser (toggle, search, click, no agent start) | Pending human | Recommended on Ship tab |

## Skipped checks

- Mobile polish beyond horizontal scroll (per plan).
- External graph export / graphify pipeline (out of scope).

## Security review

Approved in `specifications/reviews/SECURITY_REVIEW_CORE-017.md`. Read-only graph data; local plan reads; no agent start on view open.

## Human validation checklist

- [ ] Review changed files.
- [ ] Board / Process / Graph toggle; Board default unchanged.
- [ ] Every feature in FEATURES.md appears as a node on Graph.
- [ ] AGENT-002 and AGENT-003/004/005 show **depends on** → AGENT-001 where documented.
- [ ] Search hides nodes and edges to hidden nodes.
- [ ] Click node opens correct workspace; Graph alone does not start an agent.
- [ ] Process and Board still switch cleanly; `#columns` hidden on Graph and Process.

## PR body

```markdown
## Summary

- Add header **Board / Process / Graph** toggle (Board default). Graph shows feature nodes by category and labeled edges for depends-on, blocked-by, same-category (small categories), and plan-link relations parsed from registry notes and plan Dependencies.
- Enrich `GET /api/features` with a shared `graph` object from `workflow/feature-relations.js`.
- Search filters graph nodes and edges; click opens workspace; live-run polling on Graph matches Process; Graph never starts agents.

## Verification

- Node: `buildFeatureGraph` on current FEATURES.md; AGENT→AGENT-001 depends edges.
- curl: `/api/features` returns `graph`.
- Manual (recommended): toggle views, search, dependency edges, click-through, confirm Graph mount does not start agents.

## Security

See `specifications/reviews/SECURITY_REVIEW_CORE-017.md`.
```
