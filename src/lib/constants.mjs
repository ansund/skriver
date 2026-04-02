import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TOOL_ROOT = resolve(__dirname, "..", "..");
export const DEFAULT_GLOSSARY = join(TOOL_ROOT, "config", "default-glossary.txt");
export const TOOL_NAME = "skriver";
export const DEFAULT_DIARIZATION_MODEL =
  process.env.SKRIVER_DIARIZATION_MODEL || "pyannote/speaker-diarization-community-1";
export const LOCAL_DIARIZATION_PYTHON = join(TOOL_ROOT, ".venv-diarization", "bin", "python");
