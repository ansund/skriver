# skriver

Local-first transcription CLI for audio and video.

`skriver` is built around one simple path:

```bash
skriver meeting.mp4
skriver meeting.m4a
```

It writes a sibling folder beside the source file, produces a first-pass transcript quickly, and then adds evidence that helps a human or agent turn that into the final clarified transcript.

Notes are file-based:

- use `--notes-file notes.md` for the recommended path
- `.md` and `.txt` are accepted
- notes are treated as higher-trust human clarification than OCR or screenshots

## What it does

- transcribes audio and video locally
- creates screenshots and OCR for video
- stores supporting evidence in a clear `evidence/` tree
- treats the main transcript as spoken-content-first, not as a final polished interpretation
- keeps diarization off by default until `skriver setup` verifies it
- writes a `run.json` state file so partial success and failures are explicit

## Quick start

From the repo:

```bash
node src/cli.mjs doctor
node src/cli.mjs setup
node src/cli.mjs /absolute/path/to/meeting.mp4
```

After global install:

```bash
skriver setup
skriver /absolute/path/to/meeting.mp4 --notes-file ./notes.md
```

You can add a custom glossary either per run with `--glossary /path/to/file.txt` or persist it in `~/.skriver/config.json`.

## Product Model

Skriver is intentionally split into two layers:

1. `skriver` creates the first-pass transcript and evidence bundle.
2. A human or agent reviews the evidence and improves the transcript where needed.

That means the main transcript should stay conservative:

- spoken words belong in the transcript
- notes can clarify and guide interpretation
- screenshots, OCR, and diarization are evidence, not automatic truth
- the final high-quality transcript usually comes from reviewing `run.json` and the `evidence/` folder

## Install

Skriver can be installed globally and run directly:

```bash
npm install -g github:ansund/skriver
skriver --help
```

Base dependencies:

- `node >= 18.12`
- `ffmpeg`
- `ffprobe`
- `whisper`
- `tesseract`

Optional but recommended:

- `pdftotext`
- `unzip`
- `textutil` on macOS

Detailed setup lives in [docs/install.md](./docs/install.md).

## Setup

Run:

```bash
skriver setup
```

That command is the diarization gate:

- before setup succeeds, diarization defaults to `off`
- after setup succeeds, diarization defaults to `on`
- if diarization later breaks, transcription still completes and Skriver records the failure in `run.json`

## Default output

For `meeting.mp4`, Skriver writes:

```text
meeting-skriver/
  meeting-transcript.md
  run.json
  evidence/
    audio/
    whisper/
    video-screenshots/
    video-ocr/
    diarization/
    context/
    logs/
```

The main transcript is:

- `meeting-skriver/meeting-transcript.md`

The machine-readable state file is:

- `meeting-skriver/run.json`

## Review Workflow

The intended review order is:

1. Read `run.json`
2. Read `meeting-transcript.md`
3. Review `evidence/whisper/low_confidence_segments.json`
4. Review `evidence/context/notes.json` and the original notes file
5. Review `evidence/context/context_artifacts.json` if extra context was provided
6. For video, inspect `evidence/video-screenshots/`, `evidence/video-ocr/screen_ocr.tsv`, and `evidence/video-ocr/screen_notes.json`
7. If diarization completed, review `evidence/diarization/speaker_diarization.json`

The key handoff is:

- Skriver gives you a trustworthy first pass plus evidence.
- The human or agent should use that evidence to augment, clarify, and carefully improve the final transcript.
- OCR and screenshots should not be merged blindly into the transcript.

## Commands

- `skriver <file>`: create a first-pass transcript plus evidence for review
- `skriver transcribe --input <file>`: explicit form of the same operation
- `--notes-file <file.md|file.txt>`: add human notes to the evidence bundle, with `.md` recommended
- `--glossary <file.txt>`: layer a project glossary on top of the default glossary for the current run
- `skriver setup`: prepare and verify diarization
- `skriver doctor`: check local dependencies and setup state
- `skriver inspect <run-dir-or-run.json>`: inspect a completed run and print the next evidence-review steps
- `skriver glossary`: inspect or apply glossary corrections

## Development

Run the test suite:

```bash
pnpm test
```

Current automated coverage includes:

- file-first CLI invocation
- setup-gated default diarization behavior
- installed global binary boot behavior
- mocked end-to-end transcription, OCR, and diarization

## Docs

- [AGENTS.md](./AGENTS.md)
- [docs/install.md](./docs/install.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/workflows/agent-augmented-transcript.md](./docs/workflows/agent-augmented-transcript.md)
- [docs/workflows/human-review.md](./docs/workflows/human-review.md)
- [current-state.md](./current-state.md)
- [repo-cleanup.md](./repo-cleanup.md)
- [ship-mvp.md](./ship-mvp.md)

## License

MIT
