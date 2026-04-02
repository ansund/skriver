# Agent-Augmented Transcript Workflow

Use this workflow when an agent will take `skriver` artifacts and produce a better final transcript, summary, or follow-up package.

## Goal

Keep `skriver` deterministic and local.
Let the agent do reasoning on top of stable artifacts.

The important handoff is:

- `skriver` creates the first-pass transcript
- `skriver` creates the evidence bundle
- the agent uses the evidence bundle to improve the final transcript carefully

## Recommended steps

1. Run `skriver file.mp4` or `skriver file.m4a`
2. Read `run.json`
3. Read `<filename>-transcript.md`
4. Read `evidence/whisper/summary_draft.json`
5. Review `evidence/whisper/low_confidence_segments.json`
6. Read `evidence/context/notes.json` and treat notes as high-trust human clarification
7. Read `evidence/context/context_artifacts.json` if present
8. If diarization succeeded, read `evidence/diarization/speaker_diarization.json`
9. If the input was a video, inspect `evidence/video-ocr/screen_ocr.tsv`, `evidence/video-ocr/screen_notes.json`, and `evidence/video-screenshots/`
10. Update the transcript or produce a final improved version that cites the evidence it relied on
11. Ask the agent to produce:
   - a final summary
   - decisions
   - actions / owners
   - open questions
   - glossary updates if needed

## Important rule

Do not let the agent overwrite uncertain transcript content silently.

Do not treat OCR or screenshots as automatic transcript text.
Use them only when they clearly clarify what was said, what was shown, or how a technical term should be interpreted.

If the agent improves phrasing or interpretation:

- cite the timestamp
- note uncertainty where confidence is low
- preserve raw evidence in the artifacts
