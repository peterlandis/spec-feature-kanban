# CORE-018: Voice Jarvis on the knowledge graph

**Status:** Planned  
**Feature ID:** CORE-018  
**Tasks:** `specifications/tasks/CORE-018-IMPLEMENTATION-TASKS.md`  
**Human approval required before implementation:** Yes

**Intent brief:** On the Graph view, a Jarvis-like virtual person you can **talk to** and that **talks back**. It uses the CORE-017 knowledge graph plus board/process state to brief current work, relations, and what to do next — a hands-off, voice-first control room. It does not replace the visual graph.

## Goal

A human opens Graph, enables Jarvis, and works without keyboard or mouse: speak a question (“What’s blocked?” “What should I do next?” “How does AGENT-002 relate to AGENT-001?”), hear a spoken answer grounded in the live feature graph, and see Jarvis as a virtual person in that view. Optional voice confirm can approve the next gate; silent auto-start of coding agents is out of scope.

## Current state

- **CORE-017** (in Testing) is the visual feature graph: nodes, relation edges, search, click → workspace. No conversation, no voice, no avatar.
- **CORE-013** Process and **CORE-015** next-gate already know stage and “what to click next.”
- **AGENT-001** starts coding agents only after an explicit confirm.
- **AGENT-002** is later hosted/phone — overlap with voice, but this feature is the local Graph/Jarvis experience, not HTTPS hosting.

## Dependencies

- **Prerequisite:** CORE-017 (graph nodes/edges and Graph view). Do not implement the visual graph here.
- **Uses:** CORE-013 / CORE-015 (stage + next gate), AGENT-001 workspace/workflow fields for “current state.”
- **Not this feature:** AGENT-002 hosting, AGENT-003/004/005 vendor adapters, replacing Board or Process.

## Suggested slices (keep as one registry row; ship in order)

1. **Talk about the graph (text):** chat panel on Graph; Jarvis answers from feature nodes, edges, statuses, and next gates. No voice yet.
2. **Voice in / voice out:** browser speech-to-text and text-to-speech so the same conversation is hands-off.
3. **Virtual person:** visible Jarvis in the Graph view (avatar or simple character) that speaks and listens; highlight graph nodes Jarvis is talking about.

If a slice is too large at approval, split it to CORE-019+ rather than stuffing vendor backends into this feature.

## Scope

### In scope

- Jarvis session attached to the Graph view (not a second product).
- Grounding: current FEATURES.md features, CORE-017 relations, process/graph stages, next-gate hints, live/waiting if already on the payload.
- Spoken and/or written answers: what is in progress, what is waiting on a human, what is blocked, what to work on next, how two features relate.
- Voice input and spoken replies for a hands-off loop (mic permission, push-to-talk or wake phrase — pick one in implementation and document it).
- Virtual person representation in Graph; selecting or mentioning a feature highlights that node.
- **Voice confirm** (or on-screen confirm) before any AGENT-001 start / implement / ship. Hands-off means no typing, not “start agents without a gate.”
- Settings: enable Jarvis, mic, voice; keys stay in gitignored secrets like CORE-008. Never write them to FEATURES.md.

### Out of scope

- Building or replacing the CORE-017 visual graph.
- Phone/HTTPS hosted control plane (AGENT-002) — that may reuse this later.
- Auto-merge, deploy, or starting a coding agent with no confirm.
- Full repo/code GraphRAG as the only brain (feature graph is the world for v1).
- Implementing Gemini / Copilot / Claude backends (AGENT-003/004/005).

## Safety

- Same confirm-before-start rule as AGENT-001; voice “yes” is an explicit confirm, not page-load or wake-word alone.
- Jarvis must not invent features or edges that are not in the loaded graph.
- Transcript of the Jarvis session stays local; do not append it to FEATURES.md.

## Acceptance themes

- Ask by voice what to work on next; Jarvis speaks a next-gate answer that matches the board/process data.
- Ask how two features relate; Jarvis’s answer matches a CORE-017 edge (or honestly says there is none).
- Graph still works without mic if Jarvis is off.
- No coding agent starts unless the human confirms (voice or click).
