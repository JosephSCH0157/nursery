import assert from "node:assert/strict";
import { buildHammerReadableTranscriptGroups } from "../src/lib/hammerTranscriptReadability";
import type { TranscriptOverlayRow } from "../src/lib/transcriptPreview";

function buildRow(args: Partial<TranscriptOverlayRow> & Pick<TranscriptOverlayRow, "row_id" | "anchor_segment_id" | "speaker" | "start_sec" | "end_sec">): TranscriptOverlayRow {
  return {
    row_id: args.row_id,
    anchor_segment_id: args.anchor_segment_id,
    next_segment_id: args.next_segment_id ?? null,
    source_segment_ids: args.source_segment_ids ?? [args.anchor_segment_id],
    speaker: args.speaker,
    start_sec: args.start_sec,
    end_sec: args.end_sec,
    structure: args.structure ?? "base",
    blocks: args.blocks ?? [{
      block_id: `${args.row_id}:block`,
      start_sec: args.start_sec,
      end_sec: args.end_sec,
      label: null,
      text: args.row_id,
      source_segment_ids: args.source_segment_ids ?? [args.anchor_segment_id],
    }],
    timing_blocks: args.timing_blocks ?? [{
      block_id: `${args.row_id}:timing`,
      start_sec: args.start_sec,
      end_sec: args.end_sec,
      label: null,
      text: args.row_id,
      source_segment_ids: args.source_segment_ids ?? [args.anchor_segment_id],
    }],
    split_instruction: null,
    merge_instruction: null,
    is_deleted: false,
    is_muted: false,
    is_trimmed: false,
  };
}

function testBuildsReadableGroupsWithoutLosingChunkIdentity() {
  const groups = buildHammerReadableTranscriptGroups([
    buildRow({
      row_id: "row-1",
      anchor_segment_id: "seg-1",
      speaker: "Host",
      start_sec: 0,
      end_sec: 1.2,
      blocks: [{ block_id: "b1", start_sec: 0, end_sec: 1.2, label: null, text: "First chunk.", source_segment_ids: ["seg-1"] }],
      timing_blocks: [{ block_id: "b1", start_sec: 0, end_sec: 1.2, label: null, text: "First chunk.", source_segment_ids: ["seg-1"] }],
    }),
    buildRow({
      row_id: "row-2",
      anchor_segment_id: "seg-2",
      speaker: "Host",
      start_sec: 1.25,
      end_sec: 2.3,
      blocks: [{ block_id: "b2", start_sec: 1.25, end_sec: 2.3, label: null, text: "Second chunk.", source_segment_ids: ["seg-2"] }],
      timing_blocks: [{ block_id: "b2", start_sec: 1.25, end_sec: 2.3, label: null, text: "Second chunk.", source_segment_ids: ["seg-2"] }],
    }),
    buildRow({
      row_id: "row-3",
      anchor_segment_id: "seg-3",
      speaker: "Guest",
      start_sec: 2.8,
      end_sec: 3.5,
      blocks: [{ block_id: "b3", start_sec: 2.8, end_sec: 3.5, label: null, text: "Third chunk.", source_segment_ids: ["seg-3"] }],
      timing_blocks: [{ block_id: "b3", start_sec: 2.8, end_sec: 3.5, label: null, text: "Third chunk.", source_segment_ids: ["seg-3"] }],
    }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.text, "First chunk. Second chunk.");
  assert.deepEqual(groups[0]?.row_ids, ["row-1", "row-2"]);
  assert.deepEqual(groups[0]?.source_segment_ids, ["seg-1", "seg-2"]);
  assert.deepEqual(groups[1]?.row_ids, ["row-3"]);
}

function testSplitRowsStaySeparateReadableGroups() {
  const groups = buildHammerReadableTranscriptGroups([
    buildRow({
      row_id: "row-split-a",
      anchor_segment_id: "seg-split",
      speaker: "Host",
      start_sec: 0,
      end_sec: 0.8,
      structure: "split",
    }),
    buildRow({
      row_id: "row-next",
      anchor_segment_id: "seg-next",
      speaker: "Host",
      start_sec: 0.81,
      end_sec: 1.5,
    }),
  ]);

  assert.equal(groups.length, 2);
}

try {
  testBuildsReadableGroupsWithoutLosingChunkIdentity();
  testSplitRowsStaySeparateReadableGroups();
  console.log("Hammer transcript readability tests passed.");
} catch (error) {
  console.error("Hammer transcript readability tests failed:", error);
  process.exitCode = 1;
}

