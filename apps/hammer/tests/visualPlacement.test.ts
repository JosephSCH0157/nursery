import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import type { HammerVisualPackage } from "../../../packages/contracts/hammer/visual-package.contract";
import { getDevTranscriptSegments } from "../src/dev/transcriptFixtures";
import { getDevVisualPackage } from "../src/dev/visualPackageFixtures";
import { buildVisualTimelineClips, resolveVisualPlacements } from "../src/lib/visualPlacement";

function buildVisualPackage(args: {
  workpieceId: string;
  visuals: Array<{
    entryId: string;
    beatOrder: number;
    paragraphBeatOrder: number;
    spanText: string;
  }>;
}): HammerVisualPackage {
  return {
    workspace_id: "ws_test",
    workpiece_id: args.workpieceId,
    script_path: "script/script.md",
    script_updated_at: "2026-03-12T00:00:00.000Z",
    image_map_updated_at: "2026-03-12T00:00:00.000Z",
    image_map_asset_updated_at: "2026-03-12T00:00:00.000Z",
    visuals: args.visuals.map((visual) => ({
      entry_id: visual.entryId,
      beat_order: visual.beatOrder,
      paragraph_beat_order: visual.paragraphBeatOrder,
      status: "selected",
      script_anchor: {
        section_id: "intro",
        paragraph_id: `p_${visual.entryId}`,
        paragraph_order: visual.beatOrder,
        sentence_start: 1,
        sentence_end: 1,
        char_start: 0,
        char_end: visual.spanText.length,
        span_text: visual.spanText,
        speaker_block_id: null,
      },
      visual_mode: "concept_illustration",
      selected_asset_id: `${visual.entryId}_asset`,
      selected_asset: {
        asset_id: `${visual.entryId}_asset`,
        path: `assets/image-map/${args.workpieceId}/${visual.entryId}.png`,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${args.workpieceId}/assets/image-map/${visual.entryId}.png`,
        mime_type: "image/png",
        bytes: 1024,
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        variant_label: "selected",
        visual_mode: "concept_illustration",
      },
    })),
  };
}

async function testFixturePlacementSnapshot() {
  const visualPackage = getDevVisualPackage({
    fixtureId: "podcast_a",
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
  });
  const transcriptSegments = getDevTranscriptSegments("podcast_a");
  const result = resolveVisualPlacements(visualPackage, transcriptSegments);

  assert.deepEqual(result, {
    workspace_id: "ws_demo",
    workpiece_id: "wp_demo",
    transcript_segment_count: 8,
    placements: [
      {
        entry_id: "visual_001",
        beat_order: 1,
        paragraph_beat_order: 1,
        visual_mode: "concept_illustration",
        selected_asset_id: "visual_001_asset",
        start_sec: 10,
        end_sec: 14,
        confidence: 1,
        match_type: "exact",
        matched_segment_ids: ["seg_003"],
        anchor_text_used: "Here is the real problem we keep seeing.",
      },
      {
        entry_id: "visual_002",
        beat_order: 2,
        paragraph_beat_order: 2,
        visual_mode: "comparison",
        selected_asset_id: "visual_002_asset",
        start_sec: 14,
        end_sec: 21,
        confidence: 1,
        match_type: "exact",
        matched_segment_ids: ["seg_004", "seg_005"],
        anchor_text_used: "Most teams optimize output, not signal. That is why workflow quality breaks first.",
      },
      {
        entry_id: "visual_003",
        beat_order: 3,
        paragraph_beat_order: 1,
        visual_mode: "concept_illustration",
        selected_asset_id: "visual_003_asset",
        start_sec: 21,
        end_sec: 24,
        confidence: 0.8,
        match_type: "overlap",
        matched_segment_ids: ["seg_006"],
        anchor_text_used: "Can we anchor this to a repeatable pattern?",
      },
      {
        entry_id: "visual_004",
        beat_order: 4,
        paragraph_beat_order: 1,
        visual_mode: "concept_illustration",
        selected_asset_id: "visual_004_asset",
        start_sec: 24,
        end_sec: 28,
        confidence: 0.97,
        match_type: "exact",
        matched_segment_ids: ["seg_007"],
        anchor_text_used: "transcript driven edits become deterministic",
      },
    ],
  });
}

async function testMonotonicRepeatMatchesStayOrdered() {
  const transcriptSegments: HammerTranscriptSegment[] = [
    { segment_id: "seg_a", start_sec: 4, end_sec: 6, speaker: "S1", text: "Alpha cue" },
    { segment_id: "seg_b", start_sec: 0, end_sec: 2, speaker: "S1", text: "Opening line" },
    { segment_id: "seg_c", start_sec: 7, end_sec: 9, speaker: "S1", text: "Bridge text" },
    { segment_id: "seg_d", start_sec: 10, end_sec: 12, speaker: "S1", text: "Alpha cue" },
  ];
  const visualPackage = buildVisualPackage({
    workpieceId: "wp_repeat",
    visuals: [
      {
        entryId: "visual_repeat_1",
        beatOrder: 1,
        paragraphBeatOrder: 1,
        spanText: "Alpha cue",
      },
      {
        entryId: "visual_repeat_2",
        beatOrder: 2,
        paragraphBeatOrder: 1,
        spanText: "Alpha cue",
      },
    ],
  });

  const firstRun = resolveVisualPlacements(visualPackage, transcriptSegments);
  const secondRun = resolveVisualPlacements(visualPackage, transcriptSegments);

  assert.deepEqual(firstRun, secondRun);
  assert.deepEqual(
    firstRun.placements.map((placement) => ({
      entry_id: placement.entry_id,
      start_sec: placement.start_sec,
      match_type: placement.match_type,
      matched_segment_ids: placement.matched_segment_ids,
    })),
    [
      {
        entry_id: "visual_repeat_1",
        start_sec: 4,
        match_type: "exact",
        matched_segment_ids: ["seg_a"],
      },
      {
        entry_id: "visual_repeat_2",
        start_sec: 10,
        match_type: "exact",
        matched_segment_ids: ["seg_d"],
      },
    ],
  );
}

async function testWeakMatchesDegradeWithoutInventingCertainty() {
  const transcriptSegments: HammerTranscriptSegment[] = [
    { segment_id: "seg_1", start_sec: 0, end_sec: 2, speaker: "S1", text: "Opening remarks" },
  ];
  const visualPackage = buildVisualPackage({
    workpieceId: "wp_fallback",
    visuals: [
      {
        entryId: "visual_fallback_1",
        beatOrder: 1,
        paragraphBeatOrder: 1,
        spanText: "Completely unrelated anchor text",
      },
      {
        entryId: "visual_fallback_2",
        beatOrder: 2,
        paragraphBeatOrder: 1,
        spanText: "Another anchor that cannot match",
      },
    ],
  });

  const result = resolveVisualPlacements(visualPackage, transcriptSegments);

  assert.deepEqual(
    result.placements.map((placement) => ({
      entry_id: placement.entry_id,
      start_sec: placement.start_sec,
      end_sec: placement.end_sec,
      confidence: placement.confidence,
      match_type: placement.match_type,
      matched_segment_ids: placement.matched_segment_ids,
    })),
    [
      {
        entry_id: "visual_fallback_1",
        start_sec: 0,
        end_sec: 2,
        confidence: 0.18,
        match_type: "progress_fallback",
        matched_segment_ids: ["seg_1"],
      },
      {
        entry_id: "visual_fallback_2",
        start_sec: null,
        end_sec: null,
        confidence: 0,
        match_type: "unmatched",
        matched_segment_ids: [],
      },
    ],
  );
}

async function testTimelineClipConsumptionUsesPlacedSelectedVisualsOnly() {
  const visualPackage = getDevVisualPackage({
    fixtureId: "podcast_a",
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
  });
  const transcriptSegments = getDevTranscriptSegments("podcast_a");
  const placementResult = resolveVisualPlacements(visualPackage, transcriptSegments);
  const clips = buildVisualTimelineClips({
    visualPackage,
    placementResult,
    rowIdBySegmentId: new Map([
      ["seg_003", "row_003"],
      ["seg_004", "row_004"],
      ["seg_006", "row_006"],
      ["seg_007", "row_007"],
    ]),
  });

  assert.deepEqual(clips, [
    {
      clip_id: "visual_visual_001",
      entry_id: "visual_001",
      asset_id: "visual_001_asset",
      start_sec: 10,
      end_sec: 14,
      label: "beat 1",
      tone: "#fb923c",
      linked_row_id: "row_003",
      linked_segment_id: "seg_003",
      match_type: "exact",
    },
    {
      clip_id: "visual_visual_002",
      entry_id: "visual_002",
      asset_id: "visual_002_asset",
      start_sec: 14,
      end_sec: 21,
      label: "beat 2",
      tone: "#fb923c",
      linked_row_id: "row_004",
      linked_segment_id: "seg_004",
      match_type: "exact",
    },
    {
      clip_id: "visual_visual_003",
      entry_id: "visual_003",
      asset_id: "visual_003_asset",
      start_sec: 21,
      end_sec: 24,
      label: "beat 3",
      tone: "#f59e0b",
      linked_row_id: "row_006",
      linked_segment_id: "seg_006",
      match_type: "overlap",
    },
    {
      clip_id: "visual_visual_004",
      entry_id: "visual_004",
      asset_id: "visual_004_asset",
      start_sec: 24,
      end_sec: 28,
      label: "beat 4",
      tone: "#fb923c",
      linked_row_id: "row_007",
      linked_segment_id: "seg_007",
      match_type: "exact",
    },
  ]);
}

async function run() {
  await testFixturePlacementSnapshot();
  await testMonotonicRepeatMatchesStayOrdered();
  await testWeakMatchesDegradeWithoutInventingCertainty();
  await testTimelineClipConsumptionUsesPlacedSelectedVisualsOnly();
  // eslint-disable-next-line no-console
  console.log("Hammer visual placement tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual placement tests failed:", error);
  process.exit(1);
});
