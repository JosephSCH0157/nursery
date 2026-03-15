import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import type { WorkpieceVisualPackageResponseData } from "../../../packages/tongs/src/workpiece-commit-api";
import {
  deriveHammerVisualPlacements,
  isReusableHammerVisualPlacements,
} from "../src/lib/hammerVisualPlacements";

const transcriptSourceId = "hammer_transcript_ready";

function buildTranscriptSegments(): HammerTranscriptSegment[] {
  return [
    {
      segment_id: "turn_001",
      start_sec: 0,
      end_sec: 2,
      speaker: "S1",
      text: "Jackson faced overwhelming odds.",
    },
    {
      segment_id: "turn_002",
      start_sec: 2,
      end_sec: 4.5,
      speaker: "S1",
      text: "The skyline held at dawn.",
    },
    {
      segment_id: "turn_003",
      start_sec: 4.5,
      end_sec: 7,
      speaker: "G1",
      text: "Florida was announcing itself.",
    },
  ];
}

function buildVisualPackage(): WorkpieceVisualPackageResponseData {
  return {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    workpiece_id: "22222222-2222-4222-8222-222222222222",
    script_path: "script/script.md",
    script_updated_at: "2026-03-14T10:00:00.000Z",
    image_map_updated_at: "2026-03-14T10:05:00.000Z",
    image_map_asset_updated_at: "2026-03-14T10:05:30.000Z",
    visuals: [
      {
        entry_id: "image-map-01",
        beat_order: 1,
        paragraph_beat_order: 1,
        status: "selected",
        script_anchor: {
          section_id: "s1",
          paragraph_id: "s1:p1",
          paragraph_order: 1,
          sentence_start: 1,
          sentence_end: 1,
          char_start: 0,
          char_end: 32,
          span_text: "Jackson faced overwhelming odds.",
          speaker_block_id: null,
        },
        visual_mode: "comparison",
        selected_asset_id: "asset_01",
        selected_asset: {
          asset_id: "asset_01",
          path: "assets/image-map/candidates/workpiece/image-map-01/explainer.png",
          storage_bucket: "forge-workpieces",
          storage_key: "workpieces/example/assets/image-map/candidates/workpiece/image-map-01/explainer.png",
          mime_type: "image/png",
          bytes: 3210,
          created_at: "2026-03-14T10:06:00.000Z",
          updated_at: "2026-03-14T10:06:00.000Z",
          variant_label: "explainer",
          visual_mode: "comparison",
        },
      },
    ],
  };
}

function testDerivesDeterministicPlacementFromMatchingAnchor() {
  const placements = deriveHammerVisualPlacements({
    transcriptSourceId,
    transcriptSegments: buildTranscriptSegments(),
    visualPackage: buildVisualPackage(),
  });

  assert.equal(placements.status, "prepared");
  assert.equal(placements.placements.length, 1);
  assert.equal(placements.placements[0]?.anchor_segment_id, "turn_001");
  assert.equal(placements.placements[0]?.status, "placed");
  assert.equal(placements.placements[0]?.timing_source, "transcript_match");
  assert.equal(placements.placements[0]?.asset_ref, "asset_01");
  assert.equal(placements.source_refs.includes(`transcript:${transcriptSourceId}`), true);
}

function testFallsBackToReviewableUncertainPlacementWhenMatchIsWeak() {
  const visualPackage = buildVisualPackage();
  visualPackage.visuals[0] = {
    ...visualPackage.visuals[0],
    script_anchor: {
      ...visualPackage.visuals[0].script_anchor!,
      span_text: "Completely unrelated visual anchor text",
    },
  };

  const placements = deriveHammerVisualPlacements({
    transcriptSourceId,
    transcriptSegments: buildTranscriptSegments(),
    visualPackage,
  });

  assert.equal(placements.status, "prepared");
  assert.equal(placements.placements.length, 1);
  assert.equal(placements.placements[0]?.status, "uncertain");
  assert.equal(placements.placements[0]?.uncertainty_flags.includes("ordered_fallback"), true);
  assert.equal(placements.uncertainty_flags.includes("match_missing:image-map-01"), true);
}

function testReportsNoSelectedVisualsWithoutFakePlacements() {
  const visualPackage = buildVisualPackage();
  visualPackage.visuals[0] = {
    ...visualPackage.visuals[0],
    selected_asset_id: null,
    selected_asset: null,
  };

  const placements = deriveHammerVisualPlacements({
    transcriptSourceId,
    transcriptSegments: buildTranscriptSegments(),
    visualPackage,
  });

  assert.equal(placements.status, "not_started");
  assert.equal(placements.placements.length, 0);
  assert.equal(placements.uncertainty_flags.includes("no_selected_visuals"), true);
}

function testReusesPlacementArtifactWhenVisualSourcesHaveNotChanged() {
  const visualPackage = buildVisualPackage();
  const placements = deriveHammerVisualPlacements({
    transcriptSourceId,
    transcriptSegments: buildTranscriptSegments(),
    visualPackage,
  });

  assert.equal(isReusableHammerVisualPlacements(placements, transcriptSourceId, visualPackage), true);

  const changedPackage = buildVisualPackage();
  changedPackage.visuals[0] = {
    ...changedPackage.visuals[0],
    selected_asset_id: "asset_02",
    selected_asset: {
      ...changedPackage.visuals[0].selected_asset!,
      asset_id: "asset_02",
      storage_key: "workpieces/example/assets/image-map/candidates/workpiece/image-map-01/alternate.png",
    },
  };

  assert.equal(isReusableHammerVisualPlacements(placements, transcriptSourceId, changedPackage), false);
}

try {
  testDerivesDeterministicPlacementFromMatchingAnchor();
  testFallsBackToReviewableUncertainPlacementWhenMatchIsWeak();
  testReportsNoSelectedVisualsWithoutFakePlacements();
  testReusesPlacementArtifactWhenVisualSourcesHaveNotChanged();
  console.log("Hammer visual placement tests passed.");
} catch (error) {
  console.error("Hammer visual placement tests failed:", error);
  process.exitCode = 1;
}
