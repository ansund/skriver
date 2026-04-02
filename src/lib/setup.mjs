import process from "node:process";
import { join } from "node:path";

import { DEFAULT_DIARIZATION_MODEL, TOOL_ROOT, TOOL_NAME } from "./constants.mjs";
import { runDoctorCommand } from "./doctor.mjs";
import { locateDiarizationPython } from "./media.mjs";
import { inspectCommand } from "./runtime.mjs";
import { getUserConfigPath, writeUserConfig } from "./state.mjs";
import { createTerminalUi } from "./terminal-ui.mjs";
import { runCommand } from "./utils.mjs";

const IMPORT_CHECK_SCRIPT = "from pyannote.audio import Pipeline; print('ok')";
const MODEL_CHECK_SCRIPT = `
import os
import sys
from pathlib import Path
from pyannote.audio import Pipeline

model_source = os.environ.get("SKRIVER_DIARIZATION_MODEL") or "${DEFAULT_DIARIZATION_MODEL}"
token = (
    os.environ.get("HF_TOKEN")
    or os.environ.get("HUGGINGFACE_TOKEN")
    or os.environ.get("HUGGINGFACEHUB_API_TOKEN")
)

try:
    if Path(model_source).exists():
        Pipeline.from_pretrained(model_source)
    else:
        kwargs = {"token": token} if token else {}
        Pipeline.from_pretrained(model_source, **kwargs)
except Exception as exc:
    print(str(exc))
    sys.exit(1)

print("ok")
`;

export async function runSetupCommand({ json = false } = {}) {
  const checkedAt = new Date().toISOString();
  const configPath = getUserConfigPath();
  const doctor = await runDoctorCommand({ json: true });
  const requiredFailures = doctor.checks.filter((check) => check.required && !check.ok);
  const setupScript = process.env.SKRIVER_SETUP_DIARIZATION_SCRIPT || join(TOOL_ROOT, "scripts", "setup-diarization.sh");

  const steps = [];
  let python = await locateDiarizationPython();
  let installAttempted = false;
  let installError = null;

  steps.push({
    id: "doctor",
    ok: requiredFailures.length === 0,
    detail: requiredFailures.length === 0
      ? "Base media dependencies look available."
      : `Missing required tools: ${requiredFailures.map((check) => check.id).join(", ")}.`
  });

  if (!python) {
    installAttempted = true;
    try {
      await runCommand("bash", [setupScript]);
      steps.push({
        id: "install",
        ok: true,
        detail: `Prepared diarization environment using ${setupScript}.`
      });
    } catch (error) {
      installError = error;
      steps.push({
        id: "install",
        ok: false,
        detail: error.message
      });
    }

    python = await locateDiarizationPython();
  } else {
    steps.push({
      id: "install",
      ok: true,
      detail: `Found existing diarization environment at ${python}.`
    });
  }

  let importCheck = null;
  let ready = false;
  let reason = null;

  if (!python) {
    reason = installError?.message || "Could not find a diarization Python environment after setup.";
  } else {
    importCheck = await inspectCommand(python, ["-c", IMPORT_CHECK_SCRIPT]);
    steps.push({
      id: "import",
      ok: importCheck.available && importCheck.code === 0,
      detail: summarizeProbe(importCheck, "pyannote.audio is importable.")
    });

    if (importCheck.available && importCheck.code === 0) {
      const modelCheck = await inspectCommand(python, ["-c", MODEL_CHECK_SCRIPT]);
      ready = modelCheck.available && modelCheck.code === 0;
      reason = ready ? null : summarizeProbe(
        modelCheck,
        "Could not verify diarization model access. Setup is not complete yet."
      );
      steps.push({
        id: "model",
        ok: ready,
        detail: ready
          ? `Verified diarization model access for ${DEFAULT_DIARIZATION_MODEL}.`
          : reason
      });
    } else {
      reason = summarizeProbe(importCheck, "pyannote.audio could not be imported.");
    }
  }

  await writeUserConfig({
    updatedAt: checkedAt,
    setup: {
      diarization: {
        ready,
        configuredAt: checkedAt,
        python: python || null,
        modelSource: DEFAULT_DIARIZATION_MODEL,
        reason
      }
    }
  });

  const result = {
    ok: ready,
    tool: {
      name: TOOL_NAME
    },
    checkedAt,
    configPath,
    doctorOk: doctor.ok,
    installAttempted,
    diarization: {
      ready,
      python: python || null,
      modelSource: DEFAULT_DIARIZATION_MODEL,
      reason
    },
    steps
  };

  if (json) {
    return result;
  }

  return {
    ...result,
    text: renderSetupText(result)
  };
}

function summarizeProbe(probe, fallback) {
  if (!probe) {
    return fallback;
  }

  const combined = [probe.stdout, probe.stderr, probe.error].filter(Boolean).join("\n").trim();
  return combined.split(/\r?\n/)[0] || fallback;
}

function renderSetupText(result) {
  const ui = createTerminalUi({ color: Boolean(process.stdout?.isTTY) });
  const lines = [];
  const stepLabels = {
    doctor: "Check local media tools",
    install: "Prepare diarization environment",
    import: "Verify pyannote import",
    model: "Verify diarization model access"
  };

  lines.push(ui.box(
    ui.bold(`${TOOL_NAME} setup wizard`),
    [
      "Prepare diarization so it can run by default on normal transcription runs.",
      ui.dim(`Config file: ${result.configPath}`)
    ]
  ));
  lines.push("");
  lines.push(ui.bold("Setup Steps"));
  lines.push("");

  for (let index = 0; index < result.steps.length; index += 1) {
    const step = result.steps[index];
    const label = stepLabels[step.id] || step.id;
    const pill = step.ok ? ui.statusPill("ok") : ui.statusPill("warn");
    lines.push(`${pill} ${index + 1}/${result.steps.length} ${label}`);
    lines.push(`      ${step.detail}`);
    lines.push("");
  }

  if (result.diarization.ready) {
    lines.push(ui.box(
      ui.green(ui.bold("Diarization Ready")),
      [
        "Skriver will now try diarization by default on normal runs.",
        `Python: ${result.diarization.python}`,
        `Model:  ${result.diarization.modelSource}`,
        "",
        "Next:",
        "  skriver filename.mp4",
        "  skriver filename.m4a"
      ]
    ));
  } else {
    lines.push(ui.box(
      ui.yellow(ui.bold("Setup Incomplete")),
      [
        "Diarization stays off by default until setup verifies the backend cleanly.",
        result.diarization.reason || "Setup could not verify the diarization backend yet.",
        "",
        "Skriver will still transcribe normally.",
        "Run `skriver setup` again after fixing the issue above."
      ]
    ));
  }

  return lines.join("\n");
}
