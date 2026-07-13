import assert from "node:assert/strict";
import {
  canEnterPass,
  deriveHydratedPassStatus,
  getPassReloadExpectation,
  getPassStatus,
  summarizePassStatuses,
  type HammerPassSelectorContext,
} from "../src/editor/hammerPassSelectors";
import { buildHammerReadinessVerdict } from "../src/editor/hammerReadinessTypes";

function buildContext(overrides: Partial<HammerPassSelectorContext> = {}): HammerPassSelectorContext {
  return {
    currentPass: "image_animation",
    passStatus: {
      image_animation: "completed",
      ready: "completed",
    },
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: {
      schema_version: 1,
      transcript_id: "tx_reload",
      media_id: "media_reload",
      media_signature: "sig_reload",
      prepared_at: "2026-04-02T10:00:00.000Z",
      structure: "speaker_turns",
      source_media_ref: null,
      diarization: {
        label_scheme: "forge-neutral-speakers.v1",
        labels: ["S1"],
        raw_labels: ["speaker_0"],
        version: "gpt-4o-transcribe",
        provider: "openai",
        provider_request_id: "req_reload",
        model: "gpt-4o-transcribe",
      },
      confidence_flags: [],
      segments: [
        {
          segment_id: "seg_reload",
          start_sec: 0,
          end_sec: 5,
          speaker: "S1",
          text: "Reload should preserve posture, not stale truth.",
        },
      ],
    },
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_reload"],
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_reload",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_reload",
          matched_segment_ids: ["seg_reload"],
          anchor_text: "Reload should preserve posture",
          asset_ref: "asset_reload",
          asset_id: "asset_reload",
          asset_path: "assets/reload.png",
          storage_key: "assets/reload.png",
          label: "Reload image",
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
      source_artifact_paths: ["recordings/reload.wav"],
      settings_summary: {},
      analysis: null,
      audio_edit: null,
      source_media_id: "media_reload",
      source_media_signature: "sig_reload",
      processor_version: "forge-v1.2.0/audio",
      prepared_at: "2026-04-02T10:03:00.000Z",
      output_local_relpath: "hammer/prep/audio/reload.wav",
      output_workpiece_path: "hammer/prep/audio/reload.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 5_000,
      failure_code: null,
      failure_reason: null,
    },
    introPath: "assets/intro.mp4",
    outroPath: "assets/outro.mp4",
    packagingLogoEnabled: true,
    readinessVerdict: buildHammerReadinessVerdict({
      blockingReasons: [],
      reviewReasons: [],
    }),
    readinessGate: {
      status: "ready",
      blocker_count: 0,
      review_count: 0,
    },
    ...overrides,
  };
}

{
  const persistedPosture = buildContext({
    currentPass: "image_animation",
    passStatus: {
      image_animation: "completed",
    },
    visualPlacements: null,
  });
  const result = getPassStatus("image_animation", persistedPosture);
  assert.equal(persistedPosture.currentPass, "image_animation");
  assert.equal(result.status, "blocked");
  assert.equal(result.isComplete, false);
  assert.equal(getPassReloadExpectation("image_animation").code, "restore_visual_basis");
}

{
  const persistedPosture = buildContext({
    currentPass: "ready",
    passStatus: {
      ready: "completed",
    },
    readinessVerdict: buildHammerReadinessVerdict({
      blockingReasons: [],
      reviewReasons: [{
        code: "export_posture_degraded",
        label: "Export assembly is degraded and needs review.",
        severity: "review",
        source: "gate",
        operationId: null,
        operation_id: null,
      }],
    }),
  });
  const result = getPassStatus("ready", persistedPosture);
  assert.equal(persistedPosture.currentPass, "ready");
  assert.equal(canEnterPass("ready", persistedPosture), true);
  assert.equal(result.status, "degraded");
  assert.equal(result.isComplete, false);
  assert.equal(getPassReloadExpectation("ready").code, "recompute_readiness");
}

{
  const persistedPosture = buildContext({
    currentPass: "packaging",
    passStatus: {
      packaging: "completed",
    },
    introPath: null,
    outroPath: null,
    packagingLogoEnabled: false,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_reload"],
      uncertainty_flags: [],
      placements: [],
    },
  });
  const result = getPassStatus("packaging", persistedPosture);
  assert.equal(persistedPosture.currentPass, "packaging");
  assert.equal(canEnterPass("packaging", persistedPosture), true);
  assert.equal(result.status, "blocked");
  assert.equal(result.isComplete, false);
}

{
  const persistedPosture = buildContext({
    currentPass: "packaging",
    passStatus: {
      packaging: "completed",
    },
    introPath: null,
    outroPath: null,
    packagingLogoEnabled: true,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_reload"],
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_logo_reload",
          entry_id: "packaging:logo",
          anchor_segment_id: "seg_reload",
          matched_segment_ids: ["seg_reload"],
          anchor_text: "Reload should preserve posture",
          asset_ref: "asset_logo_reload",
          asset_id: "asset_logo_reload",
          asset_path: null,
          storage_key: null,
          label: "Reload logo",
          visual_mode: "packaging_logo",
          start_sec: 0,
          end_sec: 5,
          confidence: 0.9,
          timing_source: "transcript_match",
          status: "placed",
          uncertainty_flags: [],
        },
      ],
    },
  });
  const result = getPassStatus("packaging", persistedPosture);
  assert.equal(persistedPosture.currentPass, "packaging");
  assert.equal(canEnterPass("packaging", persistedPosture), true);
  assert.equal(result.status, "degraded");
  assert.equal(result.isComplete, false);
  assert.deepEqual(result.reasonCodes, ["packaging_asset_unresolved"]);
  assert.equal(summarizePassStatuses([result.status]), "degraded");
}

{
  const hydrated = deriveHydratedPassStatus("ready");
  assert.equal(hydrated.ready, "in_progress");
  assert.equal(hydrated.transcript_cleanup, "not_started");
}

{
  const persistedPosture = buildContext({
    currentPass: "ready",
    passStatus: {
      ready: "completed",
    },
    readinessVerdict: buildHammerReadinessVerdict({
      blockingReasons: [{
        code: "handoff_blocked",
        label: "Handoff is blocked.",
        severity: "blocking",
        source: "handoff",
        operationId: null,
        operation_id: null,
      }],
      reviewReasons: [],
    }),
  });
  const result = getPassStatus("ready", persistedPosture);
  assert.equal(persistedPosture.currentPass, "ready");
  assert.equal(canEnterPass("ready", persistedPosture), true);
  assert.equal(result.status, "blocked");
  assert.equal(result.isComplete, false);
  assert.equal(result.humanLabel, "Blocked: not ready for Quench");
  assert.deepEqual(result.reasonCodes, ["handoff_blocked"]);
  assert.equal(summarizePassStatuses([result.status]), "blocked");
}

{
  const persistedPosture = buildContext({
    currentPass: "ready",
    passStatus: {
      ready: "completed",
    },
    readinessVerdict: buildHammerReadinessVerdict({
      blockingReasons: [{
        code: "handoff_blocked",
        label: "Handoff is blocked.",
        severity: "blocking",
        source: "handoff",
        operationId: null,
        operation_id: null,
      }],
      reviewReasons: [{
        code: "export_posture_degraded",
        label: "Export assembly is degraded and needs review.",
        severity: "review",
        source: "gate",
        operationId: null,
        operation_id: null,
      }],
    }),
  });
  const result = getPassStatus("ready", persistedPosture);
  assert.equal(persistedPosture.currentPass, "ready");
  assert.equal(canEnterPass("ready", persistedPosture), true);
  assert.equal(result.status, "blocked");
  assert.equal(result.isComplete, false);
  assert.deepEqual(result.reasonCodes, ["handoff_blocked", "export_posture_degraded"]);
  assert.equal(summarizePassStatuses([result.status]), "blocked");
}

console.log("Hammer pass reload selector tests passed.");
