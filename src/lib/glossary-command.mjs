import { readFile } from "node:fs/promises";

import { loadGlossary, applyGlossaryCorrections } from "./utils.mjs";

export async function runGlossaryCommand(config) {
  const glossary = await loadGlossary(config.glossaryPaths);

  if (config.action === "list") {
    return renderGlossaryList(glossary, config.json);
  }

  const inputText = config.text ?? await readFile(config.file, "utf8");
  const result = applyGlossaryCorrections(inputText, glossary);
  const payload = {
    ok: true,
    action: "check",
    inputLength: inputText.length,
    correctedText: result.text,
    corrections: result.applied
  };

  if (config.json) {
    return payload;
  }

  const lines = [];
  lines.push("Glossary check");
  lines.push("");
  lines.push(`Corrections: ${result.applied.length}`);
  lines.push("");
  lines.push(result.text);
  if (result.applied.length > 0) {
    lines.push("");
    lines.push("Applied:");
    for (const correction of result.applied) {
      lines.push(`- ${correction.from} -> ${correction.to}`);
    }
  }

  return {
    ...payload,
    text: lines.join("\n")
  };
}

function renderGlossaryList(glossary, json) {
  const entries = glossary.map((entry) => ({
    canonical: entry.canonical,
    aliases: entry.aliases.filter((alias) => alias !== entry.canonical)
  }));

  const payload = {
    ok: true,
    action: "list",
    count: entries.length,
    entries
  };

  if (json) {
    return payload;
  }

  const lines = [];
  lines.push("Glossary entries");
  lines.push("");
  for (const entry of entries) {
    const aliasText = entry.aliases.length > 0 ? ` | aliases: ${entry.aliases.join(", ")}` : "";
    lines.push(`- ${entry.canonical}${aliasText}`);
  }

  return {
    ...payload,
    text: lines.join("\n")
  };
}
