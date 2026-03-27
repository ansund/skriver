# Contributing to skriver

Thanks for your interest in contributing.

## Scope

Good contributions include:

- install improvements
- bug fixes
- platform compatibility
- OCR/transcription/diarization reliability
- glossary and artifact quality improvements
- documentation and workflow improvements for agents and humans
- tests and fixtures

Please open a discussion or issue before starting large architectural work.

## Development setup

Base workflow:

```bash
pnpm test
node src/cli.mjs transcribe --help
```

Optional diarization setup:

```bash
pnpm setup-diarization
```

## Pull requests

Please keep pull requests focused.

Before submitting:

1. Run `pnpm test`
2. Update docs when behavior changes
3. Include or update tests for behavior changes
4. Explain user-visible behavior changes in the PR description

## Coding expectations

- prefer predictable outputs over clever behavior
- keep agent workflows explicit in docs and artifacts
- avoid adding built-in LLM behavior to the core CLI
- preserve local-first usage where possible

## Community

For support and usage questions, use the support/discussion channels described in [SUPPORT.md](./SUPPORT.md).
