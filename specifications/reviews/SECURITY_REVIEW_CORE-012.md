# Security Review: CORE-012 - Column card counts

**Feature ID:** CORE-012  
**Reviewer:** Cursor Cloud Agent  
**Date:** 2026-09-12  
**Plan:** `specifications/plans/CORE-012-PLAN.md`  
**Tasks:** `specifications/tasks/CORE-012-IMPLEMENTATION-TASKS.md`

## Scope

Client-only UI change: each Kanban column header displays a numeric badge equal to the number of feature cards rendered in that column (including search filtering). Touches `public/app.js` (`renderColumns`) and `public/style.css` (`.column-count`, `.column-header-leading`). No backend, parser, API, auth, or dependency changes.

## Findings

| Severity | Finding | File/area | Status |
|----------|---------|-----------|--------|
| None | Counts are derived from in-memory board state already shown as cards; no new data exposure or network surface. | `public/app.js` | N/A |

## Checklist

- [x] Authentication and authorization reviewed — not applicable; local single-user board UI.
- [x] Health data, PII, and privacy reviewed — counts are aggregates of feature metadata already visible on cards; no new collection.
- [x] Tokens, secrets, and credentials reviewed — none added or logged.
- [x] Backend permissions, storage, and infrastructure reviewed — no server changes.
- [x] Logging and telemetry reviewed for sensitive data — no new logging.
- [x] Network and third-party integrations reviewed — none.
- [x] Import/export paths reviewed — unchanged.
- [x] Prompt-injection or automation input risks reviewed — not applicable.
- [x] Dependency or supply-chain changes reviewed — none.

## Verification evidence

- Commands reviewed: logic parity check for `getFeaturesForColumn` + `applySearch` (Node one-off script mirroring column rules).
- Tests/scans run: none required per plan; no automated test suite in repo.
- Skipped checks: hosted/multi-user scenarios (AGENT-002); browser manual UI pass deferred to human PR validation.

## Outcome

Approved — standalone deep review skipped per plan rationale; lightweight checklist completed for local aggregate UI only.

## Follow-up

- None.
