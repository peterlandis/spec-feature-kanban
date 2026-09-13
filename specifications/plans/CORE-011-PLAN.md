# CORE-011: Live agent chain of thought Plan

**Status:** Approved for implementation
**Feature ID:** CORE-011
**Tasks:** `specifications/tasks/CORE-011-IMPLEMENTATION-TASKS.md`
**Human approval required before implementation:** Yes (approved in chat)

## Goal

While a Cursor run is in progress, the feature workspace shows a live activity
log: status, thinking, tool calls, and assistant text. A human can tell whether
the agent is starting, working, stuck, or crashed without leaving the Plan tab
or guessing from an empty template.

## Current state

- Start planning copies empty plan/task templates immediately, then starts an agent
- The Plan tab renders that template as if it were the plan
- Implementation shows only `lastAssistantText` after assistant messages
- Thinking and tool_call stream events are dropped
- Workspace polling starts only after `runStatus === 'running'`
- `Agent.create` can take a long time or crash; during `starting` the UI looks idle

## Dependencies

- Prerequisite features: AGENT-001 adapter, CORE-007 workspace preview
- Parallel-safe features: CORE-010
- Blockers: none for a live log; agent crashes are a separate runtime issue

## Context to load

- Required: this plan, the task list, `workflow/runner.js`, `workflow/cursor-adapter.js`, `workflow/state.js`, `public/app.js`, `public/index.html`
- Conditional: `@cursor/sdk` message types (`thinking`, `tool_call`, `assistant`, `status`)
- Do not load by default: AGENT-002

## Scope

### In scope

- Persist a capped transcript of status / thinking / tool / assistant / error lines
- Show that log in the workspace on every tab, updating while a run is live
- Poll during `starting` and `running`
- Record a starting line as soon as the user confirms Start planning
- Surface crash/error text in the same log

### Out of scope

- Streaming tokens faster than the existing workspace poll
- Replaying full raw SDK payloads
- Fixing Cursor SDK SIGSEGV
- Ship / MR

## Implementation approach

1. Normalize SDK stream events into short transcript lines on the feature workflow sidecar.
2. Keep a live agent-activity panel in the workspace chrome (above the tabs).
3. Treat `starting` as an active run for polling, cancel, and button disable.

## Verification plan

- Automated checks: none
- Manual checks: open a feature workspace, start planning, confirm the activity panel shows Starting then thinking/tools or a crash error without switching tabs
- Skipped checks: hosted/phone (AGENT-002)

## Security review scope

Standalone review not required. Transcript must not include the API key. Truncate tool args/results.

## Acceptance criteria

- [x] Plan and tasks approved by a human before implementation.
- [x] Dependencies checked.
- [x] Implementation matches approved scope.
- [x] Verification evidence recorded.
- [x] Security review skipped: local UI log only; no secrets in transcript.
- [ ] Completion summary created for PR handoff.
