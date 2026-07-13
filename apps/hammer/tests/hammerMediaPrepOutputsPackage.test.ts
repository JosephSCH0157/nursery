import assert from "node:assert/strict";
import {
  buildHammerMediaPrepOutputsPackage,
  buildHammerMediaPrepOutputsPackageFromSnapshot,
} from "../src/lib/hammerMediaPrepOutputsPackage";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";

const snapshot: HammerPersistenceSnapshot = {
  schema_version: 1,
  state: null,
  editor_session: {
    path: "hammer/session/editor-state.v1.json",
    updated_at: "2026-03-15T11:00:00.000Z",
    data: {
      schema_version: 1,
      session_id: "session_media_pkg_01",
      source_mode: "tongs",
      preview_mode: "edit-aware",
      transcript_source_id: "transcript_media_pkg_01",
      selected_segment_id: null,
      selected_overlay_row_id: null,
      media_ref: {
        media_id: "media_media_pkg_01",
        kind: "recording_audio",
        source_hint: "local",
        local_relpath: "recordings/media-pkg.wav",
        duration_ms: 8000,
      },
      workspace_mapping: {
        workspace_id: "workspace_media_pkg_01",
        local_root_abs: "D:\\ForgeMedia\\workspace_media_pkg_01",
      },
      media_source_label: "tongs:media_media_pkg_01",
      visual_preview: {
        white_balance: 0,
        color_amount: 0,
        background_blur: false,
      },
      last_opened_at: "2026-03-15T11:00:00.000Z",
    },
  },
  structured_transcript: {
    path: "hammer/transcript/structured.v1.json",
    updated_at: "2026-03-15T11:00:01.000Z",
    data: {
      schema_version: 1,
      transcript_id: "transcript_media_pkg_01",
      media_id: "media_media_pkg_01",
      media_signature: "sig_media_pkg_01",
      prepared_at: "2026-03-15T10:55:00.000Z",
      structure: "speaker_turns",
      source_media_ref: {
        media_id: "media_media_pkg_01",
        kind: "recording_audio",
        source_hint: "local",
        local_relpath: "recordings/media-pkg.wav",
        duration_ms: 8000,
      },
      diarization: {
        label_scheme: "forge-neutral-speakers.v1",
        labels: ["S1", "G1"],
        raw_labels: ["host", "guest"],
        version: "gpt-4o-transcribe",
        provider: "openai",
        provider_request_id: "req_media_pkg_01",
        model: "gpt-4o-transcribe",
      },
      confidence_flags: [],
      segments: [
        {
          segment_id: "seg_001",
          start_sec: 0,
          end_sec: 4,
          speaker: "S1",
          text: "Opening line.",
        },
      ],
    },
  },
  transcript_version_registry: { path: null, updated_at: null, data: null },
  speaker_map: { path: null, updated_at: null, data: null },
  visual_placements: {
    path: "hammer/prep/visual-placements.v1.json",
    updated_at: "2026-03-15T11:00:02.000Z",
    data: {
      schema_version: 1,
      status: "prepared",
      source_refs: [
        "transcript:transcript_media_pkg_01",
        "script:2026-03-15T10:50:00.000Z",
        "image-map:2026-03-15T10:51:00.000Z",
      ],
      uncertainty_flags: ["match_missing:image-map-02"],
      placements: [
        {
          placement_id: "placement_01",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_001",
          matched_segment_ids: ["seg_001"],
          anchor_text: "Opening line.",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/example.png",
          storage_key: "workpieces/example/assets/example.png",
          label: "explainer",
          visual_mode: "comparison",
          start_sec: 0,
          end_sec: 4,
          confidence: 0.91,
          timing_source: "transcript_match",
          status: "uncertain",
          uncertainty_flags: ["low_match_confidence"],
        },
      ],
    },
  },
  visual_timeline: { path: null, updated_at: null, data: null },
  audio_polish: {
    path: "hammer/prep/audio-polish.v1.json",
    updated_at: "2026-03-15T11:00:03.000Z",
    data: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "level_consistency"],
      source_artifact_paths: ["recordings/media-pkg.wav"],
      settings_summary: {
        supported_source: true,
        source_media_kind: "recording_audio",
      },
      analysis: null,
      source_media_id: "media_media_pkg_01",
      source_media_signature: "sig_media_pkg_01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-03-15T10:59:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/media-pkg--abcd1234.wav",
      output_workpiece_path: null,
      output_mime_type: "audio/wav",
      output_duration_ms: 8000,
      failure_code: null,
      failure_reason: null,
      audio_edit: null,
    },
  },
  edit_plan: { path: null, updated_at: null, data: null },
  editorial_authority: { path: null, updated_at: null, data: null },
  macro_hooks: {
    recipe_ref: null,
    last_run_ref: null,
  },
};

{
  const pkg = buildHammerMediaPrepOutputsPackageFromSnapshot(snapshot);
  assert.equal(pkg.visuals.status, "prepared");
  assert.equal(pkg.visuals.freshness, "current");
  assert.equal(pkg.visuals.placement_count, 1);
  assert.equal(pkg.visuals.uncertain_placement_count, 1);
  assert.deepEqual(pkg.visuals.uncertainty_flags, ["match_missing:image-map-02"]);
  assert.equal(pkg.audio.polish.status, "prepared");
  assert.equal(pkg.audio.polish.freshness, "current");
  assert.equal(pkg.audio.preferred_playback.kind, "polished");
  assert.equal(pkg.audio.preferred_playback.reason, "prepared_audio_polish");
  assert.equal(pkg.audio.preferred_playback.local_relpath, "hammer/prep/audio-polish/media-pkg--abcd1234.wav");
}

{
  const staleAudioAndVisual = buildHammerMediaPrepOutputsPackage({
    structuredTranscript: {
      ...snapshot.structured_transcript.data!,
      transcript_id: "transcript_media_pkg_02",
      media_signature: "sig_media_pkg_02",
    },
    visualPlacements: snapshot.visual_placements.data,
    audioPolish: {
      ...snapshot.audio_polish.data!,
      status: "failed",
      failure_code: "unsupported_source",
      failure_reason: "WAV-only polish is supported in this slice.",
      output_local_relpath: null,
      output_mime_type: null,
      output_duration_ms: null,
    },
    mediaRef: snapshot.editor_session.data?.media_ref ?? null,
    mediaSourceLabel: snapshot.editor_session.data?.media_source_label ?? null,
  });

  assert.equal(staleAudioAndVisual.visuals.freshness, "stale");
  assert.equal(staleAudioAndVisual.audio.polish.status, "failed");
  assert.equal(staleAudioAndVisual.audio.polish.freshness, "stale");
  assert.equal(staleAudioAndVisual.audio.preferred_playback.kind, "raw");
  assert.equal(staleAudioAndVisual.audio.preferred_playback.reason, "audio_polish_stale");
}

{
  const currentMediaChanged = buildHammerMediaPrepOutputsPackage({
    structuredTranscript: snapshot.structured_transcript.data,
    visualPlacements: snapshot.visual_placements.data,
    audioPolish: snapshot.audio_polish.data,
    mediaRef: {
      ...(snapshot.editor_session.data?.media_ref ?? {
        media_id: "media_media_pkg_01",
        kind: "recording_audio" as const,
      }),
      local_relpath: "recordings/media-pkg-retake.wav",
      duration_ms: 9000,
    },
    mediaSourceLabel: snapshot.editor_session.data?.media_source_label ?? null,
  });

  assert.equal(currentMediaChanged.audio.raw_source.local_relpath, "recordings/media-pkg-retake.wav");
  assert.notEqual(currentMediaChanged.audio.raw_source.media_signature, "sig_media_pkg_01");
  assert.equal(currentMediaChanged.audio.polish.freshness, "stale");
  assert.equal(currentMediaChanged.audio.preferred_playback.kind, "raw");
  assert.equal(currentMediaChanged.audio.preferred_playback.reason, "audio_polish_stale");
}

{
  const unsupported = buildHammerMediaPrepOutputsPackage({
    structuredTranscript: snapshot.structured_transcript.data,
    visualPlacements: null,
    audioPolish: {
      ...snapshot.audio_polish.data!,
      status: "failed",
      failure_code: "unsupported_source",
      failure_reason: "Video container extraction is not available in this slice.",
      source_media_signature: "sig_media_pkg_01",
      output_local_relpath: null,
      output_mime_type: null,
      output_duration_ms: null,
    },
    mediaRef: snapshot.editor_session.data?.media_ref ?? null,
    mediaSourceLabel: snapshot.editor_session.data?.media_source_label ?? null,
  });

  assert.equal(unsupported.visuals.status, "missing");
  assert.equal(unsupported.visuals.freshness, "missing");
  assert.equal(unsupported.audio.polish.freshness, "current");
  assert.equal(unsupported.audio.preferred_playback.kind, "raw");
  assert.equal(unsupported.audio.preferred_playback.reason, "audio_polish_unsupported");
}

console.log("Hammer media prep outputs package tests passed.");


