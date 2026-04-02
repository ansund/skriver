import { basename, dirname, extname, join, resolve } from "node:path";
import { stat } from "node:fs/promises";
import os from "node:os";

import { DEFAULT_GLOSSARY, TOOL_NAME } from "./constants.mjs";
import {
  getConfiguredGlossaryPaths,
  getDefaultDiarizationMode,
  readUserConfig
} from "./state.mjs";
import { parseOptionalPositiveInteger } from "./utils.mjs";

export function parseArgs(argv) {
  if (argv.length === 0) {
    return { help: true, command: null, options: {} };
  }

  if (argv[0] === "--version" || argv[0] === "-v") {
    return { version: true, help: false, command: null, options: {} };
  }

  if (argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    return { help: true, command: argv[1] || null, options: {} };
  }

  const command = argv[0];
  const rest = argv.slice(1);

  switch (command) {
    case "transcribe":
      return parseTranscribeArgs(command, rest);
    case "setup":
      return parseSetupArgs(command, rest);
    case "doctor":
      return parseDoctorArgs(command, rest);
    case "inspect":
      return parseInspectArgs(command, rest);
    case "glossary":
      return parseGlossaryArgs(command, rest);
    default:
      if (!command.startsWith("-")) {
        return parseTranscribeArgs("transcribe", ["--input", command, ...rest]);
      }
      return { help: true, command, options: {} };
  }
}

function parseTranscribeArgs(command, argv) {
  const options = { contexts: [], json: false, verbose: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true, command, options };
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case "--input":
        options.input = next;
        i += 1;
        break;
      case "--title":
        options.title = next;
        i += 1;
        break;
      case "--language":
        options.language = next;
        i += 1;
        break;
      case "--notes-file":
        options.notesFile = next;
        i += 1;
        break;
      case "--context":
        options.contexts.push(next);
        i += 1;
        break;
      case "--glossary":
        options.glossary = next;
        i += 1;
        break;
      case "--screenshot-interval":
        options.screenshotInterval = next;
        i += 1;
        break;
      case "--screenshots":
        options.screenshots = next;
        i += 1;
        break;
      case "--whisper-model":
        options.whisperModel = next;
        i += 1;
        break;
      case "--diarization":
        options.diarization = next;
        i += 1;
        break;
      case "--num-speakers":
        options.numSpeakers = next;
        i += 1;
        break;
      case "--min-speakers":
        options.minSpeakers = next;
        i += 1;
        break;
      case "--max-speakers":
        options.maxSpeakers = next;
        i += 1;
        break;
      case "--threads":
        options.threads = next;
        i += 1;
        break;
      case "--output-root":
        options.outputRoot = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { help: false, command, options };
}

function parseDoctorArgs(command, argv) {
  const options = { json: false, verbose: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      return { help: true, command, options };
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, command, options };
}

function parseSetupArgs(command, argv) {
  const options = { json: false, verbose: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      return { help: true, command, options };
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, command, options };
}

function parseInspectArgs(command, argv) {
  const options = { json: false, verbose: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true, command, options };
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (!options.runDir) {
      options.runDir = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, command, options };
}

function parseGlossaryArgs(command, argv) {
  const options = { action: "list", json: false, verbose: false };
  let startIndex = 0;

  if (argv[0] && !argv[0].startsWith("-")) {
    options.action = argv[0];
    startIndex = 1;
  }

  for (let i = startIndex; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true, command, options };
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case "--glossary":
        options.glossary = next;
        i += 1;
        break;
      case "--text":
        options.text = next;
        i += 1;
        break;
      case "--file":
        options.file = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { help: false, command, options };
}

export function printHelp(command = null) {
  const render = command === "transcribe"
    ? renderTranscribeHelp()
    : command === "setup"
      ? renderSetupHelp()
    : command === "doctor"
      ? renderDoctorHelp()
      : command === "inspect"
        ? renderInspectHelp()
        : command === "glossary"
          ? renderGlossaryHelp()
          : renderRootHelp();

  process.stdout.write(render);
}

function renderRootHelp() {
  return `${TOOL_NAME}

Usage:
  skriver <command> [options]
  skriver <audio-or-video-file> [options]

Commands:
  transcribe   Create a first-pass transcript plus evidence for review
  setup        Prepare and verify diarization so it can run by default
  doctor       Check local dependencies and optional diarization setup
  inspect      Review a run directory and print the next evidence-review steps
  glossary     List glossary entries or check text against glossary rules

Run \`skriver help <command>\` for command-specific help.
`;
}

function renderTranscribeHelp() {
  return `${TOOL_NAME} transcribe

Usage:
  skriver transcribe --input /absolute/path/to/file

Skriver writes a conservative first-pass transcript and an evidence bundle.
The final clarified transcript usually comes from a human or agent reviewing that evidence.
Add human notes as evidence with --notes-file ./notes.md.

Options:
  --input PATH                Absolute or relative path to audio/video file
  --title TEXT                Folder/title label for the run
  --language auto|sv|en       Spoken language hint for Whisper
  --notes-file PATH           Add human notes as evidence (.md recommended, .md or .txt accepted)
  --context PATH              Extra context file or directory, repeatable
  --glossary PATH             Extra glossary file (.txt), layered on top of defaults
  --screenshots auto|on|off   Enable screenshot extraction for videos
  --screenshot-interval N     Seconds between screenshots for videos
  --whisper-model NAME        Whisper model name (default: turbo)
  --diarization auto|on|off   Local speaker diarization (default: off until setup is ready)
  --num-speakers N            Exact speaker count hint for diarization
  --min-speakers N            Lower diarization speaker-count bound
  --max-speakers N            Upper diarization speaker-count bound
  --threads N                 Whisper CPU thread count
  --output-root PATH          Parent directory where <filename>-skriver should be created
  --verbose                   Stream detailed command output while the run is executing
  --json                      Print final machine-readable JSON instead of a text summary
  --dry-run                   Create the folder structure without running media tools
  --help                      Show this help

Examples:
  skriver meeting.mp4 --notes-file ./notes.md
  skriver meeting.mp4 --notes-file ./notes.md --glossary ./team-glossary.txt
`;
}

function renderSetupHelp() {
  return `${TOOL_NAME} setup

Usage:
  skriver setup [--json]

Options:
  --verbose  Stream detailed command output during setup
  --json   Print machine-readable JSON instead of text
  --help   Show this help
`;
}

function renderDoctorHelp() {
  return `${TOOL_NAME} doctor

Usage:
  skriver doctor [--json]

Options:
  --verbose  Stream detailed command output
  --json   Print machine-readable JSON instead of text
  --help   Show this help
`;
}

function renderInspectHelp() {
  return `${TOOL_NAME} inspect

Usage:
  skriver inspect /absolute/path/to/run-dir-or-run.json [--json]

Inspect reads run.json and points the reviewer toward the next evidence files to check.

Options:
  --verbose  Stream detailed command output
  --json   Print machine-readable JSON instead of text
  --help   Show this help
`;
}

function renderGlossaryHelp() {
  return `${TOOL_NAME} glossary

Usage:
  skriver glossary list [--glossary PATH] [--json]
  skriver glossary check (--text TEXT | --file PATH) [--glossary PATH] [--json]

Skriver always loads the built-in glossary first, then any glossary files from config.json,
then any extra --glossary file passed on the command.

Options:
  --glossary PATH   Extra glossary file to layer on top of the built-in and configured defaults
  --text TEXT       Text to check with glossary corrections
  --file PATH       File to check with glossary corrections
  --verbose         Stream detailed command output
  --json            Print machine-readable JSON instead of text
  --help            Show this help
`;
}

export async function buildConfig(options) {
  return await buildTranscribeConfig(options);
}

export async function buildTranscribeConfig(options) {
  if (!options.input) {
    throw new Error("--input is required.");
  }

  const inputPath = resolve(options.input);
  const inputStats = await stat(inputPath).catch(() => null);
  if (!inputStats || !inputStats.isFile()) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const title = options.title?.trim() || basename(inputPath, extname(inputPath));
  const language = (options.language || "auto").toLowerCase();
  if (!["auto", "sv", "en"].includes(language)) {
    throw new Error("--language must be auto, sv, or en.");
  }

  const screenshots = (options.screenshots || "auto").toLowerCase();
  if (!["auto", "on", "off"].includes(screenshots)) {
    throw new Error("--screenshots must be auto, on, or off.");
  }

  const userConfig = await readUserConfig();
  const diarization = (options.diarization || getDefaultDiarizationMode(userConfig)).toLowerCase();
  if (!["auto", "on", "off"].includes(diarization)) {
    throw new Error("--diarization must be auto, on, or off.");
  }

  const screenshotInterval = Number.parseInt(options.screenshotInterval || "20", 10);
  if (!Number.isFinite(screenshotInterval) || screenshotInterval <= 0) {
    throw new Error("--screenshot-interval must be a positive integer.");
  }

  const numSpeakers = parseOptionalPositiveInteger(options.numSpeakers, "--num-speakers");
  const minSpeakers = parseOptionalPositiveInteger(options.minSpeakers, "--min-speakers");
  const maxSpeakers = parseOptionalPositiveInteger(options.maxSpeakers, "--max-speakers");
  if (Number.isFinite(minSpeakers) && Number.isFinite(maxSpeakers) && minSpeakers > maxSpeakers) {
    throw new Error("--min-speakers cannot be greater than --max-speakers.");
  }
  if (Number.isFinite(numSpeakers) && Number.isFinite(minSpeakers) && numSpeakers < minSpeakers) {
    throw new Error("--num-speakers cannot be lower than --min-speakers.");
  }
  if (Number.isFinite(numSpeakers) && Number.isFinite(maxSpeakers) && numSpeakers > maxSpeakers) {
    throw new Error("--num-speakers cannot be greater than --max-speakers.");
  }

  const threads = Number.parseInt(options.threads || `${Math.max(1, Math.min(8, os.cpus().length))}`, 10);
  if (!Number.isFinite(threads) || threads <= 0) {
    throw new Error("--threads must be a positive integer.");
  }

  const notesFile = options.notesFile ? resolve(options.notesFile) : null;
  if (notesFile) {
    const noteStats = await stat(notesFile).catch(() => null);
    if (!noteStats || !noteStats.isFile()) {
      throw new Error(`Notes file not found: ${notesFile}`);
    }

    const notesExtension = extname(notesFile).toLowerCase();
    if (![".md", ".txt"].includes(notesExtension)) {
      throw new Error(`Notes file must be .md or .txt: ${notesFile}`);
    }
  }

  const glossaryPaths = await resolveGlossaryPaths(userConfig, options.glossary);

  const contextInputs = [];
  for (const contextPath of options.contexts || []) {
    const resolvedPath = resolve(contextPath);
    const contextStats = await stat(resolvedPath).catch(() => null);
    if (!contextStats) {
      throw new Error(`Context path not found: ${resolvedPath}`);
    }
    contextInputs.push(resolvedPath);
  }

  return {
    inputPath,
    title,
    language,
    notesFile,
    glossaryPaths,
    contextInputs,
    screenshots,
    screenshotInterval,
    whisperModel: options.whisperModel || "turbo",
    diarization,
    numSpeakers,
    minSpeakers,
    maxSpeakers,
    threads,
    outputRoot: resolve(options.outputRoot || dirname(inputPath)),
    dryRun: Boolean(options.dryRun),
    json: Boolean(options.json),
    verbose: Boolean(options.verbose)
  };
}

export async function buildInspectConfig(options) {
  if (!options.runDir) {
    throw new Error("inspect requires a run directory.");
  }

  const candidatePath = resolve(options.runDir);
  const candidateStats = await stat(candidatePath).catch(() => null);
  if (!candidateStats) {
    throw new Error(`Run directory not found: ${candidatePath}`);
  }

  const runDirectory = candidateStats.isDirectory() ? candidatePath : dirname(candidatePath);
  const runStatePath = candidateStats.isFile() ? candidatePath : join(runDirectory, "run.json");
  const runStateStats = await stat(runStatePath).catch(() => null);
  if (!runStateStats || !runStateStats.isFile()) {
    throw new Error(`run.json not found in ${runDirectory}`);
  }

  return {
    runDirectory,
    runStatePath,
    json: Boolean(options.json)
  };
}

export async function buildGlossaryConfig(options) {
  const userConfig = await readUserConfig();
  const glossaryPaths = await resolveGlossaryPaths(userConfig, options.glossary);

  const action = (options.action || "list").toLowerCase();
  if (!["list", "check"].includes(action)) {
    throw new Error("glossary action must be `list` or `check`.");
  }

  const config = {
    action,
    json: Boolean(options.json),
    glossaryPaths
  };

  if (action === "check") {
    if (!options.text && !options.file) {
      throw new Error("glossary check requires --text or --file.");
    }
    if (options.text && options.file) {
      throw new Error("Use either --text or --file, not both.");
    }
    if (options.file) {
      const filePath = resolve(options.file);
      const fileStats = await stat(filePath).catch(() => null);
      if (!fileStats || !fileStats.isFile()) {
        throw new Error(`Glossary check file not found: ${filePath}`);
      }
      config.file = filePath;
    }
    if (options.text) {
      config.text = options.text;
    }
  }

  return config;
}

async function resolveGlossaryPaths(userConfig, glossaryOption) {
  const configuredPaths = getConfiguredGlossaryPaths(userConfig);
  const resolvedConfiguredPaths = [];

  for (const configuredPath of configuredPaths) {
    const resolvedPath = resolve(configuredPath);
    const glossaryStats = await stat(resolvedPath).catch(() => null);
    if (!glossaryStats || !glossaryStats.isFile()) {
      throw new Error(`Configured glossary file not found: ${resolvedPath}`);
    }
    resolvedConfiguredPaths.push(resolvedPath);
  }

  const glossaryPaths = [DEFAULT_GLOSSARY, ...resolvedConfiguredPaths];
  if (glossaryOption) {
    const glossaryPath = resolve(glossaryOption);
    const glossaryStats = await stat(glossaryPath).catch(() => null);
    if (!glossaryStats || !glossaryStats.isFile()) {
      throw new Error(`Glossary file not found: ${glossaryPath}`);
    }
    glossaryPaths.push(glossaryPath);
  }

  return [...new Set(glossaryPaths)];
}
