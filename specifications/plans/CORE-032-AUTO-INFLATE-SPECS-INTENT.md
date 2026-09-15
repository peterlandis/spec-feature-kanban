# CORE-032 — Auto-inflate specifications layout

## Goal

When a human points the Kanban at a project FEATURES.md (or creates one), ensure the repo-native `specifications/` layout exists: folders for plans/tasks/reviews/completions/templates plus standard templates and README. Idempotent — never overwrite existing project files.

## Approach

- Bundle scaffold assets in the Kanban app (`workflow/spec-scaffold-assets/`).
- On activate/create/browse of FEATURES.md, call `ensureSpecScaffold(featuresPath)`.
- Prefer `specifications/FEATURES.md` when creating a bare `FEATURES.md`.
- Surface what was created via API/`/api/config` so the UI can toast once.
- **Open Project…** (macOS folder picker): select an empty (or any) project directory; inflate `specifications/` + `FEATURES.md` there and switch the active tracking file — no `FEATURES_PATH` env required.

## Out of scope

- Overwriting customized templates or README
- Migrating legacy `completion_summaries/` folders
- Requiring the Cursor inflate skill at runtime
