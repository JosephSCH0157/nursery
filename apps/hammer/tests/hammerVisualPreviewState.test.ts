import assert from "node:assert/strict";
import { buildHammerPreviewVisualState } from "../src/lib/hammerVisualPreviewState";
import type { HammerPersistedVisualPlacements } from "../src/persistence/hammerPersistenceContract";

function buildVisualPlacements(): HammerPersistedVisualPlacements {
  return {
    schema_version: 1,
    status: "prepared",
    source_refs: [],
    uncertainty_flags: [],
    placements: [
      {
        placement_id: "placement-01",
        entry_id: "image-map-01",
        anchor_segment_id: "seg-01",
        matched_segment_ids: ["seg-01"],
        anchor_text: "anchor one",
        asset_ref: "asset-01",
        asset_id: "asset-01",
        asset_path: "assets/image-map/candidates/a.png",
        storage_key: "workpieces/example/assets/image-map/candidates/a.png",
        label: "Image A",
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
        placement_id: "placement-02",
        entry_id: "image-map-02",
        anchor_segment_id: "seg-02",
        matched_segment_ids: ["seg-02"],
        anchor_text: "anchor two",
        asset_ref: "asset-02",
        asset_id: "asset-02",
        asset_path: "assets/image-map/candidates/b.png",
        storage_key: "workpieces/example/assets/image-map/candidates/b.png",
        label: "Image B",
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

function testResolvesActiveImageAtMappedCue() {
  const state = buildHammerPreviewVisualState({
    visualPlacements: buildVisualPlacements(),
    timeSec: 1.5,
    resolvedAssetUrlsByRef: new Map([
      ["assets/image-map/candidates/a.png", "data:image/png;base64,AAAA"],
    ]),
  });

  assert.equal(state.kind, "image");
  assert.equal(state.imageAssetId, "asset-01");
  assert.equal(state.imageUrl, "data:image/png;base64,AAAA");
  assert.equal(state.ingestState, "suggested");
  assert.deepEqual(state.placement, {
    fit: "contain",
    x: 0.5,
    y: 0.5,
    scale: 1,
  });
}

function testHoldsLastUsableImageUntilNextMappedCue() {
  const state = buildHammerPreviewVisualState({
    visualPlacements: buildVisualPlacements(),
    timeSec: 4,
  });

  assert.equal(state.kind, "image");
  assert.equal(state.imageAssetId, "asset-01");
  assert.equal(state.reason, "held_previous");
}

function testReturnsEmptyBeforeFirstUsableImage() {
  const state = buildHammerPreviewVisualState({
    visualPlacements: buildVisualPlacements(),
    timeSec: 0.5,
  });

  assert.deepEqual(state, {
    kind: "empty",
    ingestState: null,
    reason: "none",
  });
}

function testIgnoresMissingAssetsCleanly() {
  const state = buildHammerPreviewVisualState({
    visualPlacements: buildVisualPlacements(),
    timeSec: 2,
    ignoredAssetRefs: new Set(["assets/image-map/candidates/a.png"]),
  });

  assert.deepEqual(state, {
    kind: "empty",
    ingestState: null,
    reason: "none",
  });
}

function testMarksApprovedVisualsCorrectly() {
  const state = buildHammerPreviewVisualState({
    visualPlacements: buildVisualPlacements(),
    timeSec: 5.4,
  });

  assert.equal(state.kind, "image");
  assert.equal(state.ingestState, "approved");
  assert.equal(state.imageAssetId, "asset-02");
}

try {
  testResolvesActiveImageAtMappedCue();
  testHoldsLastUsableImageUntilNextMappedCue();
  testReturnsEmptyBeforeFirstUsableImage();
  testIgnoresMissingAssetsCleanly();
  testMarksApprovedVisualsCorrectly();
  console.log("Hammer visual preview state tests passed.");
} catch (error) {
  console.error("Hammer visual preview state tests failed:", error);
  process.exitCode = 1;
}

