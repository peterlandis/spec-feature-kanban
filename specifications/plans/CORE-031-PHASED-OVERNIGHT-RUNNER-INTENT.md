# CORE-031 — Phased overnight feature runner

## Goal

Let a human build a **phase** (ordered feature group) on **Process**, click **Run phase**, and leave the machine working overnight: each feature gets plan/tasks (and optionally implementation + review artifacts) via the existing Cursor workflow, with commits on the feature branch. In the morning, review the finished phase. **Board stays simple for drag-and-drop.**

## Approach

- Build a phase from Suggested focus (or an explicit feature id list); persist in `.features-phases.json`.
- Modes: `plan` (stop at PlanReview) or `plan-implement` (batch-confirmed auto-approve, then implement → Testing).
- Run sequentially (branch checkout requires one-at-a-time); surface live progress on Process.
- After each feature step, commit changed plan/tasks/review + FEATURES.md when the target is a git repo.

## Out of scope

- Parallel agents on one repo
- Auto-merge / auto Ship PR
- Phone push notifications (AGENT-002)
- Revising plans mid-phase without human input
