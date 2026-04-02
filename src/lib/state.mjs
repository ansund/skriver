import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

const CONFIG_DIRECTORY = process.env.SKRIVER_CONFIG_HOME || join(os.homedir(), ".skriver");
const CONFIG_PATH = join(CONFIG_DIRECTORY, "config.json");

export function getUserConfigDirectory() {
  return CONFIG_DIRECTORY;
}

export function getUserConfigPath() {
  return CONFIG_PATH;
}

export async function readUserConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeUserConfig(parsed);
  } catch {
    return normalizeUserConfig({});
  }
}

export async function writeUserConfig(config) {
  await mkdir(CONFIG_DIRECTORY, { recursive: true });
  const normalized = normalizeUserConfig(config);
  await writeFile(CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function normalizeUserConfig(config = {}) {
  return {
    schemaVersion: 1,
    updatedAt: config.updatedAt || null,
    setup: {
      diarization: {
        ready: Boolean(config.setup?.diarization?.ready),
        configuredAt: config.setup?.diarization?.configuredAt || null,
        python: config.setup?.diarization?.python || null,
        modelSource: config.setup?.diarization?.modelSource || null,
        reason: config.setup?.diarization?.reason || null
      }
    }
  };
}

export function isDiarizationSetupReady(config) {
  return Boolean(config?.setup?.diarization?.ready);
}

export function getDefaultDiarizationMode(config) {
  return isDiarizationSetupReady(config) ? "auto" : "off";
}
