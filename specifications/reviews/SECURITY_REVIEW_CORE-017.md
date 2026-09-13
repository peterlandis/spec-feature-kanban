# Security Review: CORE-017 - Feature relationship knowledge graph

**Feature ID:** CORE-017  
**Reviewer:** Cursor Cloud Agent  
**Date:** 2026-09-12  
**Plan:** `specifications/plans/CORE-017-FEATURE-KNOWLEDGE-GRAPH-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-017-IMPLEMENTATION-TASKS.md`

## Scope

Graph view: header Board / Process / Graph toggle, read-only relationship graph UI, relation extraction in `workflow/feature-relations.js`, `graph` payload on `GET /api/features`, local plan file reads for Dependencies sections, search-filtered nodes/edges, workspace click-through, live-run polling parity with Process. Touches `public/index.html`, `public/app.js`, `public/style.css`, `server.js`, and `workflow/feature-relations.js`. No merge/deploy; no agent start on Graph mount.

## Findings

| Severity | Finding | File/area | Status |
|----------|---------|-----------|--------|
| None | Graph renders only fields already on `/api/features` (ids, titles, status, category, notes-derived edges, workflow sidecar). No API keys or secrets in graph JSON. | `server.js`, `public/app.js` | N/A |
| None | Plan reads use existing `resolveArtifactPaths` / `readIfExists` under resolved `specRoot`; paths cannot escape project via `safeJoin` semantics on plan resolution. | `workflow/feature-relations.js`, `workflow/artifacts.js` | Mitigated |
| None | Opening Graph does not call start-planning, implement, revise, or cancel endpoints. | `public/app.js` | N/A |
| Low | Notes and plan Dependencies may mention internal feature IDs and prose; same exposure class as registry table already shown on the board. | `FEATURES.md`, plan files | Accepted (parity with CORE-001) |

## Checklist

- [x] Authentication and authorization reviewed — local single-user app; no new auth surface.
- [x] Health data, PII, and privacy reviewed — feature metadata only; no new personal fields.
- [x] Tokens, secrets, and credentials reviewed — none added to responses or DOM.
- [x] Backend permissions, storage, and infrastructure reviewed — read-only graph enrichment on existing features GET; no writes from graph UI.
- [x] Logging and telemetry reviewed for sensitive data — no new logging of plan bodies.
- [x] Network and third-party integrations reviewed — local HTTP only.
- [x] Import/export paths reviewed — graph does not edit FEATURES.md.
- [x] Prompt-injection or automation input risks reviewed — graph is read-only; agent starts remain workspace-gated.
- [x] Dependency or supply-chain changes reviewed — none.

## Verification evidence

- Code review: `buildFeatureGraph` ignores IDs not in the loaded feature set; plan loading limited to resolved artifact paths.
- Node script: graph built from `specifications/FEATURES.md` (21 nodes, expected depends-on edges for AGENT-002/003/004/005 → AGENT-001).
- `curl` `GET /api/features` on local server: `graph.nodes` / `graph.edges` present.
- Skipped: full browser manual pass (human on Ship tab).

## Outcome

Approved — lightweight standalone review per plan; no blockers.

## Follow-up

- If a structured Depends column is added later, keep extraction rules in `workflow/feature-relations.js` as the single source of truth until the registry column replaces heuristics.
