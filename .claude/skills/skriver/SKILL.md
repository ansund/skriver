---
description: Use Skriver to transcribe meeting audio or video, create an evidence bundle, and produce the best final transcript and summary from that bundle.
---

# Skriver

Use this Claude Code skill as the repo-local adapter for the canonical Skriver workflow.

Read these files in order:

1. `@../../../AGENTS.md`
2. `@../../../CLAUDE.md`
3. `@../../../skills/skriver/SKILL.md`

If the task is mainly about reviewing a completed run, also read:

- `@../../../skills/skriver-evidence-review/SKILL.md`

Core rules:

- Run the Skriver CLI on raw meeting media.
- Treat notes as higher-trust than OCR.
- Do not merge OCR into the transcript automatically.
- Use screenshots, OCR, context, and diarization as evidence to improve the final transcript carefully.
