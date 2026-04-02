import {
  buildTranscriptArtifacts,
  buildDryRunTranscript
} from "./render.mjs";
import {
  extractAudio,
  extractScreenshots,
  probeMedia,
  runSpeakerDiarization,
  runVideoOcr,
  transcribeAudio
} from "./media.mjs";
import { processContextFiles, saveRunInputs } from "./context.mjs";
import {
  createRunWorkspace,
  markStageCompleted,
  markStageFailed,
  markStageSkipped,
  markStageStarted,
  saveSourceMedia,
  updateRunSummary,
  writeRunState,
  writeStageLog
} from "./workspace.mjs";

export async function runTranscribeCommand(config, reporter = null) {
  const run = await createRunWorkspace(config);
  await saveRunInputs(run, config);
  await saveSourceMedia(run, config.inputPath);
  await writeRunState(run);

  const media = await probeMedia(config.inputPath);
  run.metadata.media = media;
  await writeRunState(run);

  if (!media.hasAudio) {
    const error = new Error("Input file does not contain an audio stream.");
    await markStageFailed(run, "transcript", error, "No audio stream was detected in the source file.");
    throw error;
  }

  const contextArtifacts = await processContextFiles(config, run);
  run.metadata.contextArtifacts = contextArtifacts;
  await writeRunState(run);

  if (config.dryRun) {
    run.metadata.diarization = {
      status: "skipped",
      reason: "Dry run."
    };
    await markStageSkipped(run, "screenshots", "Dry run.");
    await markStageSkipped(run, "diarization", "Dry run.");
    const transcriptData = await buildDryRunTranscript(run, config);
    await markStageCompleted(run, "transcript", "Dry run transcript placeholder created.");
    await updateRunSummary(run, transcriptData.summary);
    return buildResult(run, transcriptData.summary);
  }

  reporter?.startStage("Stage 1/3", "Generating the main transcript");
  await markStageStarted(run, "transcript", "Extracting audio and running Whisper.");

  try {
    await extractAudio(config, run);
    await transcribeAudio(config, run);
    const transcriptData = await buildTranscriptArtifacts(config, run);
    await markStageCompleted(run, "transcript", "Main transcript created.");
    await updateRunSummary(run, transcriptData.summary);
    await writeStageLog(run, "transcript", [
      `status=completed`,
      `audio=${run.audioPath}`,
      `whisper_json=${run.whisperJsonPath}`,
      `transcript=${run.transcriptPath}`
    ]);
    reporter?.finishStage(`Main transcript ready: ${run.transcriptPath}`);
  } catch (error) {
    await markStageFailed(run, "transcript", error, "Whisper transcription failed.");
    await writeStageLog(run, "transcript", [
      `status=failed`,
      `error=${error.message}`
    ]);
    reporter?.failStage(`Transcript stage failed: ${error.message}`);
    throw error;
  }

  if (media.hasVideo && config.screenshots !== "off") {
    reporter?.startStage("Stage 2/3", "Creating screenshots and OCR");
    await markStageStarted(run, "screenshots", "Extracting screenshots and OCR text.");
    try {
      await extractScreenshots(config, run, media.durationSeconds);
      await runVideoOcr(config, run);
      const transcriptData = await buildTranscriptArtifacts(config, run);
      await markStageCompleted(run, "screenshots", "Screenshots and OCR are ready.");
      await updateRunSummary(run, transcriptData.summary);
      await writeStageLog(run, "screenshots", [
        `status=completed`,
        `screenshots=${run.videoScreenshotsDir}`,
        `screen_ocr=${run.screenOcrPath}`
      ]);
      reporter?.finishStage(
        [
          "Screenshots and OCR are ready.",
          `Use ${run.videoScreenshotsDir} and ${run.screenOcrPath} to repair UI text, slide text, and unclear terms in ${run.transcriptPath}.`
        ].join("\n")
      );
    } catch (error) {
      await markStageFailed(run, "screenshots", error, "Screenshot or OCR enrichment failed.");
      const transcriptData = await buildTranscriptArtifacts(config, run);
      await updateRunSummary(run, transcriptData.summary);
      await writeStageLog(run, "screenshots", [
        `status=failed`,
        `error=${error.message}`
      ]);
      reporter?.failStage(`Screenshot stage failed: ${error.message}`);
    }
  } else {
    const reason = media.hasVideo ? "Screenshots were disabled by CLI option." : "Input has no video stream.";
    await markStageSkipped(run, "screenshots", reason);
    await writeStageLog(run, "screenshots", [`status=skipped`, `reason=${reason}`]);
    const transcriptData = await buildTranscriptArtifacts(config, run);
    await updateRunSummary(run, transcriptData.summary);
  }

  if (config.diarization === "off") {
    run.metadata.diarization = {
      status: "disabled",
      reason: "Diarization disabled by CLI option."
    };
    await markStageSkipped(run, "diarization", "Diarization is off.");
    await writeRunState(run);
    await writeStageLog(run, "diarization", ["status=skipped", "reason=Diarization is off."]);
    const transcriptData = await buildTranscriptArtifacts(config, run);
    await updateRunSummary(run, transcriptData.summary);
  } else {
    reporter?.startStage("Stage 3/3", "Running diarization", "This may take a while");
    await markStageStarted(run, "diarization", "Attempting speaker diarization.");
    try {
      await runSpeakerDiarization(config, run);
      const transcriptData = await buildTranscriptArtifacts(config, run);
      const diarizationStatus = run.metadata.diarization?.status || "skipped";
      if (diarizationStatus === "completed") {
        await markStageCompleted(run, "diarization", "Anonymous speaker turns are ready.");
        await writeStageLog(run, "diarization", [
          `status=completed`,
          `diarization=${run.diarizationPath}`
        ]);
        reporter?.finishStage(
          [
            "Diarization is ready.",
            `Use ${run.diarizationPath} to review anonymous speaker turns before making speaker-specific edits in ${run.transcriptPath}.`
          ].join("\n")
        );
      } else {
        await markStageSkipped(run, "diarization", run.metadata.diarization?.reason || "Diarization skipped.");
        await writeStageLog(run, "diarization", [
          `status=skipped`,
          `reason=${run.metadata.diarization?.reason || "Diarization skipped."}`
        ]);
        reporter?.finishStage(
          `Diarization was skipped: ${run.metadata.diarization?.reason || "No additional detail available."}`
        );
      }
      await updateRunSummary(run, transcriptData.summary);
    } catch (error) {
      run.metadata.diarization = {
        status: "failed",
        reason: error.message
      };
      await markStageFailed(run, "diarization", error, "Diarization failed after the main transcript was already created.");
      await writeRunState(run);
      const transcriptData = await buildTranscriptArtifacts(config, run);
      await updateRunSummary(run, transcriptData.summary);
      await writeStageLog(run, "diarization", [
        `status=failed`,
        `error=${error.message}`
      ]);
      reporter?.failStage(
        `Diarization failed, but the main transcript is still ready: ${error.message}`
      );
    }
  }

  reporter?.info(`Run state saved to ${run.runStatePath}`);
  return buildResult(run, run.metadata.summary);
}

function buildResult(run, summary) {
  return {
    ok: true,
    runDirectory: run.runDir,
    transcript: run.transcriptPath,
    runState: run.runStatePath,
    evidenceDirectory: run.evidenceDir,
    mediaHasVideo: run.metadata.media?.hasVideo || false,
    contextFiles: run.metadata.contextArtifacts?.length || 0,
    diarizationStatus: summary?.diarizationStatus || run.metadata.diarization?.status || "unknown",
    diarizedSpeakers: summary?.diarizedSpeakerCount || 0,
    appliedCorrections: summary?.appliedCorrectionCount || 0,
    lowConfidenceSegments: summary?.lowConfidenceCount || 0,
    screenshotStatus: run.stages.screenshots.status,
    transcriptStatus: run.stages.transcript.status
  };
}
