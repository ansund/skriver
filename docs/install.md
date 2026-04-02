# Install

## Base requirements

Required:

- Node.js `>=18.12`
- `ffmpeg`
- `ffprobe`
- `whisper`
- `tesseract`

Helpful extras:

- `pdftotext`
- `unzip`
- `textutil` on macOS

## Global install

```bash
curl -fsSL https://skriver.ansund.com/install.sh | bash
```

Or install directly from GitHub:

```bash
npm install -g github:ansund/skriver
```

Then verify:

```bash
skriver --version
skriver --help
```

## From source

```bash
git clone https://github.com/ansund/skriver.git
cd skriver
node src/cli.mjs doctor
node src/cli.mjs --help
```

## Diarization setup

Run:

```bash
skriver setup
```

The setup command is responsible for checking and preparing diarization. After it succeeds, diarization becomes the default behavior for normal transcription runs.

If the chosen diarization backend still needs model access or authentication, `skriver setup` should surface that clearly and leave diarization off until verification succeeds.

## First verification

```bash
skriver doctor
skriver setup
skriver /absolute/path/to/meeting.mp4 --notes-file ./notes.md
```
