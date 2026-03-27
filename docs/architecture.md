# Architecture

`skriver` is a deterministic CLI that separates extraction from reasoning.

## Design principles

- deterministic artifacts first
- readable transcript first
- explicit workflow guidance for agents
- optional advanced features instead of hidden magic

## Module map

- `src/cli.mjs`
  Dispatches commands and keeps the public CLI entrypoint small.
- `src/lib/args.mjs`
  Parses and validates command-specific arguments.
- `src/lib/transcribe.mjs`
  Orchestrates the end-to-end transcription flow.
- `src/lib/workspace.mjs`
  Creates the run directory and writes compatibility metadata.
- `src/lib/media.mjs`
  Runs `ffprobe`, `ffmpeg`, `whisper`, optional pyannote diarization, and OCR screenshot capture.
- `src/lib/context.mjs`
  Collects notes and extracts context from extra files.
- `src/lib/render.mjs`
  Produces `transcript.md`, summary drafts, low-confidence artifacts, and glossary-corrected transcript segments.
- `src/lib/manifest.mjs`
  Builds `manifest.json` and `workflow.md` so agents can discover artifacts without hardcoded assumptions.
- `src/lib/doctor.mjs`
  Checks the local environment.
- `src/lib/inspect.mjs`
  Reads a run directory and returns the next recommended review steps.

## Run lifecycle

1. Validate CLI options.
2. Create a fresh run directory.
3. Save notes and input source references.
4. Probe media.
5. Extract extra context files.
6. Extract audio and transcribe it.
7. Run diarization if enabled and available.
8. Capture screenshots and OCR for video.
9. Render transcript artifacts.
10. Write `manifest.json` and `workflow.md`.

## Artifact contract

The primary deliverable is `transcript.md`.

The primary machine-readable index is `manifest.json`.

Important supporting artifacts:

- `summary_draft.json`
- `low_confidence_segments.json`
- `speaker_diarization.json`
- `context_artifacts.json`
- `screen_ocr.tsv`

## Compatibility notes

- `metadata.json` is still written for continuity with earlier runs.
- `manifest.json` is the preferred index for new integrations.
- speaker labels remain anonymous unless a separate process verifies identity.
