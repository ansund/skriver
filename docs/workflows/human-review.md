# Human Review Workflow

`skriver` should produce a strong first-pass transcript, but the best final transcript usually comes from reviewing the evidence bundle.

## Review order

1. Open `run.json`
2. Open the main transcript
3. Check the summary section
4. Check `Applied Technical Term Corrections`
5. Check `Low-Confidence Segments`
6. Check `notes.json` and the original notes file if notes were provided
7. For video runs, inspect `screen_ocr.tsv`, `screen_notes.json`, and screenshots when wording looks odd or the spoken content references something on screen
8. Update glossary terms when you find recurring domain-specific mistakes

## Use the raw artifacts when

- speaker labels look suspicious
- context extraction seems incomplete
- human notes clarify what a vague spoken phrase was referring to
- OCR text would help confirm a term
- the transcript contains ambiguous jargon

## Important rule

Do not paste OCR output into the transcript automatically.
Only add screenshot or OCR details when they clearly improve the understanding of what was actually said.
