import { readFile, copyFile, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

let commandLogging = {
  enabled: false,
  stream: process.stderr
};

export function setCommandLogging({ enabled = false, stream = process.stderr } = {}) {
  commandLogging = {
    enabled: Boolean(enabled),
    stream
  };
}

export function getCommandLogging() {
  return commandLogging;
}

export function parseOptionalPositiveInteger(value, flagName) {
  if (value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
}

export async function loadGlossary(paths) {
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

export function applyGlossaryCorrections(text, glossary) {
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

export function buildWordPattern(term) {
  const escaped = escapeRegExp(term).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "gi");
}

export function cleanOcrText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,:;@#%&()+/-]/gu, "")
    .trim();
}

export function summarizeVisibleText(text) {
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

export function detectScreenTopic(text) {
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

export function describeScreenTopic(topic) {
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

export function hasVeryLowWordProbability(words = []) {
  return words.some((word) => Number.isFinite(word.probability) && word.probability < 0.18);
}

export function textSimilarity(a, b) {
  const aTokens = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function normalizeSentence(text) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeMultilineText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildExcerpt(text) {
  if (!text) {
    return "";
  }
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length < 8) {
    return "";
  }
  return singleLine.slice(0, 320);
}

export function extractCandidateTerms(text) {
  const matches = text.match(/\b(?:[A-ZÅÄÖ][A-Za-zÅÄÖåäö0-9.-]{2,}|[A-Z]{2,}(?:[0-9]+)?)\b/g) || [];
  return [...new Set(matches)].slice(0, 40);
}

export function parseTimestampToSeconds(value) {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => `${part}`.padStart(2, "0")).join(":");
}

export function extractTimestampFromPath(inputPath) {
  const name = inputPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "";
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

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "meeting";
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function xmlToText(value) {
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

export function describeContextExtractor(kind) {
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

export async function linkOrCopy(fromPath, toPath) {
  await symlink(fromPath, toPath).catch(async () => {
    await copyFile(fromPath, toPath);
  });
}

export async function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const shouldLog = commandLogging.enabled;
    const stream = commandLogging.stream;

    if (shouldLog) {
      stream.write(`\n[skriver] $ ${formatCommand(command, args)}\n`);
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
        stream.write(`[skriver] command failed before launch finished: ${error.message}\n`);
      }
      rejectPromise(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        if (shouldLog) {
          stream.write(`[skriver] command exited with code ${code} after ${formatCommandElapsed(Date.now() - startedAt)}\n`);
        }
        rejectPromise(new Error(`${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      if (shouldLog) {
        stream.write(`[skriver] command completed in ${formatCommandElapsed(Date.now() - startedAt)}\n`);
      }
      resolvePromise({ stdout, stderr });
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
