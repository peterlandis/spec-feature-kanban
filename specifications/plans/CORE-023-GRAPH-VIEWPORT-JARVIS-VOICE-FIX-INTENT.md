# CORE-023: Graph viewport and Jarvis voice fixes

**Status:** WorkInProgress  
**Feature ID:** CORE-023  
**Tasks:** `specifications/tasks/CORE-023-IMPLEMENTATION-TASKS.md`

## Goal

Fix two Graph/Jarvis regressions: (1) the knowledge graph sits at the bottom of an oversized scrollable page on tall/fullscreen windows; (2) changing the Settings voice still sounds like the previous/browser voice when speaking via the orb.

## Root causes

1. **Viewport:** `.graph-view` only used `min-height: calc(100vh - 140px)`. The SVG/canvas inherited an unbounded height, so the force layout centered nodes in a panel taller than the window.
2. **Voice:** Orb click starts the mic; the spoken reply calls `Audio.play()` later outside the user-gesture window. Autoplay failure falls through to `speakBrowser()`, which ignores the Settings picker. `currentVoiceId()` also preferred stale `localStorage` over live config when the select was empty.

## Approach

- Lock the app shell to the viewport (`body` column flex, `#graphView` fills remaining height with `min-height: 0` / `overflow: hidden`).
- Size the 2D SVG from the definite container height; avoid intrinsic SVG blowout.
- Unlock audio (and speech synthesis) on orb press; keep the chosen `voiceId` through speak; prefer select → config → storage for `currentVoiceId`.

## Out of scope

- Redesigning Jarvis UI, new TTS providers, or changing CORE-017 layout algorithms beyond viewport sizing.
