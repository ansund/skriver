import { readFile } from "node:fs/promises";

export async function runInspectCommand(config) {
  const runState = JSON.parse(await readFile(config.runStatePath, "utf8"));
  const stages = runState.stages || {};

  const result = {
    ok: true,
    runDirectory: config.runDirectory,
    runState: config.runStatePath,
    readme: runState.output?.readme,
    transcript: runState.output?.mainTranscript,
    evidenceDirectory: runState.output?.evidence,
    diarizationStatus: runState.diarization?.status || stages.diarization?.status || "unknown",
    diarizedSpeakers: runState.summary?.diarizedSpeakerCount || 0,
    lowConfidenceSegments: runState.summary?.lowConfidenceCount || 0,
    contextFiles: runState.summary?.contextFileCount || 0,
    screenNotes: runState.summary?.screenNoteCount || 0,
    stageStatuses: Object.fromEntries(Object.entries(stages).map(([name, value]) => [name, value.status])),
    suggestedArtifacts: [
      runState.output?.readme,
      runState.output?.mainTranscript,
      runState.artifacts?.summaryDraft,
      runState.artifacts?.lowConfidenceSegments,
      runState.artifacts?.contextArtifacts,
      runState.artifacts?.screenOcr,
      runState.artifacts?.diarization
    ].filter(Boolean),
    nextSteps: buildInspectSteps(runState)
  };

  if (config.json) {
    return result;
  }

  return {
    ...result,
    text: [
      `Inspecting: ${config.runDirectory}`,
      "",
      `Open first: ${result.readme}`,
      `Transcript: ${result.transcript}`,
      `Run state: ${result.runState}`,
      `Evidence: ${result.evidenceDirectory}`,
      `Transcript stage: ${result.stageStatuses.transcript || "unknown"}`,
      `Screenshot stage: ${result.stageStatuses.screenshots || "unknown"}`,
      `Diarization: ${result.diarizationStatus}`,
      "",
      "Next steps:",
      ...result.nextSteps.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Feedback:",
      "Leave product feedback with: skriver feedback \"What was confusing, slow, or missing?\""
    ].join("\n")
  };
}

function buildInspectSteps(runState) {
  const steps = [];
  steps.push(`Read ${runState.output?.readme} first.`);
  steps.push(`Then read ${runState.output?.mainTranscript}.`);

  if (runState.summary?.lowConfidenceCount > 0) {
    steps.push(`Review ${runState.artifacts?.lowConfidenceSegments} for uncertain segments.`);
  }
  if (runState.summary?.screenNoteCount > 0) {
    steps.push(`Use ${runState.artifacts?.screenOcr} and ${runState.artifacts?.screenshots} to repair on-screen terminology.`);
  }
  if ((runState.diarization?.status || runState.stages?.diarization?.status) === "completed") {
    steps.push(`Use ${runState.artifacts?.diarization} to review anonymous speaker turns before editing speaker-specific parts.`);
  }
  if (runState.summary?.contextFileCount > 0) {
    steps.push(`Cross-check ${runState.artifacts?.contextArtifacts} against the transcript.`);
  }

  return steps;
}
