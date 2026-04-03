---
name: "skriver"
description: "Use when a task involves meeting audio or video, a first-pass transcript, or a completed Skriver run and the goal is to create or improve a transcript, meeting notes, actions, or a summary. Run the Skriver CLI, attach notes and glossary context correctly, and then review the evidence bundle carefully to produce the best final output."
---

# Skriver

Skriver is both:

- a tool that creates a first-pass transcript and evidence bundle
- a skill that teaches the agent how to turn that bundle into the best final transcript and summary

## Use this skill when

- the user shares a meeting recording
- the user wants meeting notes or a transcript from audio or video
- the user shares a completed Skriver run directory
- the user wants a better final transcript, summary, actions, or decisions from Skriver artifacts

## Step 1: Prepare the run

1. Run `skriver doctor` if the environment is uncertain.
2. Run `skriver setup` if diarization may be needed.
3. Put human notes into `--notes-file`, preferably a `.md` file.
4. Add extra supporting material with repeatable `--context` arguments.
5. If the spoken language is obvious, prefer `--language sv` or `--language en` over `auto`.

## Step 2: Run the tool

Typical run:

```bash
skriver "/absolute/path/to/file.mp4" \
  --language sv \
  --notes-file "/absolute/path/to/notes.md" \
  --context "/absolute/path/to/slides.pdf"
```

Important options:

- `--notes-file` accepts only `.md` or `.txt`, with `.md` recommended
- `--glossary` helps with abbreviations, product names, company terms, and English terms inside another language
- `--diarization on` should only be forced when setup is ready
- `--num-speakers N` helps when participant count is known
- `--screenshot-interval 10` is better for fast-changing screen demos

## Step 3: Understand the output

Each run creates a sibling `<filename>-skriver/` folder beside the source media.

Important files:

- `run.json`
- `<filename>-transcript.md`
- `evidence/`

The main transcript is conservative on purpose.
The best final transcript usually comes from the second pass through the evidence folder.

## Step 4: Review the evidence

If the task is mainly about improving a completed run, follow:

- `skills/skriver-evidence-review/SKILL.md`
- `docs/workflows/review-a-run.md`

Review order:

1. Read `run.json`
2. Read the main transcript
3. Read `evidence/whisper/low_confidence_segments.json`
4. Read `evidence/context/notes.json` and the original notes file if available
5. Read `evidence/context/context_artifacts.json` if present
6. Read `evidence/diarization/speaker_diarization.json` if diarization completed
7. For video, inspect `evidence/video-ocr/screen_ocr.tsv`, `evidence/video-ocr/screen_notes.json`, and `evidence/video-screenshots/`

## Working rules

- Treat notes as higher-trust human clarification than OCR.
- Do not merge OCR into the transcript automatically.
- Use screenshots, OCR, diarization, and context as evidence to improve the final transcript carefully.
- Only trust anonymous speaker labels when diarization completed successfully.
- Keep the spoken language of the source unless the user explicitly asks for translation.

## Good outputs

Depending on the task, produce one or more of:

- a first-pass transcript
- an improved final transcript
- better meeting notes
- a concise evidence-grounded summary
- actions, owners, and open questions
- suggested glossary additions for recurring terms
