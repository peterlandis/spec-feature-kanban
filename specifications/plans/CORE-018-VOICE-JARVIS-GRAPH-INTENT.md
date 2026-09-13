# CORE-018: Voice Jarvis on the knowledge graph

**Status:** WorkInProgress  
**Feature ID:** CORE-018  
**Tasks:** `specifications/tasks/CORE-018-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** On the Graph view, a Jarvis-like virtual person you can **talk to** and that **talks back**. It uses the CORE-017 knowledge graph plus board/process state to brief current work, relations, and what to do next — a hands-off, voice-first control room. It does not replace the visual graph.

## Goal

A human opens **Graph**, enables Jarvis, and works without keyboard or mouse: speak a question (“What’s blocked?” “What should I do next?” “How does AGENT-003 relate to AGENT-001?”), hear a spoken answer grounded in the live feature graph, and see Jarvis as a virtual person in that view. Optional voice confirm can approve the next gate; silent auto-start of coding agents is out of scope.

## Current state

- **CORE-017** (Complete): Graph tab with 2D force layout, labeled edges, search, click → workspace. Payload includes `graph.nodes` / `graph.edges` from `workflow/feature-relations.js` on `GET /api/features`.
- **CORE-019 / CORE-020** (Complete): zoom/pan and 2D/3D on Graph; Jarvis must not break either mode.
- **CORE-013 / CORE-015**: `graphStage`, `nextWorkspaceGate`, and pipeline chips describe lifecycle and “what to click next” per feature.
- **AGENT-001**: workspace buttons (`startPlanning`, `approvePlan`, `startImplement`, ship) require explicit confirm; no agent on view open.
- No chat panel, speech APIs, conversation model route, or avatar on Graph today.

## Dependencies

- **Prerequisite:** CORE-017 graph payload and Graph view (`#graphView`, `renderFeatureGraph`, 3D sibling).
- **Uses:** `nextWorkspaceGate` logic (or equivalent hints), workflow sidecar fields (`runStatus`, `waitingOnHuman`, `planApprovedAt`), CORE-008-style secrets for any cloud model key.
- **Parallel-safe:** CORE-021 and other graph polish — extend Graph chrome only; do not rewrite layout engines.
- **Not this feature:** AGENT-002 hosting, AGENT-003/004/005 coding backends, replacing Board or Process, editing FEATURES.md from chat.

## Context to load

- **Required:** this plan, task list, `specifications/FEATURES.md`, `public/index.html`, `public/app.js` (`setMainView`, `renderFeatureGraph`, `nextWorkspaceGate`, graph highlight hooks), `public/style.css`, `server.js` (`GET /api/features`, secrets apply), `workflow/feature-relations.js`, `workflow/secrets.js`, `workflow/artifacts.js` (`graphStage`, `isWaitingOnHuman`).
- **Conditional:** browser Web Speech API docs; chosen LLM vendor HTTP API for **briefing only** (not the AGENT-001 runner).
- **Do not load by default:** AGENT-002 phone design, full-repo GraphRAG, Neo4j/graphify pipelines.

## Suggested slices (one registry row; ship in order)

1. **Talk about the graph (text):** Jarvis chat on Graph; answers from features, edges, statuses, and next-gate summaries. No voice.
2. **Voice in / voice out:** browser speech-to-text and text-to-speech on the same thread. Default input mode: **push-to-talk** (hold or toggle mic) — document in completion summary; avoid wake-word-only agent triggers.
3. **Virtual person:** visible Jarvis on Graph (simple avatar/CSS character) with listening / thinking / speaking states; highlight nodes Jarvis mentions.

If a slice is too large at approval, split follow-on work to a **new** registry row — not CORE-019/CORE-020 (already shipped).

## Scope

### In scope

- Jarvis session attached to the Graph view (not a second product).
- **Grounding snapshot:** serialized facts from the loaded feature set — ids, titles, status, `graphStage`, edges (type + from/to), blocked/paused, live/waiting flags, and per-feature next-gate hint text derived from the same rules as the workspace (no invented ids or edges).
- Spoken and/or written answers: in progress, waiting on human, blocked, what to work on next (global or for a named feature), how two features relate.
- Voice input and spoken replies for a hands-off loop (mic permission, push-to-talk default).
- Virtual person in Graph; mentioning or selecting a feature highlights that node (reuse graph selection/hover where possible).
- **Voice confirm** (or on-screen confirm) before any AGENT-001 start / implement / ship — Jarvis may *suggest* the gate, not fire runner APIs without the same confirm path as the workspace.
- Settings: enable Jarvis, optional briefing model key and voice preferences; persist like CORE-008 in gitignored `.features-secrets.json`. Never write keys or transcripts to FEATURES.md.

### Out of scope

- Building or replacing the CORE-017 visual graph or 3D renderer.
- Phone/HTTPS control plane (AGENT-002).
- Auto-merge, deploy, or starting a coding agent with no confirm.
- Repo/code GraphRAG as the only brain (feature graph is the world for v1).
- Wiring Gemini / Copilot / Claude as **coding** backends (AGENT-003/004/005).

## Safety

- Same confirm-before-start rule as AGENT-001; spoken “yes” counts only after an explicit confirm prompt for that action, not on page load or ambient listening.
- Jarvis must not invent features or edges absent from the snapshot; say “not in the graph” when unknown.
- Session transcript stays in browser memory (or optional local session only); do not append to FEATURES.md or workflow sidecar.

## Implementation approach

1. **Grounding builder**  
   Add `buildJarvisContext(features, graph)` (client or shared module) that returns a compact JSON facts block: nodes, edges, global summaries (counts by stage/status), and optional `nextGateHintByFeatureId` using the same inputs as `nextWorkspaceGate`. Refresh snapshot on `load()` and when Graph is visible during live-run poll.

2. **Text Jarvis (slice 1)**  
   Add a Jarvis panel in `#graphView` (collapsible, off by default): message list, text input, Send. Server route `POST /api/jarvis/chat` (or equivalent) accepts `{ messages, context }`, calls the configured briefing model with a strict system prompt (“answer only from CONTEXT JSON”), returns assistant text. No runner endpoints from this route.

3. **Node highlight (slice 1)**  
   When the assistant message contains tracked feature IDs, call existing graph focus/highlight (e.g. set selection / `graphHoveredFeatureId`) for the first mentioned id; optional “show on graph” chip per message.

4. **Voice (slice 2)**  
   Use `SpeechRecognition` / `webkitSpeechRecognition` for input and `speechSynthesis` for output; UI states idle / listening / speaking. Push-to-talk button; disable mic when Jarvis is off. On voice confirm flow, show the same confirm copy as workspace before calling `startPlanning` / `approvePlan` / `startImplement` / ship handlers.

5. **Virtual person (slice 3)**  
   Fixed or docked avatar region over Graph; animate mouth/glow with speaking state; aria-live region for spoken text for accessibility.

6. **Settings (cross-cutting)**  
   Settings tab or Graph toolbar: Jarvis on/off, briefing API key (server-only storage), optional voice rate/voice name. Status line “configured / not configured” without returning the key to the browser.

## Verification plan

- **Automated checks:** none required for v1; optional unit test for `buildJarvisContext` edge cases if extracted to `workflow/`.
- **Manual checks:**
  - Graph 2D/3D, search, zoom, and workspace click-through unchanged with Jarvis off.
  - Text: “What should I work on next?” → answer aligns with a feature that has a waiting next gate in the workspace.
  - Text: “How does AGENT-003 relate to AGENT-001?” → matches a **depends on** edge or states no relation.
  - Voice: push-to-talk captures a question and speaks the reply; states visible.
  - Attempt “start implementation for CORE-018” via voice → confirm UI required; no run without confirm.
  - Missing model key → Jarvis explains setup; no silent failure that looks like empty graph.
- **Skipped checks:** phone/HTTPS, non-Chromium browsers without Speech API (document limitation).

## Security review scope

Mic permission UX, briefing API key storage (parity with CORE-008), server proxy so keys are not in the DOM, no runner invocation from chat route, no transcript persistence to repo files, prompt-injection hardening via frozen context JSON and refusal to act on out-of-band instructions that contradict snapshot facts.

## Acceptance criteria

- [ ] Plan and tasks approved by a human before implementation.
- [ ] CORE-017 Graph usable as prerequisite; dependency check recorded in tasks.
- [ ] Jarvis chat on Graph answers from live graph + gate data; does not invent relations.
- [ ] Voice in/out works with push-to-talk; Graph usable with Jarvis disabled and without mic permission.
- [ ] Virtual person visible when enabled; mentioned features highlight on the graph.
- [ ] No coding agent start without the same confirm rules as AGENT-001 (voice or click).
- [ ] Briefing keys and transcripts excluded from FEATURES.md and API key responses.
- [ ] Verification evidence recorded; `SECURITY_REVIEW_CORE-018.md` completed.
- [ ] Completion summary created for PR handoff on `feat/core-018`.
