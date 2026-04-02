# Current State of Skriver

As of 2026-04-02, this repo is a small, coherent local transcription pipeline with a strong core idea:

- local first
- evidence first
- transcript first
- agent augmentation after extraction, not instead of extraction

That core idea is good. The repo is trying to turn a meeting recording into a bundle of deterministic artifacts another agent can inspect without guessing. The code does reflect that intent. The repo is not fake. It already works as a real transcription tool when run from source in a prepared local environment.

At the same time, the current product shape is not yet the simple Skriver CLI you want to ship.

## What This Repo Actually Is Today

From the code, Skriver is currently:

- a Node.js CLI with four explicit commands: `transcribe`, `doctor`, `inspect`, and `glossary`
- a run-oriented pipeline that creates timestamped output directories
- dependent on already-installed local tools like `ffmpeg`, `ffprobe`, `whisper`, and `tesseract`
- optionally able to run diarization through a separate Python environment and `pyannote`
- optimized for "artifact bundle for later review" more than "single obvious command for a human"

The main flow lives in:

- `src/cli.mjs`
- `src/lib/args.mjs`
- `src/lib/transcribe.mjs`
- `src/lib/media.mjs`
- `src/lib/render.mjs`
- `src/lib/workspace.mjs`

The current execution order in code is:

1. parse and validate CLI flags
2. create a fresh timestamped run directory
3. write notes and source links
4. probe media
5. process extra context files
6. extract mono 16 kHz wav audio
7. run Whisper
8. run diarization
9. run video screenshots and OCR
10. render the final transcript and supporting files
11. write manifest/workflow data

That ordering matters because it explains several UX problems:

- the main transcript is not written until the very end
- screenshots happen after diarization, not immediately after the transcript
- if something later in the pipeline fails, the user may not get the "best useful partial result"
- the CLI is silent during long stages and only prints final JSON at the end

## What I Verified Directly

I did not rely on docs for this review. I checked the actual repo, package shape, tests, and current runtime behavior.

### Repo health

- `git status` is clean on `main`
- the repo is small and understandable
- `pnpm test` passes: 9 tests, all green

### Local environment

`node src/cli.mjs doctor --json` reports:

- `ffmpeg`, `ffprobe`, `whisper`, `tesseract` available
- optional `pdftotext`, `textutil`, and `unzip` available
- a local diarization Python exists at `.venv-diarization/bin/python`
- Hugging Face auth is not currently cached and no HF token env var is set

This means the local machine is in better shape than the docs imply. The machine can run the base pipeline now.

### Packaging and install reality

I packed and installed the current package into a temporary global-style prefix:

- `npm pack --json --dry-run` succeeds
- `npm install -g ./tmp/skriver-0.1.0.tgz --prefix ./tmp/globaltest` succeeds

But the installed global binary is currently broken.

Reason:

- `src/cli.mjs` has no shebang
- the installed `bin/skriver` starts directly with `import ...`
- when executed as a command, the shell tries to run it as a shell script and fails immediately

So the current website install path is not truly working yet. The package installs, but the `skriver` command does not boot as a global CLI.

### CLI behavior

The current CLI only supports explicit commands.

This works:

```bash
node src/cli.mjs transcribe --input /path/to/file.mp4
```

This does not work:

```bash
node src/cli.mjs /path/to/file.mp4
```

And by extension the desired future UX does not exist yet:

```bash
skriver filename.mp4
```

Today that falls back to help output.

### Existing real outputs in the repo workspace

There are real prior run directories under:

- `transcripts/`
- `tmp/verification-output/`

Those older runs are useful because they show real transcript output from actual use, not just tests.

Important observation:

- some older runs contain `transcript.md` and supporting artifacts but do not contain `manifest.json` or `workflow.md`

That suggests the artifact contract has changed over time and old outputs are no longer fully aligned with the newer architecture story.

### Live run against the provided sample video

I used the real file:

- `/Users/viktoransund/Movies/2026-04-02 09-55-56.mp4`

I also verified the file itself:

- video: h264, 2560x1440, 30 fps
- audio: aac stereo 48 kHz
- duration: 462.6 seconds

Observed real behavior from the current CLI:

- it creates a fresh timestamped run directory under `transcripts/`
- the directory is named like `2026-04-02T09-09-47_2026-04-02-09-55-56`
- it writes `notes.json`, `notes.txt`, `metadata.json`, `context_artifacts.json`
- it extracts `media/audio_16k.wav`
- then it enters Whisper and stays there for a long time with no terminal progress
- no main transcript file is produced during that stage
- no partial success is surfaced to the user yet

That is a very important finding because it shows the current UX is still "batch job with one final JSON result", not "progressive transcript product".

I also created a shorter clip from the same video to observe the same pipeline more quickly. It showed the same front-loaded silent Whisper behavior.

## What Is Good Already

The repo has a real center of gravity. It is not random.

### Strong product instinct

The best instinct in this repo is:

- do deterministic extraction first
- keep the transcript in the spoken language
- keep speaker labels anonymous unless verified
- let downstream agents reason from evidence

That is the right direction. I think we should preserve it.

### Clear module boundaries

The modules are fairly well separated:

- args
- workspace
- media
- context
- render
- doctor
- inspect

This makes refactoring possible without a rewrite from zero.

### Good operational checks

`doctor` is useful and grounded in real binaries.

### Real transcript output already exists

The current transcript markdown is usable. It is not polished enough for the final product, but it is already a real artifact.

## Where The Repo Is Currently Mismatched With The Product We Want

## 1. Install story is not actually shippable yet

The website suggests global install from GitHub. In reality:

- the global binary is broken because of the missing shebang
- users still need local `whisper`, `ffmpeg`, `tesseract`, and optional Python tooling
- diarization still depends on external model access and separate setup

So the install story is currently more "developer setup" than "product install".

## 2. The primary CLI UX is not the intended product UX

The current mental model is:

```bash
skriver transcribe --input /path/to/file.mp4
```

The desired mental model is:

```bash
skriver filename.mp4
```

That is a meaningful product difference, not just syntax sugar. The current CLI is command-centric. The desired CLI is file-centric.

## 3. Output layout is built for internal runs, not for the user's folder

Current default:

- output root is `repo/transcripts/`
- folder name is `timestamp_slug`
- main file is always `transcript.md`
- screenshots live in `screens/`
- support files are spread across `raw/`, `media/`, `contexts/`, `screens/`, and top-level files

Desired output:

- output beside the source file
- folder name derived from the source file
- main transcript named from the source file
- support files in one clear evidence/support directory

Current output is internally sensible, but not yet the right human-facing artifact layout.

## 4. The stage ordering is wrong for the intended experience

Current order:

- Whisper
- diarization
- screenshots/OCR
- final render

Desired order:

- Whisper transcript first
- write the main transcript immediately
- screenshots/OCR next
- diarization after that
- explain in terminal how to use each later stage to improve the transcript

Today the best artifact is delayed until the whole run finishes.

## 5. Failure handling is not shaped around "always leave something useful"

Right now, most stage failures bubble up and terminate the run. There is some graceful behavior around diarization auto-skip, but the pipeline as a whole is still not designed as staged salvage.

Example problems:

- if Whisper fails, the run stops
- if OCR fails after transcription, the user does not get stage-wise terminal guidance
- there is no persistent per-stage status file showing what succeeded and what failed
- there is no clear resumable run model

The repo writes useful files, but it is not yet fail-soft in the way your product vision requires.

## 6. Diarization is still a "developer optional" subsystem

Current diarization status:

- separate Python setup
- external model dependency
- possible Hugging Face auth requirement
- best-effort skip in `auto`, hard fail in `on`

This is fine for internal experimentation, but not compatible with "install and just use it".

## 7. The repo contains some contract drift and packaging rough edges

I noticed:

- the package tarball currently includes `src/__pycache__/pyannote_diarize.cpython-312.pyc`
- older real output folders do not match the newer manifest/workflow contract
- `transcript.vtt` is copied but not consistently treated as a first-class artifact in the manifest/rendering
- `metadata.diarization` starts as a string option and later becomes an object, which makes the shape less clean than it should be

These are not fatal, but they are signs that the repo is still in a fast-moving prototype phase.

## My Read On The Real Intent Of This Repo

I think the deepest intent of Skriver is not "transcribe files".

I think the deeper intent is:

- create a trustworthy meeting evidence bundle
- make the transcript the first useful artifact
- give humans and agents enough extracted context to improve that transcript
- keep the process local and inspectable

That is stronger than a generic speech-to-text tool.

The mistake to avoid is over-rotating into a sprawling "artifact platform" before the core user path is dead simple.

The thing to keep is:

- evidence-first transcript augmentation

The thing to simplify aggressively is:

- command surface
- output structure
- install story
- stage progression and status reporting

## Shared Understanding

My current understanding of the repo state is:

- the core concept is right
- the current implementation is real and already useful from source
- the packaging and default CLI UX are not yet ship-ready
- the repo is still optimized for an internal run-bundle workflow, not the dead-simple file-in/folder-out product you want
- the next phase should not be "add more capability"
- the next phase should be "compress the product into one obvious path and make every stage fail-soft"

That is the right foundation for the next doc: `ship-mvp.md`.
