import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveHammerSelectedVisualContext,
  type HammerSelectedVisualContextInput,
} from "../src/editor/hammerSelectedVisualContext";

function fixture(overrides: {
  selectedPlacementId?: string | null;
  visualMode?: string | null;
  assetId?: string | null;
  assetKind?: "image" | "broll" | "reference_clip" | "contextual_data_composite";
  assetPath?: string | null;
  laneId?: string;
} = {}): HammerSelectedVisualContextInput {
  const clipId = "placement:florida-broll-7";
  const assetId = overrides.assetId === undefined ? "asset:florida" : overrides.assetId;
  const laneId = overrides.laneId ?? "lane:visual-primary";
  return {
    selectedPlacementId: overrides.selectedPlacementId === undefined ? clipId : overrides.selectedPlacementId,
    timeline: {
      assets: assetId === null ? [] : [{
        asset_id: assetId,
        kind: overrides.assetKind ?? "broll",
        path: overrides.assetPath === undefined ? "assets/uploads/broll/florida-target.mp4" : overrides.assetPath,
      }],
      lanes: [{ lane_id: laneId, clip_ids: [clipId] }],
      clips: [{
        clip_id: clipId,
        asset_id: assetId,
        lane_id: laneId,
        visual_mode: overrides.visualMode === undefined ? "broll" : overrides.visualMode,
      }],
    },
  };
}

test("no selection produces the inert none context", () => {
  assert.deepEqual(deriveHammerSelectedVisualContext(fixture({ selectedPlacementId: null })), { status: "none" });
});

test("image placement preserves canonical identity, lane, route preference, and capabilities", () => {
  const result = deriveHammerSelectedVisualContext(fixture({
    visualMode: "still_image",
    assetKind: "image",
    assetPath: "assets/image-map/candidates/florida.png",
  }));
  assert.deepEqual(result, {
    status: "selected",
    placementId: "placement:florida-broll-7",
    clipId: "placement:florida-broll-7",
    assetId: "asset:florida",
    laneId: "lane:visual-primary",
    kind: "image",
    preferredTool: "images",
    preferredPass: "image_placement",
    capabilities: {
      remove: true, retime: true, anchor: true, transform: true, animate: true,
      rebind: false, replace: false, revert: false, transition: false,
    },
  });
});

test("Florida-shaped B-roll placement preserves exact identity and removal capability", () => {
  const result = deriveHammerSelectedVisualContext(fixture());
  assert.equal(result.status, "selected");
  if (result.status !== "selected") return;
  assert.equal(result.placementId, "placement:florida-broll-7");
  assert.equal(result.kind, "broll");
  assert.equal(result.preferredTool, "broll");
  assert.equal(result.capabilities.remove, true);
});

test("B-roll and reference clips share the frozen B-roll command capability matrix", () => {
  const expected = {
    remove: true, retime: true, anchor: false, transform: false, animate: false,
    rebind: true, replace: true, revert: true, transition: true,
  };
  const broll = deriveHammerSelectedVisualContext(fixture());
  const reference = deriveHammerSelectedVisualContext(fixture({
    visualMode: "reference_clip",
    assetKind: "reference_clip",
    assetPath: "assets/reference/florida-context.webm",
  }));
  assert.equal(reference.status === "selected" && reference.kind, "reference_clip");
  assert.equal(reference.status === "selected" && reference.preferredPass, "image_animation");
  assert.deepEqual(broll.status === "selected" && broll.capabilities, expected);
  assert.deepEqual(reference.status === "selected" && reference.capabilities, expected);
});

test("classification preserves visual_mode priority and frozen asset-path fallback", () => {
  const byMode = deriveHammerSelectedVisualContext(fixture({
    visualMode: "contextual_data_composite",
    assetKind: "contextual_data_composite",
    assetPath: null,
  }));
  const byPath = deriveHammerSelectedVisualContext(fixture({
    visualMode: null,
    assetKind: "image",
    assetPath: "assets/florida-map.webp",
  }));
  assert.equal(byMode.status === "selected" && byMode.kind, "reference_clip");
  assert.equal(byPath.status === "selected" && byPath.kind, "image");
});

test("absent selection, missing identity, missing asset metadata, and unsupported classification fail explicitly", () => {
  const absent = deriveHammerSelectedVisualContext(fixture({ selectedPlacementId: "placement:missing" }));
  const missingIdentity = deriveHammerSelectedVisualContext(fixture({ selectedPlacementId: " " }));
  const missingAssetInput = fixture();
  const missingAsset = deriveHammerSelectedVisualContext({
    ...missingAssetInput,
    timeline: missingAssetInput.timeline && { ...missingAssetInput.timeline, assets: [] },
  });
  const unsupported = deriveHammerSelectedVisualContext(fixture({
    visualMode: null,
    assetKind: "image",
    assetPath: "assets/florida.txt",
  }));
  for (const result of [absent, missingIdentity, missingAsset, unsupported]) {
    assert.equal(result.status, "unsupported");
    assert.ok(result.status !== "unsupported" || result.reason.length > 0);
  }
});

test("contradictory lane and asset information fail explicitly", () => {
  const input = fixture();
  assert.ok(input.timeline);
  const wrongLane = deriveHammerSelectedVisualContext({
    ...input,
    timeline: { ...input.timeline, lanes: [{ lane_id: "lane:other", clip_ids: ["placement:florida-broll-7"] }] },
  });
  const contradictoryAsset = deriveHammerSelectedVisualContext(fixture({
    visualMode: "broll",
    assetKind: "image",
    assetPath: "assets/florida.png",
  }));
  assert.match(wrongLane.status === "unsupported" ? wrongLane.reason : "", /lane membership/);
  assert.match(contradictoryAsset.status === "unsupported" ? contradictoryAsset.reason : "", /contradictory visual/);
});

test("derivation is deterministic, immutable with respect to inputs, and command-free", () => {
  const input = fixture();
  const snapshot = JSON.stringify(input);
  const first = deriveHammerSelectedVisualContext(input);
  const second = deriveHammerSelectedVisualContext(JSON.parse(snapshot) as HammerSelectedVisualContextInput);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(Object.keys(input).sort(), ["selectedPlacementId", "timeline"]);
});
