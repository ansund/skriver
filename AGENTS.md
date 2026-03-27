# AGENTS.md — skriver

Use `skriver` when the user shares a meeting audio/video file and wants a transcript or an artifact bundle another agent can reason over.

## Default workflow

1. Run `skriver doctor` if the environment is uncertain.
2. Put pasted user notes into `--notes-file` when possible.
3. Add extra context with repeatable `--context` arguments when the user also shared slides, emails, PDFs, images, or notes.
4. If the spoken language is obvious, set `--language sv` or `--language en` instead of `auto`.
5. Use `--diarization on` only when the local pyannote environment is ready. If the participant count is known, also pass `--num-speakers N`.
6. Keep screenshots enabled for videos unless the user explicitly says not to.
7. Lower `--screenshot-interval` from `20` to `10` for UI-heavy demos or fast screen changes.
8. After the run, read `manifest.json` first, then `transcript.md`, then the supporting artifacts called out in `workflow.md`.

## Command

```bash
pnpm transcribe \
  --input "/absolute/path/to/file.mp4" \
  --language sv \
  --diarization on \
  --num-speakers 2 \
  --title "Short descriptive title" \
  --context "/absolute/path/to/slides.pdf" \
  --context "/absolute/path/to/followup-email.eml"
```

## Important behavior

- Each run creates a fresh folder under `transcripts/`. Do not overwrite older runs.
- `manifest.json` is the main machine-readable index for the run.
- `workflow.md` is the short human/agent checklist for what to review next.
- The transcript should preserve the spoken language. Do not translate unless the user explicitly asks for translation.
- The primary deliverable is still `transcript.md`.
- `summary_draft.json` is a helper artifact for agents, not a substitute for reasoning.
- Screen-share context is added in bracketed notes. If OCR clearly shows relevant UI text, keep that text in the transcript.
- Technical/company terms are often mistranscribed. Use `pnpm glossary check` when you want to test candidate corrections before rerunning.
- Only trust speaker labels when diarization completed. Do not add speaker names or `Speaker 1` / `Speaker 2` manually without real diarization or independent verification.

## Post-run review order

1. `manifest.json`
2. `transcript.md`
3. `summary_draft.json`
4. `low_confidence_segments.json`
5. `context_artifacts.json`
6. `speaker_diarization.json` if present
7. `screen_ocr.tsv` and `screens/` for video runs
8. `workflow.md`

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
- `--glossary /absolute/path/to/custom-glossary.txt`
- `skriver inspect "/absolute/path/to/run-dir" --json`
