import assert from "node:assert/strict";
import type { HammerEditInstruction } from "../../../packages/contracts/hammer/edit-instruction.contract";
import { getDevTranscriptSegments } from "../src/dev/transcriptFixtures";
import {
  buildInstructionIndex,
  buildPlaybackRanges,
  buildTranscriptOverlayRows,
  resolveCurrentPlayableSeekTarget,
  resolveNextPlayableSeekTarget,
  resolvePreviousPlayableSeekTarget,
  resolveSeekTargetForRow,
} from "../src/lib/transcriptPreview";

function buildFixtureInstructions(): HammerEditInstruction[] {
  const createdAt = "2026-03-07T21:00:00.000Z";
  return [
    {
      instruction_id: "ins_delete_seg_002",
      segment_id: "seg_002",
      type: "delete",
      created_at: createdAt,
    },
    {
      instruction_id: "ins_split_seg_003",
      segment_id: "seg_003",
      type: "split",
      split_at_sec: 11.8,
      created_at: createdAt,
    },
    {
      instruction_id: "ins_trim_seg_004",
      segment_id: "seg_004",
      type: "trim",
      trim_start_sec: 14.4,
      trim_end_sec: 16.4,
      created_at: createdAt,
    },
    {
      instruction_id: "ins_trim_seg_005",
      segment_id: "seg_005",
      type: "trim",
      trim_start_sec: 17.2,
      trim_end_sec: 20.4,
      created_at: createdAt,
    },
    {
      instruction_id: "ins_merge_seg_004",
      segment_id: "seg_004",
      type: "merge",
      merge_with_segment_id: "seg_005",
      created_at: createdAt,
    },
    {
      instruction_id: "ins_mute_seg_006",
      segment_id: "seg_006",
      type: "mute",
      created_at: createdAt,
    },
  ];
}

function buildPreviewFixture() {
  const segments = getDevTranscriptSegments("podcast_a");
  const instructionIndex = buildInstructionIndex(buildFixtureInstructions());
  const overlayRows = buildTranscriptOverlayRows(segments, instructionIndex);
  const segmentById = new Map(segments.map((segment) => [segment.segment_id, segment]));
  const playbackRanges = buildPlaybackRanges(overlayRows, segmentById, instructionIndex);
  return {
    overlayRows,
    playbackRanges,
  };
}

async function testOverlayDerivationSnapshot() {
  const { overlayRows } = buildPreviewFixture();
  const snapshot = overlayRows.map((row) => ({
    row_id: row.row_id,
    structure: row.structure,
    source_segment_ids: row.source_segment_ids,
    timing_blocks: row.timing_blocks.map((block) => [block.start_sec, block.end_sec]),
    is_deleted: row.is_deleted,
    is_muted: row.is_muted,
    is_trimmed: row.is_trimmed,
  }));

  assert.deepEqual(snapshot, [
    {
      row_id: "seg_001",
      structure: "base",
      source_segment_ids: ["seg_001"],
      timing_blocks: [[3, 7]],
      is_deleted: false,
      is_muted: false,
      is_trimmed: false,
    },
    {
      row_id: "seg_002",
      structure: "base",
      source_segment_ids: ["seg_002"],
      timing_blocks: [[7, 10]],
      is_deleted: true,
      is_muted: false,
      is_trimmed: false,
    },
    {
      row_id: "seg_003::split-a",
      structure: "split",
      source_segment_ids: ["seg_003"],
      timing_blocks: [[10, 11.8]],
      is_deleted: false,
      is_muted: false,
      is_trimmed: false,
    },
    {
      row_id: "seg_003::split-b",
      structure: "split",
      source_segment_ids: ["seg_003"],
      timing_blocks: [[11.8, 14]],
      is_deleted: false,
      is_muted: false,
      is_trimmed: false,
    },
    {
      row_id: "seg_004::merge",
      structure: "merge",
      source_segment_ids: ["seg_004", "seg_005"],
      timing_blocks: [[14, 17], [17, 21]],
      is_deleted: false,
      is_muted: false,
      is_trimmed: true,
    },
    {
      row_id: "seg_006",
      structure: "base",
      source_segment_ids: ["seg_006"],
      timing_blocks: [[21, 24]],
      is_deleted: false,
      is_muted: true,
      is_trimmed: false,
    },
    {
      row_id: "seg_007",
      structure: "base",
      source_segment_ids: ["seg_007"],
      timing_blocks: [[24, 28]],
      is_deleted: false,
      is_muted: false,
      is_trimmed: false,
    },
    {
      row_id: "seg_008",
      structure: "base",
      source_segment_ids: ["seg_008"],
      timing_blocks: [[28, 32]],
      is_deleted: false,
      is_muted: false,
      is_trimmed: false,
    },
  ]);
}

async function testPlaybackRangeSnapshot() {
  const { playbackRanges } = buildPreviewFixture();
  const snapshot = playbackRanges.map((range) => ({
    row_id: range.row_id,
    playable_start_sec: range.playable_start_sec,
    playable_end_sec: range.playable_end_sec,
    playable_slices: range.playable_slices.map((slice) => [slice.start_sec, slice.end_sec]),
    is_deleted: range.is_deleted,
    is_muted: range.is_muted,
  }));

  assert.deepEqual(snapshot, [
    {
      row_id: "seg_001",
      playable_start_sec: 3,
      playable_end_sec: 7,
      playable_slices: [[3, 7]],
      is_deleted: false,
      is_muted: false,
    },
    {
      row_id: "seg_002",
      playable_start_sec: null,
      playable_end_sec: null,
      playable_slices: [],
      is_deleted: true,
      is_muted: false,
    },
    {
      row_id: "seg_003::split-a",
      playable_start_sec: 10,
      playable_end_sec: 11.8,
      playable_slices: [[10, 11.8]],
      is_deleted: false,
      is_muted: false,
    },
    {
      row_id: "seg_003::split-b",
      playable_start_sec: 11.8,
      playable_end_sec: 14,
      playable_slices: [[11.8, 14]],
      is_deleted: false,
      is_muted: false,
    },
    {
      row_id: "seg_004::merge",
      playable_start_sec: 14.4,
      playable_end_sec: 20.4,
      playable_slices: [[14.4, 16.4], [17.2, 20.4]],
      is_deleted: false,
      is_muted: false,
    },
    {
      row_id: "seg_006",
      playable_start_sec: 21,
      playable_end_sec: 24,
      playable_slices: [[21, 24]],
      is_deleted: false,
      is_muted: true,
    },
    {
      row_id: "seg_007",
      playable_start_sec: 24,
      playable_end_sec: 28,
      playable_slices: [[24, 28]],
      is_deleted: false,
      is_muted: false,
    },
    {
      row_id: "seg_008",
      playable_start_sec: 28,
      playable_end_sec: 32,
      playable_slices: [[28, 32]],
      is_deleted: false,
      is_muted: false,
    },
  ]);
}

async function testSeekResolution() {
  const { playbackRanges } = buildPreviewFixture();
  const deletedRow = playbackRanges.find((range) => range.row_id === "seg_002");
  assert.ok(deletedRow, "Deleted row should exist in playback ranges");

  assert.deepEqual(resolveSeekTargetForRow(deletedRow!, playbackRanges), {
    row_id: "seg_003::split-a",
    timeSec: 10,
  });

  assert.deepEqual(resolveNextPlayableSeekTarget(playbackRanges, 7.5), {
    row_id: "seg_003::split-a",
    timeSec: 10,
  });

  assert.deepEqual(resolvePreviousPlayableSeekTarget(playbackRanges, 10.2), {
    row_id: "seg_001",
    timeSec: 3,
  });

  assert.deepEqual(resolveCurrentPlayableSeekTarget(playbackRanges, 14.1), {
    row_id: "seg_004::merge",
    timeSec: 14.4,
  });

  assert.deepEqual(resolveCurrentPlayableSeekTarget(playbackRanges, 16.6), {
    row_id: "seg_004::merge",
    timeSec: 17.2,
  });
}

async function run() {
  await testOverlayDerivationSnapshot();
  await testPlaybackRangeSnapshot();
  await testSeekResolution();
  // eslint-disable-next-line no-console
  console.log("Hammer transcript preview tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer transcript preview tests failed:", error);
  process.exit(1);
});
