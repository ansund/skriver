# Architecture

`skriver` is a deterministic CLI that separates extraction from reasoning and now centers the product around one file-first command.

## Design principles

- deterministic artifacts first
- readable transcript first
- progressive deliverables instead of one opaque batch job
- fail-soft stages with a persistent run state
- optional advanced features instead of hidden magic

## Module map

- `src/cli.mjs`
  Dispatches commands and keeps the public CLI entrypoint small.
- `src/lib/args.mjs`
  Parses commands and supports file-first invocation.
- `src/lib/transcribe.mjs`
  Orchestrates the staged transcription flow.
- `src/lib/workspace.mjs`
  Creates the sibling output folder and writes `run.json`.
- `src/lib/media.mjs`
  Runs `ffprobe`, `ffmpeg`, `whisper`, optional pyannote diarization, and OCR screenshot capture.
- `src/lib/context.mjs`
  Collects notes and extracts context from extra files.
- `src/lib/render.mjs`
  Produces the main transcript plus supporting evidence files.
- `src/lib/setup.mjs`
  Verifies and records diarization readiness.
- `src/lib/state.mjs`
  Persists user-level Skriver setup state.
- `src/lib/progress.mjs`
  Prints live stage progress in the terminal.
- `src/lib/doctor.mjs`
  Checks the local environment.
- `src/lib/inspect.mjs`
  Reads `run.json` and summarizes a completed run.

## Run lifecycle

1. Validate CLI options.
2. Create a sibling `<filename>-skriver` output directory.
3. Save notes and input source references.
4. Probe media.
5. Extract extra context files.
6. Extract audio and transcribe it.
7. Write the main transcript immediately.
8. Capture screenshots and OCR for video.
9. Rerender the transcript with screen evidence when available.
10. Run diarization if enabled and available.
11. Rerender the transcript with anonymous speaker turns when available.
12. Update `run.json` after each stage.

## Artifact contract

The primary deliverable is `<filename>-transcript.md`.

The primary machine-readable index is `run.json`.

Important supporting artifacts:

- `evidence/whisper/summary_draft.json`
- `evidence/whisper/low_confidence_segments.json`
- `evidence/diarization/speaker_diarization.json`
- `evidence/context/context_artifacts.json`
- `evidence/video-ocr/screen_ocr.tsv`

## Compatibility notes

- `run.json` is updated progressively so partial success is explicit.
- speaker labels remain anonymous unless a separate process verifies identity.
