# CORE-027 — 3D graph in-view feature roster

## Goal

While the 3D graph is spinning, the left side of the Graph view lists the features currently visible in the viewport—as many as fit the window—with a brief overview (id, title, short description) so humans can read what is on screen without depending only on crowded node labels.

## Approach

- Project 3D nodes each frame; keep those inside the canvas with enough scale to be “in view.”
- Sort nearest-first and fill a left roster until the panel height is used.
- Throttle DOM rebuilds so spin stays smooth; clicking a roster row pins that feature (same as grabbing a node).
- Keep the existing Selected inspect card when a feature is pinned; roster stays as the overview of what is visible.

## Out of scope

- Starting agents from the roster
- Changing layout math / force simulation
- 2D graph roster
