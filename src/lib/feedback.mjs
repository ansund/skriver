import process from "node:process";

import { TOOL_VERSION } from "./package-info.mjs";
import { inspectCommand } from "./runtime.mjs";
import { runCommand } from "./utils.mjs";

const FEEDBACK_REPO = "ansund/skriver";
const FEEDBACK_TEMPLATE = "agent_feedback.yml";
const FEEDBACK_BASE_URL = `https://github.com/${FEEDBACK_REPO}/issues/new`;

export async function runFeedbackCommand(config) {
  const payload = buildFeedbackPayload(config.message);
  const ghCommand = process.env.SKRIVER_GH_COMMAND || "gh";
  const issueUrl = buildPrefilledIssueUrl(payload);

  if (config.action === "url") {
    return config.json
      ? { ok: true, submitted: false, url: issueUrl, payload }
      : {
          ok: true,
          submitted: false,
          url: issueUrl,
          payload,
          text: [
            "Open this feedback URL:",
            issueUrl
          ].join("\n")
        };
  }

  const ghStatus = await inspectCommand(ghCommand, ["auth", "status"]);
  if (ghStatus.available && ghStatus.code === 0) {
    try {
      const result = await runCommand(ghCommand, [
        "issue",
        "create",
        "--repo",
        FEEDBACK_REPO,
        "--title",
        payload.title,
        "--body",
        payload.body
      ]);

      const issue = result.stdout.trim().split(/\s+/).find((item) => item.startsWith("https://"));
      return config.json
        ? { ok: true, submitted: true, issueUrl: issue || null, fallbackUrl: issueUrl, payload }
        : {
            ok: true,
            submitted: true,
            issueUrl: issue || null,
            fallbackUrl: issueUrl,
            payload,
            text: [
              "Thanks. Feedback was submitted to GitHub.",
              issue ? `Issue: ${issue}` : "Issue created through gh.",
              "",
              "If you want to submit more feedback:",
              "skriver feedback \"What was confusing, slow, or missing?\""
            ].join("\n")
          };
    } catch (error) {
      return renderFallback(config, payload, issueUrl, `Automatic submission failed: ${error.message}`);
    }
  }

  return renderFallback(config, payload, issueUrl, "GitHub CLI is unavailable or not authenticated.");
}

function renderFallback(config, payload, issueUrl, reason) {
  return config.json
    ? {
        ok: true,
        submitted: false,
        url: issueUrl,
        reason,
        payload
      }
    : {
        ok: true,
        submitted: false,
        url: issueUrl,
        reason,
        payload,
        text: [
          "Automatic feedback submission was not available.",
          `Reason: ${reason}`,
          "",
          "Open this prefilled GitHub issue URL:",
          issueUrl
        ].join("\n")
      };
}

function buildFeedbackPayload(message) {
  const trimmed = message.trim();
  const title = `[Agent feedback] ${trimmed.slice(0, 72)}`.trim();
  const body = [
    "## Summary",
    trimmed,
    "",
    "## Context",
    `- Tool version: ${TOOL_VERSION}`,
    `- Working directory: ${process.cwd()}`,
    `- Timestamp: ${new Date().toISOString()}`,
    "",
    "## What should improve?",
    "- What was confusing, slow, or missing?",
    "- What should the next agent/human experience instead?"
  ].join("\n");

  return { title, body };
}

function buildPrefilledIssueUrl(payload) {
  const params = new URLSearchParams({
    template: FEEDBACK_TEMPLATE,
    title: payload.title,
    body: payload.body
  });

  return `${FEEDBACK_BASE_URL}?${params.toString()}`;
}
