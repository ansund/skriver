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

## Use a glossary for one run

Layer an additional glossary file on top of the default one:

```bash
skriver "/absolute/path/to/file.m4a" \
  --glossary "/absolute/path/to/custom-glossary.txt"
```

## Set a default glossary in Skriver config

You can also make one or more glossary files part of your user config so they apply automatically on every run.

Config file:

`~/.skriver/config.json`

Example:

```json
{
  "defaults": {
    "glossaryPaths": [
      "/absolute/path/to/team-glossary.txt"
    ]
  }
}
```

Skriver always loads:

1. the built-in default glossary
2. any glossary files listed in Skriver config
3. any extra `--glossary` file passed on the current command

That means `--glossary` is still useful for a one-off project-specific glossary even when you already have a default glossary in config.

## Inspect glossary entries

```bash
skriver glossary list
skriver glossary list --json
```

## Check text against the glossary

```bash
skriver glossary check --text "skriver platform for hub spot"
skriver glossary check --file "/absolute/path/to/snippet.txt" --json
```

## Guidance

- keep entries narrow and high-signal
- prefer company names, product names, and domain terms
- avoid adding generic words that could over-correct ordinary speech
- use `.txt` files for glossary lists
- review corrected output in `transcript.md` and `applied_corrections.json`
