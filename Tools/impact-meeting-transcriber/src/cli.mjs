import { mkdir, readFile, readdir, symlink, writeFile, copyFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = resolve(__dirname, "..");
const DEFAULT_OUTPUT_ROOT = join(TOOL_ROOT, "transcripts");
const DEFAULT_GLOSSARY = join(TOOL_ROOT, "config", "default-glossary.txt");
const TOOL_NAME = "impact-meeting-transcriber";

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help || parsed.command !== "transcribe") {
      printHelp();
      process.exit(parsed.help ? 0 : 1);
    }

    const config = await buildConfig(parsed.options);
    const run = await createRunWorkspace(config);
    await saveRunInputs(run, config);

    const media = await probeMedia(config.inputPath);
    run.metadata.media = media;

    if (!media.hasAudio) {
      throw new Error("Input file does not contain an audio stream.");
    }

    if (!config.dryRun) {
      const contextArtifacts = await processContextFiles(config, run);
      run.metadata.contextArtifacts = contextArtifacts;
      await writeMetadata(run);

      await extractAudio(config, run);
      await transcribeAudio(config, run);

      if (media.hasVideo && config.screenshots !== "off") {
        await extractScreenshots(config, run, media.durationSeconds);
        await runVideoOcr(config, run);
      }
    } else {
      run.metadata.contextArtifacts = [];
      await writeMetadata(run);
    }

    const transcriptData = config.dryRun
      ? await buildDryRunTranscript(run, config)
      : await buildTranscriptArtifacts(config, run);

    run.metadata.summary = transcriptData.summary;
    await writeMetadata(run);

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          runDirectory: run.runDir,
          transcript: join(run.runDir, "transcript.md"),
          mediaHasVideo: media.hasVideo,
          contextFiles: run.metadata.contextArtifacts?.length || 0,
          appliedCorrections: transcriptData.summary.appliedCorrectionCount,
          lowConfidenceSegments: transcriptData.summary.lowConfidenceCount
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    process.stderr.write(`${TOOL_NAME} failed: ${error.message}\n`);
    process.exit(1);
  }
}

function parseArgs(argv) {
  if (argv.length === 0) {
    return { help: true, command: null, options: {} };
  }

  const first = argv[0];
  if (first === "--help" || first === "-h" || first === "help") {
    return { help: true, command: null, options: {} };
  }

  const command = first;
  const options = { notes: [], contexts: [] };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      return { help: true, command, options };
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
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
      case "--note":
        options.notes.push(next);
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

function printHelp() {
  process.stdout.write(`${TOOL_NAME}

Usage:
  node src/cli.mjs transcribe --input /absolute/path/to/file

Options:
  --input PATH                Absolute or relative path to audio/video file
  --title TEXT                Folder/title label for the run
  --language auto|sv|en       Spoken language hint for Whisper
  --notes-file PATH           Text file with user notes
  --note TEXT                 Inline note, repeatable
  --context PATH              Extra context file or directory, repeatable
  --glossary PATH             Extra glossary file
  --screenshots auto|on|off   Enable screenshot extraction for videos
  --screenshot-interval N     Seconds between screenshots for videos
  --whisper-model NAME        Whisper model name (default: turbo)
  --threads N                 Whisper CPU thread count
  --output-root PATH          Where run folders should be created
  --dry-run                   Create the folder structure without running media tools
  --help                      Show this help
`);
}

async function buildConfig(options) {
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

  const screenshotInterval = Number.parseInt(options.screenshotInterval || "20", 10);
  if (!Number.isFinite(screenshotInterval) || screenshotInterval <= 0) {
    throw new Error("--screenshot-interval must be a positive integer.");
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
  }

  const glossaryPaths = [DEFAULT_GLOSSARY];
  if (options.glossary) {
    const glossaryPath = resolve(options.glossary);
    const glossaryStats = await stat(glossaryPath).catch(() => null);
    if (!glossaryStats || !glossaryStats.isFile()) {
      throw new Error(`Glossary file not found: ${glossaryPath}`);
    }
    glossaryPaths.push(glossaryPath);
  }

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
    notes: options.notes || [],
    notesFile,
    glossaryPaths,
    contextInputs,
    screenshots,
    screenshotInterval,
    whisperModel: options.whisperModel || "turbo",
    threads,
    outputRoot: resolve(options.outputRoot || DEFAULT_OUTPUT_ROOT),
    dryRun: Boolean(options.dryRun)
  };
}

async function createRunWorkspace(config) {
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
      screenshotIntervalSeconds: config.screenshotInterval,
      notesFile: config.notesFile,
      glossaryPaths: config.glossaryPaths,
      contextInputs: config.contextInputs,
      dryRun: config.dryRun
    }
  };
}

async function saveRunInputs(run, config) {
  const combinedNotes = await collectNotes(config.notesFile, config.notes);
  await writeFile(join(run.runDir, "notes.txt"), combinedNotes.rawText, "utf8");
  await writeFile(join(run.runDir, "notes.json"), JSON.stringify(combinedNotes, null, 2), "utf8");
  run.metadata.notes = combinedNotes;

  const sourceTarget = join(run.sourceDir, basename(config.inputPath));
  await linkOrCopy(config.inputPath, sourceTarget);
}

async function collectNotes(notesFile, inlineNotes) {
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

async function processContextFiles(config, run) {
  if (config.contextInputs.length === 0) {
    await writeFile(join(run.runDir, "context_artifacts.json"), "[]\n", "utf8");
    return [];
  }

  const expandedFiles = await expandContextInputs(config.contextInputs);
  const artifacts = [];

  for (let index = 0; index < expandedFiles.length; index += 1) {
    const inputPath = expandedFiles[index];
    const artifact = await extractContextArtifact(config, run, inputPath, index + 1);
    artifacts.push(artifact);
  }

  await writeFile(join(run.runDir, "context_artifacts.json"), JSON.stringify(artifacts, null, 2), "utf8");
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
  const slug = slugify(`${index}-${basename(inputPath, extension)}`);
  const sourceTarget = join(run.contextsDir, `${slug}${extension}`);
  await linkOrCopy(inputPath, sourceTarget);

  const timestampSeconds = extractTimestampFromPath(inputPath);
  const kind = detectContextKind(extension);
  const extractedText = await extractContextText(kind, inputPath, config.language);
  const normalizedText = normalizeMultilineText(extractedText);
  const excerpt = buildExcerpt(normalizedText);
  const extractedTextPath = join(run.contextsDir, `${slug}.txt`);
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

function detectContextKind(extension) {
  if ([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".heic"].includes(extension)) {
    return "image";
  }
  if (extension === ".pdf") {
    return "pdf";
  }
  if ([".pptx"].includes(extension)) {
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
  const ocr = await runCommand("tesseract", [
    inputPath,
    "stdout",
    "-l",
    language === "sv" ? "swe+eng" : "eng+swe",
    "--psm",
    "6",
    "quiet"
  ]);
  return ocr.stdout;
}

async function extractPdfText(inputPath) {
  const pdf = await runCommand("pdftotext", [inputPath, "-"]);
  return pdf.stdout;
}

async function extractPresentationText(inputPath) {
  const listed = await runCommand("unzip", ["-Z1", inputPath]);
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
    const slide = await runCommand("unzip", ["-p", inputPath, slideFile]);
    chunks.push(xmlToText(slide.stdout));
  }
  return chunks.join("\n\n");
}

async function extractTextutilText(inputPath) {
  const converted = await runCommand("textutil", ["-convert", "txt", "-stdout", inputPath]);
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

async function probeMedia(inputPath) {
  const probe = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type",
    "-of",
    "json",
    inputPath
  ]);
  const parsed = JSON.parse(probe.stdout || "{}");
  const streams = parsed.streams || [];
  return {
    durationSeconds: Number.parseFloat(parsed.format?.duration || "0"),
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    hasVideo: streams.some((stream) => stream.codec_type === "video")
  };
}

async function extractAudio(config, run) {
  const audioPath = join(run.mediaDir, "audio_16k.wav");
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    config.inputPath,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    "16000",
    audioPath
  ]);
  run.metadata.audioPath = audioPath;
}

async function transcribeAudio(config, run) {
  const audioPath = join(run.mediaDir, "audio_16k.wav");
  const prompt = await buildInitialPrompt(config.glossaryPaths, run.metadata.notes, run.metadata.contextArtifacts || []);
  const args = [
    audioPath,
    "--model",
    config.whisperModel,
    "--output_dir",
    run.rawDir,
    "--output_format",
    "all",
    "--word_timestamps",
    "True",
    "--verbose",
    "False",
    "--threads",
    `${config.threads}`
  ];

  if (config.language !== "auto") {
    args.push("--language", config.language);
  }

  if (prompt) {
    args.push("--initial_prompt", prompt);
  }

  await runCommand("whisper", args);

  for (const extension of ["json", "srt", "txt", "tsv", "vtt"]) {
    const source = join(run.rawDir, `audio_16k.${extension}`);
    const target = join(run.runDir, `transcript.${extension}`);
    await copyFile(source, target).catch(() => undefined);
  }
}

async function buildInitialPrompt(glossaryPaths, notes, contextArtifacts) {
  const glossary = await loadGlossary(glossaryPaths);
  const canonicalTerms = glossary.slice(0, 24).map((entry) => entry.canonical);
  const noteTerms = extractCandidateTerms((notes.untimedNotes || []).join(" "));
  const contextTerms = extractCandidateTerms(
    contextArtifacts
      .slice(0, 12)
      .map((artifact) => artifact.excerpt)
      .join(" ")
  );

  const uniqueTerms = [...new Set([...noteTerms, ...contextTerms, ...canonicalTerms])].slice(0, 40);
  if (uniqueTerms.length === 0) {
    return "";
  }

  return `Technical meeting vocabulary: ${uniqueTerms.join(", ")}. Prefer these exact spellings when relevant.`;
}

async function extractScreenshots(config, run, durationSeconds) {
  const framesPattern = join(run.screensDir, "frame_%04d.jpg");
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    config.inputPath,
    "-vf",
    `fps=1/${config.screenshotInterval}`,
    "-q:v",
    "2",
    framesPattern
  ]);
  run.metadata.screenshotEstimate = Math.ceil(durationSeconds / config.screenshotInterval);
}

async function runVideoOcr(config, run) {
  const files = (await readdir(run.screensDir))
    .filter((file) => file.endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b));

  const ocrRows = [["frame", "seconds", "topic", "text"]];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const seconds = index * run.metadata.screenshotIntervalSeconds;
    const ocr = await runCommand("tesseract", [
      join(run.screensDir, file),
      "stdout",
      "-l",
      config.language === "sv" ? "swe+eng" : "eng+swe",
      "--psm",
      "6",
      "quiet"
    ]);
    const cleaned = cleanOcrText(ocr.stdout);
    const topic = detectScreenTopic(cleaned);
    ocrRows.push([file, `${seconds}`, topic, cleaned.replace(/\t/g, " ")]);
  }

  await writeFile(join(run.runDir, "screen_ocr.tsv"), ocrRows.map((row) => row.join("\t")).join("\n"), "utf8");
}

async function buildTranscriptArtifacts(config, run) {
  const whisperJsonPath = join(run.runDir, "transcript.json");
  const whisperJson = JSON.parse(await readFile(whisperJsonPath, "utf8"));
  const glossary = await loadGlossary(config.glossaryPaths);
  const corrections = [];

  const segments = (whisperJson.segments || []).map((segment) => {
    const result = applyGlossaryCorrections(segment.text || "", glossary);
    const lowConfidence =
      Number.isFinite(segment.avg_logprob) && segment.avg_logprob < -0.95
        ? "Low ASR confidence."
        : hasVeryLowWordProbability(segment.words)
          ? "Contains low-probability words."
          : null;

    if (result.applied.length > 0) {
      corrections.push(...result.applied.map((item) => ({ ...item, seconds: segment.start })));
    }

    return {
      start: segment.start,
      end: segment.end,
      text: normalizeSentence(result.text),
      rawText: segment.text || "",
      lowConfidence,
      appliedCorrections: result.applied
    };
  });

  const screenNotes = await loadScreenNotes(run);
  const contextArtifacts = run.metadata.contextArtifacts || [];
  const timedContextNotes = contextArtifacts
    .filter((artifact) => Number.isFinite(artifact.timestampSeconds))
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    .map((artifact) => ({
      seconds: artifact.timestampSeconds,
      text: `${capitalize(artifact.kind)} context from ${artifact.sourceLabel}: ${artifact.excerpt || "No text extracted."}`
    }));

  const noteData = run.metadata.notes;
  const markdown = renderTranscriptMarkdown({
    title: config.title,
    run,
    language: whisperJson.language || config.language,
    noteData,
    segments,
    screenNotes,
    contextArtifacts,
    timedContextNotes,
    corrections
  });

  const lowConfidenceSegments = segments
    .filter((segment) => segment.lowConfidence)
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      note: segment.lowConfidence
    }));

  await writeFile(join(run.runDir, "transcript.md"), markdown, "utf8");
  await writeFile(join(run.runDir, "applied_corrections.json"), JSON.stringify(corrections, null, 2), "utf8");
  await writeFile(join(run.runDir, "screen_notes.json"), JSON.stringify(screenNotes, null, 2), "utf8");
  await writeFile(join(run.runDir, "low_confidence_segments.json"), JSON.stringify(lowConfidenceSegments, null, 2), "utf8");

  return {
    summary: {
      language: whisperJson.language || config.language,
      segmentCount: segments.length,
      screenNoteCount: screenNotes.length,
      contextFileCount: contextArtifacts.length,
      appliedCorrectionCount: corrections.length,
      lowConfidenceCount: lowConfidenceSegments.length
    }
  };
}

async function loadScreenNotes(run) {
  const ocrPath = join(run.runDir, "screen_ocr.tsv");
  const exists = await stat(ocrPath).catch(() => null);
  if (!exists) {
    return [];
  }

  const rows = (await readFile(ocrPath, "utf8"))
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 4);

  const notes = [];
  let previous = null;

  for (const [frame, secondsText, topic, text] of rows) {
    const seconds = Number.parseInt(secondsText, 10);
    const visibleText = summarizeVisibleText(text);
    if (!visibleText) {
      continue;
    }

    const similarity = previous ? textSimilarity(previous.visibleText, visibleText) : 0;
    const sameTopic = previous?.topic === topic;

    if (previous && sameTopic && similarity > 0.82 && seconds - previous.seconds < 90) {
      continue;
    }

    if (topic === "meeting_room" && previous && seconds - previous.seconds < 120) {
      continue;
    }

    notes.push({
      seconds,
      topic,
      frame: join(run.screensDir, frame),
      visibleText,
      description: describeScreenTopic(topic)
    });
    previous = { seconds, topic, visibleText };
  }

  return notes;
}

function renderTranscriptMarkdown({
  title,
  run,
  language,
  noteData,
  segments,
  screenNotes,
  contextArtifacts,
  timedContextNotes,
  corrections
}) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- Created: ${run.metadata.createdAt}`);
  lines.push(`- Source: \`${run.metadata.inputPath}\``);
  lines.push(`- Language: \`${language}\``);
  lines.push(`- Media: ${run.metadata.media.hasVideo ? "video" : "audio"}${run.metadata.media.hasVideo ? " with screen capture notes" : ""}`);
  lines.push(`- Final output: \`transcript.md\``);
  lines.push("");

  if ((noteData.untimedNotes || []).length > 0) {
    lines.push("## User Notes");
    lines.push("");
    for (const note of noteData.untimedNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  if (contextArtifacts.length > 0) {
    lines.push("## Context Files");
    lines.push("");
    for (const artifact of contextArtifacts) {
      const timestampLabel = Number.isFinite(artifact.timestampSeconds)
        ? ` at ${formatTimestamp(artifact.timestampSeconds)}`
        : "";
      lines.push(`- ${artifact.sourceLabel} (${artifact.kind}${timestampLabel})`);
      lines.push(`  Extracted with ${artifact.extractor}.`);
      lines.push(`  ${artifact.excerpt || "No text extracted."}`);
    }
    lines.push("");
  }

  lines.push("## Transcript");
  lines.push("");

  const pendingScreenNotes = [...screenNotes];
  const pendingTimedNotes = [...(noteData.timedNotes || [])];
  const pendingContextNotes = [...timedContextNotes];

  for (const segment of segments) {
    while (pendingTimedNotes.length > 0 && pendingTimedNotes[0].seconds <= segment.start) {
      const note = pendingTimedNotes.shift();
      lines.push(`[${formatTimestamp(note.seconds)}] [User note] ${note.text}`);
    }

    while (pendingContextNotes.length > 0 && pendingContextNotes[0].seconds <= segment.start) {
      const note = pendingContextNotes.shift();
      lines.push(`[${formatTimestamp(note.seconds)}] [Context] ${note.text}`);
    }

    while (pendingScreenNotes.length > 0 && pendingScreenNotes[0].seconds <= segment.start) {
      const note = pendingScreenNotes.shift();
      lines.push(
        `[${formatTimestamp(note.seconds)}] [Screen] ${note.description} Visible text: "${note.visibleText}".`
      );
    }

    lines.push(`[${formatTimestamp(segment.start)}] ${segment.text}`);

    if (segment.appliedCorrections.length > 0) {
      const rendered = segment.appliedCorrections
        .map((item) => `"${item.from}" -> "${item.to}"`)
        .join(", ");
      lines.push(`[${formatTimestamp(segment.start)}] [Transcriber note] Corrected likely technical terms: ${rendered}.`);
    }

    if (segment.lowConfidence) {
      lines.push(`[${formatTimestamp(segment.start)}] [Transcriber note] ${segment.lowConfidence}`);
    }
  }

  for (const note of pendingTimedNotes) {
    lines.push(`[${formatTimestamp(note.seconds)}] [User note] ${note.text}`);
  }

  for (const note of pendingContextNotes) {
    lines.push(`[${formatTimestamp(note.seconds)}] [Context] ${note.text}`);
  }

  for (const note of pendingScreenNotes) {
    lines.push(`[${formatTimestamp(note.seconds)}] [Screen] ${note.description} Visible text: "${note.visibleText}".`);
  }

  lines.push("");
  lines.push("## Applied Technical Term Corrections");
  lines.push("");

  if (corrections.length === 0) {
    lines.push("- None");
  } else {
    for (const item of summarizeCorrections(corrections)) {
      lines.push(`- ${item.from} -> ${item.to} (${item.count})`);
    }
  }

  lines.push("");
  lines.push("## Low-Confidence Segments");
  lines.push("");

  const lowConfidence = segments.filter((segment) => segment.lowConfidence);
  if (lowConfidence.length === 0) {
    lines.push("- None");
  } else {
    for (const segment of lowConfidence.slice(0, 50)) {
      lines.push(`- [${formatTimestamp(segment.start)}] ${segment.text}`);
    }
  }

  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push(`- \`transcript.md\``);
  lines.push(`- \`transcript.json\``);
  lines.push(`- \`transcript.srt\``);
  lines.push(`- \`transcript.tsv\``);
  lines.push(`- \`notes.txt\``);
  if (contextArtifacts.length > 0) {
    lines.push(`- \`context_artifacts.json\``);
    lines.push(`- \`contexts/\``);
  }
  if (run.metadata.media.hasVideo) {
    lines.push(`- \`screen_ocr.tsv\``);
    lines.push(`- \`screens/\``);
  }

  return lines.join("\n");
}

function summarizeCorrections(corrections) {
  const byPair = new Map();
  for (const correction of corrections) {
    const key = `${correction.from}=>${correction.to}`;
    const existing = byPair.get(key) || { from: correction.from, to: correction.to, count: 0 };
    existing.count += 1;
    byPair.set(key, existing);
  }
  return [...byPair.values()].sort((a, b) => b.count - a.count);
}

async function buildDryRunTranscript(run, config) {
  const markdown = `# ${config.title}

- Created: ${run.metadata.createdAt}
- Source: \`${config.inputPath}\`
- Dry run: \`true\`
- Final output: \`transcript.md\`

## Transcript

[00:00:00] [Transcriber note] Dry run only. No media processing was executed.
`;

  await writeFile(join(run.runDir, "transcript.md"), markdown, "utf8");

  return {
    summary: {
      language: config.language,
      segmentCount: 0,
      screenNoteCount: 0,
      contextFileCount: 0,
      appliedCorrectionCount: 0,
      lowConfidenceCount: 0
    }
  };
}

async function writeMetadata(run) {
  await writeFile(join(run.runDir, "metadata.json"), JSON.stringify(run.metadata, null, 2), "utf8");
}

async function loadGlossary(paths) {
  const entries = [];
  for (const path of paths) {
    const content = await readFile(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const [canonicalPart, aliasPart] = trimmed.split("|").map((part) => part.trim());
      const canonical = canonicalPart;
      const aliases = (aliasPart ? aliasPart.split(",") : [])
        .map((alias) => alias.trim())
        .filter(Boolean);
      entries.push({
        canonical,
        aliases: [...new Set([canonical, ...aliases])]
      });
    }
  }
  return entries;
}

function applyGlossaryCorrections(text, glossary) {
  let updated = text;
  const applied = [];

  const replacements = glossary
    .flatMap((entry) => entry.aliases.map((alias) => ({ canonical: entry.canonical, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const replacement of replacements) {
    const pattern = buildWordPattern(replacement.alias);
    updated = updated.replace(pattern, (match) => {
      if (match === replacement.canonical) {
        return match;
      }
      applied.push({ from: match, to: replacement.canonical });
      return replacement.canonical;
    });
  }

  return { text: updated, applied };
}

function buildWordPattern(term) {
  const escaped = escapeRegExp(term).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "gi");
}

function cleanOcrText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,:;@#%&()+/-]/gu, "")
    .trim();
}

function summarizeVisibleText(text) {
  if (!text) {
    return "";
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 12) {
    return "";
  }

  const collapsed = cleaned
    .split(" ")
    .filter((part) => part.length > 1)
    .join(" ")
    .trim();

  return collapsed.slice(0, 220);
}

function detectScreenTopic(text) {
  const lower = text.toLowerCase();
  if (!lower) {
    return "unknown";
  }
  if (lower.includes("brand retail network")) {
    return "hubspot_brand_retail_network";
  }
  if (lower.includes("hubspot") && lower.includes("companies")) {
    return "hubspot_companies";
  }
  if (lower.includes("hubspot") && lower.includes("deals")) {
    return "hubspot_deals";
  }
  if (lower.includes("workflow")) {
    return "hubspot_workflows";
  }
  if (lower.includes("ticket") || lower.includes("onboarding")) {
    return "hubspot_tickets";
  }
  if (lower.includes("dashboard") || lower.includes("report")) {
    return "hubspot_dashboard";
  }
  if (lower.includes("clickup") || lower.includes("microsoft teams") || lower.includes("powered by microsoft teams")) {
    return "meeting_room";
  }
  return "shared_screen";
}

function describeScreenTopic(topic) {
  switch (topic) {
    case "hubspot_brand_retail_network":
      return "HubSpot Brand Retail Network view.";
    case "hubspot_companies":
      return "HubSpot companies view.";
    case "hubspot_deals":
      return "HubSpot deals view.";
    case "hubspot_workflows":
      return "HubSpot workflows view.";
    case "hubspot_tickets":
      return "HubSpot tickets or onboarding pipeline view.";
    case "hubspot_dashboard":
      return "HubSpot reporting or dashboard view.";
    case "meeting_room":
      return "Meeting room or call window is visible on screen.";
    default:
      return "Shared screen content is visible.";
  }
}

function hasVeryLowWordProbability(words = []) {
  return words.some((word) => Number.isFinite(word.probability) && word.probability < 0.18);
}

function textSimilarity(a, b) {
  const aTokens = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeSentence(text) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildExcerpt(text) {
  if (!text) {
    return "";
  }
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length < 8) {
    return "";
  }
  return singleLine.slice(0, 320);
}

function extractCandidateTerms(text) {
  const matches = text.match(/\b(?:[A-ZÅÄÖ][A-Za-zÅÄÖåäö0-9.-]{2,}|[A-Z]{2,}(?:[0-9]+)?)\b/g) || [];
  return [...new Set(matches)].slice(0, 40);
}

function parseTimestampToSeconds(value) {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => `${part}`.padStart(2, "0")).join(":");
}

function extractTimestampFromPath(inputPath) {
  const name = basename(inputPath, extname(inputPath));
  const longMatch = name.match(/(?:^|[_\-. ])(\d{2})[:._-](\d{2})[:._-](\d{2})(?:$|[_\-. ])/);
  if (longMatch) {
    return Number.parseInt(longMatch[1], 10) * 3600 +
      Number.parseInt(longMatch[2], 10) * 60 +
      Number.parseInt(longMatch[3], 10);
  }

  const shortMatch = name.match(/(?:^|[_\-. ])(\d{2})[:._-](\d{2})(?:$|[_\-. ])/);
  if (shortMatch) {
    return Number.parseInt(shortMatch[1], 10) * 60 + Number.parseInt(shortMatch[2], 10);
  }

  return null;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "meeting";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function xmlToText(value) {
  return value
    .replace(/<a:br\/>/g, "\n")
    .replace(/<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function describeContextExtractor(kind) {
  switch (kind) {
    case "image":
      return "tesseract OCR";
    case "pdf":
      return "pdftotext";
    case "presentation":
      return "PPTX XML extraction";
    case "document":
      return "textutil";
    case "email":
      return "email text extraction";
    case "text":
      return "direct text read";
    default:
      return "generic text extraction";
  }
}

async function linkOrCopy(fromPath, toPath) {
  await symlink(fromPath, toPath).catch(async () => {
    await copyFile(fromPath, toPath);
  });
}

async function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
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
      rejectPromise(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

main();
