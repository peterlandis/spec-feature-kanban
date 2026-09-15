# CORE-025: Per-feature Cursor model

**Status:** Planned  
**Feature ID:** CORE-025  
**Tasks:** `specifications/tasks/CORE-025-IMPLEMENTATION-TASKS.md`

## Goal

When starting **planning**, **revision**, or **implementation** for a feature, the human can pick which Cursor model to use for that run. Different features can use different models. The Settings default remains the fallback.

## Approach

- Workspace model `<select>` populated from the cached Cursor model list.
- Persist `preferredModel` on the feature workflow sidecar.
- Pass `model` on start-planning / revise / implement; runner and Cursor worker use the override when set.

## Out of scope

- Non-Cursor backends (AGENT-003/004/005).
- Changing Graph 3D behavior (CORE-024).
