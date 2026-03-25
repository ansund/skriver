# AGENTS.md — impact-meeting-transcriber

Use this tool when the user uploads or references a meeting audio/video file and wants a transcript.

## Default workflow

1. Put any pasted user notes into `--note` arguments or a `--notes-file`.
2. Add extra context with repeatable `--context` arguments when the user also shared slides, emails, PDFs, images, or notes.
3. If the spoken language is obvious, set `--language sv` or `--language en` instead of `auto`.
4. Keep screenshots enabled for videos unless the user explicitly says not to.
5. Lower `--screenshot-interval` from `20` to `10` for UI-heavy demos or fast screen changes.
6. After the run, open `transcript.md` and review:
   - `Applied technical term corrections`
   - `Low-confidence segments`
   - `Context Files`
   - nearby screenshot OCR when something still looks wrong

## Command

```bash
pnpm --dir "/Users/viktoransund/code/impact/Tools/impact-meeting-transcriber" transcribe \
  --input "/absolute/path/to/file.mp4" \
  --language sv \
  --title "Short descriptive title" \
  --context "/absolute/path/to/slides.pdf" \
  --context "/absolute/path/to/followup-email.eml"
```

## Important behavior

- The tool creates a fresh folder for every run under `transcripts/`. Do not overwrite older runs.
- The transcript should preserve the spoken language. Do not translate unless the user explicitly asks for translation.
- The primary deliverable is always `transcript.md`.
- Screen-share context is added in bracketed notes. If OCR clearly shows relevant UI text, keep that text in the transcript.
- Extra context files are merged into the same transcript run and summarized inside `transcript.md`.
- Technical/company terms are often mistranscribed. The tool applies a default glossary and flags likely corrections, but you should still sanity-check important segments and extend the glossary for Impact-specific vocabulary.
- If the user pasted especially important notes, keep them visible in the final transcript rather than hiding them in metadata.

## When to rerun

Rerun with different options if:

- the transcript language was detected incorrectly
- too many technical terms are wrong
- screen changes happen faster than the default screenshot cadence

Useful adjustments:

- `--language sv`
- `--language en`
- `--screenshot-interval 10`
- `--whisper-model medium`
- `--context /absolute/path/to/context-dir`
- `--glossary /absolute/path/to/custom-glossary.txt`
