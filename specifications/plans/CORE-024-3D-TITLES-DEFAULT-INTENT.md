# CORE-024: 3D graph titles and default mode

**Status:** WorkInProgress  
**Feature ID:** CORE-024  
**Tasks:** `specifications/tasks/CORE-024-IMPLEMENTATION-TASKS.md`

## Goal

On Graph → 3D, labeled nodes show the feature **title** as well as the ID so a dense board is readable without selecting every node. Opening Graph defaults to **3D** (2D remains available; preference remembered).

## Approach

- Extend `graph3dLabelPlan` so nearest labeled nodes also get a title line (still collision-culled).
- Default `uiState.graphMode` to `3d`; persist the last choice in `localStorage`.

## Out of scope

- Per-feature Cursor model (CORE-025).
- Rewriting the 3D engine or 2D graph.
