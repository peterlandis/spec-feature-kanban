# Security Review: CORE-018 - Voice Jarvis on the knowledge graph

**Feature ID:** CORE-018  
**Reviewer:** Cursor Agent  
**Date:** 2026-09-12  
**Plan:** `specifications/plans/CORE-018-VOICE-JARVIS-GRAPH-INTENT.md`

## Scope

Graph companion HUD, `POST /api/jarvis/chat` (local snapshot, or optional OpenAI/Grok brief from that same frozen JSON), `POST /api/jarvis/speak` (macOS `say` via execFile, optional OpenAI TTS, optional xAI Grok TTS), browser SpeechRecognition / speechSynthesis fallback, optional confirm that then calls existing workspace runner routes. OpenAI and Grok are briefing/speech only, not coding backends. Gate intents stay local.

## Findings

| Severity | Finding | Status |
|----------|---------|--------|
| None | Chat route answers only from the posted feature/graph snapshot. It does not call start-planning, implement, or ship. | Mitigated |
| None | Gate actions require an on-screen Confirm; then the existing `confirmed: true` runner routes. | Mitigated |
| None | Transcript stays in tab memory. Not written to FEATURES.md or sidecar. | Mitigated |
| Low | Mic permission is browser-mediated. Denied mic still allows text. | Accepted |
| Low | Client-supplied snapshot could be stale or edited; answers still cannot invent IDs absent from that snapshot. | Accepted |
| Low | Speak route runs local `say` with a fixed voice list. Text is an execFile argument (not a shell string), `[[...]]` is stripped, length is capped, temp WAV is deleted. | Mitigated |
| Low | Optional xAI and OpenAI keys are stored like Cursor in `.features-secrets.json`, never returned to the browser. Briefing, Grok rewrite/TTS, and OpenAI TTS are server-side from the posted snapshot only. Chat route still does not start agents. | Mitigated |

## Outcome

Approved for local single-user use. Briefing uses the graph snapshot, not a second cloud coding key.
