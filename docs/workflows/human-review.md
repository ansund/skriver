# Human Review Workflow

`skriver` should already produce a usable transcript without any LLM or agent pass.

## Review order

1. Open `transcript.md`
2. Check the summary section
3. Check `Applied Technical Term Corrections`
4. Check `Low-Confidence Segments`
5. For video runs, inspect `screen_ocr.tsv` and screenshots if wording looks odd
6. Update glossary terms when you find recurring domain-specific mistakes

## Use the raw artifacts when

- speaker labels look suspicious
- context extraction seems incomplete
- OCR text would help confirm a term
- the transcript contains ambiguous jargon
