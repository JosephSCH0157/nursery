import type { HammerVisualPackage } from "../../../../packages/contracts/hammer/visual-package.contract";

const NOW_ISO = "2026-03-12T00:00:00.000Z";

type VisualFixtureDefinition = {
  entry_id: string;
  beat_order: number;
  paragraph_beat_order: number;
  visual_mode: string;
  segment_text: string;
  paragraph_id: string;
  paragraph_order: number;
  sentence_start: number;
  sentence_end: number;
  char_start: number;
  char_end: number;
};

const FIXTURE_INDEX: Record<string, VisualFixtureDefinition[]> = {
  podcast_a: [
    {
      entry_id: "visual_001",
      beat_order: 1,
      paragraph_beat_order: 1,
      visual_mode: "concept_illustration",
      segment_text: "Here is the real problem we keep seeing.",
      paragraph_id: "p1",
      paragraph_order: 1,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 0,
      char_end: 39,
    },
    {
      entry_id: "visual_002",
      beat_order: 2,
      paragraph_beat_order: 2,
      visual_mode: "comparison",
      segment_text: "Most teams optimize output, not signal. That is why workflow quality breaks first.",
      paragraph_id: "p2",
      paragraph_order: 2,
      sentence_start: 1,
      sentence_end: 2,
      char_start: 40,
      char_end: 121,
    },
    {
      entry_id: "visual_003",
      beat_order: 3,
      paragraph_beat_order: 1,
      visual_mode: "concept_illustration",
      segment_text: "Can we anchor this to a repeatable pattern?",
      paragraph_id: "p3",
      paragraph_order: 3,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 122,
      char_end: 165,
    },
    {
      entry_id: "visual_004",
      beat_order: 4,
      paragraph_beat_order: 1,
      visual_mode: "concept_illustration",
      segment_text: "transcript driven edits become deterministic",
      paragraph_id: "p4",
      paragraph_order: 4,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 166,
      char_end: 211,
    },
  ],
  podcast_b: [
    {
      entry_id: "visual_b_001",
      beat_order: 1,
      paragraph_beat_order: 1,
      visual_mode: "event_scene",
      segment_text: "Welcome back to the show.",
      paragraph_id: "p1",
      paragraph_order: 1,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 0,
      char_end: 25,
    },
    {
      entry_id: "visual_b_002",
      beat_order: 2,
      paragraph_beat_order: 1,
      visual_mode: "comparison",
      segment_text: "Today we are comparing quality and speed.",
      paragraph_id: "p2",
      paragraph_order: 2,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 26,
      char_end: 68,
    },
    {
      entry_id: "visual_b_003",
      beat_order: 3,
      paragraph_beat_order: 1,
      visual_mode: "concept_illustration",
      segment_text: "deterministic editing signals",
      paragraph_id: "p3",
      paragraph_order: 3,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 69,
      char_end: 99,
    },
  ],
};

function cloneVisualPackage(visualPackage: HammerVisualPackage): HammerVisualPackage {
  return {
    ...visualPackage,
    visuals: visualPackage.visuals.map((visual) => ({
      ...visual,
      script_anchor: visual.script_anchor ? { ...visual.script_anchor } : null,
      selected_asset: visual.selected_asset ? { ...visual.selected_asset } : null,
    })),
  };
}

export function getDevVisualPackage(args: {
  fixtureId: string;
  workspaceId: string;
  workpieceId: string;
}): HammerVisualPackage {
  const fixtureRows = FIXTURE_INDEX[args.fixtureId] ?? FIXTURE_INDEX.podcast_a ?? [];
  const visualPackage: HammerVisualPackage = {
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    script_path: "script/script.md",
    script_updated_at: NOW_ISO,
    image_map_updated_at: NOW_ISO,
    image_map_asset_updated_at: NOW_ISO,
    visuals: fixtureRows.map((row) => ({
      entry_id: row.entry_id,
      beat_order: row.beat_order,
      paragraph_beat_order: row.paragraph_beat_order,
      status: "selected",
      script_anchor: {
        section_id: "intro",
        paragraph_id: row.paragraph_id,
        paragraph_order: row.paragraph_order,
        sentence_start: row.sentence_start,
        sentence_end: row.sentence_end,
        char_start: row.char_start,
        char_end: row.char_end,
        span_text: row.segment_text,
        speaker_block_id: null,
      },
      visual_mode: row.visual_mode,
      selected_asset_id: `${row.entry_id}_asset`,
      selected_asset: {
        asset_id: `${row.entry_id}_asset`,
        path: `assets/image-map/${args.workpieceId}/${row.entry_id}.png`,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${args.workpieceId}/assets/image-map/${row.entry_id}.png`,
        mime_type: "image/png",
        bytes: 2048,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
        variant_label: "selected",
        visual_mode: row.visual_mode,
      },
    })),
  };

  return cloneVisualPackage(visualPackage);
}
