import process from "node:process";
import { join } from "node:path";

import {
  DEFAULT_DIARIZATION_MODEL,
  LOCAL_DIARIZATION_PYTHON,
  TOOL_ROOT,
  TOOL_NAME
} from "./constants.mjs";
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
  let pythonSource = classifyDiarizationPython(python);
  let installAttempted = false;
  let installError = null;

  steps.push({
    id: "doctor",
    ok: requiredFailures.length === 0,
    detail: requiredFailures.length === 0
      ? "Base media dependencies look available."
      : `Missing required tools: ${requiredFailures.map((check) => check.id).join(", ")}.`
  });

  if (!python || pythonSource === "system") {
    installAttempted = true;
    try {
      await runCommand("bash", [setupScript]);
      python = await locateDiarizationPython();
      pythonSource = classifyDiarizationPython(python);
      steps.push({
        id: "install",
        ok: true,
        detail: describeInstallSuccess({
          python,
          pythonSource,
          setupScript
        })
      });
    } catch (error) {
      installError = error;
      steps.push({
        id: "install",
        ok: false,
        detail: summarizeErrorMessage(error.message, "Could not prepare the diarization environment.")
      });
    }
  } else {
    steps.push({
      id: "install",
      ok: true,
      detail: describeExistingPython({ python, pythonSource })
    });
  }

  let importCheck = null;
  let modelCheck = null;
  let ready = false;
  let reason = null;
  let issueCode = null;

  if (!python) {
    issueCode = installError ? "install-failed" : "missing-python";
    reason = installError?.message || "Could not find a diarization Python environment after setup.";
  } else {
    importCheck = await inspectCommand(python, ["-c", IMPORT_CHECK_SCRIPT]);
    steps.push({
      id: "import",
      ok: importCheck.available && importCheck.code === 0,
      detail: summarizeProbe(importCheck, "pyannote.audio is importable.")
    });

    if (importCheck.available && importCheck.code === 0) {
      modelCheck = await inspectCommand(python, ["-c", MODEL_CHECK_SCRIPT]);
      ready = modelCheck.available && modelCheck.code === 0;
      issueCode = ready ? null : classifyModelIssue(modelCheck);
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
      issueCode = classifyImportIssue(importCheck);
      reason = summarizeProbe(importCheck, "pyannote.audio could not be imported.");
    }
  }

  const fixes = buildFixSuggestions({
    issueCode,
    python,
    pythonSource,
    setupScript
  });

  await writeUserConfig({
    updatedAt: checkedAt,
    setup: {
      diarization: {
        ready,
        configuredAt: checkedAt,
        python: python || null,
        modelSource: DEFAULT_DIARIZATION_MODEL,
        reason,
        fixes
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
      pythonSource,
      modelSource: DEFAULT_DIARIZATION_MODEL,
      issueCode,
      reason,
      fixes
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

  const lines = [probe.stdout, probe.stderr, probe.error]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const actionable = lines.filter((line) => !isNoiseLine(line));
  const prioritized = actionable.find((line) => ACTIONABLE_ERROR_PATTERNS.some((pattern) => pattern.test(line)));
  return prioritized || actionable.at(-1) || fallback;
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
    const helpLines = [
      "Diarization stays off by default until setup verifies the backend cleanly.",
      "",
      `What failed: ${result.diarization.reason || "Setup could not verify the diarization backend yet."}`
    ];

    if (result.diarization.fixes.length > 0) {
      helpLines.push("");
      helpLines.push("How to fix it:");
      for (const fix of result.diarization.fixes) {
        helpLines.push(`  - ${fix}`);
      }
    }

    helpLines.push("");
    helpLines.push("Skriver will still transcribe normally.");
    helpLines.push("Run `skriver setup` again after applying the fix above.");

    lines.push(ui.box(
      ui.yellow(ui.bold("Setup Incomplete")),
      helpLines
    ));
  }

  return lines.join("\n");
}

function classifyDiarizationPython(python) {
  if (!python) {
    return "missing";
  }

  if (process.env.SKRIVER_DIARIZATION_PYTHON && python === process.env.SKRIVER_DIARIZATION_PYTHON) {
    return "override";
  }

  if (python === LOCAL_DIARIZATION_PYTHON) {
    return "local";
  }

  return "system";
}

function describeExistingPython({ python, pythonSource }) {
  switch (pythonSource) {
    case "override":
      return `Using diarization Python from SKRIVER_DIARIZATION_PYTHON: ${python}.`;
    case "local":
      return `Found local Skriver diarization environment at ${python}.`;
    default:
      return `Found Python interpreter at ${python}. Skriver will try to prepare a local diarization environment.`;
  }
}

function describeInstallSuccess({ python, pythonSource, setupScript }) {
  if (pythonSource === "local") {
    return `Prepared local Skriver diarization environment at ${python} using ${setupScript}.`;
  }

  if (python) {
    return `Prepared diarization dependencies using ${setupScript}. Active Python: ${python}.`;
  }

  return `Ran ${setupScript}, but Skriver could not confirm the diarization Python afterwards.`;
}

function classifyImportIssue(probe) {
  const summary = summarizeProbe(probe, "");
  if (/ModuleNotFoundError:.*pyannote|No module named ['"]pyannote/i.test(summary)) {
    return "missing-pyannote";
  }
  return "import-failed";
}

function classifyModelIssue(probe) {
  const summary = summarizeProbe(probe, "");
  if (/(HF_TOKEN|HUGGINGFACE_TOKEN|token|gated|401|403|accept|terms|hugging ?face)/i.test(summary)) {
    return "model-auth";
  }
  return "model-check-failed";
}

function buildFixSuggestions({ issueCode, python, pythonSource, setupScript }) {
  switch (issueCode) {
    case "missing-python":
      return [
        "Install Python 3.12 or 3.11, then run `skriver setup` again.",
        "If Python is installed in a custom location, set `SKRIVER_DIARIZATION_BOOTSTRAP_PYTHON` before running setup."
      ];
    case "install-failed":
      return [
        `Run \`bash ${setupScript}\` directly to inspect the full install error.`,
        "Then run `skriver setup` again."
      ];
    case "missing-pyannote":
      if (pythonSource === "override") {
        return [
          `The configured diarization Python (${python}) does not have \`pyannote.audio\` installed.`,
          "Install the diarization dependencies into that environment, or unset `SKRIVER_DIARIZATION_PYTHON` and run `skriver setup` again so Skriver can manage its own local environment."
        ];
      }

      if (pythonSource === "local") {
        return [
          `The local Skriver diarization environment at ${python} is incomplete.`,
          `Rebuild it with \`bash ${setupScript}\`, then run \`skriver setup\` again.`
        ];
      }

      return [
        `Skriver found Python at ${python}, but \`pyannote.audio\` is not installed there.`,
        `Run \`bash ${setupScript}\` to create Skriver's managed local diarization environment, then run \`skriver setup\` again.`
      ];
    case "model-auth":
      return [
        `Accept the Hugging Face model terms for \`${DEFAULT_DIARIZATION_MODEL}\`.`,
        "Set `HF_TOKEN` or `HUGGINGFACE_TOKEN` in your shell before running `skriver setup` again."
      ];
    case "model-check-failed":
      return [
        "Verify network access and model availability, then run `skriver setup` again.",
        `If the problem persists, run \`bash ${setupScript}\` to refresh the local diarization environment.`
      ];
    case "import-failed":
      return [
        `Inspect the Python environment at ${python} for import errors, then run \`skriver setup\` again.`,
        `If you want Skriver to manage diarization itself, run \`bash ${setupScript}\` and retry setup.`
      ];
    default:
      return [];
  }
}

function summarizeErrorMessage(message, fallback) {
  const summary = (message || "").trim().split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return summary || fallback;
}

function isNoiseLine(line) {
  return TRACEBACK_NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

const TRACEBACK_NOISE_PATTERNS = [
  /^Traceback \(most recent call last\):$/,
  /^File ".*", line \d+, in .*$/,
  /^\^+$/
];

const ACTIONABLE_ERROR_PATTERNS = [
  /ModuleNotFoundError:/i,
  /ImportError:/i,
  /No module named/i,
  /PermissionError:/i,
  /401\b/,
  /403\b/,
  /token/i,
  /hugging ?face/i,
  /accept/i,
  /terms/i,
  /gated/i,
  /RepositoryNotFoundError/i,
  /ConnectionError/i,
  /Could not/i
];

export const __test__ = {
  buildFixSuggestions,
  classifyDiarizationPython,
  classifyImportIssue,
  classifyModelIssue,
  renderSetupText,
  summarizeProbe
};
