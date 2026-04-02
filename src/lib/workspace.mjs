import { basename, extname, join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

import { TOOL_NAME } from "./constants.mjs";
import { TOOL_VERSION } from "./package-info.mjs";
import { linkOrCopy } from "./utils.mjs";

const STAGE_NAMES = ["transcript", "screenshots", "diarization"];

export async function createRunWorkspace(config) {
  const inputBaseName = basename(config.inputPath, extname(config.inputPath));
  const runDir = join(config.outputRoot, `${inputBaseName}-skriver`);
  const evidenceDir = join(runDir, "evidence");
  const audioDir = join(evidenceDir, "audio");
  const whisperDir = join(evidenceDir, "whisper");
  const videoScreenshotsDir = join(evidenceDir, "video-screenshots");
  const videoOcrDir = join(evidenceDir, "video-ocr");
  const diarizationDir = join(evidenceDir, "diarization");
  const contextDir = join(evidenceDir, "context");
  const logsDir = join(evidenceDir, "logs");
  const sourceDir = join(evidenceDir, "source");
  const transcriptFileName = `${inputBaseName}-transcript.md`;
  const transcriptPath = join(runDir, transcriptFileName);
  const runStatePath = join(runDir, "run.json");
  const managedDirs = [
    audioDir,
    whisperDir,
    videoScreenshotsDir,
    videoOcrDir,
    diarizationDir,
    contextDir,
    logsDir,
    sourceDir
  ];

  await mkdir(runDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });

  for (const dir of managedDirs) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }

  const run = {
    runDir,
    evidenceDir,
    audioDir,
    whisperDir,
    videoScreenshotsDir,
    videoOcrDir,
    diarizationDir,
    contextDir,
    logsDir,
    sourceDir,
    transcriptPath,
    transcriptFileName,
    runStatePath,
    sourceCopyPath: join(sourceDir, basename(config.inputPath)),
    audioPath: join(audioDir, "audio_16k.wav"),
    whisperJsonPath: join(whisperDir, "transcript.json"),
    whisperTextPath: join(whisperDir, "transcript.txt"),
    whisperSrtPath: join(whisperDir, "transcript.srt"),
    whisperTsvPath: join(whisperDir, "transcript.tsv"),
    whisperVttPath: join(whisperDir, "transcript.vtt"),
    summaryDraftPath: join(whisperDir, "summary_draft.json"),
    lowConfidenceSegmentsPath: join(whisperDir, "low_confidence_segments.json"),
    appliedCorrectionsPath: join(whisperDir, "applied_corrections.json"),
    screenNotesPath: join(videoOcrDir, "screen_notes.json"),
    screenOcrPath: join(videoOcrDir, "screen_ocr.tsv"),
    diarizationPath: join(diarizationDir, "speaker_diarization.json"),
    notesTextPath: join(contextDir, "notes.txt"),
    notesJsonPath: join(contextDir, "notes.json"),
    contextArtifactsPath: join(contextDir, "context_artifacts.json"),
    logPaths: {
      transcript: join(logsDir, "whisper.log"),
      screenshots: join(logsDir, "screenshots.log"),
      diarization: join(logsDir, "diarization.log")
    },
    metadata: {
      createdAt: new Date().toISOString(),
      title: config.title,
      inputPath: config.inputPath,
      inputBaseName,
      language: config.language,
      whisperModel: config.whisperModel,
      diarizationMode: config.diarization,
      numSpeakers: config.numSpeakers,
      minSpeakers: config.minSpeakers,
      maxSpeakers: config.maxSpeakers,
      screenshotIntervalSeconds: config.screenshotInterval,
      notesFile: config.notesFile,
      glossaryPaths: config.glossaryPaths,
      contextInputs: config.contextInputs,
      dryRun: config.dryRun,
      media: null,
      notes: {
        rawText: "",
        timedNotes: [],
        untimedNotes: []
      },
      contextArtifacts: [],
      diarization: {
        status: "pending",
        reason: null
      },
      summary: null
    },
    stages: Object.fromEntries(STAGE_NAMES.map((name) => [
      name,
      {
        status: "pending",
        startedAt: null,
        finishedAt: null,
        error: null,
        detail: null
      }
    ]))
  };

  await writeRunState(run);
  return run;
}

export async function saveSourceMedia(run, inputPath) {
  await linkOrCopy(inputPath, run.sourceCopyPath);
  await writeRunState(run);
  return run.sourceCopyPath;
}

export async function markStageStarted(run, stageName, detail = null) {
  const stage = ensureStage(run, stageName);
  stage.status = "running";
  stage.startedAt = new Date().toISOString();
  stage.finishedAt = null;
  stage.error = null;
  stage.detail = detail;
  await writeRunState(run);
}

export async function markStageCompleted(run, stageName, detail = null) {
  const stage = ensureStage(run, stageName);
  stage.status = "completed";
  stage.finishedAt = new Date().toISOString();
  stage.error = null;
  if (detail) {
    stage.detail = detail;
  }
  await writeRunState(run);
}

export async function markStageSkipped(run, stageName, detail) {
  const stage = ensureStage(run, stageName);
  stage.status = "skipped";
  stage.finishedAt = new Date().toISOString();
  stage.error = null;
  stage.detail = detail;
  await writeRunState(run);
}

export async function markStageFailed(run, stageName, error, detail = null) {
  const stage = ensureStage(run, stageName);
  stage.status = "failed";
  stage.finishedAt = new Date().toISOString();
  stage.error = error instanceof Error ? error.message : `${error}`;
  stage.detail = detail;
  await writeRunState(run);
}

export async function updateRunSummary(run, summary) {
  run.metadata.summary = summary;
  await writeRunState(run);
}

export async function writeStageLog(run, stageName, lines) {
  const logPath = run.logPaths[stageName];
  if (!logPath) {
    return;
  }

  const content = Array.isArray(lines) ? lines.join("\n") : `${lines}`;
  await writeFile(logPath, `${content.trim()}\n`, "utf8");
  await writeRunState(run);
}

export async function writeRunState(run) {
  await writeFile(run.runStatePath, `${JSON.stringify(serializeRunState(run), null, 2)}\n`, "utf8");
}

function ensureStage(run, stageName) {
  if (!run.stages[stageName]) {
    throw new Error(`Unknown stage: ${stageName}`);
  }
  return run.stages[stageName];
}

function serializeRunState(run) {
  return {
    schemaVersion: 1,
    tool: {
      name: TOOL_NAME,
      version: TOOL_VERSION
    },
    run: {
      createdAt: run.metadata.createdAt,
      title: run.metadata.title
    },
    input: {
      sourcePath: run.metadata.inputPath,
      media: run.metadata.media || null,
      language: run.metadata.language,
      whisperModel: run.metadata.whisperModel
    },
    output: {
      root: run.runDir,
      mainTranscript: run.transcriptPath,
      evidence: run.evidenceDir
    },
    options: {
      diarizationMode: run.metadata.diarizationMode,
      numSpeakers: run.metadata.numSpeakers,
      minSpeakers: run.metadata.minSpeakers,
      maxSpeakers: run.metadata.maxSpeakers,
      screenshotIntervalSeconds: run.metadata.screenshotIntervalSeconds,
      dryRun: run.metadata.dryRun
    },
    stages: run.stages,
    diarization: run.metadata.diarization,
    summary: run.metadata.summary,
    artifacts: {
      transcript: run.transcriptPath,
      notesText: run.notesTextPath,
      notesJson: run.notesJsonPath,
      contextArtifacts: run.contextArtifactsPath,
      audio: run.audioPath,
      whisperJson: run.whisperJsonPath,
      whisperText: run.whisperTextPath,
      whisperSrt: run.whisperSrtPath,
      whisperTsv: run.whisperTsvPath,
      whisperVtt: run.whisperVttPath,
      summaryDraft: run.summaryDraftPath,
      lowConfidenceSegments: run.lowConfidenceSegmentsPath,
      appliedCorrections: run.appliedCorrectionsPath,
      screenOcr: run.screenOcrPath,
      screenNotes: run.screenNotesPath,
      screenshots: run.videoScreenshotsDir,
      diarization: run.diarizationPath,
      sourceCopy: run.sourceCopyPath,
      logs: run.logPaths
    }
  };
}
