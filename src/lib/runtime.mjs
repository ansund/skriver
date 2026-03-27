import { spawn } from "node:child_process";

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
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
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
