# AGENT-004: GitHub Copilot coding agent backend

**Status:** Planned  
**Feature ID:** AGENT-004  
**Tasks:** `specifications/tasks/AGENT-004-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** Wire **GitHub Copilot coding agent** as one backend for the spec workflow. This is not the Ship/`gh` token on the GitHub settings pane. Cursor is AGENT-001. Gemini is AGENT-003. Claude is AGENT-005.

## Goal

A human configures Copilot in Settings, selects it as the coding tool, and Start planning / revise / implement runs through a Copilot `AgentBackend`. Same AGENT-001 gates.

## Current state

- Settings shows a Copilot card marked “Coming later.”
- The GitHub pane token is for draft PRs via `gh` only — do not reuse it as the Copilot agent credential unless a later human decision says otherwise and the UI labels that clearly.
- Runner is Cursor-only until AGENT-003 (or this feature) adds a selected-backend slot.

## Dependencies

- **Prerequisite:** AGENT-001, CORE-008.
- **Helpful:** AGENT-003 if it already landed the selected-backend slot; otherwise add that slot here without shipping Gemini.
- **Do not implement:** Gemini, Claude, AGENT-002 hosting.

## Scope

### In scope

- Turn the Copilot Settings stub into a real configure / save / remove card.
- Copilot coding-agent adapter behind `AgentBackend`.
- Runner uses Copilot when selected; sidecar records `backend: copilot` (or the exact vendor id).
- Honest not-configured / unavailable state — no fake runs.
- Keys stay in gitignored secrets; never in FEATURES.md.

### Out of scope

- Gemini, Claude, Cursor rewrites.
- Changing Ship/`gh` PR creation except to keep it clearly separate from Copilot.
- AGENT-002 hosting.

## Acceptance themes

- Start planning with Copilot selected uses the Copilot adapter.
- Ship still uses the GitHub token, not the Copilot agent key, unless explicitly unified later.
- Cursor still works when it is the selected tool.
