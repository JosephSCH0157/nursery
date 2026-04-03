import assert from "node:assert/strict";
import { buildHammerReleasePrepPackage } from "../../hammer/src/lib/hammerReleasePrepPackage.ts";
import {
  buildHammerQuenchReleasePacket,
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
} from "../../hammer/src/lib/hammerQuenchReleasePacket.ts";
import { buildHammerRenderAssembly, projectEditorialAuthorityGraphFromEditPlan } from "../../hammer/src/editor/hammerRenderAssembly.ts";
import { evaluateHammerReadinessGate } from "../../hammer/src/editor/hammerReadinessGate.ts";
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
  transcript_id: "tx_podcast_master_01",
  media_id: "media_podcast_master_01",
  media_signature: "sig_podcast_master_01",
  prepared_at: "2026-04-02T17:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_podcast_master_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/podcast-master.wav",
    mime_type: "audio/wav",
    duration_ms: 9000,
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_podcast_master_01",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_master_001",
      start_sec: 0,
      end_sec: 6,
      speaker: "S1",
      text: "This is the mastered audio proof case.",
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
      generated_at: "2026-04-02T17:01:00.000Z",
      source_transcript_id: "tx_podcast_master_01",
      source_layer_id: null,
      source_kind: "raw",
      source_recipe_ref: null,
      approximate_timing: false,
      entry_count: 1,
      content: "1\n00:00:00,000 --> 00:00:06,000\nThis is the mastered audio proof case.\n",
    },
    vtt: {
      format: "vtt",
      generated_at: "2026-04-02T17:01:15.000Z",
      source_transcript_id: "tx_podcast_master_01",
      source_layer_id: null,
      source_kind: "raw",
      source_recipe_ref: null,
      approximate_timing: false,
      entry_count: 1,
      content: "WEBVTT\n\n00:00.000 --> 00:06.000\nThis is the mastered audio proof case.\n",
    },
  },
};

function buildPrep() {
  return buildHammerReleasePrepPackage({
    workspaceId: "ws_podcast_master_01",
    workpieceId: "wp_podcast_master_01",
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
          placement_id: "placement_master_01",
          entry_id: "image-map-master-01",
          anchor_segment_id: "seg_master_001",
          matched_segment_ids: ["seg_master_001"],
          anchor_text: "master proof",
          asset_ref: "asset-master-01",
          asset_id: "asset-master-01",
          asset_path: "visuals/master-card.png",
          storage_key: "workpieces/wp_podcast_master_01/assets/master-card.png",
          label: "Master card",
          visual_mode: "hero",
          start_sec: 0.2,
          end_sec: 5.8,
          confidence: 0.95,
          timing_source: "transcript_match",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
        },
      ],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound"],
      source_artifact_paths: ["recordings/podcast-master.wav"],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_podcast_master_01",
      source_media_signature: "sig_podcast_master_01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-04-02T17:02:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/podcast-master.wav",
      output_workpiece_path: "hammer/prep/audio-polish/podcast-master.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 9000,
      failure_code: null,
      failure_reason: null,
    },
    editorSession: {
      schema_version: 1,
      session_id: "session_podcast_master_01",
      source_mode: "tongs",
      preview_mode: "edit-aware",
      transcript_source_id: transcript.transcript_id,
      selected_segment_id: "seg_master_001",
      selected_overlay_row_id: "placement_master_01",
      media_ref: transcript.source_media_ref,
      workspace_mapping: null,
      media_source_label: "podcast-master-source",
      visual_preview: {
        white_balance: 0,
        color_amount: 0,
        background_blur: false,
      },
      last_opened_at: "2026-04-02T17:03:00.000Z",
    },
  });
}

function buildPodcastMasterGraph() {
  return projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_podcast_master_01",
      version: "1",
      created_at: "2026-04-02T17:00:00.000Z",
      updated_at: "2026-04-02T17:00:00.000Z",
      source_transcript_id: transcript.transcript_id,
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_master_01",
          segment_id: "seg_master_001",
          type: "podcast_master_pass",
          preset: "podcast_master_v1",
          noise_cleanup: "light",
          normalization_lufs: -16,
          compression_amount: "medium",
          limiter_ceiling_dbtp: -1,
          created_at: "2026-04-02T17:00:00.000Z",
        },
      ],
    },
    workspaceId: "ws_podcast_master_01",
    workpieceId: "wp_podcast_master_01",
    sessionId: "session_podcast_master_01",
  });
}

async function ingestPacket(manifest: HammerQuenchReleasePacketManifest, packet: ReturnType<typeof buildHammerQuenchReleasePacket>) {
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path!]: packet.transcriptText,
    [manifest.captions.srt_path!]: packet.srtText,
    [manifest.captions.vtt_path!]: packet.vttText,
    [manifest.visuals.placements_path]: packet.visuals,
  };
  return ingestHammerReleasePacket({
    reader: createReader(store),
    audioResolver: {
      async resolveAudioReference() {
        return {
          resolved: true,
          uri: "file:///podcast-master.wav",
          reason: null,
        };
      },
    },
  });
}

async function testPodcastMasterNeedsReviewParity() {
  const canonicalGraph = buildPodcastMasterGraph();
  const renderAssembly = buildHammerRenderAssembly({
    canonicalGraph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: ["podcast_master_pass"],
      handoff_supported_operation_types: ["podcast_master_pass"],
      podcast_master: {
        available: true,
        preview_supported: false,
        stages: {
          normalize: true,
          compress: false,
          limit: true,
          noise_cleanup_light: false,
        },
      },
    },
    transcriptSegments: transcript.segments,
    captionChunks: [{ chunk_id: "cap_master_001", start_sec: 0, end_sec: 1, segment_ids: ["seg_master_001"] }],
  });
  const gate = evaluateHammerReadinessGate({
    renderAssembly,
    canonicalGraph,
    boundAttentionQueue: [],
    unresolvedBrollSuggestionOperationIds: [],
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: buildPrep(),
    readinessGate: gate,
    canonicalGraph,
    renderAssembly,
    preparedAt: "2026-04-02T17:04:00.000Z",
  });
  const ingest = await ingestPacket(packet.manifest as HammerQuenchReleasePacketManifest, packet);

  assert.equal(gate.status, "needs_review");
  assert.equal(gate.reasons.some((reason) => reason.code === "podcast_master_degraded"), true);
  assert.equal(gate.reasons.some((reason) => reason.code === "podcast_master_export_only"), true);
  assert.equal(packet.manifest.readiness.status, "needs_review");
  assert.equal(packet.manifest.readiness.reason_codes.includes("podcast_master_degraded"), true);
  assert.equal(packet.manifest.readiness.reason_codes.includes("podcast_master_export_only"), true);
  assert.equal(packet.manifest.editorial_truth?.podcast_master_summary.posture, "degraded");
  assert.equal(packet.manifest.editorial_truth?.podcast_master_summary.preview_mode, "export_only");
  assert.equal(ingest.state, "needs_review");
  assert.equal(ingest.verdict?.reason_codes.includes("podcast_master_degraded"), true);
  assert.equal(ingest.verdict?.reason_codes.includes("podcast_master_export_only"), true);
  assert.equal(ingest.verdict?.reason_codes.some((code) => code.startsWith("quench_")), false);
}

async function testPodcastMasterBlockedParity() {
  const canonicalGraph = buildPodcastMasterGraph();
  const renderAssembly = buildHammerRenderAssembly({
    canonicalGraph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: [],
      handoff_supported_operation_types: ["podcast_master_pass"],
      podcast_master: {
        available: false,
        preview_supported: false,
        stages: {
          normalize: false,
          compress: false,
          limit: false,
          noise_cleanup_light: false,
        },
      },
    },
    transcriptSegments: transcript.segments,
    captionChunks: [{ chunk_id: "cap_master_001", start_sec: 0, end_sec: 1, segment_ids: ["seg_master_001"] }],
  });
  const gate = evaluateHammerReadinessGate({
    renderAssembly,
    canonicalGraph,
    boundAttentionQueue: [],
    unresolvedBrollSuggestionOperationIds: [],
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: buildPrep(),
    readinessGate: gate,
    canonicalGraph,
    renderAssembly,
    preparedAt: "2026-04-02T17:04:30.000Z",
  });
  const ingest = await ingestPacket(packet.manifest as HammerQuenchReleasePacketManifest, packet);

  assert.equal(gate.status, "blocked");
  assert.equal(gate.reasons.some((reason) => reason.code === "podcast_master_unavailable"), true);
  assert.equal(packet.manifest.readiness.status, "blocked");
  assert.equal(packet.manifest.readiness.reason_codes.includes("podcast_master_unavailable"), true);
  assert.equal(packet.manifest.editorial_truth?.podcast_master_summary.posture, "unavailable");
  assert.equal(ingest.state, "blocked");
  assert.equal(ingest.verdict?.reason_codes.includes("podcast_master_unavailable"), true);
}

await testPodcastMasterNeedsReviewParity();
await testPodcastMasterBlockedParity();

console.log("Hammer podcast master parity tests passed.");
