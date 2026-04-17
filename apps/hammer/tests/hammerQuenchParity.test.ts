import assert from "node:assert/strict";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import { buildHammerQuenchReleasePacket } from "../src/lib/hammerQuenchReleasePacket";
import { buildHammerReadinessVerdict } from "../src/editor/hammerReadinessTypes";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";
import { ingestHammerReleasePacket } from "../../quench/src/core/hammer-release-packet.ingest";
import { HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH } from "../../quench/src/core/hammer-release-packet.types";

type MemoryStore = Record<string, unknown>;

function createReader(store: MemoryStore) {
  return {
    async readJson(path: string): Promise<unknown | null> {
      const value = store[path];
      if (value == null) return null;
      return value;
    },
    async readText(path: string): Promise<string | null> {
      const value = store[path];
      return typeof value === "string" ? value : null;
    },
  };
}

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "tx_parity_01",
  media_id: "media_parity_01",
  media_signature: "sig_parity_01",
  prepared_at: "2026-04-17T12:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_parity_01",
    kind: "recording_audio",
    local_relpath: "recordings/parity.wav",
    cloud_uri: null,
    source_hint: "local",
    mime_type: "audio/wav",
    byte_size: null,
    duration_ms: 22_000,
    sha256: null,
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["S1"],
    version: null,
    provider: "openai",
    provider_request_id: null,
    model: null,
  },
  confidence_flags: [],
  segments: [{
    segment_id: "seg_001",
    start_sec: 0,
    end_sec: 3,
    speaker: "S1",
    text: "Parity test transcript line.",
  }],
  derived_text_layers: {
    schema_version: 1,
    active_layer_id: "layer_01",
    output_layer_id: "layer_01",
    layers: [{
      layer_id: "layer_01",
      recipe_ref: "speaker_panel:balanced",
      macro_kind: "speaker_panel",
      status: "active",
      created_at: "2026-04-17T12:00:00.000Z",
      based_on_transcript_id: "tx_parity_01",
      summary: {
        changed_segment_count: 0,
        removal_count: 0,
        untouched_segment_count: 1,
      },
      changes: [{
        segment_id: "seg_001",
        original_text: "Parity test transcript line.",
        cleaned_text: "Parity test transcript line.",
        operations: [],
      }],
    }],
  },
  subtitle_outputs: {
    schema_version: 1,
    last_generated_format: "srt",
    srt: {
      format: "srt",
      generated_at: "2026-04-17T12:00:00.000Z",
      source_transcript_id: "tx_parity_01",
      source_layer_id: "layer_01",
      source_kind: "derived",
      source_recipe_ref: "speaker_panel:balanced",
      approximate_timing: false,
      entry_count: 1,
      content: "1\n00:00:00,000 --> 00:00:03,000\nParity test transcript line.\n",
    },
    vtt: null,
  },
};

async function testHammerQuenchReadinessParity() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_parity_01",
    workpieceId: "wp_parity_01",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_parity_01"],
      uncertainty_flags: [],
      placements: [{
        placement_id: "pl_01",
        entry_id: "image-map-01",
        anchor_segment_id: "seg_001",
        matched_segment_ids: ["seg_001"],
        anchor_text: "Parity test transcript line.",
        asset_ref: "asset_01",
        asset_id: "asset_01",
        asset_path: "visuals/parity.png",
        storage_key: "workpieces/wp_parity_01/assets/parity.png",
        label: "parity",
        visual_mode: "comparison",
        start_sec: 0.2,
        end_sec: 1.4,
        confidence: 0.9,
        timing_source: "transcript_match",
        status: "placed",
        uncertainty_flags: [],
      }],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound"],
      source_artifact_paths: ["recordings/parity.wav"],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_parity_01",
      source_media_signature: "sig_parity_01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-04-17T12:00:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/parity.wav",
      output_workpiece_path: "hammer/prep/audio-polish/parity.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 22_000,
      failure_code: null,
      failure_reason: null,
    },
    editorSession: null,
  });

  const readinessGate = buildHammerReadinessVerdict({
    blockingReasons: [{
      code: "handoff_blocked",
      label: "Handoff is blocked.",
      severity: "blocking",
      source: "handoff",
      operationId: "op_block_01",
      operation_id: "op_block_01",
    }],
    reviewReasons: [{
      code: "export_posture_degraded",
      label: "Export posture is degraded.",
      severity: "review",
      source: "gate",
      operationId: "op_review_01",
      operation_id: "op_review_01",
    }],
  });

  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    readinessGate,
    preparedAt: "2026-04-17T12:00:10.000Z",
  });

  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: packet.manifest,
    ...(packet.manifest.transcript.text_path
      ? { [packet.manifest.transcript.text_path]: packet.transcriptText }
      : {}),
    ...(packet.manifest.captions.srt_path
      ? { [packet.manifest.captions.srt_path]: packet.srtText }
      : {}),
    [packet.manifest.visuals.placements_path]: packet.visuals,
  };

  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
    audioResolver: {
      async resolveAudioReference() {
        return {
          resolved: true,
          uri: "recordings/parity.wav",
          reason: null,
        };
      },
    },
  });

  assert.equal(result.state, packet.manifest.readiness.status);
  assert.equal(result.verdict?.status, packet.manifest.readiness.status);
  assert.equal(result.verdict?.ready_for_quench, packet.manifest.readiness.ready_for_quench);
  assert.deepEqual(result.verdict?.reason_codes, packet.manifest.readiness.reason_codes);
  assert.deepEqual(result.verdict?.blocking_reason_codes, packet.manifest.readiness.blocking_reason_codes);
  assert.deepEqual(result.verdict?.review_reason_codes, packet.manifest.readiness.review_reason_codes);
  assert.equal(result.issues.length, 0);
}

async function run() {
  await testHammerQuenchReadinessParity();
  // eslint-disable-next-line no-console
  console.log("Hammer Quench parity tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Quench parity tests failed:", error);
  process.exit(1);
});
