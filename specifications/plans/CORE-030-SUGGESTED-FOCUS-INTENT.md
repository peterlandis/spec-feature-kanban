# CORE-030 — Suggested focus (where to start)

## Goal

Help humans decide where to begin: on **Process**, a Suggested focus strip lists Start here and the next few features, ranked from dependency graph + human gates. Jarvis “what next” uses the same ranking. Picks can deepen on Graph (focus/pin the node). **Board stays simple for drag-and-drop.**

## Approach

- Shared ranker: prefer waiting-on-human and unblocked work; boost features that unlock others; demote incomplete prerequisites and Blocked.
- Process: compact Suggested focus strip above the lifecycle graph.
- Jarvis: next-work answers cite Start here + Next from the same list.
- Graph: “On graph” focuses/pins the feature so Related roster explains why.

## Out of scope

- Auto-starting agents
- Manual drag-reorder of the suggestion list
- A new top-level nav tab
