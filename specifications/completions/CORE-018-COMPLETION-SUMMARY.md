# CORE-018 Completion Summary

**Feature ID:** CORE-018  
**Plan:** `specifications/plans/CORE-018-VOICE-JARVIS-GRAPH-INTENT.md`  
**Tasks:** `specifications/tasks/CORE-018-IMPLEMENTATION-TASKS.md`  
**Security review:** `specifications/reviews/SECURITY_REVIEW_CORE-018.md`  
**Date:** 2026-09-12

## Summary

Jarvis is a companion HUD on Graph (off by default). It answers from a frozen feature-graph snapshot: next work, blocked, waiting, relations. Push-to-talk is a latch on the orb (click to listen, click to stop). Spoken “start implementation for CORE-018” shows Confirm; the chat route never starts agents. Visual language follows the attached J.A.R.V.I.S. orb / output-panel references. No extra paid coding vendor — briefing is local from the snapshot. Cursor remains the only coding backend.

## Decisions

- Voice input: **latch push-to-talk** (not hold, not wake-word).
- Briefing model: **graph snapshot engine** for local/browser voices. OpenAI/Grok voices send the snapshot plus the question to that LLM with a conversational Jarvis prompt, then speak the reply. Not a coding backend. Gate confirms stay local.
- Spoken voice: Settings → Jarvis **Voice** picker. Local Mac (Daniel / Reed / Eddy) and browser UK male need no key. OpenAI voices (Onyx, Echo, Ash, Fable, and others) show the OpenAI key form. Grok voices (Rex, Ara, Leo, Sal, Eve) show the xAI key form. Speech keys are not coding backends.

## Files changed

| File | Purpose |
|------|---------|
| `workflow/jarvis-context.js` | Snapshot + grounded answers |
| `workflow/jarvis-brief.js` | Optional OpenAI / Grok conversational brief from the snapshot |
| `workflow/jarvis-voice.js` | Local / OpenAI / Grok TTS + spoken ID expansion |
| `server.js` | `POST /api/jarvis/chat`, `POST /api/jarvis/speak` |
| `public/index.html` | HUD, Settings → Jarvis |
| `public/jarvis.js` | Chat, PTT, TTS, confirm |
| `public/style.css` | Orb HUD |
| `public/app.js` | Snapshot, highlight, confirm POST |

## Verification

Local `answerJarvis` checks: AGENT-003 depends on AGENT-001; next work prefers waiting CORE-018; implement intent returns confirm only.
