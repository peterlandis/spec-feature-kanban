# Security Review: CORE-020 - Rotating 3D knowledge graph

**Feature ID:** CORE-020  
**Reviewer:** Cursor Agent  
**Date:** 2026-09-12  
**Plan:** `specifications/plans/CORE-020-GRAPH-3D-PERSPECTIVE-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-020-IMPLEMENTATION-TASKS.md`

## Scope

Client-only 3D projection of the existing CORE-017 `graph` payload. Header stays Board / Process / Graph. 2D / 3D is a Graph-page toggle. Canvas render, orbit, zoom, selection highlight, and a Selected card. No new server routes. Opening 3D or clicking a node does not start agents.

## Findings

| Severity | Finding | File/area | Status |
|----------|---------|-----------|--------|
| None | Reuses `state.graph.edges` already returned by `GET /api/features`. No new fields or secrets. | `public/app.js` | N/A |
| None | `requestAnimationFrame` loop stops when leaving Graph or switching to 2D. | `public/app.js` | N/A |
| None | Node click still calls existing `openWorkspace`; no start-planning / implement / revise. | `public/app.js` | N/A |
| Low | Selected card shows feature IDs and titles already visible on Board and 2D Graph. | `public/app.js` | Accepted (parity) |

## Checklist

- [x] Authentication and authorization reviewed — no new auth surface.
- [x] Tokens, secrets, and credentials reviewed — none added.
- [x] Backend permissions, storage, and infrastructure reviewed — no server changes.
- [x] Network and third-party integrations reviewed — no Three.js/CDN; canvas 2D only.
- [x] Prompt-injection or automation input risks reviewed — read-only view; agent starts remain workspace-gated.
- [x] Dependency or supply-chain changes reviewed — none.

## Outcome

Approved. Client-only visualization of existing graph data.
