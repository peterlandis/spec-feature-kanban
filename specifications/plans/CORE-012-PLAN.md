# CORE-012: Column card counts Plan

**Status:** Planned  
**Feature ID:** CORE-012  
**Tasks:** `specifications/tasks/CORE-012-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

## Goal

Each Kanban column header shows how many feature cards are in that column. With no search query, counts reflect all cards assigned to that column by existing board rules (WIP, per-category backlog, Completed). When the user types in the header search box, counts update to match only features that pass the same filter as the visible cards, so the number always agrees with what is rendered in the column body.

## Current state

- `public/app.js` builds columns in `renderColumns()`: WIP, one column per markdown category, then Completed (`COL_WIP`, `COL_COMPLETE`).
- Column membership and visibility already live in `getFeaturesForColumn()`, which applies status/category rules and `applySearch()` via `uiState.searchQuery`.
- Search input (`#searchFeatures`) sets `uiState.searchQuery` and calls `renderColumns()` on input and Escape clear.
- Column headers render only the title (and category Delete); there is no count UI or styling yet.
- `public/style.css` defines `.column-header`, `.column-title`, and `.column-header-row` but no count badge.

No server or parser changes are required; counts are derived from in-memory client state at render time.

## Dependencies

- Prerequisite features: CORE-001 (board load/render), existing client search behavior (no separate feature ID).
- Parallel-safe features: CORE-011, AGENT-001 (board chrome only).
- Blockers: none.

## Context to load

- Required: this plan, task list, `public/app.js` (`renderColumns`, `getFeaturesForColumn`, `applySearch`), `public/style.css` (column header rules).
- Conditional: `public/index.html` only if markup structure changes beyond what `renderColumns()` injects.
- Do not load by default: workflow/agent modules, `server.js`, `parser.js`.

## Scope

### In scope

- Show a numeric count on every column header (WIP, each category, Completed).
- Count equals `getFeaturesForColumn(columnKey).length` so it stays aligned with search and column rules.
- Count refreshes whenever `renderColumns()` runs (search, refresh, drag-drop, create/edit/delete, category changes).
- Light styling consistent with the board (muted badge; readable when count is 0).

### Out of scope

- Total board count in the header or subtitle.
- Counting hidden cards that fail search separately (“3 hidden”).
- Per-status breakdown inside a column.
- API or markdown format changes.
- Automated test suite (none in repo today).

## Implementation approach

1. In `renderColumns()`, after resolving `features` for each column, compute `count = features.length` (already search-filtered).
2. Add a count element in the column header markup (e.g. span with class `column-count`), placed so it does not break the category Delete button layout.
3. Add CSS for the count (font size, color, optional min-width for alignment) and an accessible label such as `aria-label` on the header or count describing “N features”.
4. Manually verify empty search, partial match, no-match (all zeros in filtered columns), and that WIP/Completed still pull cross-category cards correctly.

## Verification plan

- Automated checks: none.
- Manual checks:
  - Load board with mixed columns; counts match visible cards with search empty.
  - Enter a search term; each column count matches the number of cards shown in that column.
  - Clear search (Escape); counts return to full totals.
  - Move a card between columns; both affected column counts update after persist/render.
- Skipped checks: hosted/multi-user (AGENT-002); no new network surface.

## Security review scope

Standalone security review not required. Counts expose only aggregate numbers already visible as card lists in the local UI; no new secrets or server endpoints.

## Acceptance criteria

- [ ] Plan and tasks approved by a human before implementation.
- [ ] Dependencies checked.
- [ ] Implementation matches approved scope.
- [ ] Verification evidence recorded.
- [ ] Security review completed or skip rationale documented.
- [ ] Completion summary created for PR handoff.
