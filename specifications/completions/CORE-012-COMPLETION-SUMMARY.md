# CORE-012 Completion Summary

**Feature ID:** CORE-012  
**Plan:** `specifications/plans/CORE-012-PLAN.md`  
**Tasks:** `specifications/tasks/CORE-012-IMPLEMENTATION-TASKS.md`  
**Security review:** `specifications/reviews/SECURITY_REVIEW_CORE-012.md`  
**Date:** 2026-09-12

## Summary

Column headers (WIP, each category, Completed) now show a compact count badge. The value is `getFeaturesForColumn(columnKey).length`, so it stays aligned with visible cards and the header search filter. Counts refresh whenever `renderColumns()` runs (search, refresh, drag-drop, CRUD, category changes).

## Files changed

| File | Purpose |
|------|---------|
| `public/app.js` | Compute per-column `features` before header markup; render `.column-count` with `aria-label` in `.column-header-leading`. |
| `public/style.css` | Styles for `.column-header-leading` and muted pill `.column-count` (including `0`). |
| `specifications/reviews/SECURITY_REVIEW_CORE-012.md` | Security review record. |
| `specifications/completions/CORE-012-COMPLETION-SUMMARY.md` | This handoff summary. |

## Task status

- Completed: Phase 1–2 implementation; Phase 3 logic verification; Phase 4 security documentation; Phase 5 completion summary (PR body below).
- Deferred: Full browser manual checklist (human validation on Ship tab).
- Not applicable: Commit, push, and draft PR (human performs from Ship tab per implementation request).

## Verification evidence

| Command/check | Result | Notes |
|---------------|--------|-------|
| Node script mirroring `getFeaturesForColumn` / `applySearch` | Pass | Confirms count equals filtered feature length for backlog, WIP, Completed, search match, and no-match (zeros). |
| `renderColumns()` caller trace | Pass | Invoked on search input/Escape, delete feature/category, load/refresh, drag-drop persist paths — counts need no extra hooks. |
| Automated UI tests | Skipped | None in repository (per plan). |
| Manual browser board exercise | Pending human | Recommended: empty search totals, partial search, Escape clear, drag between columns. |

## Security review

Approved with plan skip rationale documented in `specifications/reviews/SECURITY_REVIEW_CORE-012.md`. Client-only aggregate counts; no new secrets, endpoints, or dependencies.

## Known risks or gaps

- Browser-level manual verification not run in this session; human should confirm layout with long category titles and Delete button on category columns.

## Human validation checklist

- [ ] Review changed files.
- [ ] Review verification evidence.
- [ ] Review security review.
- [ ] Confirm PR body is accurate.
- [ ] Run manual board checks (search, drag-drop, empty columns).

## PR body

```markdown
## Summary

- Show a search-aware feature count on every Kanban column header (WIP, categories, Completed).
- Count uses the same `getFeaturesForColumn()` list as rendered cards so it always matches visible cards.
- Muted pill badge styling and `aria-label` for screen readers.

## Verification

- Node logic check: column membership + search filter produces expected lengths.
- Code review: all existing `renderColumns()` call sites refresh counts automatically.
- Manual (recommended): load board, toggle search, clear with Escape, move a card between columns.

## Security

- Client-only UI; no API or auth changes. See `specifications/reviews/SECURITY_REVIEW_CORE-012.md`.

## Notes

- Registry row CORE-012 can move to Complete after merge.
```
