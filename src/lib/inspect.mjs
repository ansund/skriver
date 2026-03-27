import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildInspectNextSteps, renderNextStepsText } from "./next-steps.mjs";

export async function runInspectCommand(config) {
  const manifestPath = join(config.runDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const nextSteps = buildInspectNextSteps(manifest);

  const result = {
    ok: true,
    runDirectory: config.runDirectory,
    manifest: manifestPath,
    transcript: manifest.artifacts.transcript.path,
    workflowGuide: manifest.artifacts.workflowGuide.path,
    diarizationStatus: manifest.summary.diarizationStatus,
    diarizedSpeakers: manifest.summary.diarizedSpeakerCount,
    lowConfidenceSegments: manifest.summary.lowConfidenceCount,
    contextFiles: manifest.summary.contextFileCount,
    screenNotes: manifest.summary.screenNoteCount,
    nextSteps,
    suggestedArtifacts: buildSuggestedArtifacts(manifest)
  };

  if (config.json) {
    return result;
  }

  return {
    ...result,
    text: [
      `Inspecting: ${config.runDirectory}`,
      "",
      `Transcript: ${result.transcript}`,
      `Manifest: ${result.manifest}`,
      `Workflow guide: ${result.workflowGuide}`,
      `Diarization: ${result.diarizationStatus}`,
      `Low-confidence segments: ${result.lowConfidenceSegments}`,
      "",
      "Next steps:",
      renderNextStepsText(nextSteps)
    ].join("\n")
  };
}

function buildSuggestedArtifacts(manifest) {
  const suggestions = [
    manifest.artifacts.transcript.path,
    manifest.artifacts.summaryDraft.path,
    manifest.artifacts.lowConfidenceSegments.path,
    manifest.artifacts.manifest.path
  ];

  if (manifest.artifacts.contextArtifacts.exists) {
    suggestions.push(manifest.artifacts.contextArtifacts.path);
  }
  if (manifest.artifacts.speakerDiarization.exists) {
    suggestions.push(manifest.artifacts.speakerDiarization.path);
  }
  if (manifest.artifacts.screenOcr.exists) {
    suggestions.push(manifest.artifacts.screenOcr.path);
  }

  return suggestions;
}
