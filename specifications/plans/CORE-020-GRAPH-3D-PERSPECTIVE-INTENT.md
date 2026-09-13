# CORE-020: Rotating 3D knowledge graph

**Status:** Testing  
**Feature ID:** CORE-020  
**Tasks:** `specifications/tasks/CORE-020-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** Add a **3D** mode on the Graph page that draws the CORE-017 knowledge graph in true perspective and slowly rotates. Grabbing a feature stops the spin so a human can inspect that node and its related edges. The existing 2D Graph (CORE-017 / CORE-019) stays as-is.

## Goal

Open **Graph**, choose **3D**, and see every tracked feature as a glowing node in a rotating 3D cloud. Edges still show depends-on, blocked-by, same-category, and plan-link. Grab a node: rotation pauses, that feature stays highlighted, and dragging orbits the camera around the cloud. A click without a drag still opens the workspace. A Resume control starts the spin again. This view never starts agents.

## Current state

- **Graph** is a 2D SVG force layout with zoom/pan (CORE-017 + CORE-019). Humans asked to keep that view.
- Header toggle is Board / Process / Graph.
- Relations already come from `GET /api/features` → `graph.edges`.

## Dependencies

- **Prerequisite:** CORE-017 relationship graph payload and node tones.
- **Parallel-safe:** CORE-019 zoom (2D only). CORE-018 Jarvis must not start here.
- **Not this feature:** Replacing Graph, voice, editing edges, Three.js/WebGL engine, starting agents.

## Scope

### In scope

- **2D / 3D** choice on the Graph page; header stays Board / Process / Graph.
- Perspective projection (nearer nodes larger, farther nodes smaller and dimmer).
- Idle auto-rotate around the vertical axis.
- Pointer grab on a node pauses auto-rotate and focuses that feature.
- Drag empty space (or a grabbed node) to orbit.
- Same zoom as Graph: wheel toward cursor, **+** / **−** / **Reset**, clamped 35%–500%.
- Click a node (no drag) → `openWorkspace`.
- Selected node, related neighbors, and labeled edges are visually emphasized; a Selected card lists related IDs.
- Resume spin control.
- Same search filter as Board / Graph.

### Out of scope

- Changing the 2D Graph renderer or zoom controls.
- Physics simulation after first layout (layout is computed once per feature set).
- Voice Jarvis (CORE-018).

## Acceptance criteria

- [x] Graph 2D still works unchanged.
- [x] 3D view auto-rotates until a feature is grabbed.
- [x] Grabbing a feature stops rotation and keeps a readable perspective of that node.
- [x] Click still opens the workspace; drag does not.
- [x] Resume restores auto-rotate.
- [x] View never starts agents.
