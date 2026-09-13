# CORE-019: Graph zoom and pan

**Status:** Complete  
**Feature ID:** CORE-019  
**Tasks:** `specifications/tasks/CORE-019-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** Let a human zoom into the CORE-017 knowledge graph so feature IDs, titles, and edges are readable, and pan to move around. No agent start.

## Goal

On Graph, zoom toward the cursor (wheel), use **+** / **−** / **Reset** controls, and drag the canvas to pan. Zoom range is clamped. Search and workspace click-through still work.

## Dependencies

- **Prerequisite:** CORE-017 network graph.
- **Not this feature:** CORE-018 Jarvis/voice, replacing Board or Process.

## Acceptance themes

- Wheel zoom makes labels larger and easier to read.
- Drag pans without opening a workspace (a click still opens one).
- Reset returns to the default fit.
