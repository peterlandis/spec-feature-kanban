# CORE-023 Implementation Tasks

## Setup

- [x] FEATURES.md row CORE-023 added; branch `feat/core-023` from latest `main`.

## Implementation

- [x] Pin Graph shell to viewport height (body/kanban/graph-view/stage/feature-graph CSS).
- [x] Keep 2D SVG sizing inside the definite container (no intrinsic height blowout).
- [x] Unlock audio on orb click; orb replies use Settings `voiceId` instead of browser fallback when autoplay was the only failure mode after unlock.
- [x] Fix `currentVoiceId` / `syncJarvis` so select and config win over stale localStorage.

## Verification

- [x] Fullscreen / tall window: graph nodes centered in visible stage; page does not grow a second viewport of empty space.
- [x] Change voice in Settings → Preview uses new voice; speak requests send the selected `voiceId`.
- [x] Board and Process still scroll inside `.kanban`.
