# CORE-018 Implementation Tasks
## Voice Jarvis on the knowledge graph

**Plan:** `specifications/plans/CORE-018-VOICE-JARVIS-GRAPH-INTENT.md`  
**Feature ID:** CORE-018  
**Human approval required before implementation:** Yes

## Human approval gate

- [ ] Human reviewed the feature registry row.
- [ ] Human reviewed the plan.
- [ ] Human reviewed this task list.
- [ ] Human approved implementation.

## Dependency check

- [ ] CORE-017 Graph view is usable (nodes, edges, search, workspace click-through).
- [ ] Blockers recorded: mic/speech APIs and a conversation model key are runtime requirements.
- [ ] Parallel work risks: do not rewrite CORE-017 layout; do not start AGENT-002 hosting; do not ship AGENT-003/004/005 adapters here.

## Tasks

### Phase 1: Preparation

- [ ] Load this intent, CORE-017 graph UI, next-gate helpers (`nextWorkspaceGate`), feature relation payload.
- [ ] Choose wake style: push-to-talk vs wake phrase; document in the plan notes.

### Phase 2: Implementation (slice 1 — talk about the graph)

- [ ] Add a Jarvis chat surface on the Graph view, grounded in loaded features + relations + next gates.
- [ ] Highlight the node Jarvis is talking about.
- [ ] Do not start coding agents from chat text alone.

### Phase 3: Implementation (slice 2 — voice)

- [ ] Voice in (speech-to-text) and voice out (text-to-speech) for the same conversation.
- [ ] Hands-off loop: listen → answer → speak, with a clear listening / speaking / idle state.
- [ ] Voice confirm required before start planning / implement / ship.

### Phase 4: Implementation (slice 3 — virtual person)

- [ ] Show a Jarvis virtual person on the Graph view that speaks and listens.
- [ ] Graph remains visible; Jarvis is a companion, not a replacement for nodes/edges.

### Phase 5: Verification

- [ ] “What should I work on next?” spoken answer matches next-gate data.
- [ ] “How does X relate to Y?” matches CORE-017 edges or an honest “no relation.”
- [ ] Graph works with Jarvis off and without mic permission.
- [ ] No agent start without confirm.

### Phase 6: Security review

- [ ] Create `specifications/reviews/SECURITY_REVIEW_CORE-018.md`.
- [ ] Cover mic permission, conversation keys never in FEATURES.md, no silent agent start, local transcripts.

### Phase 7: Completion summary and PR handoff

- [ ] Create `specifications/completions/CORE-018-COMPLETION-SUMMARY.md`.
- [ ] Commit and push on `feat/core-018` (not `main`).

## Notes

- Branch: `feat/core-018`.
- Implement after CORE-017 is stable enough to ground answers.
- Phone/hosted reuse is AGENT-002, not this feature.
