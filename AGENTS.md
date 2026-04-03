# AGENTS.md — skriver

Use `skriver` when the user shares a meeting audio/video file and wants a transcript, a meeting summary, or an artifact bundle another agent can reason over.

The important product idea is:

- `skriver` creates the first-pass transcript
- `skriver` also creates an evidence bundle
- the reviewing agent has an important job in turning that into the final clarified transcript

When the task is end-to-end transcription plus review, use:

- `skills/skriver/SKILL.md`

When the task is specifically to review a completed Skriver run or improve a final transcript from Skriver artifacts, use:

- `skills/skriver-evidence-review/SKILL.md`

## Default workflow

1. Run `skriver doctor` if the environment is uncertain.
2. Put user notes into `--notes-file`, preferably as a `.md` file. Only `.md` and `.txt` notes files are supported.
3. Add extra context with repeatable `--context` arguments when the user also shared slides, emails, PDFs, images, or notes.
4. If the spoken language is obvious, set `--language sv` or `--language en` instead of `auto`.
5. Use `--diarization on` only when the local pyannote environment is ready. If the participant count is known, also pass `--num-speakers N`.
6. Keep screenshots enabled for videos unless the user explicitly says not to.
7. Lower `--screenshot-interval` from `20` to `10` for UI-heavy demos or fast screen changes.
8. After the run, open `README.md` in the run folder first.
9. Then read `run.json`, the main transcript, and the supporting evidence artifacts in that order.
10. Prefer `skriver review <run-dir>` for the second-pass checklist when handing the run to another agent.

## Command

```bash
skriver "/absolute/path/to/file.mp4" \
  --language sv \
  --diarization on \
  --num-speakers 2 \
  --notes-file "/absolute/path/to/notes.md" \
  --context "/absolute/path/to/slides.pdf" \
  --context "/absolute/path/to/followup-email.eml"
```

## Important behavior

- Each run creates a sibling `<filename>-skriver/` folder beside the source media.
- `run.json` is the main machine-readable index for the run.
- `skriver help agents` prints the install path, usage path, and cross-agent workflow docs.
- The transcript should preserve the spoken language. Do not translate unless the user explicitly asks for translation.
- The primary deliverable is `<filename>-transcript.md`.
- `summary_draft.json` is a helper artifact for agents, not a substitute for reasoning.
- Notes from `--notes-file` should be treated as higher-trust human clarification than OCR.
- Screenshots and OCR are evidence. Do not merge them into the final transcript automatically. Review them and only add what clearly clarifies what was said.
- Technical/company terms are often mistranscribed. Use `pnpm glossary check` when you want to test candidate corrections before rerunning.
- Only trust speaker labels when diarization completed. Do not add speaker names or `Speaker 1` / `Speaker 2` manually without real diarization or independent verification.
- The reviewing agent is responsible for using the evidence folder to augment and clarify the transcript into a better final file.

## Post-run review order

Follow:

- `docs/workflows/review-a-run.md`

## When to rerun

Rerun with different options if:

- the transcript language was detected incorrectly
- too many technical terms are wrong
- screen changes happen faster than the default screenshot cadence
- speaker labels are missing but diarization should have worked

Useful adjustments:

- `--language sv`
- `--language en`
- `--diarization on`
- `--num-speakers 2`
- `--screenshot-interval 10`
- `--whisper-model medium`
- `--context /absolute/path/to/context-dir`
- `--notes-file /absolute/path/to/notes.md`
- `--glossary /absolute/path/to/custom-glossary.txt`
- `skriver inspect "/absolute/path/to/run-dir" --json`
