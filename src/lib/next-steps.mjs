import { join } from "node:path";

import { formatTimestamp } from "./utils.mjs";

export function buildTranscribeNextSteps(run, summary) {
  const steps = [
    `Read ${join(run.runDir, "transcript.md")} first.`,
    `Use ${join(run.runDir, "manifest.json")} as the machine-readable index for this run.`
  ];

  if (summary.lowConfidenceCount > 0) {
    steps.push(
      `Review ${join(run.runDir, "low_confidence_segments.json")} for ${summary.lowConfidenceCount} uncertain segment(s).`
    );
  }

  if (summary.contextFileCount > 0) {
    steps.push(`Inspect ${join(run.runDir, "context_artifacts.json")} for merged file context.`);
  }

  if (summary.screenNoteCount > 0 || run.metadata.media?.hasVideo) {
    steps.push(`For video runs, inspect ${join(run.runDir, "screen_ocr.tsv")} and ${join(run.runDir, "screens")}.`);
  }

  if (summary.diarizationStatus === "completed") {
    steps.push(`Speaker labels are available in ${join(run.runDir, "speaker_diarization.json")}.`);
  } else {
    steps.push("Do not assign speakers manually unless you independently verify who is speaking.");
  }

  steps.push(`Run \`skriver inspect "${run.runDir}"\` for a guided review checklist.`);
  return steps;
}

export function buildInspectNextSteps(manifest) {
  const steps = [
    `Read ${manifest.artifacts.transcript.path} before editing or summarizing anything.`,
    `Treat ${manifest.artifacts.manifest.path} as the source of truth for artifact discovery.`
  ];

  if (manifest.summary.lowConfidenceCount > 0) {
    steps.push(`Resolve or annotate the ${manifest.summary.lowConfidenceCount} low-confidence segment(s).`);
  }
  if (manifest.summary.contextFileCount > 0) {
    steps.push("Cross-check transcript wording against the extracted context files.");
  }
  if (manifest.summary.screenNoteCount > 0) {
    steps.push("Use screen OCR and screenshots to repair unclear product or UI terminology.");
  }
  if (manifest.summary.diarizationStatus === "completed") {
    steps.push("Keep anonymous speaker labels unless you have independent identity confirmation.");
  }

  return steps;
}

export function renderNextStepsText(steps) {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

export function buildWorkflowGuide(run, manifest) {
  const lines = [];
  lines.push(`# Review Workflow: ${run.metadata.title}`);
  lines.push("");
  lines.push("Use this checklist after transcription finishes.");
  lines.push("");
  lines.push("## Run");
  lines.push("");
  lines.push(`- Created: ${run.metadata.createdAt}`);
  lines.push(`- Transcript: \`${manifest.artifacts.transcript.path}\``);
  lines.push(`- Manifest: \`${manifest.artifacts.manifest.path}\``);
  lines.push(`- Diarization status: \`${manifest.summary.diarizationStatus}\``);
  lines.push(`- Low-confidence segments: \`${manifest.summary.lowConfidenceCount}\``);
  lines.push("");
  lines.push("## Suggested workflow");
  lines.push("");
  for (const step of manifest.workflow.nextSteps) {
    lines.push(`- ${step}`);
  }
  lines.push("");
  lines.push("## Timestamp review hints");
  lines.push("");
  lines.push(`- Transcript timestamps use \`${formatTimestamp(0)}\` style HH:MM:SS markers.`);
  lines.push("- Keep the spoken language intact unless the user explicitly asks for translation.");
  lines.push("- Prefer refining summaries and action items after reading the artifacts, not before.");
  lines.push("");
  lines.push("## Useful files");
  lines.push("");
  for (const artifact of Object.values(manifest.artifacts)) {
    if (artifact.exists) {
      lines.push(`- \`${artifact.path}\``);
    }
  }
  return lines.join("\n");
}
