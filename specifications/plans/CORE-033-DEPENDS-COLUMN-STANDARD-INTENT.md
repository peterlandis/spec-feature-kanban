# CORE-033 — Depends column as FEATURES.md standard

## Goal

Make feature dependencies a first-class **Depends** column in FEATURES.md instead of free text in Notes. Graph edges, apply-dependency, and focus ranking should read that column. On open/load, migrate Notes → Depends deterministically; if the file is too malformed to parse, repair with AI when a chat key is configured.

## Standard columns

`Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Depends | Notes`

Depends cell: comma-separated IDs (`CORE-017, CORE-030`) or `-`.

## Approach

- Header-aware parser (aliases for Depends / Dependencies).
- Always serialize with Depends.
- Deterministic migrate: extract `Depends on …` from Notes into Depends; strip those phrases from Notes.
- Auto-apply migrate on registry load when the file is missing Depends or still has note-only deps.
- AI repair (OpenAI or Grok) only when validation/parse fails badly; validate output before writing.
- Update inflate template, create/edit form, and dependency API.

## Out of scope

- Silent AI rewrites when deterministic migrate succeeds
- Multiple synonym columns (Blocked-by stays status/plan-derived)
