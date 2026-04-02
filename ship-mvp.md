# Ship MVP for Skriver

This is the simplification plan I would ship around the product you described.

## Product Goal

The main use case should become:

```bash
skriver filename.mp4
skriver filename.m4a
skriver filename.wav
```

And the user should be able to assume:

- Skriver installs as a global CLI and actually boots
- video and audio both work through the same command
- the main transcript arrives first
- later evidence stages improve confidence, not block usefulness
- every run leaves a clear folder beside the source file
- every failure leaves a clear record of what succeeded and what failed

## The MVP I Would Ship

For a source file named `filename.mp4`, default output should be:

```text
filename-skriver/
  filename-transcript.md
  run.json
  evidence/
    audio/
      audio_16k.wav
    whisper/
      transcript.json
      transcript.srt
      transcript.tsv
      transcript.txt
      transcript.vtt
    video-screenshots/
      00-00-00.jpg
      00-00-10.jpg
      00-00-20.jpg
    video-ocr/
      screen_ocr.tsv
      screen_notes.json
    diarization/
      speaker_diarization.json
    context/
      notes.txt
      notes.json
      context_artifacts.json
    logs/
      whisper.log
      screenshots.log
      diarization.log
```

I recommend `evidence/` over `artifacts/`.

Why:

- it matches the actual philosophy of the repo
- it is easier for both humans and agents to understand
- it says what these files are for, not just that they are outputs

## Behavioral Contract

### Always

- transcribe
- create screenshots for video
- write the main transcript as soon as Whisper is done
- continue with later stages even if they are optional
- write `run.json` after every stage change

### Best effort

- diarization
- OCR enrichment
- extra context extraction

### Never

- require the user to understand the internal folder layout
- require the user to wait for every enhancement stage before getting the main transcript
- fail the entire run if optional enrichment fails

## The New Stage Model

The current code thinks in terms of "one run that completes at the end".

The MVP should think in terms of "one run with staged deliverables".

## Stage 1: Whisper transcript

Inputs:

- source media

Outputs:

- `filename-transcript.md`
- `evidence/whisper/*`
- `evidence/audio/audio_16k.wav`
- `run.json` updated to `transcript_status: completed`

Terminal behavior:

- show spinner and elapsed time
- when done, print the exact path to `filename-transcript.md`
- explicitly tell the user that the main transcript is ready now

This is the first useful product moment. It should not be delayed.

## Stage 2: Screenshots and OCR for video

Inputs:

- source video

Outputs:

- `evidence/video-screenshots/HH-MM-SS.jpg`
- `evidence/video-ocr/screen_ocr.tsv`
- `evidence/video-ocr/screen_notes.json`
- `run.json` updated to `video_status: completed` or `skipped`

Terminal behavior:

- show spinner and elapsed time
- when done, print exact guidance such as:

```text
Main transcript is ready.
Screenshots and OCR are now ready in:
  /path/to/filename-skriver/evidence/video-screenshots
  /path/to/filename-skriver/evidence/video-ocr/screen_ocr.tsv

Use them to repair product names, UI labels, slide text, and unclear transcript segments.
```

## Stage 3: Diarization

Default behavior should be:

- off until `skriver setup` succeeds
- on by default after setup succeeds
- still skippable with an explicit flag

That means `skriver setup` becomes the clean boundary between "transcription only" and "full enrichment mode".

Inputs:

- extracted wav

Outputs:

- `evidence/diarization/speaker_diarization.json`
- optional transcript patch hints later, but not mandatory for MVP
- `run.json` updated to `diarization_status: completed|skipped|failed`

Terminal behavior:

- say that diarization is starting
- give a rough estimate
- keep showing a spinner and elapsed time
- when done, explain how to use the diarization output to improve the transcript

Important:

I agree with your instinct here. Speaker identity assignment is often not deterministic enough to silently rewrite the final transcript without review. For MVP, diarization should produce evidence and guidance, not hidden mutation.

## `run.json` Should Replace the Current Operational Complexity

I would simplify the operational contract to one small state file:

```json
{
  "schema_version": 1,
  "tool": {
    "name": "skriver",
    "version": "0.1.0"
  },
  "input": {
    "source_path": "/abs/path/filename.mp4",
    "media_type": "video"
  },
  "output": {
    "root": "/abs/path/filename-skriver",
    "main_transcript": "/abs/path/filename-skriver/filename-transcript.md"
  },
  "stages": {
    "transcript": {
      "status": "completed",
      "started_at": "...",
      "finished_at": "...",
      "error": null
    },
    "screenshots": {
      "status": "completed",
      "started_at": "...",
      "finished_at": "...",
      "error": null
    },
    "diarization": {
      "status": "skipped",
      "started_at": "...",
      "finished_at": "...",
      "error": "No local diarization backend available"
    }
  }
}
```

This is simpler than the current combination of:

- `metadata.json`
- `manifest.json`
- `workflow.md`
- `inspect`
- `next-steps`

For the MVP, I would keep one state file and move terminal guidance into the live run itself.

## What I Would Remove or Merge

The repo is not huge, but it still has some layers we can compress.

## Remove or retire for MVP

- `src/lib/inspect.mjs`
- `src/lib/manifest.mjs`
- `src/lib/next-steps.mjs`

Reason:

- the run should already tell the user what happened
- `run.json` can be the single machine-readable index
- the output layout should be simple enough that an extra inspect command is no longer necessary

## Merge or simplify

- merge `metadata.json` responsibilities into `run.json`
- simplify `workspace.mjs` around the new output layout
- simplify `args.mjs` so file-first invocation is the default path

## Clean up packaging noise

- stop shipping `src/__pycache__/*`
- add a shebang to `src/cli.mjs`
- add a global install smoke test to CI

## Potentially move out of the core repo

- `website/`

Reason:

- it is a different lifecycle from the CLI
- it is currently promising a cleaner product than the CLI actually delivers
- keeping it here is okay for now, but I would either tightly couple it to release truth or split it later

I do not think the website is the core problem, but it is a drift risk.

## What I Would Keep

These are worth preserving:

- the local-first extraction model
- the glossary correction layer
- anonymous speaker labeling
- context extraction from extra files
- the transcript markdown as the primary human artifact

The answer is not to throw away the repo. The answer is to narrow it.

## The Command Surface I Would Ship

The default command should be:

```bash
skriver filename.mp4
```

Optional flags should be minimal:

```bash
skriver filename.mp4 --language sv
skriver filename.mp4 --no-diarization
skriver filename.mp4 --screenshot-interval 10
skriver filename.mp4 --output /custom/output-dir
```

Secondary commands:

- `skriver doctor`
- `skriver setup`
- maybe `skriver inspect /path/to/run.json` later, but not required for MVP

I would stop leading with subcommands in the main UX.

## Honest Recommendation on Diarization

This is the place where Skriver should own the complexity instead of pushing it onto the user.

You want:

- install Skriver
- diarization just works
- no personal Hugging Face ceremony

I think that is the right product goal, but it is not a small cleanup task. It is a distribution strategy decision.

### MVP setup contract

Ship `skriver setup` as a clear wizard:

- it checks the local environment
- it installs the diarization environment Skriver needs
- it downloads or verifies the diarization backend/model
- it runs a real verification step
- only after that verification passes does Skriver mark diarization as ready

Normal runtime behavior should then be:

- before setup: diarization default `off`
- after verified setup: diarization default `on`
- if the backend later breaks: skip diarization with a clear message instead of blocking the transcript

### Important constraint

If pyannote model terms or redistribution constraints prevent a frictionless bundle, then the setup wizard still needs to be honest. In that case we either:

- keep diarization explicitly optional
- or switch to a backend we can legally and operationally distribute cleanly

I would not let this ambiguity infect the rest of the CLI. The main product should ship even if diarization remains a second-stage enhancement.

## Failure Model

This part is critical.

For every stage:

- start it
- record status in `run.json`
- write logs to `evidence/logs`
- on success, keep outputs and continue
- on failure, preserve all previous outputs and continue where reasonable

The user should always be able to answer:

- what was completed
- what failed
- where the useful files are
- what to do next

That means no opaque crash-only behavior after partial success.

## Suggested Refactor Sequence

I would do this in order:

1. Fix packaging so global install really works.
   Add shebang to `src/cli.mjs`.
   Add a smoke test that runs the installed binary.

2. Add `skriver setup`.
   Persist setup readiness locally.
   Gate default diarization behavior on verified readiness.

3. Add file-first CLI invocation.
   `skriver file.mp4` should route to transcribe automatically.

4. Replace timestamp-rooted default output with sibling output.
   Default to `filename-skriver` beside the source file.

5. Rename primary output file.
   Write `filename-transcript.md` immediately after Whisper.

6. Introduce staged terminal progress.
   Spinner, elapsed timer, and stage-complete messages.

7. Introduce `run.json`.
   Record stage status and errors after every transition.

8. Reorder the pipeline.
   Whisper first, screenshots second, diarization third.

9. Rename screenshot outputs.
   Use `HH-MM-SS.jpg` naming.

10. Remove or retire `inspect`, `manifest`, and `workflow` complexity.
   Keep the runtime simple.

11. Revisit diarization distribution as a product decision.

## My Strong Recommendation

Do not grow the artifact system further before simplifying the happy path.

The repo already knows what it wants to be. The next win is not more extraction types or smarter summaries. The next win is:

- one install that actually works
- one obvious command
- one obvious output folder
- one obvious main transcript
- progressive stage feedback
- useful outputs even on partial failure

That would turn Skriver from a promising internal tool into a shippable CLI product.
