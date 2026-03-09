# Feature Tracking (Examples)

This document is an example feature backlog formatted for the Features Kanban app. It contains fake categories, fake features, and fake assignees.

## Status Legend

- 🔨 **WorkInProgress** - Currently being developed
- 🧪 **Testing** - Feature is complete and being tested
- 🟢 **ReadyToMerge** - PR approved by reviewer, ready to merge
- ✅ **Complete** - Feature is complete and merged
- 📋 **Planned** - Planned but not started
- 🚫 **Blocked** - Blocked by dependencies or issues
- ⏸️ **Paused** - Temporarily paused

## Feature Categories

### 🔧 Core Features
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| CORE-001 | Board loads from markdown | Parse a feature-tracking markdown file and render a Kanban board | MVP | ✅ Complete | @alex-rivera | - | Verified with sample data |
| CORE-002 | Persist updates to file | Save drag-and-drop changes back into the markdown file | MVP | ✅ Complete | @jamie-chen | - | Writes on every change |
| CORE-003 | Switch tracking file | Allow selecting a different feature-tracking file as the source of truth | MVP | 🧪 Testing | @taylor-wells | - | Ensure selection persists |
| CORE-004 | First-run template creation | Create a template tracking file when no file exists on first run | MVP | ✅ Complete | @morgan-kim | - | Includes legend + tables |
| CORE-005 | Guardrails for bad format | Validate selected file looks like a feature tracker and show an error if not | MVP | 🔨 WorkInProgress | @casey-jordan | - | Require Feature Categories + tables |
| CORE-006 | Large file performance | Improve parsing/rendering for ~500+ features | Later | 📋 Planned | - | - | Consider incremental render |

### 🎨 User Experience
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| UX-001 | Inline success toasts | Show brief confirmation after saves and moves | MVP | ✅ Complete | @riley-park | - | Toasts disappear automatically |
| UX-002 | Better empty-column state | Make empty columns feel intentional with a short hint | MVP | 📋 Planned | - | - | “Drop a card here” hint |
| UX-003 | Keyboard-friendly modal | Ensure create/edit modal is usable without a mouse | MVP | 🔨 WorkInProgress | @devon-singh | - | Focus trap + ESC close |
| UX-004 | Compact card layout | Offer a denser card layout for long titles | Later | ⏸️ Paused | @sam-lee | - | Waiting on design choice |
| UX-005 | Assignee suggestions | Suggest assignees already present in the tracking file | MVP | ✅ Complete | @quinn-blake | - | Adds “Other…” option |
| UX-006 | Better error copy | Friendly error text when loading/saving fails | MVP | 🧪 Testing | @noah-iverson | - | Include next-step guidance |

### 🔌 Integrations
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| INT-001 | Export JSON snapshot | Download the current board state as JSON | MVP | 📋 Planned | - | - | Useful for agents/tools |
| INT-002 | Import JSON snapshot | Upload a JSON snapshot and update the markdown file | MVP | 🚫 Blocked | @skyler-ng | - | Needs schema decision |
| INT-003 | Webhook on save | POST a webhook whenever the file is updated | Later | 📋 Planned | - | - | Optional feature |
| INT-004 | Read-only mode | Serve UI in read-only mode for safe browsing | Later | 📋 Planned | - | - | Controlled via env var |
| INT-005 | Multiple workspaces | Remember recently-used tracking files | Later | 🔨 WorkInProgress | @ava-martinez | - | Persist a short MRU list |
| INT-006 | CLI helper | Command to print summaries (counts by status/category) | Later | 🟢 ReadyToMerge | @drew-hart | - | Review pending |

### 🧪 Quality & Testing
| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |
|------------|-------|-------------|-------|--------|----------|---------------|-------|
| QA-001 | Parser unit tests | Add tests for parsing tables, categories, and statuses | MVP | 📋 Planned | - | - | Cover edge cases |
| QA-002 | Serialization round-trip | Ensure parse -> serialize preserves content | MVP | 🔨 WorkInProgress | @harper-diaz | - | Verify preamble/postamble |
| QA-003 | Lint + format | Add consistent formatting checks | Later | 📋 Planned | - | - | Keep it minimal |
| QA-004 | Regression test: drag/drop | Automate a smoke test for moving cards | Later | 📋 Planned | - | - | Possibly Playwright |

## How to Use This File

### Adding a New Feature

1. Create a new row in the appropriate category table
2. Assign a unique Feature ID (e.g., `UX-007`)
3. Fill in Title, Description, Phase, Status, Assignee, and Notes
4. Set status to `📋 Planned` initially

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

**Last Updated:** 2026-03-08
**Maintainer:** Example Team