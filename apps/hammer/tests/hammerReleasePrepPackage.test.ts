import assert from "node:assert/strict";
import type { MediaKind, MediaRef } from "../../../packages/contracts/hammer/media-resolver.contract";
import {
  buildHammerMediaBackboneRuntimeSummary,
} from "../src/media/hammerMediaBackbone";
import { runHammerFillerCleanupMacro } from "../src/macros/hammerFillerCleanupMacro";
import { setHammerDerivedTextLayerOutput } from "../src/macros/hammerDerivedTranscriptLayers";
import {
  generateHammerSubtitleArtifact,
  setHammerSubtitleArtifact,
} from "../src/lib/hammerSubtitleExports";
import { buildHammerReleasePrepPackageFromSnapshot } from "../src/lib/hammerReleasePrepPackage";
import type {
  HammerPersistenceSnapshot,
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
} from "../src/persistence/hammerPersistenceContract";

function buildMediaRef(kind: MediaKind, localRelpath: string): MediaRef {
  return {
    media_id: "media_release_pkg_01",
    kind,
    source_hint: "local",
    local_relpath: localRelpath,
    duration_ms: 12000,
  };
}

function buildStructuredTranscript(mediaRef: MediaRef): HammerPersistedStructuredTranscript {
  const rawTranscript: HammerPersistedStructuredTranscript = {
    schema_version: 1,
    transcript_id: "transcript_release_pkg_01",
    media_id: mediaRef.media_id,
    media_signature: "sig_release_pkg_01",
    prepared_at: "2026-03-15T12:00:00.000Z",
    structure: "speaker_turns",
    source_media_ref: { ...mediaRef },
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: ["S1"],
      raw_labels: ["host"],
      version: "gpt-4o-transcribe",
      provider: "openai",
      provider_request_id: "req_release_pkg_01",
      model: "gpt-4o-transcribe",
    },
    confidence_flags: [],
    segments: [
      {
        segment_id: "seg_001",
        start_sec: 0,
        end_sec: 4,
        speaker: "S1",
        text: "Um welcome back to the show.",
      },
      {
        segment_id: "seg_002",
        start_sec: 4,
        end_sec: 8,
        speaker: "S1",
        text: "We have the full story today.",
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

  const fillerRun = runHammerFillerCleanupMacro(rawTranscript, "2026-03-15T12:05:00.000Z");
  const withOutput = setHammerDerivedTextLayerOutput(fillerRun.transcript, fillerRun.layer_id);
  const withSrt = setHammerSubtitleArtifact(withOutput, generateHammerSubtitleArtifact({
    rawSegments: rawTranscript.segments,
    transcript: withOutput,
    format: "srt",
    generatedAt: "2026-03-15T12:06:00.000Z",
  }));
  return setHammerSubtitleArtifact(withSrt, generateHammerSubtitleArtifact({
    rawSegments: rawTranscript.segments,
    transcript: withSrt,
    format: "vtt",
    generatedAt: "2026-03-15T12:06:30.000Z",
  }));
}

function buildAudioPolish(status: HammerPersistedAudioPolish["status"], mediaRef: MediaRef): HammerPersistedAudioPolish {
  return {
    schema_version: 1,
    status,
    prepared_passes: status === "prepared" ? ["studio_sound", "noise_cleanup", "level_consistency"] : [],
    source_artifact_paths: [mediaRef.local_relpath ?? "source"],
    settings_summary: {
      source_media_kind: mediaRef.kind,
      source_local_relpath: mediaRef.local_relpath ?? null,
      supported_source: status === "prepared",
    },
    source_media_id: mediaRef.media_id,
    source_media_signature: "sig_release_pkg_01",
    processor_version: "forge-v1.2.0/audio-polish.v4",
    prepared_at: status === "prepared" ? "2026-03-15T12:07:00.000Z" : null,
    output_local_relpath: status === "prepared" ? "hammer/prep/audio-polish/release-pkg.wav" : null,
    output_mime_type: status === "prepared" ? "audio/wav" : null,
    output_duration_ms: status === "prepared" ? 12000 : null,
    failure_code: null,
    failure_reason: null,
  };
}

function buildSnapshot(args?: {
  mediaKind?: MediaKind;
  localRelpath?: string;
  transcript?: HammerPersistedStructuredTranscript;
  audioPolish?: HammerPersistedAudioPolish | null;
}): HammerPersistenceSnapshot {
  const mediaRef = buildMediaRef(args?.mediaKind ?? "recording_audio", args?.localRelpath ?? "recordings/release-pkg.wav");
  const transcript = args?.transcript ?? buildStructuredTranscript(mediaRef);
  const audioPolish = Object.prototype.hasOwnProperty.call(args ?? {}, "audioPolish")
    ? args?.audioPolish ?? null
    : buildAudioPolish("prepared", mediaRef);
  return {
    schema_version: 1,
    state: {
      workspace_id: "workspace_release_pkg_01",
      workpiece_id: "workpiece_release_pkg_01",
      active_session_id: "session_release_pkg_01",
      current_pass: "transcript_cleanup",
      pass_order_version: 2,
      pass_status: {
        transcript_cleanup: "in_progress",
      },
      editor_session_path: "hammer/session/editor-state.v1.json",
      transcript_artifact_path: "hammer/transcript/structured.v1.json",
      speaker_map_artifact_path: null,
      visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
      audio_polish_artifact_path: "hammer/prep/audio-polish.v1.json",
      edit_plan_artifact_path: null,
      editorial_authority_artifact_path: null,
      edit_plan_signature: null,
      prep_status: "prepared",
      alignment_status: "aligned",
      macro_recipe_ref: "macro:podcast_cleanup.v1",
      last_macro_run_ref: transcript.derived_text_layers?.layers[0]?.layer_id ?? null,
      last_opened_at: "2026-03-15T12:08:00.000Z",
      updated_at: "2026-03-15T12:08:00.000Z",
      updated_by: "user_release_pkg_01",
    },
    editor_session: {
      path: "hammer/session/editor-state.v1.json",
      updated_at: "2026-03-15T12:08:00.000Z",
      data: {
        schema_version: 1,
        session_id: "session_release_pkg_01",
        source_mode: "tongs",
        preview_mode: "edit-aware",
        transcript_source_id: transcript.transcript_id,
        selected_segment_id: null,
        selected_overlay_row_id: null,
        media_ref: { ...mediaRef },
        workspace_mapping: {
          workspace_id: "workspace_release_pkg_01",
          local_root_abs: "D:\\ForgeMedia\\workspace_release_pkg_01",
        },
        media_source_label: `tongs:${mediaRef.media_id}`,
        last_opened_at: "2026-03-15T12:08:00.000Z",
      },
    },
    structured_transcript: {
      path: "hammer/transcript/structured.v1.json",
      updated_at: "2026-03-15T12:08:00.000Z",
      data: transcript,
    },
    speaker_map: {
      path: null,
      updated_at: null,
      data: null,
    },
    visual_placements: {
      path: "hammer/prep/visual-placements.v1.json",
      updated_at: "2026-03-15T12:08:00.000Z",
      data: {
        schema_version: 1,
        status: "prepared",
        source_refs: [`transcript:${transcript.transcript_id}`, "script:2026-03-15T11:55:00.000Z"],
        uncertainty_flags: ["match_missing:image-map-02"],
        placements: [
          {
            placement_id: "placement_release_pkg_01",
            entry_id: "image-map-01",
            anchor_segment_id: "seg_001",
            matched_segment_ids: ["seg_001"],
            anchor_text: "welcome back to the show",
            asset_ref: "asset_release_pkg_01",
            asset_id: "asset_release_pkg_01",
            asset_path: "assets/release-pkg.png",
            storage_key: "workpieces/release-pkg/assets/release-pkg.png",
            label: "opening visual",
            visual_mode: "hero",
            start_sec: 0,
            end_sec: 4,
            confidence: 0.92,
            timing_source: "transcript_match",
            status: "uncertain",
            uncertainty_flags: ["low_match_confidence"],
          },
        ],
      },
    },
    audio_polish: {
      path: "hammer/prep/audio-polish.v1.json",
      updated_at: "2026-03-15T12:08:00.000Z",
      data: audioPolish,
    },
    edit_plan: {
      path: null,
      updated_at: null,
      data: null,
    },
    editorial_authority: {
      path: null,
      updated_at: null,
      data: null,
    },
    macro_hooks: {
      recipe_ref: "macro:podcast_cleanup.v1",
      last_run_ref: transcript.derived_text_layers?.layers[0]?.layer_id ?? null,
    },
  };
}

{
  const snapshot = buildSnapshot();
  const pkg = buildHammerReleasePrepPackageFromSnapshot(snapshot);

  assert.equal(pkg.identity.workspace_id, "workspace_release_pkg_01");
  assert.equal(pkg.identity.workpiece_id, "workpiece_release_pkg_01");
  assert.equal(pkg.artifact_refs.structured_transcript_path, "hammer/transcript/structured.v1.json");
  assert.equal(pkg.text_outputs?.output_selection.source_kind, "derived");
  assert.equal(pkg.media_backbone.audio_polish_plan?.readiness, "ready_now");
  assert.equal(pkg.readiness.transcript_output, "ready");
  assert.equal(pkg.readiness.subtitles.srt, "ready");
  assert.equal(pkg.readiness.subtitles.vtt, "ready");
  assert.equal(pkg.readiness.visuals, "ready");
  assert.equal(pkg.readiness.audio_polish, "ready");
  assert.deepEqual(pkg.readiness.blocking_statuses, []);
  assert.equal(pkg.readiness.fully_prepared, true);
  assert.equal(pkg.readiness.status_flags.ready, true);
  assert.equal(pkg.readiness.status_flags.requires_future_ffmpeg, false);
}

{
  const readySnapshot = buildSnapshot();
  const rawOutputTranscript = setHammerDerivedTextLayerOutput(readySnapshot.structured_transcript.data!, null);
  const snapshot = buildSnapshot({
    transcript: rawOutputTranscript,
  });
  const pkg = buildHammerReleasePrepPackageFromSnapshot(snapshot);

  assert.equal(pkg.text_outputs?.output_selection.source_kind, "raw");
  assert.equal(pkg.readiness.subtitles.srt, "stale");
  assert.equal(pkg.readiness.subtitles.vtt, "stale");
  assert.equal(pkg.readiness.fully_prepared, false);
  assert.deepEqual(pkg.readiness.blocking_statuses, ["stale"]);
  assert.equal(pkg.readiness.status_flags.stale, true);
}

{
  const mediaRef = buildMediaRef("recording_video", "recordings/release-pkg.mp4");
  const snapshot = buildSnapshot({
    mediaKind: mediaRef.kind,
    localRelpath: mediaRef.local_relpath ?? "recordings/release-pkg.mp4",
    transcript: buildStructuredTranscript(mediaRef),
    audioPolish: {
      ...buildAudioPolish("failed", mediaRef),
      settings_summary: {
        source_media_kind: mediaRef.kind,
        source_local_relpath: mediaRef.local_relpath ?? null,
        supported_source: false,
      },
      failure_code: "unsupported_source",
      failure_reason: "Video sources need FFmpeg-backed working audio before polish can run.",
    },
  });
  const pkg = buildHammerReleasePrepPackageFromSnapshot(snapshot, {
    mediaBackboneRuntime: buildHammerMediaBackboneRuntimeSummary(),
  });

  assert.equal(pkg.media_backbone.audio_polish_plan?.readiness, "requires_future_ffmpeg");
  assert.equal(pkg.readiness.audio_polish, "requires_future_ffmpeg");
  assert.equal(pkg.readiness.status_flags.requires_future_ffmpeg, true);
  assert.equal(pkg.readiness.fully_prepared, false);
  assert.ok(pkg.readiness.blocking_statuses.includes("requires_future_ffmpeg"));
}

{
  const mediaRef = buildMediaRef("asset_image", "assets/release-pkg.png");
  const snapshot = buildSnapshot({
    mediaKind: mediaRef.kind,
    localRelpath: mediaRef.local_relpath ?? "assets/release-pkg.png",
    transcript: buildStructuredTranscript(mediaRef),
    audioPolish: null,
  });
  const pkg = buildHammerReleasePrepPackageFromSnapshot(snapshot);

  assert.equal(pkg.media_backbone.audio_polish_plan?.readiness, "unsupported");
  assert.equal(pkg.readiness.audio_polish, "unsupported");
  assert.equal(pkg.readiness.status_flags.unsupported, true);
  assert.ok(pkg.readiness.blocking_statuses.includes("unsupported"));
}

console.log("Hammer release prep package tests passed.");


