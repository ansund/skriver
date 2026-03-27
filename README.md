# skriver

Local-first transcription CLI that turns meetings into agent-ready evidence.

`skriver` is built for agents first and still useful for humans on its own. It transcribes audio and video, extracts screen and file context, applies glossary corrections, flags uncertain segments, and writes a stable run directory that another agent can inspect without guessing.

## What it does

- transcribes audio and video locally
- extracts screenshots and OCR for video context
- runs optional local speaker diarization
- merges extra context files like notes, PDFs, slides, images, and emails
- normalizes likely technical mistranscriptions with a glossary
- writes readable markdown plus machine-readable artifacts

## What it is not

- not a hosted meeting assistant
- not a built-in chat product
- not a fake “AI summary” layer hiding the evidence

The tool does deterministic extraction. Your agent does the reasoning.

## Quick start

From the repo:

```bash
pnpm cli:help
node src/cli.mjs doctor
```

Transcribe audio:

```bash
node src/cli.mjs transcribe \
  --input "/absolute/path/to/meeting.m4a" \
  --language sv \
  --screenshots off \
  --title "Initial meeting"
```

Transcribe video with context and diarization:

```bash
node src/cli.mjs transcribe \
  --input "/absolute/path/to/meeting.mp4" \
  --language sv \
  --diarization on \
  --num-speakers 2 \
  --title "Product review" \
  --context "/absolute/path/to/slides.pdf" \
  --context "/absolute/path/to/followup-email.eml"
```

Inspect a completed run:

```bash
node src/cli.mjs inspect "/absolute/path/to/transcripts/2026-03-25T15-44-06_product-review" --json
```

## Install

Current supported path is running from source.

Base requirements:

- `node >= 18.12`
- `pnpm`
- `ffmpeg`
- `ffprobe`
- `whisper`
- `tesseract`

Optional for diarization:

- `python3.12` or `python3.11`
- accepted Hugging Face access for `pyannote/speaker-diarization-community-1`
- `HF_TOKEN` or `HUGGINGFACE_TOKEN` for first-time model download if the model is not already cached

Detailed setup lives in [docs/install.md](./docs/install.md).

## Commands

- `skriver transcribe`: create a new timestamped run directory with transcript artifacts
- `skriver doctor`: verify local dependencies and optional diarization setup
- `skriver inspect`: review a completed run and print the next recommended workflow steps
- `skriver glossary`: list glossary entries or check text against glossary corrections

## Run contract

Each run creates a stable folder under `transcripts/` with the important files indexed by `manifest.json`.

Common artifacts:

- `manifest.json`
- `workflow.md`
- `transcript.md`
- `transcript.json`
- `transcript.srt`
- `transcript.tsv`
- `summary_draft.json`
- `low_confidence_segments.json`
- `speaker_diarization.json` when diarization completes
- `context_artifacts.json`
- `screen_ocr.tsv` for video runs

The transcript should already be useful before any agent augmentation. The manifest and workflow guide make the post-processing path explicit.

## Agent workflow

Recommended agent sequence:

1. Run `skriver transcribe ...`
2. Read `manifest.json`
3. Read `transcript.md`
4. Review `summary_draft.json`
5. Review `low_confidence_segments.json`
6. Review `context_artifacts.json`
7. Review `speaker_diarization.json` if present
8. Review `screen_ocr.tsv` and `screens/` for video runs
9. Produce the final summary, actions, open questions, and follow-up work

More detail:

- [AGENTS.md](./AGENTS.md)
- [docs/workflows/agent-augmented-transcript.md](./docs/workflows/agent-augmented-transcript.md)
- [docs/workflows/human-review.md](./docs/workflows/human-review.md)

## Architecture

The CLI is split into focused modules:

- `args`: command parsing and validation
- `transcribe`: orchestration
- `workspace`: run directory and metadata management
- `media`: probing, extraction, transcription, diarization, OCR
- `context`: notes and extra file ingestion
- `render`: transcript assembly and summary drafting
- `manifest`: artifact indexing
- `doctor` and `inspect`: operational workflows

Architecture notes live in [docs/architecture.md](./docs/architecture.md).

## Development

Run the full suite:

```bash
pnpm test
```

The automated coverage currently includes:

- unit tests for diarization mapping, summary drafting, and markdown rendering
- dry-run e2e behavior
- mocked full e2e behavior across OCR, glossary correction, manifest generation, inspect, doctor, and diarization

## Open source

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)
- [SUPPORT.md](./SUPPORT.md)
- [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
