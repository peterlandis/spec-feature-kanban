# CORE-030 — Suggested focus (where to start)

## Goal

Help humans decide where to begin: a Board strip lists Start here and the next few features, ranked from dependency graph + human gates. Jarvis “what next” uses the same ranking. Picks can deepen on Graph (focus/pin the node).

## Approach

- Shared ranker: prefer waiting-on-human and unblocked work; boost features that unlock others; demote incomplete prerequisites and Blocked.
- Board: compact Suggested focus strip above the columns.
- Jarvis: next-work answers cite Start here + Next from the same list.
- Graph: “On graph” focuses/pins the feature so Related roster explains why.

## Out of scope

- Auto-starting agents
- Manual drag-reorder of the suggestion list
- A new top-level nav tab
