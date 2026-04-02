import assert from "node:assert/strict";
import {
  getPassReloadExpectation,
  getPassStatus,
  summarizePassStatuses,
  type HammerPassSelectorContext,
} from "../src/editor/hammerPassSelectors";

function buildContext(overrides: Partial<HammerPassSelectorContext> = {}): HammerPassSelectorContext {
  return {
    currentPass: "transcript_cleanup",
    passStatus: {
      transcript_cleanup: "in_progress",
      retakes: "not_started",
      gap_pacing: "not_started",
      visual_finishing: "not_started",
      image_placement: "not_started",
      image_animation: "not_started",
      audio_finalization: "not_started",
      packaging: "not_started",
      ready: "not_started",
    },
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: {
      schema_version: 1,
      transcript_id: "tx_01",
      media_id: "media_01",
      media_signature: "sig_01",
      prepared_at: "2026-04-02T10:00:00.000Z",
      structure: "speaker_turns",
      source_media_ref: null,
      diarization: {
        label_scheme: "forge-neutral-speakers.v1",
        labels: ["S1"],
        raw_labels: ["speaker_0"],
        version: "gpt-4o-transcribe",
        provider: "openai",
        provider_request_id: "req_01",
        model: "gpt-4o-transcribe",
      },
      confidence_flags: [],
      segments: [
        {
          segment_id: "seg_01",
          start_sec: 0,
          end_sec: 4,
          speaker: "S1",
          text: "Hello world",
        },
      ],
    },
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_01"],
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_01",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_01",
          matched_segment_ids: ["seg_01"],
          anchor_text: "Hello world",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/example.png",
          storage_key: "assets/example.png",
          label: "Example image",
          visual_mode: "still_image",
          start_sec: 0,
          end_sec: 3,
          confidence: 0.9,
          timing_source: "transcript_match",
          status: "placed",
          uncertainty_flags: [],
          animation_preset: "fade_in",
        },
      ],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound"],
      source_artifact_paths: ["recordings/example.wav"],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_01",
      source_media_signature: "sig_01",
      processor_version: "forge-v1.2.0/audio",
      prepared_at: "2026-04-02T10:03:00.000Z",
      output_local_relpath: "hammer/prep/audio/example.wav",
      output_workpiece_path: "hammer/prep/audio/example.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 4_000,
      failure_code: null,
      failure_reason: null,
    },
    introPath: "assets/intro.mp4",
    outroPath: "assets/outro.mp4",
    packagingLogoEnabled: true,
    readinessGate: {
      status: "ready",
      blocker_count: 0,
      review_count: 0,
    },
    handoffStatus: "ready",
    ...overrides,
  };
}

{
  const result = getPassStatus("transcript_cleanup", buildContext({
    structuredTranscript: null,
    prepStatus: "idle",
  }));
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.reasonCodes, ["structured_transcript_missing"]);
}

{
  const result = getPassStatus("image_placement", buildContext({
    passStatus: { image_placement: "completed" },
    visualPlacements: null,
  }));
  assert.equal(result.status, "blocked");
  assert.equal(result.isComplete, false);
  assert.deepEqual(result.reasonCodes, ["visual_placements_missing"]);
}

{
  const result = getPassStatus("image_animation", buildContext({
    passStatus: { image_animation: "completed" },
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_01"],
      uncertainty_flags: ["match_missing:image-map-01"],
      placements: [
        {
          placement_id: "placement_01",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_01",
          matched_segment_ids: ["seg_01"],
          anchor_text: "Hello world",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/example.png",
          storage_key: "assets/example.png",
          label: "Example image",
          visual_mode: "still_image",
          start_sec: 0,
          end_sec: 3,
          confidence: 0.4,
          timing_source: "ordered_fallback",
          status: "uncertain",
          uncertainty_flags: ["low_confidence"],
          animation_preset: "fade_in",
        },
      ],
    },
  }));
  assert.equal(result.status, "degraded");
  assert.equal(result.isComplete, false);
}

{
  const result = getPassStatus("audio_finalization", buildContext({
    passStatus: { audio_finalization: "completed" },
    audioPolish: {
      schema_version: 1,
      status: "failed",
      prepared_passes: [],
      source_artifact_paths: [],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_01",
      source_media_signature: "sig_01",
      processor_version: "forge-v1.2.0/audio",
      prepared_at: null,
      output_local_relpath: null,
      output_workpiece_path: null,
      output_mime_type: null,
      output_duration_ms: null,
      failure_code: "processing_failed",
      failure_reason: "Processing failed",
    },
  }));
  assert.equal(result.status, "degraded");
  assert.equal(result.reasonCodes[0], "audio_polish_failed");
}

{
  const result = getPassStatus("ready", buildContext({
    passStatus: { ready: "completed" },
    readinessGate: {
      status: "blocked",
      blocker_count: 1,
      review_count: 0,
    },
    handoffStatus: "blocked",
  }));
  assert.equal(result.status, "blocked");
  assert.equal(result.isComplete, false);
  assert.deepEqual(result.reasonCodes, ["ready_gate_blocked", "ready_handoff_blocked"]);
}

{
  const status = summarizePassStatuses(["completed", "degraded"]);
  assert.equal(status, "degraded");
}

{
  const expectation = getPassReloadExpectation("ready");
  assert.equal(expectation.code, "recompute_readiness");
}

{
  const transcriptPass = getPassStatus("transcript_cleanup", buildContext({
    currentPass: "transcript_cleanup",
    passStatus: {
      transcript_cleanup: "not_started",
    },
  }));
  const readyPass = getPassStatus("ready", buildContext({
    currentPass: "ready",
    passStatus: {
      ready: "not_started",
    },
  }));
  assert.equal(transcriptPass.isComplete, false);
  assert.equal(readyPass.isComplete, false);
}

console.log("Hammer pass status selector tests passed.");
