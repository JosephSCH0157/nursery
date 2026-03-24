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

function run() {
  test_basic_summary_shape();
  test_quick_clean_sequence_is_disclosed();
  test_no_change_preview_sets_note();
  // eslint-disable-next-line no-console
  console.log("Hammer polish result summary tests passed.");
}

run();
