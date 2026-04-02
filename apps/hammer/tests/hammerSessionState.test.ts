import assert from "node:assert/strict";
import { deriveHammerSessionState } from "../src/editor/hammerSessionState";
import { createHammerPrepState } from "../src/prep/hammerPrep";

function buildInput(overrides: Partial<Parameters<typeof deriveHammerSessionState>[0]> = {}) {
  return {
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: false,
      failedMessage: null,
      lastSavedAt: "2026-04-02T16:20:00.000Z",
    },
    recoveryState: null,
    mediaPrepOutputs: null,
    editorVisible: true,
    ...overrides,
  };
}

{
  const result = deriveHammerSessionState(buildInput({
    saveState: {
      isSaving: false,
      hasPendingChanges: false,
      failedMessage: null,
      lastSavedAt: null,
    },
    recoveryState: {
      reloadRequired: true,
    },
  }));
  assert.equal(result.status, "reload_required");
  assert.equal(result.humanLabel, "Reload required");
}

{
  const result = deriveHammerSessionState(buildInput({
    saveState: {
      isSaving: false,
      hasPendingChanges: true,
      failedMessage: "save exploded",
      lastSavedAt: "2026-04-02T16:20:00.000Z",
    },
  }));
  assert.equal(result.status, "save_failed");
  assert.equal(result.humanLabel, "Unsaved changes");
}

{
  const result = deriveHammerSessionState(buildInput({
    saveState: {
      isSaving: false,
      hasPendingChanges: true,
      failedMessage: null,
      lastSavedAt: "2026-04-02T16:20:00.000Z",
    },
  }));
  assert.equal(result.status, "unsaved_changes");
}

{
  const result = deriveHammerSessionState(buildInput({
    mediaPrepOutputs: {
      schema_version: 1,
      visuals: {
        status: "prepared",
        freshness: "current",
        transcript_source_ref: "transcript:tx_session",
        source_refs: ["transcript:tx_session"],
        placement_count: 1,
        uncertain_placement_count: 0,
        uncertainty_flags: [],
        placements: [{
          placement_id: "placement_session",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_session",
          matched_segment_ids: ["seg_session"],
          anchor_text: "Session state",
          asset_ref: "asset_session",
          asset_id: "asset_session",
          asset_path: null,
          storage_key: null,
          label: "Session image",
          visual_mode: "still_image",
          start_sec: 0,
          end_sec: 2,
          confidence: 0.8,
          timing_source: "transcript_match",
          status: "placed",
          uncertainty_flags: [],
        }],
      },
      audio: {
        raw_source: {
          media_id: "media_session",
          kind: "recording_video",
          media_signature: "sig_session",
          local_relpath: "recordings/session.mp4",
          cloud_uri: null,
          source_hint: "local",
          media_source_label: "session-source",
          duration_ms: 2_000,
        },
        polish: {
          status: "prepared",
          freshness: "current",
          prepared_passes: [],
          failure_code: null,
          failure_reason: null,
          processor_version: null,
          settings_summary: {},
          output_local_relpath: null,
          output_workpiece_path: null,
          output_mime_type: null,
          output_duration_ms: null,
        },
        preferred_playback: {
          kind: "raw",
          reason: "raw_source_available",
          media_id: "media_session",
          local_relpath: "recordings/session.mp4",
          workpiece_path: null,
          mime_type: null,
          source_label: "session-source",
        },
      },
    },
  }));
  assert.equal(result.status, "media_unresolved");
}

{
  const result = deriveHammerSessionState(buildInput({
    prepState: createHammerPrepState("preparing", "extracting_working_audio"),
    saveState: {
      isSaving: false,
      hasPendingChanges: false,
      failedMessage: null,
      lastSavedAt: null,
    },
    editorVisible: false,
  }));
  assert.equal(result.status, "prep_incomplete");
}

{
  const result = deriveHammerSessionState(buildInput({
    mediaPrepOutputs: {
      schema_version: 1,
      visuals: {
        status: "prepared",
        freshness: "stale",
        transcript_source_ref: "transcript:tx_session",
        source_refs: ["transcript:old_tx_session"],
        placement_count: 1,
        uncertain_placement_count: 1,
        uncertainty_flags: ["needs_review"],
        placements: [],
      },
      audio: {
        raw_source: {
          media_id: "media_session",
          kind: "recording_video",
          media_signature: "sig_session",
          local_relpath: "recordings/session.mp4",
          cloud_uri: null,
          source_hint: "local",
          media_source_label: "session-source",
          duration_ms: 2_000,
        },
        polish: {
          status: "failed",
          freshness: "stale",
          prepared_passes: [],
          failure_code: "processing_failed",
          failure_reason: "boom",
          processor_version: null,
          settings_summary: {},
          output_local_relpath: null,
          output_workpiece_path: null,
          output_mime_type: null,
          output_duration_ms: null,
        },
        preferred_playback: {
          kind: "raw",
          reason: "audio_polish_failed",
          media_id: "media_session",
          local_relpath: "recordings/session.mp4",
          workpiece_path: null,
          mime_type: null,
          source_label: "session-source",
        },
      },
    },
  }));
  assert.equal(result.status, "degraded_mode");
}

{
  const result = deriveHammerSessionState(buildInput({
    saveState: {
      isSaving: true,
      hasPendingChanges: false,
      failedMessage: null,
      lastSavedAt: null,
    },
  }));
  assert.equal(result.status, "saving");
}

{
  const result = deriveHammerSessionState(buildInput());
  assert.equal(result.status, "saved");
}

console.log("Hammer session state tests passed.");
