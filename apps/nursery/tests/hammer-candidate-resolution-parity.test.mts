import assert from "node:assert/strict";
import { buildHammerReleasePrepPackage } from "../../hammer/src/lib/hammerReleasePrepPackage.ts";
import {
  buildHammerQuenchReleasePacket,
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
} from "../../hammer/src/lib/hammerQuenchReleasePacket.ts";
import { previewRemoveFillers } from "../../hammer/src/editor/hammerCleanupTools.ts";
import { buildHammerReadinessVerdict } from "../../hammer/src/editor/hammerReadinessTypes.ts";
import {
  appendHammerDerivedTextLayer,
  createHammerDerivedTextLayer,
  setHammerDerivedTextLayerOutput,
} from "../../hammer/src/macros/hammerDerivedTranscriptLayers.ts";
import {
  generateHammerSubtitleArtifact,
  setHammerSubtitleArtifact,
} from "../../hammer/src/lib/hammerSubtitleExports.ts";
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
  transcript_id: "tx_candidate_resolution_01",
  media_id: "media_candidate_resolution_01",
  media_signature: "sig_candidate_resolution_01",
  prepared_at: "2026-04-02T14:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_candidate_resolution_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/candidate-resolution.wav",
    mime_type: "audio/wav",
    duration_ms: 11_000,
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_candidate_resolution_01",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_candidate_001",
      start_sec: 0,
      end_sec: 3,
      speaker: "S1",
      text: "Um welcome back to the show.",
    },
    {
      segment_id: "seg_candidate_002",
      start_sec: 3,
      end_sec: 6,
      speaker: "S1",
      text: "I mean we should probably keep going.",
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
    last_generated_format: null,
    srt: null,
    vtt: null,
  },
};

function buildCandidateResolvedTranscript(): {
  transcript: HammerPersistedStructuredTranscript;
  approvedSegmentId: string;
  rejectedSegmentId: string;
  layerId: string;
} {
  const preview = previewRemoveFillers(transcript.segments, {
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  });

  assert.equal(preview.suggestions.length >= 2, true, "Fixture should start with multiple filler candidates.");

  const approvedSegmentId = "seg_candidate_001";
  const rejectedSegmentId = "seg_candidate_002";
  const approvedResult = preview.resultSegments.find((segment) => segment.segment_id === approvedSegmentId) ?? null;
  const rejectedRaw = transcript.segments.find((segment) => segment.segment_id === rejectedSegmentId) ?? null;

  assert.ok(approvedResult, "Approved candidate must have a preview result.");
  assert.ok(rejectedRaw, "Rejected candidate must exist in the raw transcript.");
  assert.match(approvedResult?.text ?? "", /^welcome back to the show\.$/i);
  assert.match(rejectedRaw?.text ?? "", /^I mean we should probably keep going\.$/);

  const layer = createHammerDerivedTextLayer({
    transcriptId: transcript.transcript_id,
    recipeRef: "macro:podcast_cleanup.v1",
    macroKind: "filler_cleanup",
    nowIso: "2026-04-02T14:05:00.000Z",
    changes: [
      {
        segment_id: approvedSegmentId,
        original_text: transcript.segments.find((segment) => segment.segment_id === approvedSegmentId)?.text ?? "",
        cleaned_text: approvedResult?.text ?? "",
        operations: [
          {
            kind: "filler_removed",
            value: "Um",
            start: 0,
            end: 2,
          },
        ],
      },
    ],
  });

  const withLayer = appendHammerDerivedTextLayer(transcript, layer);
  const withOutput = setHammerDerivedTextLayerOutput(withLayer, layer.layer_id);
  const withSrt = setHammerSubtitleArtifact(withOutput, generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript: withOutput,
    format: "srt",
    generatedAt: "2026-04-02T14:06:00.000Z",
  }));
  const withVtt = setHammerSubtitleArtifact(withSrt, generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript: withSrt,
    format: "vtt",
    generatedAt: "2026-04-02T14:06:15.000Z",
  }));

  return {
    transcript: withVtt,
    approvedSegmentId,
    rejectedSegmentId,
    layerId: layer.layer_id,
  };
}

async function testCandidateResolutionParity() {
  const resolved = buildCandidateResolvedTranscript();

  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_candidate_resolution_01",
    workpieceId: "wp_candidate_resolution_01",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: resolved.transcript,
    visualPlacements: {
      schema_version: 1,
      source_refs: [`transcript:${resolved.transcript.transcript_id}`],
      status: "prepared",
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_candidate_resolution_01",
          entry_id: "image-map-candidate-resolution-01",
          anchor_segment_id: resolved.approvedSegmentId,
          matched_segment_ids: [resolved.approvedSegmentId],
          anchor_text: "welcome back to the show",
          asset_ref: "asset_candidate_resolution_01",
          asset_id: "asset_candidate_resolution_01",
          storage_key: "workpieces/wp_candidate_resolution_01/assets/card-a.png",
          start_sec: 0.2,
          end_sec: 2.2,
          asset_path: "visuals/card-a.png",
          visual_mode: "hero",
          status: "placed",
          confidence: 0.95,
          timing_source: "transcript_match",
          uncertainty_flags: [],
        },
      ],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound"],
      source_artifact_paths: ["recordings/candidate-resolution.wav"],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_candidate_resolution_01",
      source_media_signature: "sig_candidate_resolution_01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-04-02T14:06:30.000Z",
      output_local_relpath: "hammer/prep/audio-polish/candidate-resolution.wav",
      output_workpiece_path: "hammer/prep/audio-polish/candidate-resolution.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 11_000,
      failure_code: null,
      failure_reason: null,
    },
    editorSession: {
      schema_version: 1,
      session_id: "session_candidate_resolution_01",
      source_mode: "tongs",
      preview_mode: "edit-aware",
      transcript_source_id: resolved.transcript.transcript_id,
      selected_segment_id: resolved.approvedSegmentId,
      selected_overlay_row_id: "placement_candidate_resolution_01",
      media_ref: resolved.transcript.source_media_ref,
      workspace_mapping: null,
      media_source_label: "candidate-resolution-source",
      visual_preview: {
        white_balance: 0,
        color_amount: 0,
        background_blur: false,
      },
      last_opened_at: "2026-04-02T14:07:00.000Z",
    },
  });

  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    readinessGate: buildHammerReadinessVerdict({
      blockingReasons: [],
      reviewReasons: [],
    }),
    preparedAt: "2026-04-02T14:08:00.000Z",
  });

  const manifest = packet.manifest as HammerQuenchReleasePacketManifest;
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path!]: packet.transcriptText,
    [manifest.captions.srt_path!]: packet.srtText,
    [manifest.visuals.placements_path]: packet.visuals,
  };

  const ingest = await ingestHammerReleasePacket({
    reader: createReader(store),
    audioResolver: {
      async resolveAudioReference() {
        return {
          resolved: true,
          uri: "file:///candidate-resolution.wav",
          reason: null,
        };
      },
    },
  });

  assert.equal(prep.text_outputs?.output_selection.source_kind, "derived");
  assert.equal(prep.text_outputs?.output_selection.layer_id, resolved.layerId);
  assert.equal(prep.text_outputs?.output_selection.recipe_ref, "macro:podcast_cleanup.v1");

  const resolvedText = prep.text_outputs?.resolved_output.full_text ?? "";
  assert.match(resolvedText, /S1: welcome back to the show\./);
  assert.match(resolvedText, /S1: I mean we should probably keep going\./);

  assert.equal(manifest.transcript.source_kind, "derived");
  assert.equal(manifest.transcript.source_layer_id, resolved.layerId);
  assert.equal(manifest.transcript.source_recipe_ref, "macro:podcast_cleanup.v1");

  assert.match(packet.transcriptText ?? "", /S1: welcome back to the show\./);
  assert.match(packet.transcriptText ?? "", /S1: I mean we should probably keep going\./);

  assert.equal(ingest.state, "ready");
  assert.equal(ingest.verdict?.status, "ready");
  assert.equal(ingest.verdict?.reason_codes.some((code) => code.startsWith("quench_")), false);
  assert.match(ingest.transcript_text ?? "", /S1: welcome back to the show\./);
  assert.match(ingest.transcript_text ?? "", /S1: I mean we should probably keep going\./);
}

await testCandidateResolutionParity();

console.log("Hammer candidate resolution parity tests passed.");
