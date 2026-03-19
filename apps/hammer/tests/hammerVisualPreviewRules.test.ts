import assert from "node:assert/strict";
import { HAMMER_PREVIEW_PLACEMENT_DEFAULTS, resolveActiveHammerVisualAtTime } from "../src/lib/hammerVisualPreviewRules";
import type { HammerPersistedVisualPlacements } from "../src/persistence/hammerPersistenceContract";

function buildPlacements(): HammerPersistedVisualPlacements {
  return {
    schema_version: 1,
    status: "prepared",
    source_refs: [],
    uncertainty_flags: [],
    placements: [
      {
        placement_id: "p1",
        entry_id: "image-1",
        anchor_segment_id: "seg-1",
        matched_segment_ids: ["seg-1"],
        anchor_text: "first",
        asset_ref: "asset-1",
        asset_id: "asset-1",
        asset_path: "assets/image-map/candidates/a.png",
        storage_key: "workpieces/example/assets/image-map/candidates/a.png",
        label: "A",
        visual_mode: "comparison",
        start_sec: 1,
        end_sec: 3,
        confidence: 1,
        timing_source: "transcript_match",
        status: "placed",
        ingest_state: "suggested",
        uncertainty_flags: [],
      },
      {
        placement_id: "p2",
        entry_id: "image-2",
        anchor_segment_id: "seg-2",
        matched_segment_ids: ["seg-2"],
        anchor_text: "second",
        asset_ref: "asset-2",
        asset_id: "asset-2",
        asset_path: "assets/image-map/candidates/b.png",
        storage_key: "workpieces/example/assets/image-map/candidates/b.png",
        label: "B",
        visual_mode: "map",
        start_sec: 5,
        end_sec: 7,
        confidence: 1,
        timing_source: "transcript_match",
        status: "placed",
        ingest_state: "approved",
        uncertainty_flags: [],
      },
    ],
  };
}

function testResolvesMatchingVisualAndDefaults() {
  const result = resolveActiveHammerVisualAtTime({
    visualPlacements: buildPlacements(),
    timeSec: 1.5,
  });

  assert.equal(result.visual?.placement_id, "p1");
  assert.equal(result.approval_state, "suggested");
  assert.deepEqual(result.defaults, HAMMER_PREVIEW_PLACEMENT_DEFAULTS);
  assert.equal(result.reason, "active_match");
}

function testHoldsLastUsableVisualBetweenCues() {
  const result = resolveActiveHammerVisualAtTime({
    visualPlacements: buildPlacements(),
    timeSec: 4,
  });

  assert.equal(result.visual?.placement_id, "p1");
  assert.equal(result.reason, "held_previous");
  assert.equal(result.change_at_sec, 5);
}

function testReturnsEmptyVisualStateWhenNothingHasStarted() {
  const result = resolveActiveHammerVisualAtTime({
    visualPlacements: buildPlacements(),
    timeSec: 0.2,
  });

  assert.equal(result.visual, null);
  assert.equal(result.reason, "none");
  assert.equal(result.change_at_sec, 1);
}

try {
  testResolvesMatchingVisualAndDefaults();
  testHoldsLastUsableVisualBetweenCues();
  testReturnsEmptyVisualStateWhenNothingHasStarted();
  console.log("Hammer visual preview rule tests passed.");
} catch (error) {
  console.error("Hammer visual preview rule tests failed:", error);
  process.exitCode = 1;
}

