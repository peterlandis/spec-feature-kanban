# Specifications

This directory is the repo-native workflow for Cursor Cloud Agents. Agents must start
with the feature registry, then load only the artifacts required for the selected
feature.

## Agent start here

1. Read `FEATURES.md`.
2. Select a feature that is unblocked by the dependency rules.
3. Read the linked plan in `plans/`.
4. Read the linked tasks in `tasks/`.
5. Load supporting docs only when the plan says they are needed.

## Directory map

| Path | Purpose | Load by default? |
|------|---------|------------------|
| `FEATURES.md` | Canonical feature registry, status legend, dependencies, pick rules | Yes |
| `plans/` | Feature-specific implementation plans | Only selected feature |
| `tasks/` | Feature-specific task checklists and approval gates | Only selected feature |
| `templates/` | Reusable plan, task, security review, and completion summary templates | When creating artifacts |
| `reviews/` | Code and security review artifacts | Only selected feature |
| `completions/` | Completion summaries for shipped work and PR handoff | Only selected feature |

## Context loading rules

- Do not load every historical plan, task, review, or completion.
- Load architecture and security docs only when the selected feature touches those areas.
- Load framework documentation only when a feature uses a new or changed API.

## Artifact requirements

Every implementation feature needs:

1. a registry row in `FEATURES.md`,
2. a plan under `plans/`,
3. a task list under `tasks/`,
4. verification evidence in the task list and completion summary,
5. a security review under `reviews/` or a documented reason it is not required,
6. a completion summary under `completions/`,
7. a PR body derived from the completion summary.

## Approval gate

Planning runs stop after feature, plan, and task artifacts are ready. Product
implementation starts only after a human records approval in the task file, PR, issue, or
approved workflow signal.
