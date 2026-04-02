# Repo Cleanup Suggestions

This file is a suggestion list, not an applied refactor.

The goal is to make the repo easier to understand for a new human or agent landing in it for the first time.

## Safe Cleanup Soon

- Remove the legacy `transcripts/` workspace convention from the repo entirely.
  The product now writes sibling `<filename>-skriver/` folders beside the source file, so the `transcripts/` directory and its `.gitkeep` are a leftover mental model.
- Remove the `transcripts/*` lines from `.gitignore`.
  They reinforce the old output shape.
- Remove tmp and  `tmp/.gitkeep` and stop presenting it as part of the project structure.

## Move Out Of The Root

- Mode  `current-state.md` and `ship-mvp.md` to a docs/history/ folder.   
- Move `go-open-source-plan.md` into the same archival docs area.
  It adds noise in the root for people who are trying to understand the current shipping product.

## Consolidate Docs

- Keep `README.md` as the product overview.
- Keep `AGENTS.md` as the agent-specific operating contract.
- dont keep both `docs/workflows/agent-augmented-transcript.md` and `docs/workflows/human-review.md`. 
  If they drift into near-duplicates, merge them into one `docs/workflows/reviewing-a-run.md`.
- Consider adding `docs/output-contract.md`.
  That would give one stable place for the `run.json`, transcript, and `evidence/` contract instead of spreading that information across README and architecture docs.

## Separate Product And Website Concerns

- Decide whether `website/` belongs in this repo long term.
  If the website changes on a different cadence than the CLI, a separate repo may reduce noise.
- If you keep `website/` here, treat it as a first-class maintained surface.
  It is part of the product story agents and humans will read first, so stale copy there is unusually costly.

## Remove Stale Concepts Everywhere

Watch for these old concepts and remove them when they appear:

- `manifest.json`
- `workflow.md`
- timestamped run folders under `transcripts/`
- OCR being merged automatically into the main transcript

These are especially confusing because they describe a product shape that is no longer true.

## Suggested End State

The repo should feel like this:

- root: only active project files
- `README.md`: product overview and quickstart
- `AGENTS.md`: agent instructions
- `docs/`: architecture, install, workflows, history/plans
- `src/`: implementation
- `test/`: tests
- `website/`: either clearly maintained or moved out

That would make the current Skriver mental model much easier to see:

- one CLI
- one output contract
- one evidence-first review workflow
- fewer stale product eras visible at once
