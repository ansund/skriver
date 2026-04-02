import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(toolRoot, "src", "cli.mjs");

async function writeShim(dir, name, jsBody) {
  const scriptPath = path.join(dir, name);
  await writeFile(scriptPath, `#!/usr/bin/env node\n${jsBody}\n`, {
    encoding: "utf8",
    mode: 0o755
  });
  await writeFile(
    path.join(dir, `${name}.cmd`),
    `@echo off\r\n"${process.execPath}" "%~dp0\\${name}" %*\r\n`,
    "utf8"
  );
}

function shimCommandPath(dir, name) {
  return path.join(dir, process.platform === "win32" ? `${name}.cmd` : name);
}

async function runCli(command, args, options = {}) {
  return await execFileAsync(process.execPath, [cliPath, command, ...args], {
    cwd: toolRoot,
    env: {
      ...process.env,
      ...options.env
    }
  });
}

async function runCliArgs(args, options = {}) {
  return await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: toolRoot,
    env: {
      ...process.env,
      ...options.env
    }
  });
}

function buildToolEnv(shimsDir) {
  return {
    SKRIVER_FFMPEG_COMMAND: shimCommandPath(shimsDir, "ffmpeg"),
    SKRIVER_FFPROBE_COMMAND: shimCommandPath(shimsDir, "ffprobe"),
    SKRIVER_WHISPER_COMMAND: shimCommandPath(shimsDir, "whisper"),
    SKRIVER_TESSERACT_COMMAND: shimCommandPath(shimsDir, "tesseract"),
    SKRIVER_PDFTOTEXT_COMMAND: shimCommandPath(shimsDir, "pdftotext"),
    SKRIVER_TEXTUTIL_COMMAND: shimCommandPath(shimsDir, "textutil"),
    SKRIVER_UNZIP_COMMAND: shimCommandPath(shimsDir, "unzip")
  };
}

async function writeCommonShims(shimsDir) {
  await mkdir(shimsDir, { recursive: true });

  await writeShim(
    shimsDir,
    "ffprobe",
    `
const payload = process.env.SKRIVER_TEST_MEDIA_JSON || JSON.stringify({
  streams: [{ index: 0, codec_type: "audio" }],
  format: { duration: "12.0" }
});
process.stdout.write(payload);
`
  );

  await writeShim(
    shimsDir,
    "ffmpeg",
    `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("-version")) {
  process.stdout.write("ffmpeg version test\\n");
  process.exit(0);
}
const lastArg = args.at(-1);
if (args.includes("-vf")) {
  fs.mkdirSync(path.dirname(lastArg), { recursive: true });
  fs.writeFileSync(lastArg.replace("%04d", "0001"), "frame1");
  fs.writeFileSync(lastArg.replace("%04d", "0002"), "frame2");
} else {
  fs.mkdirSync(path.dirname(lastArg), { recursive: true });
  fs.writeFileSync(lastArg, "fake wav");
}
`
  );

  await writeShim(
    shimsDir,
    "whisper",
    `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--help") || !args.includes("--output_dir")) {
  process.stdout.write("whisper help\\n");
  process.exit(0);
}
const audio = args[0];
let outDir = "";
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === "--output_dir") {
    outDir = args[i + 1];
    i += 1;
  }
}
fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(audio, ".wav");
fs.writeFileSync(path.join(outDir, base + ".json"), JSON.stringify({
  language: "sv",
  segments: [
    {
      start: 0.0,
      end: 3.0,
      text: " skriver platform målet är att hjälpa hub spot och Ekobanken.",
      avg_logprob: -0.2,
      words: [{ word: "skriver", probability: 0.91 }]
    },
    {
      start: 3.0,
      end: 6.0,
      text: " vi ska boka ett uppföljningsmöte nästa vecka.",
      avg_logprob: -0.2,
      words: [{ word: "boka", probability: 0.88 }]
    },
    {
      start: 6.0,
      end: 9.0,
      text: " hur ska vi beskriva Skriver på hemsidan?",
      avg_logprob: -0.2,
      words: [{ word: "hur", probability: 0.9 }]
    },
    {
      start: 9.0,
      end: 12.0,
      text: " den här delen är osäker.",
      avg_logprob: -1.1,
      words: [{ word: "osäker", probability: 0.1 }]
    }
  ]
}, null, 2));
fs.writeFileSync(path.join(outDir, base + ".txt"), "text output\\n");
fs.writeFileSync(path.join(outDir, base + ".srt"), "1\\n00:00:00,000 --> 00:00:03,000\\nSkriver\\n");
fs.writeFileSync(path.join(outDir, base + ".vtt"), "WEBVTT\\n\\n00:00:00.000 --> 00:00:03.000\\nSkriver\\n");
fs.writeFileSync(path.join(outDir, base + ".tsv"), "start\\tend\\ttext\\n0\\t3\\tSkriver\\n");
`
  );

  await writeShim(
    shimsDir,
    "tesseract",
    `
const input = process.argv[2] || "";
if (input.includes("frame_0001.jpg") || input.includes("00-00-00.jpg")) {
  process.stdout.write("HubSpot dashboard Skriver launch plan");
} else {
  process.stdout.write("Microsoft Teams");
}
`
  );

  await writeShim(
    shimsDir,
    "pdftotext",
    `
process.stdout.write("PDF context");
`
  );

  await writeShim(
    shimsDir,
    "textutil",
    `
process.stdout.write("Converted text");
`
  );

  await writeShim(
    shimsDir,
    "unzip",
    `
process.stdout.write("");
`
  );

  await writeShim(
    shimsDir,
    "fake-python",
    `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("Python 3.12.0\\n");
  process.exit(0);
}
if (args[0] === "-c") {
  process.stdout.write("ok\\n");
  process.exit(0);
}
let output = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--output") {
    output = args[i + 1];
    i += 1;
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({
  modelSource: "pyannote/speaker-diarization-community-1",
  usedExclusiveDiarization: true,
  speakerCount: 2,
  segments: [
    { start: 0.0, end: 3.0, speaker: "SPEAKER_00" },
    { start: 3.0, end: 6.0, speaker: "SPEAKER_01" },
    { start: 6.0, end: 9.0, speaker: "SPEAKER_00" },
    { start: 9.0, end: 12.0, speaker: "SPEAKER_01" }
  ],
  exclusiveSegments: [
    { start: 0.0, end: 3.0, speaker: "SPEAKER_00" },
    { start: 3.0, end: 6.0, speaker: "SPEAKER_01" },
    { start: 6.0, end: 9.0, speaker: "SPEAKER_00" },
    { start: 9.0, end: 12.0, speaker: "SPEAKER_01" }
  ]
}, null, 2));
`
  );
}

test("dry-run e2e builds transcript, manifest, and summary placeholder", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skriver-dry-"));
  const inputPath = path.join(tempRoot, "meeting.m4a");
  const outputRoot = path.join(tempRoot, "out");
  const shimsDir = path.join(tempRoot, "shims");
  await writeFile(inputPath, "placeholder audio");
  await writeCommonShims(shimsDir);

  const { stdout } = await runCli("transcribe", [
    "--input",
    inputPath,
    "--title",
    "Dry run meeting",
    "--language",
    "sv",
    "--diarization",
    "off",
    "--screenshots",
    "off",
    "--dry-run",
    "--output-root",
    outputRoot,
    "--json"
  ], {
    env: {
      ...buildToolEnv(shimsDir)
    }
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.diarizationStatus, "skipped");
  assert.ok(parsed.runState.endsWith("run.json"));
  assert.ok(parsed.transcript.endsWith("-transcript.md"));

  const transcript = await readFile(parsed.transcript, "utf8");
  const summaryDraft = JSON.parse(await readFile(path.join(parsed.evidenceDirectory, "whisper", "summary_draft.json"), "utf8"));
  const runState = JSON.parse(await readFile(parsed.runState, "utf8"));

  assert.match(transcript, /Auto-generated draft is unavailable in dry-run mode\./);
  assert.deepEqual(summaryDraft.overview, ["Auto-generated draft is unavailable in dry-run mode."]);
  assert.equal(runState.summary.diarizationStatus, "skipped");
  assert.equal(runState.stages.transcript.status, "completed");
  assert.equal(runState.stages.screenshots.status, "skipped");
  assert.equal(runState.stages.diarization.status, "skipped");
});

test("mocked full e2e run merges transcript, manifest, context, screens, glossary, and diarization", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skriver-e2e-"));
  const shimsDir = path.join(tempRoot, "shims");
  const outputRoot = path.join(tempRoot, "out");
  const inputPath = path.join(tempRoot, "meeting.mp4");
  const notesPath = path.join(tempRoot, "notes.txt");
  const contextPath = path.join(tempRoot, "05-30-context.txt");

  await writeCommonShims(shimsDir);
  await writeFile(inputPath, "placeholder video");
  await writeFile(notesPath, "Initial Skriver meeting\n[00:00:04] Key decision point.");
  await writeFile(contextPath, "Ekobanken workshop at Bjornbacka with AI Fusion planning.");

  const { stdout } = await runCli("transcribe", [
    "--input",
    inputPath,
    "--title",
    "Skriver product review",
    "--language",
    "sv",
    "--diarization",
    "on",
    "--num-speakers",
    "2",
    "--screenshots",
    "on",
    "--screenshot-interval",
    "10",
    "--notes-file",
    notesPath,
    "--context",
    contextPath,
    "--output-root",
    outputRoot,
    "--json"
  ], {
    env: {
      ...buildToolEnv(shimsDir),
      SKRIVER_DIARIZATION_PYTHON: shimCommandPath(shimsDir, "fake-python"),
      SKRIVER_TEST_MEDIA_JSON: JSON.stringify({
        streams: [
          { index: 0, codec_type: "audio" },
          { index: 1, codec_type: "video" }
        ],
        format: { duration: "12.0" }
      })
    }
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.diarizationStatus, "completed");
  assert.equal(parsed.diarizedSpeakers, 2);
  assert.equal(parsed.screenshotStatus, "completed");

  const runDir = parsed.runDirectory;
  const transcript = await readFile(parsed.transcript, "utf8");
  const runState = JSON.parse(await readFile(parsed.runState, "utf8"));
  const summaryDraft = JSON.parse(await readFile(runState.artifacts.summaryDraft, "utf8"));
  const diarization = JSON.parse(await readFile(runState.artifacts.diarization, "utf8"));

  assert.match(transcript, /## Summary/);
  assert.match(transcript, /## Key Insights/);
  assert.match(transcript, /## Actions \/ TODOs/);
  assert.match(transcript, /## Open Questions/);
  assert.match(transcript, /## Context Files/);
  assert.match(transcript, /## Speaker Labels/);
  assert.match(transcript, /Speaker 1 = SPEAKER_00/);
  assert.match(transcript, /Speaker 2 = SPEAKER_01/);
  assert.match(transcript, /\[00:00:00\] \[Screen\] HubSpot reporting or dashboard view\./);
  assert.match(transcript, /\[00:00:04\] \[User note\] Key decision point\./);
  assert.match(transcript, /Corrected likely technical terms: "skriver platform" -> "Skriver", "hub spot" -> "HubSpot"\./);
  assert.match(transcript, /\[00:00:00\] Speaker 1: Skriver målet är att hjälpa HubSpot och Ekobanken\./);
  assert.match(transcript, /\[00:00:03\] Speaker 2: vi ska boka ett uppföljningsmöte nästa vecka\./i);
  assert.match(transcript, /\[00:00:06\] Speaker 1: hur ska vi beskriva Skriver på hemsidan\?/i);
  assert.match(transcript, /\[00:00:09\] \[Transcriber note\] Low ASR confidence\./);
  assert.match(transcript, /run\.json/);
  assert.match(transcript, /evidence\/video-ocr\/screen_ocr\.tsv/);
  assert.match(transcript, /05-30-context\.txt/);

  assert.equal(runState.diarization.status, "completed");
  assert.equal(runState.diarization.speakerCount, 2);
  assert.equal(diarization.speakerCount, 2);
  assert.equal(runState.summary.diarizationStatus, "completed");
  assert.equal(runState.summary.contextFileCount, 1);
  assert.equal(runState.stages.transcript.status, "completed");
  assert.equal(runState.stages.screenshots.status, "completed");
  assert.equal(runState.stages.diarization.status, "completed");
  assert.ok(summaryDraft.keyInsights.length >= 1);
  assert.ok(summaryDraft.actions.some((item) => item.categories.includes("action")));
  assert.ok(summaryDraft.openQuestions.some((item) => item.categories.includes("question")));

  await stat(runState.artifacts.screenOcr);
  await stat(runState.artifacts.contextArtifacts);
  assert.equal(path.basename(runDir), "meeting-skriver");
});

test("inspect command summarizes a completed run", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skriver-inspect-"));
  const shimsDir = path.join(tempRoot, "shims");
  const outputRoot = path.join(tempRoot, "out");
  const inputPath = path.join(tempRoot, "meeting.m4a");

  await writeCommonShims(shimsDir);
  await writeFile(inputPath, "placeholder audio");

  const transcribe = await runCli("transcribe", [
    "--input",
    inputPath,
    "--title",
    "Inspect target",
    "--language",
    "sv",
    "--diarization",
    "off",
    "--screenshots",
    "off",
    "--output-root",
    outputRoot,
    "--json"
  ], {
    env: {
      ...buildToolEnv(shimsDir)
    }
  });

  const runDir = JSON.parse(transcribe.stdout.trim()).runDirectory;
  const inspect = await runCli("inspect", [runDir, "--json"]);
  const parsed = JSON.parse(inspect.stdout.trim());

  assert.equal(parsed.ok, true);
  assert.equal(parsed.runDirectory, runDir);
  assert.ok(parsed.suggestedArtifacts.some((item) => item.endsWith("summary_draft.json")));
  assert.ok(parsed.nextSteps.some((step) => step.includes("Read")));
});

test("setup marks diarization ready and file-first invocation uses it by default", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skriver-setup-"));
  const shimsDir = path.join(tempRoot, "shims");
  const outputRoot = path.join(tempRoot, "out");
  const configHome = path.join(tempRoot, "config");
  const inputPath = path.join(tempRoot, "meeting.mp4");

  await writeCommonShims(shimsDir);
  await writeFile(inputPath, "placeholder video");

  const sharedEnv = {
    ...buildToolEnv(shimsDir),
    SKRIVER_DIARIZATION_PYTHON: shimCommandPath(shimsDir, "fake-python"),
    SKRIVER_CONFIG_HOME: configHome,
    SKRIVER_TEST_MEDIA_JSON: JSON.stringify({
      streams: [
        { index: 0, codec_type: "audio" },
        { index: 1, codec_type: "video" }
      ],
      format: { duration: "12.0" }
    })
  };

  const beforeSetup = await runCliArgs([
    inputPath,
    "--title",
    "Before setup",
    "--screenshots",
    "off",
    "--output-root",
    outputRoot,
    "--json"
  ], {
    env: sharedEnv
  });

  const beforeParsed = JSON.parse(beforeSetup.stdout.trim());
  assert.equal(beforeParsed.diarizationStatus, "disabled");

  const setup = await runCli("setup", ["--json"], {
    env: sharedEnv
  });
  const setupParsed = JSON.parse(setup.stdout.trim());
  assert.equal(setupParsed.ok, true);
  assert.equal(setupParsed.diarization.ready, true);

  const storedConfig = JSON.parse(await readFile(path.join(configHome, "config.json"), "utf8"));
  assert.equal(storedConfig.setup.diarization.ready, true);

  const afterSetup = await runCliArgs([
    inputPath,
    "--title",
    "After setup",
    "--screenshots",
    "off",
    "--output-root",
    outputRoot,
    "--json"
  ], {
    env: sharedEnv
  });

  const afterParsed = JSON.parse(afterSetup.stdout.trim());
  assert.equal(afterParsed.diarizationStatus, "completed");
  assert.equal(afterParsed.diarizedSpeakers, 2);
});

test("installed global binary boots through the package bin entry", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skriver-bin-"));
  const prefix = path.join(tempRoot, "prefix");

  await execFileAsync("npm", ["install", "-g", ".", "--prefix", prefix], {
    cwd: toolRoot,
    env: process.env
  });

  const installedBin = path.join(prefix, "bin", "skriver");
  const { stdout } = await execFileAsync(installedBin, ["--help"], {
    cwd: toolRoot,
    env: process.env
  });

  assert.match(stdout, /skriver/);
  assert.match(stdout, /<audio-or-video-file>/);
});

test("doctor command reports tool availability via env overrides", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skriver-doctor-"));
  const shimsDir = path.join(tempRoot, "shims");
  const configHome = path.join(tempRoot, "config");
  await writeCommonShims(shimsDir);

  const { stdout } = await runCli("doctor", ["--json"], {
    env: {
      ...buildToolEnv(shimsDir),
      SKRIVER_DIARIZATION_PYTHON: shimCommandPath(shimsDir, "fake-python"),
      SKRIVER_CONFIG_HOME: configHome,
      HF_TOKEN: "hf_test_token"
    }
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.environment.huggingFaceTokenSource, "HF_TOKEN");
  assert.equal(parsed.environment.diarizationSetupReady, false);
  assert.ok(parsed.checks.find((check) => check.id === "ffmpeg").ok);
  assert.ok(parsed.checks.find((check) => check.id === "whisper").ok);
});

test("glossary check applies canonical corrections", async () => {
  const { stdout } = await runCli("glossary", [
    "check",
    "--text",
    "skriver platform for hub spot",
    "--json"
  ]);

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.ok, true);
  assert.match(parsed.correctedText, /Skriver/);
  assert.match(parsed.correctedText, /HubSpot/);
  assert.ok(parsed.corrections.length >= 2);
});
