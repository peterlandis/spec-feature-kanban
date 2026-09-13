# CORE-018 Implementation Tasks
## Voice Jarvis on the knowledge graph

**Plan:** `specifications/plans/CORE-018-VOICE-JARVIS-GRAPH-INTENT.md`  
**Feature ID:** CORE-018  
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.

## Dependency check

- [x] CORE-017 Graph view is usable (nodes, edges, search, workspace click-through; 2D and 3D if CORE-020 is present).
- [x] Blockers recorded: mic + Web Speech API (browser-dependent); briefing is local snapshot (no extra vendor key).
- [x] Parallel work risks: do not rewrite CORE-017/019/020 layout; do not start AGENT-002 hosting; do not ship AGENT-003/004/005 adapters on this branch.

## Tasks

### Phase 1: Preparation

- [x] Read the plan slices, safety section, and acceptance criteria.
- [x] Trace Graph entry points.
- [x] Trace `nextWorkspaceGate` / live/waiting fields.
- [x] Confirm `GET /api/features` returns `graph`.
- [x] Decision: latch push-to-talk; no wake-word-only agent start. Documented in completion summary.
- [x] Affected files listed in completion summary.

### Phase 2–4

- [x] `buildJarvisContext` + grounded answers.
- [x] Jarvis panel on Graph (off by default).
- [x] `POST /api/jarvis/chat` — no runner calls.
- [x] Settings → Jarvis on/off and speak replies.
- [x] Optional Natural speech (Grok): xAI key, rewrite + neural TTS, local fallback.
- [x] Optional OpenAI speech: OpenAI key, `gpt-4o-mini-tts` voices in the same picker. Speech only — not a coding backend.
- [x] OpenAI/Grok voices brief from the full graph snapshot with a conversational Jarvis prompt; local snapshot remains the fallback. Gate confirms stay local.
- [x] Mentioned IDs highlight on the graph.
- [x] Latch push-to-talk + speechSynthesis; states idle/listening/thinking/speaking.
- [x] Voice/text gate actions require on-screen Confirm.
- [x] Orb avatar; aria-live state line.

### Phase 5–7

- [x] Local answerer verification recorded in completion summary.
- [x] `SECURITY_REVIEW_CORE-018.md`.
- [x] `CORE-018-COMPLETION-SUMMARY.md`.
