# AGENT-005: Claude coding agent backend

**Status:** Planned  
**Feature ID:** AGENT-005  
**Tasks:** `specifications/tasks/AGENT-005-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** Wire **Anthropic Claude** as one coding-agent backend for the spec workflow. Cursor is AGENT-001. Gemini is AGENT-003. Copilot is AGENT-004. Settings already has a Claude “Coming later” stub.

## Goal

A human saves an Anthropic API key in Settings, selects Claude as the coding tool, and Start planning / revise / implement runs through a Claude `AgentBackend`. Same AGENT-001 gates.

## Current state

- Settings IDE pane has a Claude card marked “Coming later.”
- No Anthropic key storage or adapter.
- Runner is Cursor-only until a sibling feature adds a selected-backend slot.

## Dependencies

- **Prerequisite:** AGENT-001, CORE-008.
- **Helpful:** AGENT-003 if it already landed the selected-backend slot; otherwise add that slot here without shipping Gemini or Copilot.
- **Do not implement:** Gemini, Copilot, AGENT-002 hosting.

## Scope

### In scope

- Turn the Claude Settings stub into a real configure / save / remove card, with a model picker if the API lists models.
- Claude adapter behind `AgentBackend`.
- Runner uses Claude when selected; sidecar records `backend: claude`.
- Keys in gitignored secrets only. Never in FEATURES.md.
- Honest not-configured state — no fake runs.

### Out of scope

- Gemini, GitHub Copilot, Cursor rewrites.
- AGENT-002 hosting.
- Replacing the workspace or Process views.

## Acceptance themes

- Start planning with Claude selected uses the Claude adapter.
- Unconfigured Claude cannot start.
- Cursor still works when it is the selected tool.
