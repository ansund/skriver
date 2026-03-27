# Agent-Augmented Transcript Workflow

Use this workflow when an agent will take `skriver` artifacts and produce a better final meeting summary or follow-up package.

## Goal

Keep `skriver` deterministic and local.
Let the agent do reasoning on top of stable artifacts.

## Recommended steps

1. Run `pnpm transcribe ...`
2. Read `transcript.md`
3. Read `summary_draft.json`
4. Review `low_confidence_segments.json`
5. Read `context_artifacts.json`
6. If diarization succeeded, read `speaker_diarization.json`
7. If the input was a video, inspect `screen_ocr.tsv` and `screens/`
8. Ask the agent to produce:
   - a final summary
   - decisions
   - actions / owners
   - open questions
   - glossary updates if needed

## Important rule

Do not let the agent overwrite uncertain transcript content silently.

If the agent improves phrasing or interpretation:

- cite the timestamp
- note uncertainty where confidence is low
- preserve raw evidence in the artifacts
