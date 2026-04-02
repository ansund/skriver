import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

function resolveConfigDirectory() {
  return process.env.SKRIVER_CONFIG_HOME || join(os.homedir(), ".skriver");
}

function resolveConfigPath() {
  return join(resolveConfigDirectory(), "config.json");
}

export function getUserConfigDirectory() {
  return resolveConfigDirectory();
}

export function getUserConfigPath() {
  return resolveConfigPath();
}

export async function readUserConfig() {
  try {
    const raw = await readFile(resolveConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    return normalizeUserConfig(parsed);
  } catch {
    return normalizeUserConfig({});
  }
}

export async function writeUserConfig(config) {
  await mkdir(resolveConfigDirectory(), { recursive: true });
  const normalized = normalizeUserConfig(config);
  await writeFile(resolveConfigPath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function normalizeUserConfig(config = {}) {
  const configuredGlossaryPaths = Array.isArray(config.defaults?.glossaryPaths)
    ? config.defaults.glossaryPaths.filter((value) => typeof value === "string" && value.trim())
    : [];

  return {
    schemaVersion: 1,
    updatedAt: config.updatedAt || null,
    defaults: {
      glossaryPaths: configuredGlossaryPaths
    },
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

export function getConfiguredGlossaryPaths(config) {
  return Array.isArray(config?.defaults?.glossaryPaths)
    ? config.defaults.glossaryPaths.filter(Boolean)
    : [];
}
