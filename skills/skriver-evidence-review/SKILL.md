---
name: "skriver-evidence-review"
description: "Use when a task involves a completed Skriver run directory, run.json, or evidence folder and the goal is to produce the best final transcript, summary, actions, or clarifications. Read the Skriver artifacts in the right order, treat notes as high-trust clarification, treat screenshots/OCR/diarization as evidence, and improve the final output carefully rather than merging evidence blindly."
---

# Skriver Evidence Review

Skriver is both:

- a tool that creates a first-pass transcript and evidence bundle
- a skill that teaches the agent how to turn that bundle into the best final transcript and summary

## Use this skill when

- the user provides a Skriver run directory
- the user points to `run.json`
- the user wants a better final transcript from Skriver artifacts
- the user wants a summary, actions, or decisions grounded in Skriver evidence

If the user only provides raw media, run `skriver` first.

## Core model

- the main transcript is spoken-content-first
- notes are high-trust human clarification
- screenshots and OCR are evidence, not transcript text
- diarization is useful evidence when it completed, but speaker identity is still anonymous unless verified elsewhere
- the agent has an important second-step job: improve the transcript and summary using the evidence carefully

## Review order

1. Read `run.json`
2. Read the main transcript
3. Read `evidence/whisper/low_confidence_segments.json`
4. Read `evidence/context/notes.json` and the original notes file if available
5. Read `evidence/context/context_artifacts.json` if present
6. Read `evidence/diarization/speaker_diarization.json` if diarization completed
7. For video runs, inspect `evidence/video-ocr/screen_ocr.tsv`, `evidence/video-ocr/screen_notes.json`, and `evidence/video-screenshots/`

## Working rules

- Do not silently rewrite uncertain parts of the transcript.
- Do not paste OCR into the transcript automatically.
- Only use screenshots or OCR when they clearly clarify what was said, shown, or intended.
- Prefer human notes over OCR when they conflict.
- Keep timestamps and uncertainty visible when they matter.

## Good outputs

Depending on the request, produce one or more of:

- an improved final transcript
- a concise evidence-grounded summary
- decisions
- actions / owners
- open questions
- suggested glossary additions for recurring terms

## Final check

Before finalizing, confirm:

- every important correction is grounded in transcript evidence, notes, OCR, screenshots, diarization, or context files
- OCR-derived details were added only when clearly relevant
- speaker claims were not upgraded beyond the evidence
- the final transcript is better, but still honest about uncertainty
