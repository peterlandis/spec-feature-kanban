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
| CORE-006 | Specifications folder | Repo-native `specifications/` layout matching other projects | MVP | 🔨 WorkInProgress | @peterlandis | - | Inflated on `feat/agents` |

### Agent Workflow

| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| AGENT-001 | Local Cursor spec workflow | From the local Kanban, confirm Start planning, fire a Cursor agent to write plan/tasks, revise until approved, then implement, review artifacts, and optionally open an MR | v1 | 📋 Planned | @peterlandis | [AGENT-001-LOCAL-CURSOR-WORKFLOW-PLAN.md](plans/AGENT-001-LOCAL-CURSOR-WORKFLOW-PLAN.md) | Tasks: [AGENT-001-IMPLEMENTATION-TASKS.md](tasks/AGENT-001-IMPLEMENTATION-TASKS.md). App stays local; agents via Cursor SDK. |
| AGENT-002 | Hosted phone-reachable service | Host the control plane over HTTPS so any device can kick off remote/cloud agents against a connected git repo and get notified at human gates | Later | 📋 Planned | - | - | Depends on AGENT-001. Not v1. |

---

## How to Use This File

### Adding a New Feature

1. Create a new row in the appropriate category table
2. Assign a unique Feature ID (e.g., `CORE-007`, `AGENT-003`)
3. Fill in Title, Description, Phase, Status, Assignee, and Notes
4. Set status to `📋 Planned` initially
5. Create linked plan and task artifacts under `specifications/plans/` and `specifications/tasks/`

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
