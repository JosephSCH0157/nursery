import assert from "node:assert/strict";
import {
  buildPolishResultSummaryFromCleanupPreview,
} from "../src/editor/PolishResultSummary";
import type { HammerCleanupPreview } from "../src/editor/hammerCleanupTools";

function buildPreview(label: HammerCleanupPreview["label"]): HammerCleanupPreview {
  return {
    label,
    resultSegments: [],
    suggestions: [
      {
        id: "f1",
        type: "filler_remove",
        segmentId: "s1",
        description: "Remove 1 filler phrase.",
        confidence: 0.8,
        timeSavedSec: 0.2,
      },
      {
        id: "g1",
        type: "gap_trim",
        segmentId: "s2",
        description: "Tighten gap by 0.4s.",
        confidence: 0.95,
        timeSavedSec: 0.4,
      },
    ],
    summary: {
      changedSegments: 2,
      removedSegments: 0,
      timeSavedSec: 0.6,
    },
  };
}

function test_basic_summary_shape() {
  const summary = buildPolishResultSummaryFromCleanupPreview(buildPreview("Remove Fillers"));
  assert.equal(summary.tool, "remove_fillers");
  assert.equal(summary.detected, 2);
  assert.equal(summary.applied, 2);
  assert.equal(summary.affectedSegments, 2);
  assert.equal(summary.estimatedSecondsSaved, 0.6);
  assert.equal(summary.confidence != null && summary.confidence > 0.87, true);
  assert.equal(summary.categories.length, 2);
}

function test_quick_clean_sequence_is_disclosed() {
  const summary = buildPolishResultSummaryFromCleanupPreview(buildPreview("Quick Clean"));
  assert.equal(summary.tool, "quick_clean");
  assert.deepEqual(summary.sequence, [
    "Remove Retakes",
    "Remove Fillers",
    "Shorten Gaps",
  ]);
}

function test_no_change_preview_sets_note() {
  const emptyPreview: HammerCleanupPreview = {
    label: "Shorten Gaps",
    resultSegments: [],
    suggestions: [],
    summary: {
      changedSegments: 0,
      removedSegments: 0,
      timeSavedSec: 0,
    },
  };
  const summary = buildPolishResultSummaryFromCleanupPreview(emptyPreview);
  assert.equal(summary.notes.includes("No qualifying edits detected."), true);
  assert.equal(summary.confidence, null);
}

function test_tighten_selection_summary_metadata() {
  const tightenPreview: HammerCleanupPreview = {
    label: "Tighten Selection",
    resultSegments: [],
    suggestions: [
      {
        id: "t1",
        type: "repetition_collapse",
        segmentId: "s1",
        description: "Collapsed repeated phrase.",
        confidence: 0.84,
        timeSavedSec: 0.3,
      },
    ],
    summary: {
      changedSegments: 1,
      removedSegments: 0,
      timeSavedSec: 0.3,
    },
    metadata: {
      tightenSelection: {
        intent: "Tighten this passage while preserving meaning.",
        beforeText: "This this is is long.",
        afterText: "This is long.",
        removedFillers: 0,
        collapsedRepetitions: 2,
        mergedFragments: 0,
        confidenceLabel: "High",
        confidenceScore: 0.91,
        safetyNote: "Original performance preserved. Undo restores fully.",
      },
    },
  };
  const summary = buildPolishResultSummaryFromCleanupPreview(tightenPreview);
  assert.equal(summary.tool, "tighten_selection");
  assert.equal(summary.notes.includes("Collapsed repetitions: 2"), true);
  assert.equal(summary.notes.includes("Confidence: High"), true);
}

function test_solo_mode_summary_metadata() {
  const soloPreview: HammerCleanupPreview = {
    label: "Solo Mode",
    resultSegments: [],
    suggestions: [
      {
        id: "solo-1",
        type: "fragment_merge",
        segmentId: "s2",
        description: "Suppressed non-target speaker segment in Solo Mode.",
        confidence: 0.9,
        timeSavedSec: 0.7,
      },
    ],
    summary: {
      changedSegments: 1,
      removedSegments: 0,
      timeSavedSec: 0.7,
    },
    metadata: {
      speakerSolo: {
        intent: "Keep one speaker in focus and suppress non-target voices without touching source truth.",
        targetSpeaker: "S1",
        scopeLabel: "full transcript",
        suppressedSegments: 3,
        collapsedInterruptions: 1,
        estimatedDurationSavedSec: 2.4,
        confidenceLabel: "High",
        confidenceScore: 0.9,
        safetyNote: "Source transcript and media remain recoverable. Undo restores the prior state in one step.",
      },
    },
  };
  const summary = buildPolishResultSummaryFromCleanupPreview(soloPreview);
  assert.equal(summary.tool, "solo_mode");
  assert.equal(summary.notes.includes("Target speaker: S1"), true);
  assert.equal(summary.notes.includes("Suppressed non-target segments: 3"), true);
}

function test_interview_mode_summary_metadata() {
  const interviewPreview: HammerCleanupPreview = {
    label: "Interview Mode",
    resultSegments: [],
    suggestions: [
      {
        id: "iv-1",
        type: "filler_remove",
        segmentId: "s2",
        description: "Removed filler phrases in respondent answer.",
        confidence: 0.86,
        timeSavedSec: 0.4,
      },
    ],
    summary: {
      changedSegments: 1,
      removedSegments: 0,
      timeSavedSec: 0.4,
    },
    metadata: {
      speakerInterview: {
        intent: "Keep host prompts intact while tightening respondent answers for clearer interview flow.",
        hostSpeaker: "S1",
        respondentSpeaker: "S2",
        promptsKept: 2,
        answerSegmentsTightened: 1,
        fillersRemoved: 3,
        retakesRemoved: 0,
        interruptionsSuppressed: 1,
        estimatedDurationSavedSec: 0.4,
        confidenceLabel: "High",
        confidenceScore: 0.9,
        safetyNote: "Source transcript and media remain recoverable. Undo restores the prior state in one step.",
      },
    },
  };
  const summary = buildPolishResultSummaryFromCleanupPreview(interviewPreview);
  assert.equal(summary.tool, "interview_mode");
  assert.equal(summary.notes.includes("Host: S1"), true);
  assert.equal(summary.notes.includes("Respondent: S2"), true);
}

function test_panel_mode_summary_metadata() {
  const panelPreview: HammerCleanupPreview = {
    label: "Panel Mode",
    resultSegments: [],
    suggestions: [
      {
        id: "panel-1",
        type: "fragment_merge",
        segmentId: "s3",
        description: "Suppressed short cross-talk interruption between adjacent same-speaker turns.",
        confidence: 0.87,
        timeSavedSec: 0.3,
      },
    ],
    summary: {
      changedSegments: 1,
      removedSegments: 1,
      timeSavedSec: 0.3,
    },
    metadata: {
      speakerPanel: {
        intent: "Preserve panel turn structure while reducing low-signal backchannels and short cross-talk clutter.",
        participantScope: "full transcript",
        hostSpeaker: "S1",
        primarySpeakerBias: "balanced",
        backchannelsRemoved: 1,
        crossTalkSegmentsSuppressed: 1,
        turnsPreserved: 8,
        estimatedDurationSavedSec: 0.3,
        confidenceLabel: "High",
        confidenceScore: 0.88,
        safetyNote: "Preserves speaker structure while reducing low-signal overlap and backchannels. Source transcript and media remain recoverable.",
      },
    },
  };
  const summary = buildPolishResultSummaryFromCleanupPreview(panelPreview);
  assert.equal(summary.tool, "panel_mode");
  assert.equal(summary.notes.includes("Host: S1"), true);
  assert.equal(summary.notes.includes("Cross-talk suppressed: 1"), true);
}

function run() {
  test_basic_summary_shape();
  test_quick_clean_sequence_is_disclosed();
  test_no_change_preview_sets_note();
  test_tighten_selection_summary_metadata();
  test_solo_mode_summary_metadata();
  test_interview_mode_summary_metadata();
  test_panel_mode_summary_metadata();
  // eslint-disable-next-line no-console
  console.log("Hammer polish result summary tests passed.");
}

run();
