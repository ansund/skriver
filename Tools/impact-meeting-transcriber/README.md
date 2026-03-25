# Impact Meeting Transcriber

Small local-first CLI for meeting transcription.

It is built for:

- audio files
- video files with screen sharing
- extra context files such as presentations, emails, notes, PDFs, and images
- mixed Swedish/English conversations
- technical meetings where product and integration terms are often transcribed incorrectly

## What it does

For each run it creates a new folder under `transcripts/` and stores:

- `transcript.md`: final readable transcript with bracketed notes and merged context
- `transcript.json`, `transcript.srt`, `transcript.txt`, `transcript.tsv`
- `metadata.json`
- `notes.txt`
- `context_artifacts.json`
- `contexts/`: copied source context files and extracted text
- `screens/`: extracted screenshots and OCR
- `raw/`: raw Whisper output

Pipeline:

1. Uses `ffprobe` to inspect the media.
2. Uses `ffmpeg` to extract mono 16 kHz audio.
3. Uses local `whisper` for timestamped transcription.
4. For video, extracts screenshots on an interval and OCRs them with `tesseract`.
5. Extracts text from extra context files such as PDFs, PPTX slides, emails, documents, and images.
6. Applies a small technical glossary and flags low-confidence segments.
7. Builds `transcript.md` as the final output to hand back to the user.

## Requirements

The current machine should have:

- `node`
- `pnpm`
- `ffmpeg`
- `ffprobe`
- `whisper`
- `tesseract`

## Quick start

```bash
pnpm --dir "Tools/impact-meeting-transcriber" transcribe --help
pnpm --dir "Tools/impact-meeting-transcriber" transcribe \
  --input "/absolute/path/to/meeting.mp4" \
  --language sv \
  --title "Impact product review" \
  --note "User highlighted the key product decision as especially important." \
  --context "/absolute/path/to/presentation.pdf" \
  --context "/absolute/path/to/followup-email.eml"
```

Audio-only:

```bash
pnpm --dir "Tools/impact-meeting-transcriber" transcribe \
  --input "/absolute/path/to/meeting.m4a" \
  --language en \
  --screenshots off \
  --context "/absolute/path/to/architecture-notes.md"
```

With extra notes and glossary:

```bash
pnpm --dir "Tools/impact-meeting-transcriber" transcribe \
  --input "/absolute/path/to/meeting.mp4" \
  --language auto \
  --notes-file "/absolute/path/to/notes.txt" \
  --glossary "/absolute/path/to/custom-glossary.txt" \
  --screenshot-interval 10 \
  --context "/absolute/path/to/slides.pptx" \
  --context "/absolute/path/to/screenshot.png"
```

Context files can be passed more than once with `--context`. Each `--context` value may be a file or a directory.

## Notes format

Untimed notes are copied into the transcript under `User notes`.

Timed notes can be inserted into the timeline if each line starts with a timestamp:

```text
[00:12:40] This was the key decision point.
00:18:05 Need to verify the custom object naming.
```

## Custom glossary format

Use the same format as `config/default-glossary.txt`:

```text
Impact | impact platform, impact app
Important internal term | common misheard form
```

## Output style

Transcript annotations use bracketed notes such as:

- `[Screen]`
- `[Context]`
- `[User note]`
- `[Transcriber note]`

This keeps the spoken transcript readable while still surfacing important screen context and likely technical-term corrections.

Update `config/default-glossary.txt` with Impact-specific product names, customer names, acronyms, and teammate names as they come up.

## Supported context types

- Text and notes: `txt`, `md`, `csv`, `tsv`, `json`, `yaml`, `xml`, `log`
- Emails: `eml` and other text-convertible mail files
- Documents: `doc`, `docx`, `rtf`, `html`, `odt`
- Presentations: `pptx`
- PDFs: `pdf`
- Images: `png`, `jpg`, `jpeg`, `webp`, `tiff`, `bmp`, `heic`

The main deliverable is always `transcript.md`.
