import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deriveHammerVisualPlacements } from "../src/lib/hammerVisualPlacements";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";

async function testAnvilLiveAsrCannotBecomeCanonicalTranscript() {
  const editorPath = path.resolve(process.cwd(), "apps/hammer/src/editor/HammerWorkspaceEditor.tsx");
  const source = await fs.readFile(editorPath, "utf-8");
  assert.equal(
    source.includes("promoteAnvilLocalTranscriptToTongs("),
    false,
    "Anvil live ASR must never promote into canonical Hammer transcript persistence.",
  );
  assert.equal(
    source.includes("transcriptSource = \"local_anvil\""),
    false,
    "Anvil live ASR must never be selected as canonical transcript source.",
  );
  assert.equal(
    source.includes("source: \"live_noncanonical\""),
    true,
    "Anvil live ASR recovery should be tracked only as live_noncanonical diagnostics.",
  );
}

function testScriptCueAlignmentDoesNotMutateTranscriptAndAnchorsToHammerTimeline() {
  const transcript: HammerTranscriptSegment[] = [
    { segment_id: "seg_001", speaker: "S1", text: "Intro.", start_sec: 0, end_sec: 1 },
    { segment_id: "seg_002", speaker: "S1", text: "Middle beat.", start_sec: 1, end_sec: 2 },
    { segment_id: "seg_003", speaker: "S1", text: "Planned visual moment.", start_sec: 2, end_sec: 3 },
  ];
  const transcriptBefore = JSON.stringify(transcript);

  const placements = deriveHammerVisualPlacements({
    transcriptSourceId: "transcript_authority_01",
    transcriptSegments: transcript,
    visualPackage: {
      workspace_id: "workspace_01",
      workpiece_id: "workpiece_01",
      script_path: "hearth/script.md",
      script_updated_at: "2026-05-07T00:00:00.000Z",
      image_map_updated_at: "2026-05-07T00:00:00.000Z",
      image_map_asset_updated_at: "2026-05-07T00:00:00.000Z",
      visuals: [
        {
          entry_id: "cue_001",
          beat_order: 1,
          paragraph_beat_order: 1,
          status: "selected",
          script_anchor: {
            section_id: "sec_01",
            paragraph_id: "p_01",
            paragraph_order: 1,
            sentence_start: 0,
            sentence_end: 1,
            char_start: 0,
            char_end: 20,
            span_text: "Planned visual moment.",
            speaker_block_id: null,
          },
          visual_mode: "image",
          selected_asset_id: "asset_001",
          selected_asset: {
            asset_id: "asset_001",
            path: "assets/images/one.png",
            storage_bucket: "workpieces",
            storage_key: "workpieces/example/assets/images/one.png",
            mime_type: "image/png",
            bytes: 1234,
            created_at: "2026-05-07T00:00:00.000Z",
            updated_at: "2026-05-07T00:00:00.000Z",
            variant_label: "Scene one",
            visual_mode: "image",
          },
          asset_class: "image",
        },
      ],
    },
  });

  assert.equal(JSON.stringify(transcript), transcriptBefore, "Script alignment must not mutate spoken-truth transcript.");
  assert.equal(placements.placements.length, 1);
  const placement = placements.placements[0];
  assert.equal(placement.anchor_segment_id, "seg_003");
  assert.equal(placement.script_cue_id, "cue_001");
  assert.equal(placement.placement_authority, "hammer_timeline_anchor");
  assert.equal(placement.alignment?.script_cue_id, "cue_001");
  assert.equal(placement.alignment?.transcript_segment_id, "seg_003");
  assert.equal(placement.alignment?.match_method, "deterministic_phrase");
  assert.equal(placement.alignment?.state, "aligned");
}

async function run() {
  await testAnvilLiveAsrCannotBecomeCanonicalTranscript();
  testScriptCueAlignmentDoesNotMutateTranscriptAndAnchorsToHammerTimeline();
  console.log("Hammer transcript authority enforcement tests passed.");
}

run().catch((error) => {
  console.error("Hammer transcript authority enforcement tests failed:", error);
  process.exitCode = 1;
});
