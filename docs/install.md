# Install

## Base dependencies

`skriver` currently runs from source and expects local media tools.

Required:

- Node.js `>=18.12`
- `pnpm`
- `ffmpeg`
- `ffprobe`
- `whisper`
- `tesseract`

Optional:

- `pdftotext` for PDF context extraction
- `unzip` for PPTX extraction
- `textutil` for richer document extraction on macOS
- Python `3.11` or `3.12` for diarization

## Repository setup

```bash
git clone https://github.com/ansund/skriver.git
cd skriver
pnpm cli:help
node src/cli.mjs doctor
```

## Diarization setup

Set up the local diarization environment:

```bash
pnpm setup-diarization
```

If the pyannote model has not been cached on your machine yet:

1. Accept the access terms for `pyannote/speaker-diarization-community-1`
2. Export a Hugging Face token
3. Authenticate the local environment

```bash
export HF_TOKEN="hf_..."
./.venv-diarization/bin/hf auth login --token "$HF_TOKEN"
```

Supported env vars:

- `SKRIVER_DIARIZATION_PYTHON`
- `SKRIVER_DIARIZATION_MODEL`
- `SKRIVER_DIARIZATION_BOOTSTRAP_PYTHON`

## First verification

```bash
node src/cli.mjs doctor
node src/cli.mjs transcribe --help
pnpm test
```
