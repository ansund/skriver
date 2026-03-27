# Go Open Source Plan for `skriver`

## Thesis

`skriver` should be a deterministic transcription CLI for agents and humans.

It should not try to be an LLM product.
It should do the hard, local, evidence-producing work:

- transcribe audio
- transcribe video
- extract screenshots and OCR for video context
- run diarization when available
- collect context files
- flag suspicious transcript segments
- produce predictable artifacts that an agent can reason over

The agent should do the final reasoning, rewriting, summarizing, and decision-making.

That product boundary is a strength, not a weakness.

## Core product position

**One-line positioning**

`skriver` is a local-first transcription CLI that produces agent-ready meeting artifacts.

**What it is**

- a transcription and evidence extraction tool
- a workflow tool for agent-assisted meeting understanding
- useful on its own even with no LLM

**What it is not**

- not a hosted SaaS
- not a chat interface
- not an opinionated built-in summarizer that pretends to reason
- not an all-in-one “AI meeting assistant”

## Product principle

Make the raw output good enough for humans.
Make the artifacts structured enough for agents.

That means:

- `transcript.md` must already be readable and useful
- the run directory must contain enough evidence for post-processing
- instructions for augmentation must be explicit, short, and repeatable

## Best-practice insights from strong open-source CLI projects

### 1. Fast first success matters

Strong CLI projects optimize for “install, run one command, see value”.

- `uv` documents installation first, then “first steps”, then guides and reference.
- `gh` emphasizes commands, examples, and community extensions.
- `ripgrep` sells itself with concrete examples and performance evidence.
- `aider` leads with a tight identity, a short quickstart, and obvious documentation/community links.

Implication for `skriver`:

- the README must let someone get to a first transcript in under 5 minutes
- install and first command must be above the fold
- examples must be real, copy-pastable, and short

### 2. Local-vs-CI-vs-auth workflows should be explicit

`rdme` is a good example here:

- local login flow
- env-var auth for automation
- `whoami` and `logout`
- documented precedence order for auth sources

Implication for `skriver`:

- add `skriver doctor`
- add `skriver auth` guidance in docs, even if the only auth today is Hugging Face for optional diarization
- document auth precedence clearly
- support `whoami`-style checks where relevant

### 3. Good open-source projects reduce maintainer load with structure

GitHub Open Source Guides and GitHub Docs both emphasize:

- CONTRIBUTING guidelines
- issue and PR templates
- support resources
- labeling beginner-friendly issues
- clear contribution boundaries

Implication for `skriver`:

- be explicit about what contributions are welcome
- define what belongs in an issue vs a discussion
- use templates from day one
- keep the roadmap public

### 4. Security and release hygiene increase trust

OpenSSF’s Best Practices badge emphasizes:

- documented architecture
- documented security expectations
- easy contributor setup
- testable software
- sustainable releases not dependent on one person

Implication for `skriver`:

- publish architecture docs
- add `SECURITY.md`
- automate tests and releases
- avoid undocumented one-off setup

## Recommendation: product design

## Keep `skriver` deterministic

The biggest design choice:

Do **not** put built-in LLM summarization into `skriver`.

Instead:

- make `skriver transcribe` deterministic
- make `skriver review` or `skriver inspect` produce agent-ready review material
- document the augmentation workflow for external agents

This keeps the tool:

- simpler to trust
- easier to install
- easier to test
- easier to open source
- more useful in secure/local workflows

## Recommended workflow design

### Phase 1 user workflow

1. Run `skriver transcribe ...`
2. Get a readable transcript plus artifacts
3. Review flagged segments
4. If using an agent, give the agent the transcript plus artifacts and follow the augmentation instructions

### Recommended commands

- `skriver transcribe`
- `skriver doctor`
- `skriver inspect <run-dir>`
- `skriver glossary ...`
- `skriver export <run-dir>`

### What `skriver transcribe` should output

Keep terminal output short and structured:

- run directory
- transcript path
- diarization status
- context file count
- low-confidence count
- next steps

Example shape:

```text
Done.

Transcript: /.../transcript.md
Artifacts: /.../run-dir
Diarization: completed (2 speakers)
Low-confidence segments: 14

Next steps:
1. Read transcript.md
2. Review low_confidence_segments.json
3. If using an agent, provide transcript.md + summary_draft.json + context_artifacts.json + speaker_diarization.json
```

Do not print a huge essay after every run.
Instead, add:

- `--next-steps text|json|none`
- `skriver inspect <run-dir>` for richer workflow instructions

## Best way to support agent workflows

The agent workflow should be a first-class documented mode.

Recommended files:

- `README.md` for humans
- `AGENTS.md` for coding agents
- `docs/workflows/agent-augmented-transcript.md`
- `docs/workflows/human-review.md`

The agent instructions should say:

1. read `transcript.md`
2. read `summary_draft.json`
3. inspect `low_confidence_segments.json`
4. inspect `context_artifacts.json`
5. inspect screenshots/OCR if video
6. inspect `speaker_diarization.json` if present
7. produce a final summary with actions and open questions

This is better than burying the workflow inside source code or giant CLI output.

## Important product call: transcript vs augmentation

The transcript must stand alone.

So the baseline deliverable should be:

- speaker-labeled when diarization succeeds
- timestamped
- readable
- clearly annotated where confidence is low
- not dependent on any later agent pass

Augmentation should improve the transcript, not rescue it.

That means the deterministic tool should already do:

- glossary normalization
- low-confidence detection
- OCR capture for video
- context extraction
- suspicious-term flags

## Recommendation: architecture direction

## Move to a Python-first CLI

For open source, the cleanest long-term architecture is:

- Python package named `skriver`
- install via `uv tool install skriver` or `pipx install skriver`
- optional extras for diarization/OCR/video features

Reason:

- Whisper, faster-whisper, pyannote, OCR-adjacent tooling are Python-native
- today’s Node wrapper adds extra packaging complexity
- “Node + Python + ffmpeg + whisper + pyannote” is too much for an open-source v1 install story

Recommended packaging target:

- Python CLI with Typer or Click
- `pyproject.toml`
- optional dependency groups:
  - `base`
  - `video`
  - `diarization`
  - `dev`

Keep the current repo as a migration base, but plan a deliberate package simplification.

## Recommended repository structure

```text
skriver/
  pyproject.toml
  README.md
  LICENSE
  CHANGELOG.md
  CONTRIBUTING.md
  SECURITY.md
  CODE_OF_CONDUCT.md
  AGENTS.md
  docs/
    workflows/
      agent-augmented-transcript.md
      human-review.md
    architecture.md
    glossary.md
    install.md
  src/skriver/
    cli.py
    doctor.py
    transcribe.py
    diarize.py
    media.py
    context.py
    ocr.py
    glossary.py
    render.py
    inspect.py
    models.py
  tests/
    unit/
    e2e/
    fixtures/
  .github/
    ISSUE_TEMPLATE/
    workflows/
```

## What the v1 feature set should be

### Must-have

- transcribe audio
- transcribe video
- extract screenshots from video
- OCR screenshots
- optional diarization
- context file ingestion
- glossary corrections
- confidence flags
- stable run directory structure
- markdown transcript
- machine-readable JSON artifacts

### Nice-to-have, but not v1 blockers

- redaction
- subtitle editing UI
- live recording
- hosted web app
- built-in LLM summarization
- cloud sync

## Suggested artifact contract

Each run should create a stable folder like:

```text
run/
  transcript.md
  transcript.txt
  transcript.srt
  transcript.json
  summary_draft.json
  low_confidence_segments.json
  speaker_diarization.json
  context_artifacts.json
  manifest.json
  notes.txt
  raw/
  contexts/
  screens/
```

`manifest.json` should become the main machine-readable index.
Agents should be able to inspect one file and discover the rest.

## Open-source repo checklist

Before launch, `ansund/skriver` should have:

- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `AGENTS.md`
- issue forms for bug report, feature request, install problem
- pull request template
- CI for tests on macOS, Linux, Windows
- release automation
- example media and fixtures

## Release and launch strategy

## Versioning

Use SemVer.
Automate releases with `release-please` or `semantic-release`.

## Distribution

Primary:

- `uv tool install skriver`
- `pipx install skriver`

Secondary:

- Homebrew tap after early traction
- GitHub Releases binaries later if you add standalone packaging

## Launch order

### Phase 0: cleanup

- rename repo to `ansund/skriver`
- define scope
- simplify install story
- finish tests
- publish architecture and workflows

### Phase 1: public beta

- release `0.1.x`
- post a strong README
- publish demo artifacts
- ask a few agent-heavy users to test real workflows

### Phase 2: credibility

- add comparison table
- add performance numbers
- add fixture corpus and regression tests
- pursue OpenSSF Best Practices badge

### Phase 3: growth

- Homebrew
- docs site
- plugin or extension system
- contributor onboarding

## Messaging

The product story should be:

> `skriver` is an open-source CLI that turns meetings into agent-ready evidence.
> It transcribes audio and video locally, extracts context from screen and files, flags uncertain segments, and gives agents the artifacts they need to produce better summaries and follow-up work.

Not:

> AI meeting assistant.

That category is crowded and vague.
Your angle is sharper:

- local-first
- artifact-first
- agent-first
- human-usable

## Concrete next actions

### In the next 7 days

1. Create `ansund/skriver`
2. Choose license
3. Rename all earlier internal prototype references to `skriver`
4. Add the missing community files
5. Publish a first public roadmap
6. Rewrite README around install -> first run -> outputs -> workflows

### In the next 14 days

1. Decide whether to stay on Node short-term or begin Python-first migration
2. Add `doctor`, `inspect`, and `manifest.json`
3. Add fixtures and regression tests
4. Add CI on GitHub Actions
5. Add release automation

### In the next 30 days

1. Ship `0.1.0`
2. Announce it with a short demo gif/video
3. Ask 5-10 real users to run it on real meetings
4. Collect friction around install, diarization, and workflow clarity
5. Tighten based on actual usage instead of adding broad features

## My strongest recommendation

If you want this to become a successful open-source tool, optimize for:

- **clarity over cleverness**
- **deterministic artifacts over built-in reasoning**
- **excellent install and docs over more features**
- **one strong workflow over many weak ones**

The winning v1 is not “AI does everything.”
The winning v1 is:

> “I can install `skriver`, run one command on a meeting, and immediately get a transcript plus a clean evidence bundle that my agent can use.”

## Sources

- GitHub Open Source Guides: [Best Practices for Maintainers](https://opensource.guide/best-practices/)
- GitHub Open Source Guides repo: [github/opensource.guide](https://github.com/github/opensource.guide)
- OpenSSF: [Best Practices Badge](https://openssf.org/best-practices-badge/)
- GitHub Docs: [Setting up your project for healthy contributions](https://docs.github.com/github/building-a-strong-community/setting-up-your-project-for-healthy-contributions)
- GitHub Docs: [Adding support resources to your project](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-support-resources-to-your-project?apiVersion=2022-11-28)
- GitHub Docs: [Creating a default community health file](https://docs.github.com/en/github/building-a-strong-community/creating-a-default-community-health-file)
- GitHub Docs: [Configuring issue templates](https://docs.github.com/articles/configuring-issue-templates-for-your-repository)
- GitHub Docs: [About issue and pull request templates](https://docs.github.com/en/enterprise-server%403.19/communities/using-templates-to-encourage-useful-issues-and-pull-requests/manually-creating-a-single-issue-template-for-your-repository)
- `uv` docs: [Installation](https://docs.astral.sh/uv/getting-started/installation/)
- `uv` docs: [Overview](https://docs.astral.sh/uv/)
- GitHub CLI manual: [gh manual](https://cli.github.com/manual/)
- `ripgrep` repo: [BurntSushi/ripgrep](https://github.com/BurntSushi/ripgrep)
- `rdme` repo: [readmeio/rdme](https://github.com/readmeio/rdme)
- `aider` repo: [Aider-AI/aider](https://github.com/Aider-AI/aider)
- `release-please`: [googleapis/release-please](https://github.com/googleapis/release-please)
