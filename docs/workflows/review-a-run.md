# Review A Run

`skriver` creates a strong first-pass transcript and an evidence bundle.

The final clarified transcript usually comes from reviewing that evidence carefully.

## Core model

- the main transcript is spoken-content-first
- notes are high-trust human clarification
- screenshots, OCR, and diarization are evidence
- evidence should improve the final transcript carefully, not be merged blindly

## Review order

1. Open `run.json`
2. Open `<filename>-transcript.md`
3. Review `evidence/whisper/low_confidence_segments.json`
4. Review `evidence/context/notes.json` and the original notes file
5. Review `evidence/context/context_artifacts.json` if present
6. Review `evidence/diarization/speaker_diarization.json` if diarization completed
7. For video runs, inspect `evidence/video-ocr/screen_ocr.tsv`, `evidence/video-ocr/screen_notes.json`, and `evidence/video-screenshots/`

## Important rules

- Do not overwrite uncertain transcript content silently.
- Do not paste OCR into the transcript automatically.
- Only add screenshot or OCR details when they clearly clarify what was said or what term was intended.
- Only trust anonymous speaker labels when diarization completed successfully.

## Typical final pass

Use the evidence to:

- repair low-confidence wording
- correct technical or company terms
- clarify vague references using notes
- clarify on-screen references when they are clearly relevant
- improve the final transcript, summary, actions, and open questions
