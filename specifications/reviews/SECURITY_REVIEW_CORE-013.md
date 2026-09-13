# Security Review: CORE-013 - Spec workflow process graph

**Feature ID:** CORE-013  
**Reviewer:** Cursor Cloud Agent  
**Date:** 2026-09-12  
**Plan:** `specifications/plans/CORE-013-WORKFLOW-PROCESS-GRAPH-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-013-IMPLEMENTATION-TASKS.md`

## Scope

Process view: header Board / Process toggle, pipeline graph UI, per-feature stage placement from shared `graphStage()` in `workflow/artifacts.js`, search-aware occupancy counts, live/waiting styling, workspace click-through, 1s polling while any displayed feature has a live run, concurrent agent runs (one per feature) in `workflow/state.js` / `workflow/runner.js`, and read-only `GET /api/workflow/process-summary`. Touches `public/index.html`, `public/app.js`, `public/style.css`, `server.js`, and workflow modules. No merge/deploy, no agent start on Process mount.

## Findings

| Severity | Finding | File/area | Status |
|----------|---------|-----------|--------|
| None | Transcript snippets on occupant pills use server-truncated `activityLine` / `truncateForProcessUi` (same exposure class as CORE-011 workspace). | `server.js`, `workflow/artifacts.js` | Mitigated |
| None | Process summary and `/api/features` attach only sidecar fields already used by the workspace; no API keys or secrets in JSON. | `server.js` | N/A |
| None | Opening Process does not call start-planning/implement/revise endpoints. | `public/app.js` | N/A |
| Low | Tool payloads in transcript could contain paths or env fragments; truncation limits blast radius; same as existing transcript UI. | `workflow/state.js` | Accepted (parity with CORE-011) |

## Checklist

- [x] Authentication and authorization reviewed — local single-user app; no new auth surface.
- [x] Health data, PII, and privacy reviewed — feature metadata and truncated agent text only.
- [x] Tokens, secrets, and credentials reviewed — none added to responses or DOM; keys remain in settings storage.
- [x] Backend permissions, storage, and infrastructure reviewed — read-only summary endpoint; sidecar write paths unchanged except `activeRuns` map shape (migration from legacy `activeRun`).
- [x] Logging and telemetry reviewed for sensitive data — no new logging of transcript bodies.
- [x] Network and third-party integrations reviewed — summary is local HTTP only.
- [x] Import/export paths reviewed — FEATURES.md unchanged by Process view.
- [x] Prompt-injection or automation input risks reviewed — Process is read-only; starts still require workspace confirm gates.
- [x] Dependency or supply-chain changes reviewed — none.

## Verification evidence

- Code review: `graphStage` / `processFieldsForFeature` do not embed raw transcript arrays in list payloads; `activityLine` capped (~96 chars).
- Node checks: `graphStage` mapping spot cases; `assertNoActiveRun` uses `findActiveRunForFeature` (and in-memory `liveRuns`) so concurrent runs on different features are allowed while duplicate starts on the same feature are blocked.
- Skipped: hosted/multi-tenant deployment (AGENT-002); full browser manual pass deferred to human Ship tab.

## Outcome

Approved — lightweight standalone review per plan; no blockers.

## Follow-up

- None required for merge. If occupant one-liners ever show sensitive tool output, tighten redaction in shared transcript formatting (CORE-011 scope).
