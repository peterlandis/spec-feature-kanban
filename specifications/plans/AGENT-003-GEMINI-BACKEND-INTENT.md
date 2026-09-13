# AGENT-003: Gemini coding agent backend

**Status:** Planned  
**Feature ID:** AGENT-003  
**Tasks:** `specifications/tasks/AGENT-003-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** Wire **Google Gemini** as one coding-agent backend for the existing spec workflow. Cursor stays AGENT-001. Copilot is AGENT-004. Claude is AGENT-005. Do not implement those vendors here.

## Goal

A human saves a Gemini API key in Settings, selects Gemini as the coding tool, and Start planning / revise / implement runs through a Gemini `AgentBackend`. AGENT-001 gates stay the same (confirm before start, no implement before plan approval, no merge from the board).

## Current state

- Cursor is the only live adapter (`CORE-008`, `CORE-009`, `workflow/cursor-adapter.js`).
- Settings IDE pane has no Gemini card.
- Secrets are Cursor-shaped; runner always launches Cursor.
- **AgentBackend** in the AGENT-001 plan is the extension point.

## Dependencies

- **Prerequisite:** AGENT-001, CORE-008 (key storage pattern).
- **Sibling features (do not implement):** AGENT-004 Copilot, AGENT-005 Claude, AGENT-002 hosting.
- This feature may add the shared “selected backend” slot in secrets/runner so later tools can plug in. It must not ship Copilot or Claude adapters.

## Scope

### In scope

- Settings card: Gemini key, optional model picker, save / remove, honest not-configured state.
- Gemini adapter behind `AgentBackend` (`start` / `send` / `status` / `cancel` / `resume` as applicable).
- Runner uses Gemini when it is the selected backend; sidecar records `backend: gemini`.
- Keys in gitignored secrets only. Never write keys to `FEATURES.md` or return them in list APIs.
- Cursor still works when Cursor is selected (or when Gemini is not configured).

### Out of scope

- GitHub Copilot, Claude, other vendors.
- AGENT-002 hosted/phone/cloud-default.
- Changing Kanban, Process, or Graph.
- Using the Ship `gh` token as a Gemini credential.

## Acceptance themes

- Start planning with Gemini selected uses the Gemini adapter.
- Unconfigured Gemini cannot start a fake run.
- Cursor path still works.
- Gemini key never appears in FEATURES.md or `/api/features`.
