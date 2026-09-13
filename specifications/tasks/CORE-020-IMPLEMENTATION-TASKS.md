# CORE-020 Implementation Tasks
## Rotating 3D knowledge graph

**Plan:** `specifications/plans/CORE-020-GRAPH-3D-PERSPECTIVE-INTENT.md`  
**Feature ID:** CORE-020

## Human approval gate

- [x] Human asked for a true 3D rotating graph as a new feature, keeping the current Graph.
- [ ] Human reviewed this task list.

## Dependency check

- [x] Depends on CORE-017 graph edges and node tones.
- [x] Must not modify CORE-017 / CORE-019 2D behavior.

## Tasks

- [x] Register CORE-020 and add 3D as a Graph-page mode (header stays Board / Process / Graph).
- [x] Perspective canvas: 3D layout, depth sort, auto-rotate.
- [x] Grab a node to pause spin and inspect; drag to orbit; click opens workspace.
- [x] Resume spin; leave view stops the animation loop.
- [x] Verify Board / Process / Graph unchanged.
- [x] Same zoom as Graph on 3D: wheel toward cursor, + / − / Reset, percent label.
- [x] Selected node and related edges/neighbors are visually emphasized; Selected card lists relations.
- [x] Completion summary and draft PR.
