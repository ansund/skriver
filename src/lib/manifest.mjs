import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { TOOL_NAME } from "./constants.mjs";
import { buildInspectNextSteps, buildWorkflowGuide } from "./next-steps.mjs";
import { TOOL_VERSION } from "./package-info.mjs";

async function artifact(path) {
  const exists = Boolean(await stat(path).catch(() => null));
  return { path, exists };
}

export async function buildRunManifest(run, summary, nextSteps = []) {
  const artifacts = {
    manifest: { path: join(run.runDir, "manifest.json"), exists: true },
    workflowGuide: await artifact(join(run.runDir, "workflow.md")),
    transcript: await artifact(join(run.runDir, "transcript.md")),
    transcriptJson: await artifact(join(run.runDir, "transcript.json")),
    transcriptSrt: await artifact(join(run.runDir, "transcript.srt")),
    transcriptTsv: await artifact(join(run.runDir, "transcript.tsv")),
    transcriptTxt: await artifact(join(run.runDir, "transcript.txt")),
    summaryDraft: await artifact(join(run.runDir, "summary_draft.json")),
    lowConfidenceSegments: await artifact(join(run.runDir, "low_confidence_segments.json")),
    appliedCorrections: await artifact(join(run.runDir, "applied_corrections.json")),
    speakerDiarization: await artifact(join(run.runDir, "speaker_diarization.json")),
    contextArtifacts: await artifact(join(run.runDir, "context_artifacts.json")),
    screenOcr: await artifact(join(run.runDir, "screen_ocr.tsv")),
    notes: await artifact(join(run.runDir, "notes.txt")),
    notesJson: await artifact(join(run.runDir, "notes.json")),
    metadata: await artifact(join(run.runDir, "metadata.json")),
    rawDir: await artifact(run.rawDir),
    contextsDir: await artifact(run.contextsDir),
    screensDir: await artifact(run.screensDir),
    sourceDir: await artifact(run.sourceDir)
  };

  return {
    schemaVersion: 1,
    tool: {
      name: TOOL_NAME,
      version: TOOL_VERSION
    },
    run: {
      directory: run.runDir,
      createdAt: run.metadata.createdAt,
      title: run.metadata.title,
      inputPath: run.metadata.inputPath,
      language: run.metadata.language,
      dryRun: run.metadata.dryRun,
      whisperModel: run.metadata.whisperModel,
      screenshotIntervalSeconds: run.metadata.screenshotIntervalSeconds,
      media: run.metadata.media || null
    },
    options: {
      glossaryPaths: run.metadata.glossaryPaths || [],
      contextInputs: run.metadata.contextInputs || [],
      notesFile: run.metadata.notesFile || null,
      numSpeakers: run.metadata.numSpeakers ?? null,
      minSpeakers: run.metadata.minSpeakers ?? null,
      maxSpeakers: run.metadata.maxSpeakers ?? null
    },
    summary: summary || run.metadata.summary || {
      language: run.metadata.language,
      segmentCount: 0,
      screenNoteCount: 0,
      contextFileCount: run.metadata.contextArtifacts?.length || 0,
      diarizationStatus: run.metadata.diarization?.status || "unknown",
      diarizedSpeakerCount: 0,
      appliedCorrectionCount: 0,
      lowConfidenceCount: 0
    },
    artifacts,
    workflow: {
      inspectCommand: `${TOOL_NAME} inspect "${run.runDir}"`,
      nextSteps: nextSteps.length > 0 ? nextSteps : buildInspectNextSteps({
        artifacts,
        summary: summary || run.metadata.summary || {},
        run: { directory: run.runDir }
      })
    }
  };
}

export async function writeRunManifest(run, summary, nextSteps = []) {
  const manifest = await buildRunManifest(run, summary, nextSteps);
  const workflowText = buildWorkflowGuide(run, manifest);
  await writeFile(join(run.runDir, "workflow.md"), workflowText, "utf8");
  manifest.artifacts.workflowGuide.exists = true;
  await writeFile(join(run.runDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return manifest;
}

export async function readManifest(runDir) {
  const manifestPath = join(runDir, "manifest.json");
  return JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(manifestPath, "utf8")));
}
