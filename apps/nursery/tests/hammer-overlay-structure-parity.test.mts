import assert from "node:assert/strict";
import { buildHammerReleasePrepPackage } from "../../hammer/src/lib/hammerReleasePrepPackage.ts";
import {
  buildHammerQuenchReleasePacket,
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
} from "../../hammer/src/lib/hammerQuenchReleasePacket.ts";
import { buildHammerReadinessVerdict } from "../../hammer/src/editor/hammerReadinessTypes.ts";
import { resolveSelectedPlacementId } from "../../hammer/src/editor/hammerWorkspaceSelection.ts";
import type { HammerPersistedStructuredTranscript } from "../../hammer/src/persistence/hammerPersistenceContract.ts";
import {
  ingestHammerReleasePacket,
  type HammerQuenchReleasePacketManifest,
} from "../../quench/src/index.ts";

type MemoryStore = Record<string, unknown>;

function createReader(store: MemoryStore) {
  return {
    async readJson(path: string): Promise<unknown | null> {
      return store[path] ?? null;
    },
    async readText(path: string): Promise<string | null> {
      const value = store[path];
      return typeof value === "string" ? value : null;
    },
  };
}

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "tx_overlay_structure_01",
  media_id: "media_overlay_structure_01",
  media_signature: "sig_overlay_structure_01",
  prepared_at: "2026-04-02T16:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_overlay_structure_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/overlay-structure.wav",
    mime_type: "audio/wav",
    duration_ms: 15_000,
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_overlay_structure_01",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_overlay_001",
      start_sec: 0,
      end_sec: 4,
      speaker: "S1",
      text: "We start with the first visual on screen.",
    },
    {
      segment_id: "seg_overlay_002",
      start_sec: 4,
      end_sec: 8,
      speaker: "S1",
      text: "Then we shift to a second visual beat.",
    },
    {
      segment_id: "seg_overlay_003",
      start_sec: 8,
      end_sec: 12,
      speaker: "S1",
      text: "Finally we close on the third image.",
    },
  ],
  derived_text_layers: {
    schema_version: 1,
    active_layer_id: null,
    output_layer_id: null,
    layers: [],
  },
  subtitle_outputs: {
    schema_version: 1,
    last_generated_format: "srt",
    srt: {
      format: "srt",
      generated_at: "2026-04-02T16:01:00.000Z",
      source_transcript_id: "tx_overlay_structure_01",
      source_layer_id: null,
      source_kind: "raw",
      source_recipe_ref: null,
      approximate_timing: false,
      entry_count: 3,
      content: "1\n00:00:00,000 --> 00:00:04,000\nWe start with the first visual on screen.\n",
    },
    vtt: {
      format: "vtt",
      generated_at: "2026-04-02T16:01:15.000Z",
      source_transcript_id: "tx_overlay_structure_01",
      source_layer_id: null,
      source_kind: "raw",
      source_recipe_ref: null,
      approximate_timing: false,
      entry_count: 3,
      content: "WEBVTT\n\n00:00.000 --> 00:04.000\nWe start with the first visual on screen.\n",
    },
  },
};

async function testOverlayStructureParity() {
  const placementIds = ["placement-a", "placement-b", "placement-c"];

  assert.equal(resolveSelectedPlacementId(placementIds, "placement-b"), "placement-b");
  assert.equal(resolveSelectedPlacementId(placementIds, "missing-placement"), "placement-a");

  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_overlay_structure_01",
    workpieceId: "wp_overlay_structure_01",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: {
      schema_version: 1,
      source_refs: [`transcript:${transcript.transcript_id}`],
      status: "prepared",
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement-a",
          entry_id: "image-map-a",
          anchor_segment_id: "seg_overlay_001",
          matched_segment_ids: ["seg_overlay_001"],
          anchor_text: "first visual",
          asset_ref: "asset-a",
          asset_id: "asset-a",
          asset_path: "visuals/a.png",
          storage_key: "workpieces/wp_overlay_structure_01/assets/a.png",
          label: "Image A",
          visual_mode: "hero",
          start_sec: 0.5,
          end_sec: 3.5,
          confidence: 0.98,
          timing_source: "transcript_match",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: { x: 0.1, y: 0.15, width: 0.3, height: 0.35, anchor: "top_left" },
          animation_preset: "fade_in",
          overlay_opacity: 0.9,
          overlay_z_index: 1,
        },
        {
          placement_id: "placement-b",
          entry_id: "image-map-b",
          anchor_segment_id: "seg_overlay_002",
          matched_segment_ids: ["seg_overlay_002"],
          anchor_text: "second visual",
          asset_ref: "asset-b",
          asset_id: "asset-b",
          asset_path: "visuals/b.png",
          storage_key: "workpieces/wp_overlay_structure_01/assets/b.png",
          label: "Image B",
          visual_mode: "comparison",
          start_sec: 4.2,
          end_sec: 7.6,
          confidence: 0.96,
          timing_source: "transcript_match",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: { x: 0.55, y: 0.2, width: 0.25, height: 0.25, anchor: "top_left" },
          animation_preset: "shutter_in",
          overlay_opacity: 0.85,
          overlay_z_index: 2,
        },
        {
          placement_id: "placement-c",
          entry_id: "image-map-c",
          anchor_segment_id: "seg_overlay_003",
          matched_segment_ids: ["seg_overlay_003"],
          anchor_text: "third visual",
          asset_ref: "asset-c",
          asset_id: "asset-c",
          asset_path: "visuals/c.png",
          storage_key: "workpieces/wp_overlay_structure_01/assets/c.png",
          label: "Image C",
          visual_mode: "map",
          start_sec: 8.4,
          end_sec: 11.5,
          confidence: 0.94,
          timing_source: "transcript_match",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: { x: 0.2, y: 0.55, width: 0.4, height: 0.25, anchor: "top_left" },
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: 3,
        },
      ],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound"],
      source_artifact_paths: ["recordings/overlay-structure.wav"],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_overlay_structure_01",
      source_media_signature: "sig_overlay_structure_01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-04-02T16:02:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/overlay-structure.wav",
      output_workpiece_path: "hammer/prep/audio-polish/overlay-structure.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 15_000,
      failure_code: null,
      failure_reason: null,
    },
    editorSession: {
      schema_version: 1,
      session_id: "session_overlay_structure_01",
      source_mode: "tongs",
      preview_mode: "edit-aware",
      transcript_source_id: transcript.transcript_id,
      selected_segment_id: "seg_overlay_002",
      selected_overlay_row_id: "placement-b",
      media_ref: transcript.source_media_ref,
      workspace_mapping: null,
      media_source_label: "overlay-structure-source",
      visual_preview: {
        white_balance: 0,
        color_amount: 0,
        background_blur: false,
      },
      last_opened_at: "2026-04-02T16:03:00.000Z",
    },
  });

  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    readinessGate: buildHammerReadinessVerdict({
      blockingReasons: [],
      reviewReasons: [],
    }),
    preparedAt: "2026-04-02T16:04:00.000Z",
  });

  const manifest = packet.manifest as HammerQuenchReleasePacketManifest;
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path!]: packet.transcriptText,
    [manifest.captions.srt_path!]: packet.srtText,
    [manifest.captions.vtt_path!]: packet.vttText,
    [manifest.visuals.placements_path]: packet.visuals,
  };

  const ingest = await ingestHammerReleasePacket({
    reader: createReader(store),
    audioResolver: {
      async resolveAudioReference() {
        return {
          resolved: true,
          uri: "file:///overlay-structure.wav",
          reason: null,
        };
      },
    },
  });

  assert.equal(packet.visuals.length, 3);
  assert.deepEqual(
    packet.visuals.map((placement) => placement.placement_id),
    placementIds,
  );
  assert.deepEqual(
    packet.visuals.map((placement) => [placement.start_sec, placement.end_sec]),
    [
      [0.5, 3.5],
      [4.2, 7.6],
      [8.4, 11.5],
    ],
  );

  assert.equal(ingest.state, "ready");
  assert.equal(ingest.visuals?.length, 3);
  assert.deepEqual(
    ingest.visuals?.map((placement) => placement.placement_id),
    placementIds,
  );
  assert.deepEqual(
    ingest.visuals?.map((placement) => [placement.anchor_segment_id, placement.start_sec, placement.end_sec, placement.asset_path]),
    [
      ["seg_overlay_001", 0.5, 3.5, "visuals/a.png"],
      ["seg_overlay_002", 4.2, 7.6, "visuals/b.png"],
      ["seg_overlay_003", 8.4, 11.5, "visuals/c.png"],
    ],
  );
}

await testOverlayStructureParity();

console.log("Hammer overlay structure parity tests passed.");
