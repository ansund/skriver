import { dirname, join } from "node:path";
import process from "node:process";

import { LOCAL_DIARIZATION_PYTHON, TOOL_NAME } from "./constants.mjs";
import { inspectCommand, resolveToolCommand } from "./runtime.mjs";
import { TOOL_VERSION } from "./package-info.mjs";
import { locateDiarizationPython } from "./media.mjs";
import { getUserConfigPath, isDiarizationSetupReady, readUserConfig } from "./state.mjs";

const TOOL_CHECKS = [
  {
    id: "ffmpeg",
    required: true,
    args: ["-version"],
    summary: "Audio/video extraction"
  },
  {
    id: "ffprobe",
    required: true,
    args: ["-version"],
    summary: "Media probing"
  },
  {
    id: "whisper",
    required: true,
    args: ["--help"],
    summary: "Speech transcription"
  },
  {
    id: "tesseract",
    required: true,
    args: ["--version"],
    summary: "OCR for screenshots and images"
  },
  {
    id: "pdftotext",
    required: false,
    args: ["-v"],
    summary: "PDF context extraction"
  },
  {
    id: "textutil",
    required: false,
    args: ["-help"],
    summary: "macOS document extraction"
  },
  {
    id: "unzip",
    required: false,
    args: ["-v"],
    summary: "PPTX context extraction"
  }
];

function summarizeProbe(probe) {
  const output = [probe.stdout, probe.stderr].join("\n").trim();
  return output.split(/\r?\n/)[0] || null;
}

export async function runDoctorCommand({ json = false } = {}) {
  const checks = [];
  const userConfig = await readUserConfig();

  for (const tool of TOOL_CHECKS) {
    const command = resolveToolCommand(tool.id);
    const probe = await inspectCommand(command, tool.args);
    const available = probe.available && probe.code === 0;

    checks.push({
      id: tool.id,
      required: tool.required,
      command,
      ok: available,
      summary: tool.summary,
      detail: available ? summarizeProbe(probe) : (probe.error || summarizeProbe(probe))
    });
  }

  const diarizationPython = await locateDiarizationPython();
  const hfTokenSource = process.env.HF_TOKEN
    ? "HF_TOKEN"
    : process.env.HUGGINGFACE_TOKEN
      ? "HUGGINGFACE_TOKEN"
      : process.env.HUGGINGFACEHUB_API_TOKEN
        ? "HUGGINGFACEHUB_API_TOKEN"
        : null;
  const cachedHfAuth = diarizationPython
    ? await detectCachedHuggingFaceAuth(diarizationPython)
    : false;

  const requiredFailures = checks.filter((check) => check.required && !check.ok);
  const result = {
    ok: requiredFailures.length === 0,
    tool: {
      name: TOOL_NAME,
      version: TOOL_VERSION
    },
    environment: {
      node: process.version,
      platform: process.platform,
      diarizationPython: diarizationPython || null,
      localDiarizationPython: LOCAL_DIARIZATION_PYTHON,
      userConfigPath: getUserConfigPath(),
      diarizationSetupReady: isDiarizationSetupReady(userConfig),
      huggingFaceTokenSource: hfTokenSource,
      huggingFaceCachedAuth: cachedHfAuth
    },
    checks
  };

  if (json) {
    return result;
  }

  const lines = [];
  lines.push(`${TOOL_NAME} doctor`);
  lines.push("");
  lines.push(`Version: ${TOOL_VERSION}`);
  lines.push(`Node: ${process.version}`);
  lines.push(`Platform: ${process.platform}`);
  lines.push(`Config: ${getUserConfigPath()}`);
  lines.push(`Diarization setup ready: ${isDiarizationSetupReady(userConfig) ? "yes" : "no"}`);
  lines.push(`Diarization Python: ${diarizationPython || "not found"}`);
  lines.push(`HF token env: ${hfTokenSource || "not set"}`);
  lines.push(`HF cached auth: ${cachedHfAuth ? "available" : "not detected"}`);
  lines.push("");
  for (const check of checks) {
    lines.push(`- ${check.ok ? "OK" : "MISSING"} ${check.id}${check.required ? "" : " (optional)"}`);
    if (check.detail) {
      lines.push(`  ${check.detail}`);
    }
  }
  if (requiredFailures.length > 0) {
    lines.push("");
    lines.push("Base setup is incomplete. Install the missing required tools before running `skriver transcribe`.");
  }

  return {
    ...result,
    text: lines.join("\n")
  };
}

async function detectCachedHuggingFaceAuth(python) {
  const hfCli = join(dirname(python), process.platform === "win32" ? "hf.exe" : "hf");
  const cliProbe = await inspectCommand(hfCli, ["auth", "whoami"]);
  if (cliProbe.available && cliProbe.code === 0) {
    return true;
  }

  const probe = await inspectCommand(python, [
    "-c",
    "from huggingface_hub import HfFolder; print('cached' if HfFolder.get_token() else 'missing')"
  ]);

  return probe.available && probe.code === 0 && probe.stdout.includes("cached");
}
