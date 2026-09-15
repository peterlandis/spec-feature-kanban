# CORE-034 — Phase live CoT and stage models

## Goal

When a phase is running, Process must show the **live agent chain of thought** for the current feature (thinking, tools, assistant text) — same critical visibility as the workspace Agent activity panel. Before Run phase, humans must see and choose Cursor models **per stage**: plan/tasks, implement, and security/review.

Features in the phase must **auto-move across Process stage groups** as status/workflow changes (planning → plan review → coding → …), with **dependency lines** drawn between related features on the Process graph so the phase’s progress and blockers are visible at a glance.

## Approach

- Enrich `GET /api/phases` with `liveRun` (current feature workflow: transcript, kind, status, model, errors).
- Poll faster while running; render a Phase agent activity panel under the phase list.
- Persist `models: { plan, implement, review }` on the phase sidecar; UI selects before run; pass into `runPhaseJob`.
- Planning uses `models.plan`; implement uses `models.implement`; review model is stored and shown (used when a review agent is started from the phase path later / workspace default for that stage).
- Show active model in the live panel header.
- While a phase runs (or any live agent), refresh FEATURES + workflow summaries and re-render Process so occupants move between stage columns.
- Overlay SVG dependency edges (depends-on / blocked-by) between process occupants; emphasize edges involving the active phase.

## Out of scope

- Parallel agent runs inside one phase
- Killing in-flight Cursor runs on Cancel (unchanged)
