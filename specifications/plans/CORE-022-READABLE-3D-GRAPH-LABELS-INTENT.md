# CORE-022: Readable 3D graph labels

**Status:** WorkInProgress  
**Feature ID:** CORE-022  
**Tasks:** `specifications/tasks/CORE-022-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** On a large FEATURES.md the CORE-020 3D cloud becomes a wall of overlapping IDs and titles. Keep the rotating cloud, but make it readable: dots first, labels only when they can be told apart.

## Goal

Open Graph → 3D on a board with dozens of features and still see the shape of the graph. Hover or select a node to read its ID and title. Related neighbors stay labeled. The 2D graph is unchanged.

## Current state

- CORE-020 draws **every** node ID plus a truncated title every frame.
- Perspective already shrinks far nodes, but text still stacks through the sphere.
- A Selected card already lists the held feature and its links.

## Scope

### In scope

- Hide titles except hover / selected / neighbors.
- Cull overlapping IDs; nearer nodes win. Far or dim nodes are dots only.
- Spread the 3D layout as the feature count grows.
- HUD copy that says to hover or click to read a name.

### Out of scope

- Rewriting the 2D graph.
- A new 3D engine (WebGL / Three.js).
- Changing Jarvis.

## Acceptance criteria

- [ ] Dense 3D view is mostly nodes and edges, not a pile of text.
- [ ] Hover or select shows a readable ID and title.
- [ ] 2D Graph unchanged.
- [ ] View never starts agents.
