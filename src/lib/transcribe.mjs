import { join } from "node:path";

import { buildTranscriptArtifacts, buildDryRunTranscript } from "./render.mjs";
import { buildRunManifest, writeRunManifest } from "./manifest.mjs";
import { buildTranscribeNextSteps, renderNextStepsText } from "./next-steps.mjs";
import {
  extractAudio,
  extractScreenshots,
  probeMedia,
  runSpeakerDiarization,
  runVideoOcr,
  transcribeAudio
} from "./media.mjs";
import { processContextFiles, saveRunInputs } from "./context.mjs";
import { createRunWorkspace, saveSourceMedia, writeRunMetadata } from "./workspace.mjs";

export async function runTranscribeCommand(config) {
  const run = await createRunWorkspace(config);
  await saveRunInputs(run, config);
  await saveSourceMedia(run, config.inputPath);

  const media = await probeMedia(config.inputPath);
  run.metadata.media = media;

  if (!media.hasAudio) {
    throw new Error("Input file does not contain an audio stream.");
  }

  if (!config.dryRun) {
    const contextArtifacts = await processContextFiles(config, run);
    run.metadata.contextArtifacts = contextArtifacts;
    await writeRunMetadata(run);

    await extractAudio(config, run);
    await transcribeAudio(config, run);
    await runSpeakerDiarization(config, run);

    if (media.hasVideo && config.screenshots !== "off") {
      await extractScreenshots(config, run, media.durationSeconds);
      await runVideoOcr(config, run);
    }

    await writeRunMetadata(run);
  } else {
    run.metadata.contextArtifacts = [];
    run.metadata.diarization = {
      status: "skipped",
      reason: "Dry run."
    };
    await writeRunMetadata(run);
  }

  const transcriptData = config.dryRun
    ? await buildDryRunTranscript(run, config)
    : await buildTranscriptArtifacts(config, run);

  run.metadata.summary = transcriptData.summary;
  await writeRunMetadata(run);

  const nextSteps = buildTranscribeNextSteps(run, transcriptData.summary);
  const manifest = await writeRunManifest(run, transcriptData.summary, nextSteps);

  const result = {
    ok: true,
    runDirectory: run.runDir,
    transcript: join(run.runDir, "transcript.md"),
    manifest: join(run.runDir, "manifest.json"),
    workflowGuide: join(run.runDir, "workflow.md"),
    mediaHasVideo: media.hasVideo,
    contextFiles: run.metadata.contextArtifacts?.length || 0,
    diarizationStatus: transcriptData.summary.diarizationStatus,
    diarizedSpeakers: transcriptData.summary.diarizedSpeakerCount,
    appliedCorrections: transcriptData.summary.appliedCorrectionCount,
    lowConfidenceSegments: transcriptData.summary.lowConfidenceCount,
    nextSteps
  };

  if (config.nextSteps === "text") {
    result.nextStepsText = renderNextStepsText(nextSteps);
  }
  if (config.nextSteps === "none") {
    delete result.nextSteps;
    delete result.nextStepsText;
  }

  return {
    result,
    run,
    manifest: manifest || await buildRunManifest(run, transcriptData.summary, nextSteps)
  };
}
