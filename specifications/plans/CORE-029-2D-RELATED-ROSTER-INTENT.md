# CORE-029 — Graph related-features roster

## Goal

When a feature is highlighted on the 2D Graph (or pinned on 3D), the left side lists related features with brief detail (id, title, short description, relation type)—same readable overview style as the 3D in-view roster—so humans get both the visual highlight and scannable context. While 3D is spinning with nothing pinned, keep the existing In view roster.

## Approach

- On 2D hover/focus, show a left Related roster of linked neighbors (depends on / blocked by / plan link), plus same-category peers when links are sparse.
- On 3D pin/select, switch the left panel from In view to Related (focus card + detailed related rows); Resume spin returns to In view.
- Reuse one roster visual language; hovering a roster row focuses that node; clicking opens the workspace (or pins on 3D, second click opens).
- Keep 2D focus when the pointer moves from a node onto the roster; clear when leaving both.
- Reserve left layout inset in 2D so the cloud stays readable beside the panel.

## Out of scope

- Starting agents from the roster
- Auto-creating dependency notes
