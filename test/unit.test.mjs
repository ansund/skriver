import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../src/cli.mjs";
import { __test__ as setupTest } from "../src/lib/setup.mjs";
import { incrementPatchVersion } from "../src/lib/versioning.mjs";

const {
  assignSpeakersToSegments,
  buildSummaryDraft,
  parseArgs,
  renderTranscriptMarkdown,
  serializeSummaryDraft
} = __test__;
const { buildFixSuggestions, summarizeProbe } = setupTest;

test("parseArgs reads diarization options", () => {
  const parsed = parseArgs([
    "transcribe",
    "--input",
    "/tmp/meeting.m4a",
    "--diarization",
    "on",
    "--num-speakers",
    "2",
    "--min-speakers",
    "2",
    "--max-speakers",
    "3"
  ]);

  assert.equal(parsed.command, "transcribe");
  assert.equal(parsed.options.input, "/tmp/meeting.m4a");
  assert.equal(parsed.options.diarization, "on");
  assert.equal(parsed.options.numSpeakers, "2");
  assert.equal(parsed.options.minSpeakers, "2");
  assert.equal(parsed.options.maxSpeakers, "3");
});

test("parseArgs treats a file path as shorthand for transcribe input", () => {
  const parsed = parseArgs([
    "/tmp/meeting.mp4",
    "--screenshots",
    "off"
  ]);

  assert.equal(parsed.command, "transcribe");
  assert.equal(parsed.options.input, "/tmp/meeting.mp4");
  assert.equal(parsed.options.screenshots, "off");
});

test("parseArgs reads root version flags", () => {
  assert.equal(parseArgs(["--version"]).version, true);
  assert.equal(parseArgs(["-v"]).version, true);
});

test("parseArgs reads verbose flags for transcribe and setup", () => {
  assert.equal(parseArgs(["/tmp/meeting.mp4", "--verbose"]).options.verbose, true);
  assert.equal(parseArgs(["setup", "--verbose"]).options.verbose, true);
});

test("incrementPatchVersion bumps the patch number", () => {
  assert.equal(incrementPatchVersion("0.1.0"), "0.1.1");
  assert.equal(incrementPatchVersion("12.9.41"), "12.9.42");
});

test("summarizeProbe prefers the actionable error line over traceback noise", () => {
  const summary = summarizeProbe({
    stdout: "",
    stderr: [
      "Traceback (most recent call last):",
      "  File \"/tmp/check.py\", line 1, in <module>",
      "ModuleNotFoundError: No module named 'pyannote'"
    ].join("\n"),
    error: null
  }, "fallback");

  assert.equal(summary, "ModuleNotFoundError: No module named 'pyannote'");
});

test("buildFixSuggestions explains how to recover from a missing pyannote override", () => {
  const fixes = buildFixSuggestions({
    issueCode: "missing-pyannote",
    python: "/tmp/custom-python",
    pythonSource: "override",
    setupScript: "/tmp/setup-diarization.sh"
  });

  assert.ok(fixes.some((line) => line.includes("does not have `pyannote.audio` installed")));
  assert.ok(fixes.some((line) => line.includes("unset `SKRIVER_DIARIZATION_PYTHON`")));
});

test("assignSpeakersToSegments maps diarization labels by overlap", () => {
  const result = assignSpeakersToSegments(
    [
      { start: 0, end: 4, text: "First", appliedCorrections: [] },
      { start: 4, end: 8, text: "Second", appliedCorrections: [] },
      { start: 8, end: 11, text: "Third", appliedCorrections: [] }
    ],
    {
      exclusiveSegments: [
        { start: 0, end: 4, speaker: "SPEAKER_00" },
        { start: 4, end: 8, speaker: "SPEAKER_01" },
        { start: 8, end: 11, speaker: "SPEAKER_00" }
      ]
    }
  );

  assert.deepEqual(
    result.segments.map((segment) => segment.speaker),
    ["Speaker 1", "Speaker 2", "Speaker 1"]
  );
  assert.deepEqual(result.speakerLabels, [
    { id: "SPEAKER_00", label: "Speaker 1" },
    { id: "SPEAKER_01", label: "Speaker 2" }
  ]);
});

test("buildSummaryDraft extracts insights, actions, and questions", () => {
  const summaryDraft = buildSummaryDraft({
    noteData: {
      untimedNotes: ["Skriver kickoff with Ekobanken"],
      timedNotes: []
    },
    contextArtifacts: [
      {
        sourceLabel: "context.txt",
        excerpt: "Bjornbacka workshop and AI Fusion plan."
      }
    ],
    segments: [
      {
        start: 0,
        end: 4,
        text: "Målet är att Skriver ska hjälpa Ekobanken att hålla bättre strategiska workshops.",
        lowConfidence: null
      },
      {
        start: 4,
        end: 8,
        text: "Vi ska boka ett uppföljningsmöte nästa vecka.",
        lowConfidence: null
      },
      {
        start: 8,
        end: 12,
        text: "Hur ska vi beskriva Skriver på hemsidan?",
        lowConfidence: null
      }
    ],
    diarizationData: {
      speakerCount: 2
    },
    run: {
      metadata: {
        diarization: {
          status: "completed"
        }
      }
    }
  });

  assert.ok(summaryDraft.overview.some((line) => line.includes("Local diarization detected 2 speaker")));
  assert.ok(summaryDraft.keyInsights.some((item) => item.text.includes("Målet är att Skriver")));
  assert.ok(summaryDraft.actions.some((item) => item.text.includes("Vi ska boka")));
  assert.ok(summaryDraft.openQuestions.some((item) => item.text.includes("Hur ska vi beskriva")));

  const serialized = serializeSummaryDraft(summaryDraft);
  assert.deepEqual(serialized.actions[0].categories, ["action"]);
  assert.ok(serialized.openQuestions[0].categories.includes("question"));
});

test("renderTranscriptMarkdown includes summary, speakers, and artifacts", () => {
  const markdown = renderTranscriptMarkdown({
    title: "Skriver kickoff",
    run: {
      metadata: {
        createdAt: "2026-03-25T12:00:00.000Z",
        inputPath: "/tmp/meeting.m4a",
        media: { hasVideo: true },
        diarization: { status: "completed" }
      },
      transcriptFileName: "meeting-transcript.md"
    },
    language: "sv",
    noteData: { untimedNotes: ["Initial note"], timedNotes: [] },
    segments: [
      {
        start: 0,
        end: 5,
        text: "Hej allihopa.",
        speaker: "Speaker 1",
        appliedCorrections: [],
        lowConfidence: null
      }
    ],
    screenNotes: [
      {
        seconds: 0,
        topic: "shared_screen",
        frame: "/tmp/frame.jpg",
        visibleText: "HubSpot dashboard",
        description: "Shared screen content is visible."
      }
    ],
    contextArtifacts: [],
    timedContextNotes: [],
    corrections: [],
    diarizationData: {
      segments: [{ start: 0, end: 5, speaker: "SPEAKER_00" }]
    },
    summaryDraft: {
      overview: ["Auto-generated draft."],
      keyInsights: [],
      actions: [],
      openQuestions: []
    },
    speakerLabels: [{ id: "SPEAKER_00", label: "Speaker 1" }]
  });

  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Speaker Labels/);
  assert.match(markdown, /Speaker 1 = SPEAKER_00/);
  assert.match(markdown, /\[00:00:00\] Speaker 1: Hej allihopa\./);
  assert.doesNotMatch(markdown, /\[Screen\]/);
  assert.match(markdown, /## Evidence Review/);
  assert.match(markdown, /spoken content only/);
  assert.match(markdown, /summary_draft\.json/);
  assert.match(markdown, /speaker_diarization\.json/);
  assert.match(markdown, /screen_ocr\.tsv/);
});
