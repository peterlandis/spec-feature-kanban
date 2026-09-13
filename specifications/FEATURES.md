# Feature Tracking

**Spec Features Kanban: Markdown-backed Kanban for spec-driven development**

Local web UI for managing a feature-tracking markdown file. The markdown file is the
single source of truth so humans can drag-and-drop progress and agents can read the
same backlog. Features drive plan, tasks, implementation, and review in an iterative
cycle.

---

## Status Legend

- 🔨 **WorkInProgress** - Currently being developed
- 🧪 **Testing** - Feature is complete and being tested
- 🟢 **ReadyToMerge** - PR approved by reviewer, ready to merge
- ✅ **Complete** - Feature is complete and merged
- 📋 **Planned** - Planned but not started
- 📝 **Planning** - Agent or workspace is writing plan and tasks
- 👀 **PlanReview** - Plan and tasks waiting on human approval
- 🚫 **Blocked** - Blocked by dependencies or issues
- ⏸️ **Paused** - Temporarily paused

---

## Feature Categories

### Core
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| CORE-001 | Board loads from markdown | Parse a feature-tracking markdown file and render a Kanban board | MVP | ✅ Complete | @peterlandis | - | `parser.js` + `GET /api/features` |
| CORE-002 | Persist updates to file | Save drag-and-drop and CRUD changes back into the markdown file | MVP | ✅ Complete | @peterlandis | - | `PUT /api/features` |
| CORE-003 | Switch tracking file | Select which markdown file is the source of truth | MVP | ✅ Complete | @peterlandis | - | `.features-kanban.json`; `FEATURES_PATH` override |
| CORE-004 | First-run template | Create a template tracking file when none exists | MVP | ✅ Complete | @peterlandis | - | Legend + category tables |
| CORE-005 | Format guardrails | Reject files that do not look like a feature tracker | MVP | ✅ Complete | @peterlandis | - | Requires Feature Categories + tables |
| CORE-006 | Specifications folder | Repo-native `specifications/` layout matching other projects | MVP | ✅ Complete | @peterlandis | - | Inflated on `feat/agents` |
| CORE-007 | Markdown preview | Preview plan, task, and review markdown in the feature workspace | v1 | ✅ Complete | @peterlandis | - | Preview/Edit toggle on workspace artifacts |
| CORE-008 | Cursor API key settings | Save a Cursor API key in the UI so the server can start agents without a terminal export | v1 | ✅ Complete | @peterlandis | - | Header Cursor key → paste once. Stored in gitignored `.features-secrets.json`, never returned to the browser. |
| CORE-009 | Refresh Cursor models | Pull the latest Cursor models when the app starts and from Cursor setup | v1 | ✅ Complete | @peterlandis | - | `Cursor.models.list()` on launch, after saving a key, and via Refresh models. Cached in gitignored `.features-models.json`. |
| CORE-011 | Live agent chain of thought | Show the in-progress Cursor agent transcript (thinking, tool calls, and assistant text) in the feature workspace so a human can tell what the run is doing | v1 | ✅ Complete | @peterlandis | [CORE-011-PLAN.md](plans/CORE-011-PLAN.md) | Live Agent activity panel above workspace tabs. Polls during starting/running. |
| CORE-012 | Column card counts | Show how many features are in each Kanban column on the column header (WIP, each category, Completed). Counts should follow the current search filter. | v1 | ✅ Complete | @peterlandis | specifications/plans/CORE-012-PLAN.md | PR: https://github.com/peterlandis/spec-feature-kanban/pull/1 |
| CORE-013 | Spec workflow process graph | Add a Process view that draws spec-driven development as a visual pipeline graph and places every feature on the stage it is in (not started, planning, plan review, coding, reviewing, ready to merge, complete, plus blocked/paused). Live agent runs are visible on the graph so a human can see what is being worked on across features, ideally with several agents running at once. | v1 | ✅ Complete | @peterlandis | specifications/plans/CORE-013-WORKFLOW-PROCESS-GRAPH-INTENT.md | Board / Process toggle; shared graphStage(); concurrent runs per feature. Security: specifications/reviews/SECURITY_REVIEW_CORE-013.md · PR: https://github.com/peterlandis/spec-feature-kanban/pull/2 |
| CORE-014 | Feature branch and registry rules | Agents must never implement on main. Every change gets a FEATURES.md row and a feat/core-nnn (or feat/agent-nnn) branch from latest main. | v1 | ✅ Complete | @peterlandis | - | Cursor rule: `.cursor/rules/feature-branches.mdc` |
| CORE-015 | Card chips match next gate | Kanban card pipeline chips must match the workspace next-gate. After plan approval, the card should say ready to implement, not awaiting approval. | v1 | ✅ Complete | @peterlandis | - | Board cards currently map PlanReview → awaiting approval from FEATURES.md only. |
| CORE-016 | Show feature git branch | Show which git branch a feature is on (feat/core-016) on the card and in the workspace, and let a human check that branch out locally. | v1 | ✅ Complete | @peterlandis | - | Recorded in workflow sidecar; convention feat/<id> when none recorded. |
| CORE-017 | Feature relationship knowledge graph | Show tracked features as a knowledge graph: each feature is a node, and edges show how features relate (depends on, blocks, prerequisites, same category) so a human can see the web of work, not only columns or the Process pipeline | v1 | ✅ Complete | @peterlandis | specifications/plans/CORE-017-FEATURE-KNOWLEDGE-GRAPH-INTENT.md | Tasks: specifications/tasks/CORE-017-IMPLEMENTATION-TASKS.md. Third header view next to Board / Process. Click a node opens the workspace. Voice Jarvis is CORE-018. · PR: https://github.com/peterlandis/spec-feature-kanban/pull/3 |
| CORE-018 | Voice Jarvis on the knowledge graph | Hands-off Graph experience: a Jarvis-like virtual person you talk to with voice, that talks back about current state, relations, and what to work on next, using the CORE-017 knowledge graph as its world | Later | 📋 Planned | @peterlandis | specifications/plans/CORE-018-VOICE-JARVIS-GRAPH-INTENT.md | Tasks: specifications/tasks/CORE-018-IMPLEMENTATION-TASKS.md. Depends on CORE-017. Voice confirm still required before starting agents. Branch: feat/core-018. |
| CORE-019 | Graph zoom and pan | Zoom in on the CORE-017 knowledge graph (scroll wheel, +/−, reset) and pan so feature IDs and titles are readable. Does not start agents | v1 | ✅ Complete | @peterlandis | specifications/plans/CORE-019-GRAPH-ZOOM-PAN-INTENT.md | Shipped with CORE-017 Graph. 3D zoom is CORE-020. |
| CORE-020 | Rotating 3D knowledge graph | 3D perspective mode inside the Graph tab. Auto-rotates; grab a feature to stop and inspect. Same zoom as CORE-019. Choose 2D or 3D on the Graph page | v1 | 🧪 Testing | @peterlandis | specifications/plans/CORE-020-GRAPH-3D-PERSPECTIVE-INTENT.md | Tasks: specifications/tasks/CORE-020-IMPLEMENTATION-TASKS.md. Depends on CORE-017. 2D/3D switch on Graph. Selection card + related-edge highlight. Branch: feat/core-020. |


### Agent Workflow
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| AGENT-001 | Local Cursor spec workflow | From the local Kanban, confirm Start planning, fire a Cursor agent to write plan/tasks, revise until approved, then implement, review artifacts, and optionally open an MR | v1 | ✅ Complete | @peterlandis | [AGENT-001-LOCAL-CURSOR-WORKFLOW-PLAN.md](plans/AGENT-001-LOCAL-CURSOR-WORKFLOW-PLAN.md) | Tasks: [AGENT-001-IMPLEMENTATION-TASKS.md](tasks/AGENT-001-IMPLEMENTATION-TASKS.md). Local Cursor adapter and Ship/MR on main. |
| AGENT-002 | Hosted phone-reachable service | Host the control plane over HTTPS so any device can kick off remote/cloud agents against a connected git repo and get notified at human gates | Later | 📋 Planned | - | - | Depends on AGENT-001. Not v1. |
| AGENT-003 | Gemini coding agent backend | Wire Google Gemini as a Settings-selectable coding tool for the same plan / approve / implement gates as AGENT-001. One vendor only — not Copilot or Claude | v1 | 📋 Planned | @peterlandis | specifications/plans/AGENT-003-GEMINI-BACKEND-INTENT.md | Tasks: specifications/tasks/AGENT-003-IMPLEMENTATION-TASKS.md. Cursor already shipped (AGENT-001 / CORE-008). May add the shared selected-backend slot. Branch: feat/agent-003. |
| AGENT-004 | GitHub Copilot coding agent backend | Wire GitHub Copilot coding agent as its own Settings-selectable backend. Not the Ship/gh GitHub token. Not Gemini or Claude | v1 | 📋 Planned | @peterlandis | specifications/plans/AGENT-004-GITHUB-COPILOT-BACKEND-INTENT.md | Tasks: specifications/tasks/AGENT-004-IMPLEMENTATION-TASKS.md. Settings card is currently Coming later. Branch: feat/agent-004. |
| AGENT-005 | Claude coding agent backend | Wire Anthropic Claude as its own Settings-selectable backend for the spec workflow. Not Gemini or Copilot | v1 | 📋 Planned | @peterlandis | specifications/plans/AGENT-005-CLAUDE-BACKEND-INTENT.md | Tasks: specifications/tasks/AGENT-005-IMPLEMENTATION-TASKS.md. Settings card is currently Coming later. Branch: feat/agent-005. |



## How to Use This File

### Adding a New Feature

1. Create a new row in the appropriate category table
2. Assign a unique Feature ID (e.g., `CORE-007`, `AGENT-003`)
3. Fill in Title, Description, Phase, Status, Assignee, and Notes
4. Set status to `📋 Planned` initially
5. Create a branch from latest `main`: `feat/core-014` from `CORE-014` (never implement on `main`)
6. Create linked plan and task artifacts under `specifications/plans/` and `specifications/tasks/`

### Updating Feature Status

1. Find the feature in the table
2. Update the Status column
3. Update Assignee if ownership changes
4. Add notes about progress or blockers

**Note:** The `🟢 ReadyToMerge` status should be assigned by the reviewer after PR approval.

### Example Workflow

```
1. Feature starts: Status = 📋 Planned, Assignee = -
2. Developer picks it up: Status = 🔨 WorkInProgress, Assignee = @username
3. Code complete: Status = 🧪 Testing, Assignee = @username
4. Reviewer approves PR: Status = 🟢 ReadyToMerge, Assignee = @username
5. Merged: Status = ✅ Complete, Assignee = @username
```

**Last Updated:** 2026-09-12
**Maintainer:** @peterlandis