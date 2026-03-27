import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { linkOrCopy, slugify } from "./utils.mjs";

export async function createRunWorkspace(config) {
  const timestamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
  const slug = slugify(config.title);
  const runDir = join(config.outputRoot, `${timestamp}_${slug}`);
  const rawDir = join(runDir, "raw");
  const mediaDir = join(runDir, "media");
  const screensDir = join(runDir, "screens");
  const sourceDir = join(runDir, "source");
  const contextsDir = join(runDir, "contexts");

  await mkdir(rawDir, { recursive: true });
  await mkdir(mediaDir, { recursive: true });
  await mkdir(screensDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  await mkdir(contextsDir, { recursive: true });

  return {
    runDir,
    rawDir,
    mediaDir,
    screensDir,
    sourceDir,
    contextsDir,
    metadata: {
      createdAt: new Date().toISOString(),
      title: config.title,
      inputPath: config.inputPath,
      language: config.language,
      whisperModel: config.whisperModel,
      diarization: config.diarization,
      numSpeakers: config.numSpeakers,
      minSpeakers: config.minSpeakers,
      maxSpeakers: config.maxSpeakers,
      screenshotIntervalSeconds: config.screenshotInterval,
      notesFile: config.notesFile,
      glossaryPaths: config.glossaryPaths,
      contextInputs: config.contextInputs,
      dryRun: config.dryRun
    }
  };
}

export async function saveSourceMedia(run, inputPath) {
  const sourceTarget = join(run.sourceDir, basename(inputPath));
  await linkOrCopy(inputPath, sourceTarget);
  return sourceTarget;
}

export async function writeRunMetadata(run) {
  await writeFile(join(run.runDir, "metadata.json"), JSON.stringify(run.metadata, null, 2), "utf8");
}
