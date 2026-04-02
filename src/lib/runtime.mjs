import { spawn } from "node:child_process";
import { getCommandLogging } from "./utils.mjs";

const COMMAND_ENV_MAP = {
  ffmpeg: "SKRIVER_FFMPEG_COMMAND",
  ffprobe: "SKRIVER_FFPROBE_COMMAND",
  whisper: "SKRIVER_WHISPER_COMMAND",
  tesseract: "SKRIVER_TESSERACT_COMMAND",
  pdftotext: "SKRIVER_PDFTOTEXT_COMMAND",
  textutil: "SKRIVER_TEXTUTIL_COMMAND",
  unzip: "SKRIVER_UNZIP_COMMAND"
};

export function resolveToolCommand(name) {
  return process.env[COMMAND_ENV_MAP[name]] || name;
}

export async function inspectCommand(command, args = []) {
  return await new Promise((resolve) => {
    const startedAt = Date.now();
    const logging = getCommandLogging();
    const shouldLog = logging.enabled;
    const stream = logging.stream;
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    if (shouldLog) {
      stream.write(`\n[skriver] ? ${formatCommand(command, args)}\n`);
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (shouldLog) {
        stream.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (shouldLog) {
        stream.write(text);
      }
    });

    child.on("error", (error) => {
      if (shouldLog) {
        stream.write(`[skriver] probe failed before launch finished: ${error.message}\n`);
      }
      resolve({
        available: false,
        command,
        args,
        code: null,
        stdout,
        stderr,
        error: error.message
      });
    });

    child.on("close", (code) => {
      if (shouldLog) {
        stream.write(`[skriver] probe ${code === 0 ? "completed" : `exited with code ${code}`} in ${formatCommandElapsed(Date.now() - startedAt)}\n`);
      }
      resolve({
        available: true,
        command,
        args,
        code,
        stdout,
        stderr,
        error: null
      });
    });
  });
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteShellArg).join(" ");
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatCommandElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}
