import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
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
  const audioPath = join(run.mediaDir, "audio_16k.wav");
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
    audioPath
  ]);
  run.metadata.audioPath = audioPath;
}

export async function transcribeAudio(config, run) {
  const audioPath = join(run.mediaDir, "audio_16k.wav");
  const prompt = await buildInitialPrompt(config.glossaryPaths, run.metadata.notes, run.metadata.contextArtifacts || []);
  const args = [
    audioPath,
    "--model",
    config.whisperModel,
    "--output_dir",
    run.rawDir,
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

  for (const extension of ["json", "srt", "txt", "tsv", "vtt"]) {
    const source = join(run.rawDir, `audio_16k.${extension}`);
    const target = join(run.runDir, `transcript.${extension}`);
    await copyFile(source, target).catch(() => undefined);
  }
}

export async function runSpeakerDiarization(config, run) {
  const outputPath = join(run.runDir, "speaker_diarization.json");

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
    const reason = "No diarization Python environment found. Run `pnpm setup-diarization` first.";
    if (config.diarization === "on") {
      throw new Error(reason);
    }

    run.metadata.diarization = {
      status: "skipped",
      reason,
      outputPath
    };
    await writeFile(outputPath, JSON.stringify(run.metadata.diarization, null, 2), "utf8");
    return;
  }

  const args = [
    join(TOOL_ROOT, "src", "pyannote_diarize.py"),
    "--audio",
    join(run.mediaDir, "audio_16k.wav"),
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
  const framesPattern = join(run.screensDir, "frame_%04d.jpg");
  await runCommand(resolveToolCommand("ffmpeg"), [
    "-y",
    "-i",
    config.inputPath,
    "-vf",
    `fps=1/${config.screenshotInterval}`,
    "-q:v",
    "2",
    framesPattern
  ]);
  run.metadata.screenshotEstimate = Math.ceil(durationSeconds / config.screenshotInterval);
}

export async function runVideoOcr(config, run) {
  const files = (await readdir(run.screensDir))
    .filter((file) => file.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b));

  const ocrRows = [["frame", "seconds", "topic", "text"]];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const seconds = index * run.metadata.screenshotIntervalSeconds;
    const ocr = await runCommand(resolveToolCommand("tesseract"), [
      join(run.screensDir, file),
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

  await writeFile(join(run.runDir, "screen_ocr.tsv"), ocrRows.map((row) => row.join("\t")).join("\n"), "utf8");
}
