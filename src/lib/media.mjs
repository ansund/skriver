import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import {
  DEFAULT_DIARIZATION_MODEL,
  LOCAL_DIARIZATION_PYTHON,
  TOOL_ROOT
} from "./constants.mjs";
import { resolveToolCommand } from "./runtime.mjs";
import {
  cleanOcrText,
  detectScreenTopic,
  extractCandidateTerms,
  loadGlossary,
  runCommand
} from "./utils.mjs";

export async function probeMedia(inputPath) {
  const probe = await runCommand(resolveToolCommand("ffprobe"), [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type",
    "-of",
    "json",
    inputPath
  ]);
  const parsed = JSON.parse(probe.stdout || "{}");
  const streams = parsed.streams || [];
  return {
    durationSeconds: Number.parseFloat(parsed.format?.duration || "0"),
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    hasVideo: streams.some((stream) => stream.codec_type === "video")
  };
}

export async function extractAudio(config, run) {
  await runCommand(resolveToolCommand("ffmpeg"), [
    "-y",
    "-i",
    config.inputPath,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    "16000",
    run.audioPath
  ]);
  run.metadata.audioPath = run.audioPath;
}

export async function transcribeAudio(config, run) {
  const prompt = await buildInitialPrompt(config.glossaryPaths, run.metadata.notes, run.metadata.contextArtifacts || []);
  const args = [
    run.audioPath,
    "--model",
    config.whisperModel,
    "--output_dir",
    run.whisperDir,
    "--output_format",
    "all",
    "--word_timestamps",
    "True",
    "--verbose",
    "False",
    "--threads",
    `${config.threads}`
  ];

  if (config.language !== "auto") {
    args.push("--language", config.language);
  }

  if (prompt) {
    args.push("--initial_prompt", prompt);
  }

  await runCommand(resolveToolCommand("whisper"), args);

  for (const [extension, target] of [
    ["json", run.whisperJsonPath],
    ["srt", run.whisperSrtPath],
    ["txt", run.whisperTextPath],
    ["tsv", run.whisperTsvPath],
    ["vtt", run.whisperVttPath]
  ]) {
    const source = join(run.whisperDir, `audio_16k.${extension}`);
    if (source !== target) {
      await copyFile(source, target).catch(() => undefined);
    }
  }
}

export async function runSpeakerDiarization(config, run) {
  const outputPath = run.diarizationPath;

  if (config.diarization === "off") {
    run.metadata.diarization = {
      status: "disabled",
      reason: "Diarization disabled by CLI option.",
      outputPath
    };
    await writeFile(outputPath, JSON.stringify(run.metadata.diarization, null, 2), "utf8");
    return;
  }

  const python = await locateDiarizationPython();
  if (!python) {
    const reason = "No diarization Python environment found. Run `skriver setup` first.";

    run.metadata.diarization = {
      status: config.diarization === "on" ? "failed" : "skipped",
      reason,
      outputPath
    };
    await writeFile(outputPath, JSON.stringify(run.metadata.diarization, null, 2), "utf8");
    if (config.diarization === "on") {
      throw new Error(reason);
    }
    return;
  }

  const args = [
    join(TOOL_ROOT, "src", "pyannote_diarize.py"),
    "--audio",
    run.audioPath,
    "--output",
    outputPath,
    "--model-source",
    DEFAULT_DIARIZATION_MODEL
  ];

  if (Number.isFinite(config.numSpeakers)) {
    args.push("--num-speakers", `${config.numSpeakers}`);
  }
  if (Number.isFinite(config.minSpeakers)) {
    args.push("--min-speakers", `${config.minSpeakers}`);
  }
  if (Number.isFinite(config.maxSpeakers)) {
    args.push("--max-speakers", `${config.maxSpeakers}`);
  }

  try {
    await runCommand(python, args);
    const diarization = JSON.parse(await readFile(outputPath, "utf8"));
    run.metadata.diarization = {
      status: "completed",
      python,
      modelSource: diarization.modelSource,
      exclusive: diarization.usedExclusiveDiarization,
      speakerCount: diarization.speakerCount,
      outputPath
    };
  } catch (error) {
    if (config.diarization === "on") {
      throw error;
    }

    run.metadata.diarization = {
      status: "skipped",
      reason: error.message,
      python,
      outputPath
    };
    await writeFile(outputPath, JSON.stringify(run.metadata.diarization, null, 2), "utf8");
  }
}

export async function locateDiarizationPython() {
  const candidates = [
    process.env.SKRIVER_DIARIZATION_PYTHON,
    LOCAL_DIARIZATION_PYTHON,
    "python3.12",
    "python3.11"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await runCommand(candidate, ["--version"]);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function buildInitialPrompt(glossaryPaths, notes, contextArtifacts) {
  const glossary = await loadGlossary(glossaryPaths);
  const canonicalTerms = glossary.slice(0, 24).map((entry) => entry.canonical);
  const noteTerms = extractCandidateTerms((notes.untimedNotes || []).join(" "));
  const contextTerms = extractCandidateTerms(
    contextArtifacts
      .slice(0, 12)
      .map((artifact) => artifact.excerpt)
      .join(" ")
  );

  const uniqueTerms = [...new Set([...noteTerms, ...contextTerms, ...canonicalTerms])].slice(0, 40);
  if (uniqueTerms.length === 0) {
    return "";
  }

  return `Technical meeting vocabulary: ${uniqueTerms.join(", ")}. Prefer these exact spellings when relevant.`;
}

export async function extractScreenshots(config, run, durationSeconds) {
  const tempPattern = join(run.videoScreenshotsDir, "frame_%04d.jpg");
  await rm(run.videoScreenshotsDir, { recursive: true, force: true });
  await mkdir(run.videoScreenshotsDir, { recursive: true });
  await runCommand(resolveToolCommand("ffmpeg"), [
    "-y",
    "-i",
    config.inputPath,
    "-vf",
    `fps=1/${config.screenshotInterval}`,
    "-q:v",
    "2",
    tempPattern
  ]);
  run.metadata.screenshotEstimate = Math.ceil(durationSeconds / config.screenshotInterval);

  const extracted = (await readdir(run.videoScreenshotsDir))
    .filter((file) => file.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b));

  for (let index = 0; index < extracted.length; index += 1) {
    const seconds = index * config.screenshotInterval;
    const renamed = `${formatScreenshotTimestamp(seconds)}.jpg`;
    await rename(join(run.videoScreenshotsDir, extracted[index]), join(run.videoScreenshotsDir, renamed));
  }
}

export async function runVideoOcr(config, run) {
  const files = (await readdir(run.videoScreenshotsDir))
    .filter((file) => file.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b));

  const ocrRows = [["frame", "seconds", "topic", "text"]];

  for (const file of files) {
    const seconds = parseSecondsFromScreenshotName(file);
    const ocr = await runCommand(resolveToolCommand("tesseract"), [
      join(run.videoScreenshotsDir, file),
      "stdout",
      "-l",
      config.language === "sv" ? "swe+eng" : "eng+swe",
      "--psm",
      "6",
      "quiet"
    ]);
    const cleaned = cleanOcrText(ocr.stdout);
    const topic = detectScreenTopic(cleaned);
    ocrRows.push([file, `${seconds}`, topic, cleaned.replace(/\t/g, " ")]);
  }

  await writeFile(run.screenOcrPath, ocrRows.map((row) => row.join("\t")).join("\n"), "utf8");
}

function formatScreenshotTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = `${Math.floor(seconds / 3600)}`.padStart(2, "0");
  const minutes = `${Math.floor((seconds % 3600) / 60)}`.padStart(2, "0");
  const remainder = `${seconds % 60}`.padStart(2, "0");
  return `${hours}-${minutes}-${remainder}`;
}

function parseSecondsFromScreenshotName(fileName) {
  const match = fileName.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1], 10) * 3600 +
    Number.parseInt(match[2], 10) * 60 +
    Number.parseInt(match[3], 10);
}
