import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  applyGlossaryCorrections,
  capitalize,
  describeScreenTopic,
  detectScreenTopic,
  extractCandidateTerms,
  formatTimestamp,
  hasVeryLowWordProbability,
  loadGlossary,
  normalizeSentence,
  summarizeVisibleText,
  textSimilarity
} from "./utils.mjs";

export async function buildTranscriptArtifacts(config, run) {
  const whisperJson = JSON.parse(await readFile(run.whisperJsonPath, "utf8"));
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

  const diarizationData = await loadDiarizationData(run);
  const speakerAssignment = assignSpeakersToSegments(segments, diarizationData);
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
  const summaryDraft = buildSummaryDraft({
    noteData,
    contextArtifacts,
    segments: speakerAssignment.segments,
    diarizationData,
    run
  });
  const markdown = renderTranscriptMarkdown({
    title: config.title,
    run,
    language: whisperJson.language || config.language,
    noteData,
    segments: speakerAssignment.segments,
    screenNotes,
    contextArtifacts,
    timedContextNotes,
    corrections,
    diarizationData,
    summaryDraft,
    speakerLabels: speakerAssignment.speakerLabels
  });

  const lowConfidenceSegments = speakerAssignment.segments
    .filter((segment) => segment.lowConfidence)
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      note: segment.lowConfidence,
      speaker: segment.speaker || null
    }));

  await writeFile(run.transcriptPath, markdown, "utf8");
  await writeFile(run.summaryDraftPath, `${JSON.stringify(serializeSummaryDraft(summaryDraft), null, 2)}\n`, "utf8");
  await writeFile(run.appliedCorrectionsPath, `${JSON.stringify(corrections, null, 2)}\n`, "utf8");
  await writeFile(run.screenNotesPath, `${JSON.stringify(screenNotes, null, 2)}\n`, "utf8");
  await writeFile(run.lowConfidenceSegmentsPath, `${JSON.stringify(lowConfidenceSegments, null, 2)}\n`, "utf8");

  return {
    summary: {
      language: whisperJson.language || config.language,
      segmentCount: speakerAssignment.segments.length,
      screenNoteCount: screenNotes.length,
      contextFileCount: contextArtifacts.length,
      diarizationStatus: run.metadata.diarization?.status || "skipped",
      diarizedSpeakerCount: speakerAssignment.speakerLabels.length,
      appliedCorrectionCount: corrections.length,
      lowConfidenceCount: lowConfidenceSegments.length
    }
  };
}

export async function loadScreenNotes(run) {
  const exists = await stat(run.screenOcrPath).catch(() => null);
  if (!exists) {
    return [];
  }

  const rows = (await readFile(run.screenOcrPath, "utf8"))
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
      frame: join(run.videoScreenshotsDir, frame),
      visibleText,
      description: describeScreenTopic(topic)
    });
    previous = { seconds, topic, visibleText };
  }

  return notes;
}

export async function loadDiarizationData(run) {
  const exists = await stat(run.diarizationPath).catch(() => null);
  if (!exists) {
    return null;
  }

  const parsed = JSON.parse(await readFile(run.diarizationPath, "utf8"));
  if (!Array.isArray(parsed.segments) && !Array.isArray(parsed.exclusiveSegments)) {
    return null;
  }

  return parsed;
}

export function assignSpeakersToSegments(segments, diarizationData) {
  const diarizationSegments = diarizationData?.exclusiveSegments?.length
    ? diarizationData.exclusiveSegments
    : diarizationData?.segments || [];

  if (diarizationSegments.length === 0) {
    return { segments, speakerLabels: [] };
  }

  const rawToPublic = new Map();
  const assignedSegments = segments.map((segment) => {
    const matchedSpeaker = pickBestSpeakerForSegment(segment, diarizationSegments);
    if (!matchedSpeaker) {
      return segment;
    }

    if (!rawToPublic.has(matchedSpeaker)) {
      rawToPublic.set(matchedSpeaker, `Speaker ${rawToPublic.size + 1}`);
    }

    return {
      ...segment,
      speakerId: matchedSpeaker,
      speaker: rawToPublic.get(matchedSpeaker)
    };
  });

  return {
    segments: assignedSegments,
    speakerLabels: [...rawToPublic.entries()].map(([id, label]) => ({ id, label }))
  };
}

export function pickBestSpeakerForSegment(segment, diarizationSegments) {
  let bestSpeaker = null;
  let bestOverlap = 0;

  for (const diarizationSegment of diarizationSegments) {
    const overlap = Math.max(
      0,
      Math.min(segment.end, diarizationSegment.end) - Math.max(segment.start, diarizationSegment.start)
    );
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestSpeaker = diarizationSegment.speaker;
    }
  }

  if (bestSpeaker) {
    return bestSpeaker;
  }

  const midpoint = segment.start + ((segment.end - segment.start) / 2);
  const containing = diarizationSegments.find((item) => midpoint >= item.start && midpoint <= item.end);
  return containing?.speaker || null;
}

export function buildSummaryDraft({ noteData, contextArtifacts, segments, diarizationData, run }) {
  const recurringTopics = extractRecurringTopics(noteData, contextArtifacts, segments);
  const overview = [
    "Auto-generated draft from transcript, notes, and extracted context. Review before sharing."
  ];

  if (recurringTopics.length > 0) {
    overview.push(`Likely recurring topics: ${recurringTopics.join(", ")}.`);
  }

  if (contextArtifacts.length > 0) {
    overview.push(`Merged context files: ${contextArtifacts.map((artifact) => artifact.sourceLabel).slice(0, 6).join(", ")}.`);
  }

  if (diarizationData?.speakerCount) {
    overview.push(`Local diarization detected ${diarizationData.speakerCount} speaker(s). Speaker labels are anonymous.`);
  } else if (run.metadata.diarization?.status !== "completed") {
    overview.push("No speaker labels were added because diarization did not complete.");
  }

  const candidateItems = segments
    .filter((segment) => segment.text && segment.text.length >= 24 && !segment.lowConfidence)
    .map((segment) => buildSummaryCandidate(segment))
    .filter(Boolean);

  const keyInsights = dedupeSummaryItems(
    candidateItems
      .filter((item) => item.categories.has("insight"))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  );

  const actions = dedupeSummaryItems(
    candidateItems
      .filter((item) => item.categories.has("action"))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  );

  const openQuestions = dedupeSummaryItems(
    candidateItems
      .filter((item) => item.categories.has("question"))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  );

  return {
    overview,
    recurringTopics,
    keyInsights,
    actions,
    openQuestions
  };
}

export function buildSummaryCandidate(segment) {
  const categories = classifySummaryText(segment.text);
  if (categories.size === 0) {
    return null;
  }

  const normalized = segment.text.toLowerCase();
  let score = Math.min(segment.text.length, 220) / 10;
  if (categories.has("action")) {
    score += 6;
  }
  if (categories.has("question")) {
    score += 4;
  }
  if (categories.has("insight")) {
    score += 3;
  }
  if (normalized.includes("skriver")) {
    score += 2;
  }

  return {
    seconds: segment.start,
    speaker: segment.speaker || null,
    text: buildSummarySnippet(segment.text),
    categories,
    score
  };
}

export function classifySummaryText(text) {
  const normalized = text.toLowerCase();
  const categories = new Set();

  const actionPatterns = [
    /\b(vi behöver|jag ska|du ska|vi ska|ni ska|behöver vi|next step|nästa steg|todo|to do|follow up|följa upp|återkomma|skicka|boka|kolla|undersöka|ta fram|göra|fixa|testa|prova)\b/i,
    /\b(should|need to|needs to|action|owner|deadline|send|book|check|investigate|prepare)\b/i
  ];
  const questionPatterns = [
    /\?/,
    /\b(hur ska|hur gör|varför|vad händer|vad betyder|kan vi|ska vi|oklart|fråga|risk|utmaning|problem|osäker|unknown)\b/i
  ];
  const insightPatterns = [
    /\b(målet är|poängen är|det viktiga är|det handlar om|vi vill|vision|möjlighet|opportunity|insight|lärdom|slutsats|strategi|riktning|värde|problem vi löser)\b/i,
    /\b(skriver|startup|produkt|kund|ekobanken|björnbacka|ai-agent|ai fusion)\b/i
  ];

  if (actionPatterns.some((pattern) => pattern.test(normalized))) {
    categories.add("action");
  }
  if (questionPatterns.some((pattern) => pattern.test(normalized))) {
    categories.add("question");
  }
  if (insightPatterns.some((pattern) => pattern.test(normalized)) || text.length > 120) {
    categories.add("insight");
  }

  return categories;
}

export function buildSummarySnippet(text) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/^(och|men|så|liksom|typ|alltså|well|so)\s+/i, "")
    .trim();
  return cleaned.length <= 220 ? cleaned : `${cleaned.slice(0, 217).trim()}...`;
}

export function dedupeSummaryItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = item.text.toLowerCase().replace(/[^a-z0-9åäö ]/gi, "");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function renderSummaryItem(item) {
  const speakerPrefix = item.speaker ? `${item.speaker}, ` : "";
  return `[${formatTimestamp(item.seconds)}] ${speakerPrefix}${item.text}`;
}

export function serializeSummaryDraft(summaryDraft) {
  const serializeItems = (items) => items.map((item) => ({
    seconds: item.seconds,
    speaker: item.speaker,
    text: item.text,
    categories: [...item.categories]
  }));

  return {
    overview: summaryDraft.overview,
    recurringTopics: summaryDraft.recurringTopics,
    keyInsights: serializeItems(summaryDraft.keyInsights),
    actions: serializeItems(summaryDraft.actions),
    openQuestions: serializeItems(summaryDraft.openQuestions)
  };
}

export function extractRecurringTopics(noteData, contextArtifacts, segments) {
  const candidateTerms = extractCandidateTerms([
    ...(noteData.untimedNotes || []),
    ...contextArtifacts.slice(0, 10).map((artifact) => artifact.excerpt || ""),
    ...segments.slice(0, 120).map((segment) => segment.text)
  ].join(" "));

  if (candidateTerms.length >= 3) {
    return candidateTerms.slice(0, 6);
  }

  const counts = new Map();
  const stopwords = new Set([
    "that", "this", "with", "from", "they", "them", "have", "will", "your", "about", "there",
    "what", "when", "where", "which", "would", "could", "should", "their", "into", "also",
    "och", "det", "att", "som", "för", "med", "har", "inte", "den", "detta", "eller", "ska",
    "kan", "var", "från", "bara", "också", "över", "under", "kring", "efter", "innan", "vara",
    "vill", "behöver", "sedan", "något", "någon", "några", "väldigt", "liksom", "alltså"
  ]);

  for (const segment of segments.slice(0, 160)) {
    for (const token of segment.text.toLowerCase().match(/\p{L}[\p{L}\p{N}-]{3,}/gu) || []) {
      if (stopwords.has(token)) {
        continue;
      }
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([term]) => term);
}

export function renderTranscriptMarkdown({
  title,
  run,
  language,
  noteData,
  segments,
  screenNotes,
  contextArtifacts,
  timedContextNotes,
  corrections,
  diarizationData,
  summaryDraft,
  speakerLabels
}) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- Created: ${run.metadata.createdAt}`);
  lines.push(`- Source: \`${run.metadata.inputPath}\``);
  lines.push(`- Language: \`${language}\``);
  lines.push(`- Media: ${run.metadata.media.hasVideo ? "video" : "audio"}${run.metadata.media.hasVideo ? " with screen capture notes" : ""}`);
  lines.push(`- Diarization: \`${run.metadata.diarization?.status || "skipped"}\``);
  lines.push(`- Final output: \`${run.transcriptFileName}\``);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  for (const bullet of summaryDraft.overview) {
    lines.push(`- ${bullet}`);
  }
  lines.push("");

  lines.push("## Key Insights");
  lines.push("");
  if (summaryDraft.keyInsights.length === 0) {
    lines.push("- None automatically extracted.");
  } else {
    for (const item of summaryDraft.keyInsights) {
      lines.push(`- ${renderSummaryItem(item)}`);
    }
  }
  lines.push("");

  lines.push("## Actions / TODOs");
  lines.push("");
  if (summaryDraft.actions.length === 0) {
    lines.push("- None automatically extracted.");
  } else {
    for (const item of summaryDraft.actions) {
      lines.push(`- ${renderSummaryItem(item)}`);
    }
  }
  lines.push("");

  lines.push("## Open Questions");
  lines.push("");
  if (summaryDraft.openQuestions.length === 0) {
    lines.push("- None automatically extracted.");
  } else {
    for (const item of summaryDraft.openQuestions) {
      lines.push(`- ${renderSummaryItem(item)}`);
    }
  }
  lines.push("");

  if (speakerLabels.length > 0) {
    lines.push("## Speaker Labels");
    lines.push("");
    for (const item of speakerLabels) {
      lines.push(`- ${item.label} = ${item.id}`);
    }
    lines.push("");
  }

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
      lines.push(`[${formatTimestamp(note.seconds)}] [Screen] ${note.description} Visible text: "${note.visibleText}".`);
    }

    const speakerPrefix = segment.speaker ? `${segment.speaker}: ` : "";
    lines.push(`[${formatTimestamp(segment.start)}] ${speakerPrefix}${segment.text}`);

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
  lines.push(`- \`${run.transcriptFileName}\``);
  lines.push("- `run.json`");
  lines.push("- `evidence/whisper/transcript.json`");
  lines.push("- `evidence/whisper/transcript.txt`");
  lines.push("- `evidence/whisper/transcript.srt`");
  lines.push("- `evidence/whisper/transcript.tsv`");
  lines.push("- `evidence/context/notes.txt`");
  lines.push("- `evidence/whisper/summary_draft.json`");
  if (contextArtifacts.length > 0) {
    lines.push("- `evidence/context/context_artifacts.json`");
    lines.push("- `evidence/context/`");
  }
  if (diarizationData?.segments?.length > 0 || run.metadata.diarization?.status === "completed") {
    lines.push("- `evidence/diarization/speaker_diarization.json`");
  }
  if (run.metadata.media.hasVideo) {
    lines.push("- `evidence/video-ocr/screen_ocr.tsv`");
    lines.push("- `evidence/video-screenshots/`");
  }

  return lines.join("\n");
}

export function summarizeCorrections(corrections) {
  const byPair = new Map();
  for (const correction of corrections) {
    const key = `${correction.from}=>${correction.to}`;
    const existing = byPair.get(key) || { from: correction.from, to: correction.to, count: 0 };
    existing.count += 1;
    byPair.set(key, existing);
  }
  return [...byPair.values()].sort((a, b) => b.count - a.count);
}

export async function buildDryRunTranscript(run, config) {
  const markdown = `# ${config.title}

- Created: ${run.metadata.createdAt}
- Source: \`${config.inputPath}\`
- Dry run: \`true\`
- Diarization: \`${run.metadata.diarization?.status || "skipped"}\`
- Final output: \`${run.transcriptFileName}\`

## Summary

- Auto-generated draft is unavailable in dry-run mode.

## Transcript

[00:00:00] [Transcriber note] Dry run only. No media processing was executed.
`;

  await writeFile(run.transcriptPath, markdown, "utf8");
  await writeFile(run.summaryDraftPath, JSON.stringify({
    overview: ["Auto-generated draft is unavailable in dry-run mode."],
    recurringTopics: [],
    keyInsights: [],
    actions: [],
    openQuestions: []
  }, null, 2), "utf8");

  return {
    summary: {
      language: config.language,
      segmentCount: 0,
      screenNoteCount: 0,
      contextFileCount: 0,
      diarizationStatus: run.metadata.diarization?.status || "skipped",
      diarizedSpeakerCount: 0,
      appliedCorrectionCount: 0,
      lowConfidenceCount: 0
    }
  };
}
