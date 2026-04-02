#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { incrementPatchVersion } from "../src/lib/versioning.mjs";

const repoRoot = process.cwd();
const packageJsonPath = join(repoRoot, "package.json");
const releaseManifestPath = join(repoRoot, ".release-please-manifest.json");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const currentVersion = packageJson.version;
const headVersion = readHeadVersion(packageJsonPath) || currentVersion;

if (currentVersion !== headVersion) {
  process.stdout.write(`Version already bumped for this commit attempt: ${currentVersion}\n`);
  process.exit(0);
}

const nextVersion = incrementPatchVersion(currentVersion);
packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, "utf8"));
releaseManifest["."] = nextVersion;
writeFileSync(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");

execFileSync("git", ["add", "package.json", ".release-please-manifest.json"], { cwd: repoRoot, stdio: "inherit" });
process.stdout.write(`Bumped version: ${currentVersion} -> ${nextVersion}\n`);

function readHeadVersion(filePath) {
  try {
    const relativePath = filePath.replace(`${repoRoot}/`, "");
    const raw = execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return JSON.parse(raw).version;
  } catch {
    return null;
  }
}
