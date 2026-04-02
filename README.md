# skriver

Local-first transcription CLI for audio and video.

`skriver` is built around one simple path:

```bash
skriver meeting.mp4
skriver meeting.m4a
```

It writes a sibling folder beside the source file, produces the main transcript first, and then adds evidence that can help a human or agent improve it.

## What it does

- transcribes audio and video locally
- creates screenshots and OCR for video
- stores supporting evidence in a clear `evidence/` tree
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
skriver /absolute/path/to/meeting.mp4
```

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

## Commands

- `skriver <file>`: transcribe an audio or video file
- `skriver transcribe --input <file>`: explicit form of the same operation
- `skriver setup`: prepare and verify diarization
- `skriver doctor`: check local dependencies and setup state
- `skriver inspect <run-dir-or-run.json>`: inspect a completed run
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
- [current-state.md](./current-state.md)
- [ship-mvp.md](./ship-mvp.md)

## License

MIT
