#!/usr/bin/env node
import { realpathSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGlossaryConfig,
  buildInspectConfig,
  buildTranscribeConfig,
  parseArgs,
  printHelp
} from "./lib/args.mjs";
import { TOOL_NAME } from "./lib/constants.mjs";
import { runDoctorCommand } from "./lib/doctor.mjs";
import { runGlossaryCommand } from "./lib/glossary-command.mjs";
import { runInspectCommand } from "./lib/inspect.mjs";
import { TOOL_VERSION } from "./lib/package-info.mjs";
import {
  assignSpeakersToSegments,
  buildSummaryDraft,
  classifySummaryText,
  renderTranscriptMarkdown,
  serializeSummaryDraft
} from "./lib/render.mjs";
import { createProgressReporter } from "./lib/progress.mjs";
import { runSetupCommand } from "./lib/setup.mjs";
import { runTranscribeCommand } from "./lib/transcribe.mjs";
import { formatTimestamp, parseOptionalPositiveInteger } from "./lib/utils.mjs";

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.version) {
      process.stdout.write(`${TOOL_NAME} ${TOOL_VERSION}\n`);
      return;
    }
    if (parsed.help || !parsed.command) {
      printHelp(parsed.command);
      process.exit(parsed.help ? 0 : 1);
    }

    switch (parsed.command) {
      case "transcribe": {
        const config = await buildTranscribeConfig(parsed.options);
        const reporter = createProgressReporter({ enabled: !config.json });
        const result = await runTranscribeCommand(config, reporter);
        reporter.stop();
        if (config.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          process.stdout.write(`${renderTranscribeResultText(result)}\n`);
        }
        return;
      }
      case "doctor": {
        const result = await runDoctorCommand(parsed.options);
        process.stdout.write(parsed.options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.text}\n`);
        return;
      }
      case "setup": {
        const result = await runSetupCommand(parsed.options);
        process.stdout.write(parsed.options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.text}\n`);
        return;
      }
      case "inspect": {
        const config = await buildInspectConfig(parsed.options);
        const result = await runInspectCommand(config);
        process.stdout.write(config.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.text}\n`);
        return;
      }
      case "glossary": {
        const config = await buildGlossaryConfig(parsed.options);
        const result = await runGlossaryCommand(config);
        process.stdout.write(config.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.text}\n`);
        return;
      }
      default:
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`${TOOL_NAME} failed: ${error.message}\n`);
    process.exit(1);
  }
}

function renderTranscribeResultText(result) {
  const lines = [];
  lines.push("Skriver run complete.");
  lines.push("");
  lines.push(`Transcript: ${result.transcript}`);
  lines.push(`Run state: ${result.runState}`);
  lines.push(`Evidence: ${result.evidenceDirectory}`);
  lines.push(`Transcript stage: ${result.transcriptStatus}`);
  lines.push(`Screenshot stage: ${result.screenshotStatus}`);
  lines.push(`Diarization: ${result.diarizationStatus}`);
  return lines.join("\n");
}

export const __test__ = {
  assignSpeakersToSegments,
  buildSummaryDraft,
  classifySummaryText,
  formatTimestamp,
  parseArgs,
  parseOptionalPositiveInteger,
  renderTranscriptMarkdown,
  serializeSummaryDraft
};

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
