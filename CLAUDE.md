# CLAUDE.md — skriver

Use this repo as both:

- a tool that creates first-pass meeting transcripts and evidence bundles
- a workflow for turning those bundles into the best final transcript and summary

## Start here

1. Read `AGENTS.md`
2. Read `docs/workflows/review-a-run.md`
3. Use `.claude/skills/skriver/SKILL.md` as the Claude-local skill entrypoint

## Important idea

Skriver is both:

- the tool that creates the bundle
- the skill/workflow that teaches the agent how to use the bundle well

For the Codex-style skill version of that workflow, see:

- `skills/skriver/SKILL.md`
- `skills/skriver-evidence-review/SKILL.md`

For the Claude-local adapters, see:

- `.claude/skills/skriver/SKILL.md`
- `.claude/skills/skriver-evidence-review/SKILL.md`

Even if your agent runtime does not support `SKILL.md` natively, use the repo skill files as the reference workflow for reviewing a completed Skriver run.

## What to do

- If the user gives raw media, run `skriver` on the file.
- If the user gives a completed Skriver run, review `run.json`, the main transcript, and the evidence folder in that order.
- Treat notes as higher-trust clarification than OCR.
- Treat screenshots, OCR, context, and diarization as evidence.
- Do not merge OCR into the final transcript automatically.
