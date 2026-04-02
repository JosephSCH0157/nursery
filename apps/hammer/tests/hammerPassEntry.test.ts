import assert from "node:assert/strict";
import {
  canEnterPass,
  getPassBlockedReason,
  type HammerPassSelectorContext,
} from "../src/editor/hammerPassSelectors";

function buildContext(overrides: Partial<HammerPassSelectorContext> = {}): HammerPassSelectorContext {
  return {
    currentPass: "transcript_cleanup",
    passStatus: {
      transcript_cleanup: "in_progress",
    },
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: {
      schema_version: 1,
      transcript_id: "tx_entry",
      media_id: "media_entry",
      media_signature: "sig_entry",
      prepared_at: "2026-04-02T10:00:00.000Z",
      structure: "speaker_turns",
      source_media_ref: null,
      diarization: {
        label_scheme: "forge-neutral-speakers.v1",
        labels: ["S1"],
        raw_labels: ["speaker_0"],
        version: "gpt-4o-transcribe",
        provider: "openai",
        provider_request_id: "req_entry",
        model: "gpt-4o-transcribe",
      },
      confidence_flags: [],
      segments: [
        {
          segment_id: "seg_entry",
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
      source_refs: ["transcript:tx_entry"],
      uncertainty_flags: [],
      placements: [],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound"],
      source_artifact_paths: [],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_entry",
      source_media_signature: "sig_entry",
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
    packagingLogoEnabled: false,
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
  const context = buildContext({
    structuredTranscript: null,
    prepStatus: "preparing",
  });
  assert.equal(canEnterPass("transcript_cleanup", context), false);
  assert.equal(getPassBlockedReason("transcript_cleanup", context), "transcript_prep_incomplete");
}

{
  const context = buildContext({
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_entry"],
      uncertainty_flags: [],
      placements: [],
    },
  });
  assert.equal(canEnterPass("image_animation", context), false);
  assert.equal(getPassBlockedReason("image_animation", context), "image_animation_target_missing");
}

{
  const context = buildContext({
    introPath: null,
    outroPath: null,
    packagingLogoEnabled: false,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_entry"],
      uncertainty_flags: [],
      placements: [],
    },
  });
  assert.equal(canEnterPass("packaging", context), true);
  assert.equal(getPassBlockedReason("packaging", context), "packaging_selection_missing");
}

{
  const context = buildContext({
    currentPass: "ready",
    passStatus: {
      transcript_cleanup: "not_started",
      ready: "not_started",
    },
  });
  assert.equal(canEnterPass("ready", context), true);
}

console.log("Hammer pass entry selector tests passed.");
