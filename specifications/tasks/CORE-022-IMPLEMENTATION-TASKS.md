# CORE-022 Implementation Tasks
## Readable 3D graph labels

**Plan:** `specifications/plans/CORE-022-READABLE-3D-GRAPH-LABELS-INTENT.md`  
**Feature ID:** CORE-022  
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.

Asked from the 3D Graph screenshot: overlapping labels on a large board.

## Dependency check

- [x] CORE-020 3D canvas renderer is on main.
- [x] Blockers recorded: none.
- [x] Parallel work risks: do not change 2D layout or Jarvis.

## Tasks

### Phase 1–2

- [x] Cull 3D labels; titles only on hover/select/neighbors.
- [x] Spread layout with feature count.
- [x] HUD hint to hover or click to read a name.

### Phase 3

- [x] Browser-verify Graph 2D unchanged and 3D readable while spinning, on hover, and when selected.
