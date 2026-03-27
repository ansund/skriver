# Glossary

The glossary helps `skriver` repair likely technical mistranscriptions in a deterministic way.

## Default glossary

The built-in glossary lives at:

`config/default-glossary.txt`

Each line is:

```text
Canonical Term | alias one, alias two, alias three
```

Blank lines and comment lines beginning with `#` are ignored.

## Add your own glossary

Layer an additional glossary file on top of the default one:

```bash
node src/cli.mjs transcribe \
  --input "/absolute/path/to/file.m4a" \
  --glossary "/absolute/path/to/custom-glossary.txt"
```

## Inspect glossary entries

```bash
node src/cli.mjs glossary list
node src/cli.mjs glossary list --json
```

## Check text against the glossary

```bash
node src/cli.mjs glossary check --text "skriver platform for hub spot"
node src/cli.mjs glossary check --file "/absolute/path/to/snippet.txt" --json
```

## Guidance

- keep entries narrow and high-signal
- prefer company names, product names, and domain terms
- avoid adding generic words that could over-correct ordinary speech
- review corrected output in `transcript.md` and `applied_corrections.json`
