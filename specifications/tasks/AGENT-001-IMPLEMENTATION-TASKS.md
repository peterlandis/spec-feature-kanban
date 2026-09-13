# AGENT-001 Implementation Tasks
## Local Cursor Spec Workflow

**Plan:** `specifications/plans/AGENT-001-LOCAL-CURSOR-WORKFLOW-PLAN.md`
**Feature ID:** AGENT-001
**Human approval required before implementation:** Yes

## Human approval gate

- [x] Human reviewed the feature registry row.
- [x] Human reviewed the plan.
- [x] Human reviewed this task list.
- [x] Human approved implementation.

Implementation must not begin until all approval items are checked or an equivalent
approved signal is linked here.

## Dependency check

- [x] Dependencies checked in `specifications/FEATURES.md`.
- [x] Blockers recorded: none for local Cursor SDK; runtime needs `CURSOR_API_KEY`
- [x] Parallel work risks recorded: do not start AGENT-002 hosting work in this feature

## Tasks

### Phase 1: Preparation

- [x] Load only required context from the AGENT-001 plan.
- [x] Confirm affected files: `server.js`, `parser.js`, `public/app.js`, `public/index.html`, `public/style.css`, new `workflow/` module.
- [x] Confirm target cwd is the git root of the selected tracking file.

### Phase 2: Implementation

- [x] Add Planning and PlanReview statuses (parser normalize + UI select + board chips).
- [x] Add feature workspace UI: Plan/Tasks, Implementation, Review, Ship.
- [x] Do not start an agent on drag-and-drop; require an explicit Start planning confirm.
- [x] Persist workflow state outside `FEATURES.md` (`.features-workflow.json` or equivalent).
- [x] Add start / send-revision / approve / cancel / status APIs.
- [x] Enforce one active run per target repo.
- [x] Implement `AgentBackend` and a Cursor SDK local adapter (`Agent.create`, `send`, `resume`, `local.cwd`).
- [x] Planning prompt writes plan + tasks only and stops.
- [x] Revision prompt edits those artifacts only.
- [x] Implement prompt runs only after recorded plan approval.
- [x] After implement, write completion summary + security review for UI review.
- [x] Ship action may create an MR via `gh` and write the URL onto the feature row.
- [ ] Keep hosted/phone/cloud-default/notify work out of this feature (AGENT-002).

### Phase 3: Verification

- [ ] Run required checks: `npm start` loads the board; workflow APIs reject start without confirm payload; second start on same repo is refused while a run is active.
- [ ] Record results:
- [ ] Record skipped checks and reasons: no hosted/phone tests in v1.

### Phase 4: Security review

- [ ] Create or update `specifications/reviews/SECURITY_REVIEW_AGENT-001.md`.
- [ ] Address blockers or document follow-up.

### Phase 5: Completion summary and PR handoff

- [ ] Create `specifications/completions/AGENT-001-COMPLETION-SUMMARY.md`.
- [ ] Use completion summary PR body for draft PR.
- [ ] Commit and push changes.
- [ ] Create or update draft PR.

## Notes

- v1 goal: run locally and fire agents via Cursor.
- AGENT-002 is the later hosted, phone-reachable, remote-agent service.
