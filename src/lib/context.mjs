import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { resolveToolCommand } from "./runtime.mjs";
import {
  buildExcerpt,
  describeContextExtractor,
  extractTimestampFromPath,
  linkOrCopy,
  normalizeMultilineText,
  parseTimestampToSeconds,
  runCommand,
  xmlToText,
  cleanOcrText
} from "./utils.mjs";

export async function saveRunInputs(run, config) {
  const combinedNotes = await collectNotes(config.notesFile, config.notes);
  await writeFile(run.notesTextPath, combinedNotes.rawText, "utf8");
  await writeFile(run.notesJsonPath, `${JSON.stringify(combinedNotes, null, 2)}\n`, "utf8");
  run.metadata.notes = combinedNotes;
}

export async function collectNotes(notesFile, inlineNotes) {
  const chunks = [];
  if (notesFile) {
    chunks.push(await readFile(notesFile, "utf8"));
  }
  for (const note of inlineNotes) {
    chunks.push(note);
  }

  const rawText = chunks.join("\n").trim();
  const timedNotes = [];
  const untimedNotes = [];

  if (!rawText) {
    return { rawText: "", timedNotes, untimedNotes };
  }

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[:-]?\s*(.+)$/);
    if (match) {
      timedNotes.push({
        raw: trimmed,
        seconds: parseTimestampToSeconds(match[1]),
        text: match[2].trim()
      });
      continue;
    }

    untimedNotes.push(trimmed);
  }

  timedNotes.sort((a, b) => a.seconds - b.seconds);
  return { rawText, timedNotes, untimedNotes };
}

export async function processContextFiles(config, run) {
  if (config.contextInputs.length === 0) {
    await writeFile(run.contextArtifactsPath, "[]\n", "utf8");
    return [];
  }

  const expandedFiles = await expandContextInputs(config.contextInputs);
  const artifacts = [];

  for (let index = 0; index < expandedFiles.length; index += 1) {
    const inputPath = expandedFiles[index];
    const artifact = await extractContextArtifact(config, run, inputPath, index + 1);
    artifacts.push(artifact);
  }

  await writeFile(run.contextArtifactsPath, `${JSON.stringify(artifacts, null, 2)}\n`, "utf8");
  return artifacts;
}

async function expandContextInputs(inputs) {
  const files = [];

  for (const inputPath of inputs) {
    const currentStat = await stat(inputPath);
    if (currentStat.isDirectory()) {
      const nested = await readdir(inputPath, { withFileTypes: true });
      for (const entry of nested.sort((a, b) => a.name.localeCompare(b.name))) {
        files.push(...(await expandContextInputs([join(inputPath, entry.name)])));
      }
      continue;
    }

    if (currentStat.isFile()) {
      files.push(inputPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function extractContextArtifact(config, run, inputPath, index) {
  const extension = extname(inputPath).toLowerCase();
  const sourceTarget = join(run.contextDir, `${index}-${basename(inputPath)}`);
  await linkOrCopy(inputPath, sourceTarget);

  const timestampSeconds = extractTimestampFromPath(inputPath);
  const kind = detectContextKind(extension);
  const extractedText = await extractContextText(kind, inputPath, config.language);
  const normalizedText = normalizeMultilineText(extractedText);
  const excerpt = buildExcerpt(normalizedText);
  const extractedTextPath = join(run.contextDir, `${index}-${basename(inputPath, extension)}.txt`);
  await writeFile(extractedTextPath, normalizedText, "utf8");

  return {
    sourcePath: inputPath,
    sourceLabel: basename(inputPath),
    copiedSourcePath: sourceTarget,
    kind,
    timestampSeconds,
    extractedTextPath,
    excerpt,
    extractor: describeContextExtractor(kind),
    textLength: normalizedText.length
  };
}

export function detectContextKind(extension) {
  if ([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".heic"].includes(extension)) {
    return "image";
  }
  if (extension === ".pdf") {
    return "pdf";
  }
  if (extension === ".pptx") {
    return "presentation";
  }
  if ([".doc", ".docx", ".rtf", ".html", ".htm", ".odt", ".webarchive"].includes(extension)) {
    return "document";
  }
  if ([".eml", ".msg"].includes(extension)) {
    return "email";
  }
  if ([".md", ".markdown", ".txt", ".csv", ".tsv", ".json", ".yaml", ".yml", ".xml", ".log"].includes(extension)) {
    return "text";
  }
  return "generic";
}

async function extractContextText(kind, inputPath, language) {
  try {
    switch (kind) {
      case "image":
        return await extractImageText(inputPath, language);
      case "pdf":
        return await extractPdfText(inputPath);
      case "presentation":
        return await extractPresentationText(inputPath);
      case "document":
        return await extractTextutilText(inputPath);
      case "email":
        return await extractEmailText(inputPath);
      case "text":
        return await readUtf8Text(inputPath);
      default:
        return await extractGenericText(inputPath);
    }
  } catch (error) {
    return `[Context extraction failed] ${error.message}`;
  }
}

async function extractImageText(inputPath, language) {
  const ocr = await runCommand(resolveToolCommand("tesseract"), [
    inputPath,
    "stdout",
    "-l",
    language === "sv" ? "swe+eng" : "eng+swe",
    "--psm",
    "6",
    "quiet"
  ]);
  return cleanOcrText(ocr.stdout);
}

async function extractPdfText(inputPath) {
  const pdf = await runCommand(resolveToolCommand("pdftotext"), [inputPath, "-"]);
  return pdf.stdout;
}

async function extractPresentationText(inputPath) {
  const listed = await runCommand(resolveToolCommand("unzip"), ["-Z1", inputPath]);
  const slideFiles = listed.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^ppt\/slides\/slide\d+\.xml$/i.test(line))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (slideFiles.length === 0) {
    return await extractTextutilText(inputPath);
  }

  const chunks = [];
  for (const slideFile of slideFiles) {
    const slide = await runCommand(resolveToolCommand("unzip"), ["-p", inputPath, slideFile]);
    chunks.push(xmlToText(slide.stdout));
  }
  return chunks.join("\n\n");
}

async function extractTextutilText(inputPath) {
  const converted = await runCommand(resolveToolCommand("textutil"), ["-convert", "txt", "-stdout", inputPath]);
  return converted.stdout;
}

async function extractEmailText(inputPath) {
  if (extname(inputPath).toLowerCase() === ".eml") {
    const raw = await readUtf8Text(inputPath);
    const body = raw
      .replace(/\r/g, "")
      .split("\n\n")
      .slice(1)
      .join("\n\n");
    return body || raw;
  }

  return await extractTextutilText(inputPath);
}

async function extractGenericText(inputPath) {
  try {
    return await readUtf8Text(inputPath);
  } catch {
    return await extractTextutilText(inputPath);
  }
}

async function readUtf8Text(inputPath) {
  return await readFile(inputPath, "utf8");
}
