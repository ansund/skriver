---
description: Review a completed Skriver run directory, use the evidence carefully, and improve the final transcript and summary.
---

# Skriver Evidence Review

Use this Claude Code skill as the repo-local adapter for the focused Skriver review workflow.

Read these files in order:

1. `@../../../AGENTS.md`
2. `@../../../CLAUDE.md`
3. `@../../../skills/skriver-evidence-review/SKILL.md`

Core rules:

- Start with `run.json`.
- Treat notes as higher-trust than OCR.
- Do not merge OCR into the transcript automatically.
- Use screenshots, OCR, context, and diarization as evidence to improve the final transcript carefully.
