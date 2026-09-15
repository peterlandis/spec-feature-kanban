# CORE-028 — Graph category clusters and dependency suggestions

## Goal

Make related work visible on boards like QuantFoundry where categories exist but the Graph looks like isolated dots: show category clusters, parse non-CORE/AGENT feature IDs, and suggest Depends-on links the human can apply.

## Approach

1. Generalize feature-ID parsing beyond `CORE|AGENT` (e.g. `QF-001`).
2. Return category `clusters` from the graph builder; lay out nodes by category and draw labeled hulls in 2D and 3D.
3. Suggest missing dependencies from plan/notes ID mentions and conservative title/description overlap; Apply writes `Depends on <ID>` into Notes.

## Out of scope

- Auto-rewriting categories without human confirmation
- LLM-only clustering (v1 is deterministic)
- Starting agents from the suggest panel
