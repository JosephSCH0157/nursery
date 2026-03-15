import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTongsHammerReleaseAssembly,
} from "../src/lib/tongsReleaseAssembly.ts";
import type { HammerPersistenceSnapshot } from "../../hammer/src/persistence/hammerPersistenceContract";

function buildSnapshot(overrides?: {
  outputLayerId?: string | null;
  includeVtt?: boolean;
  includeAudioPolish?: boolean;
  subtitleDrift?: "srt" | "vtt" | "both" | null;
  audioFailureCode?: "unsupported_source" | "source_unavailable" | "processing_failed" | null;
  audioFailureReason?: string | null;
  audioStatus?: "not_started" | "preparing" | "prepared" | "failed";
  mediaKind?: "recording_audio" | "recording_video" | "asset_image";
  mediaPath?: string;
  stateWorkspaceId?: string;
  stateWorkpieceId?: string;
}): HammerPersistenceSnapshot {
  const mediaKind = overrides?.mediaKind ?? "recording_audio";
  const mediaPath = overrides?.mediaPath ?? "recordings/release-assembly.wav";
  const outputLayerId = overrides?.outputLayerId ?? "macro_run_release_01";
  const driftSrt = overrides?.subtitleDrift === "srt" || overrides?.subtitleDrift === "both";
  const driftVtt = overrides?.subtitleDrift === "vtt" || overrides?.subtitleDrift === "both";
  return {
    schema_version: 1,
    state: {
      workspace_id: overrides?.stateWorkspaceId ?? "workspace_release_assembly_01",
      workpiece_id: overrides?.stateWorkpieceId ?? "workpiece_release_assembly_01",
      active_session_id: "session_release_assembly_01",
      editor_session_path: "hammer/session/editor-state.v1.json",
      transcript_artifact_path: "hammer/transcript/structured.v1.json",
      speaker_map_artifact_path: null,
      visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
      audio_polish_artifact_path: "hammer/prep/audio-polish.v1.json",
      edit_plan_artifact_path: null,
      edit_plan_signature: null,
      prep_status: "prepared",
      alignment_status: "aligned",
      macro_recipe_ref: "macro:podcast_cleanup.v1",
      last_macro_run_ref: "macro_run_release_01",
      last_opened_at: "2026-03-15T13:00:00.000Z",
      updated_at: "2026-03-15T13:00:00.000Z",
      updated_by: "user_release_assembly_01",
    },
    editor_session: {
      path: "hammer/session/editor-state.v1.json",
      updated_at: "2026-03-15T13:00:00.000Z",
      data: {
        schema_version: 1,
        session_id: "session_release_assembly_01",
        source_mode: "tongs",
        preview_mode: "edit-aware",
        transcript_source_id: "transcript_release_assembly_01",
        selected_segment_id: null,
        selected_overlay_row_id: null,
        media_ref: {
          media_id: "media_release_assembly_01",
          kind: mediaKind,
          source_hint: "local",
          local_relpath: mediaPath,
          duration_ms: 9000,
        },
        workspace_mapping: {
          workspace_id: "workspace_release_assembly_01",
          local_root_abs: "D:\\ForgeMedia\\workspace_release_assembly_01",
        },
        media_source_label: "tongs:media_release_assembly_01",
        last_opened_at: "2026-03-15T13:00:00.000Z",
      },
    },
    structured_transcript: {
      path: "hammer/transcript/structured.v1.json",
      updated_at: "2026-03-15T13:00:00.000Z",
      data: {
        schema_version: 1,
        transcript_id: "transcript_release_assembly_01",
        media_id: "media_release_assembly_01",
        media_signature: "sig_release_assembly_01",
        prepared_at: "2026-03-15T12:55:00.000Z",
        structure: "speaker_turns",
        source_media_ref: {
          media_id: "media_release_assembly_01",
          kind: mediaKind,
          source_hint: "local",
          local_relpath: mediaPath,
          duration_ms: 9000,
        },
        diarization: {
          label_scheme: "forge-neutral-speakers.v1",
          labels: ["S1"],
          raw_labels: ["host"],
          version: "gpt-4o-transcribe",
          provider: "openai",
          provider_request_id: "req_release_assembly_01",
          model: "gpt-4o-transcribe",
        },
        confidence_flags: [],
        segments: [
          {
            segment_id: "seg_001",
            start_sec: 0,
            end_sec: 4,
            speaker: "S1",
            text: "Welcome back to the show.",
          },
        ],
        derived_text_layers: {
          schema_version: 1,
          active_layer_id: outputLayerId,
          output_layer_id: outputLayerId,
          layers: outputLayerId ? [{
            layer_id: outputLayerId,
            recipe_ref: "macro:podcast_cleanup.v1",
            macro_kind: "filler_cleanup",
            status: "active",
            created_at: "2026-03-15T12:56:00.000Z",
            based_on_transcript_id: "transcript_release_assembly_01",
            summary: {
              changed_segment_count: 1,
              removal_count: 1,
              untouched_segment_count: 0,
            },
            changes: [
              {
                segment_id: "seg_001",
                original_text: "Um welcome back to the show.",
                cleaned_text: "Welcome back to the show.",
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
          }] : [],
        },
        subtitle_outputs: {
          schema_version: 1,
          last_generated_format: overrides?.includeVtt ? "vtt" : "srt",
          srt: {
            format: "srt",
            generated_at: "2026-03-15T12:57:00.000Z",
            source_transcript_id: "transcript_release_assembly_01",
            source_layer_id: driftSrt ? null : outputLayerId,
            source_kind: driftSrt ? "raw" : outputLayerId ? "derived" : "raw",
            source_recipe_ref: driftSrt ? null : outputLayerId ? "macro:podcast_cleanup.v1" : null,
            approximate_timing: false,
            entry_count: 1,
            content: "1\n00:00:00,000 --> 00:00:04,000\nWelcome back to the show.",
          },
          vtt: overrides?.includeVtt ? {
            format: "vtt",
            generated_at: "2026-03-15T12:57:30.000Z",
            source_transcript_id: "transcript_release_assembly_01",
            source_layer_id: driftVtt ? null : outputLayerId,
            source_kind: driftVtt ? "raw" : outputLayerId ? "derived" : "raw",
            source_recipe_ref: driftVtt ? null : outputLayerId ? "macro:podcast_cleanup.v1" : null,
            approximate_timing: false,
            entry_count: 1,
            content: "WEBVTT\n\n00:00.000 --> 00:04.000\nWelcome back to the show.",
          } : null,
        },
      },
    },
    speaker_map: {
      path: null,
      updated_at: null,
      data: null,
    },
    visual_placements: {
      path: "hammer/prep/visual-placements.v1.json",
      updated_at: "2026-03-15T13:00:00.000Z",
      data: {
        schema_version: 1,
        status: "prepared",
        source_refs: ["transcript:transcript_release_assembly_01"],
        uncertainty_flags: [],
        placements: [
          {
            placement_id: "placement_release_assembly_01",
            entry_id: "image-map-01",
            anchor_segment_id: "seg_001",
            matched_segment_ids: ["seg_001"],
            anchor_text: "Welcome back to the show.",
            asset_ref: "asset_release_assembly_01",
            asset_id: "asset_release_assembly_01",
            asset_path: "assets/release-assembly.png",
            storage_key: "workpieces/release-assembly/assets/release-assembly.png",
            label: "opener",
            visual_mode: "hero",
            start_sec: 0,
            end_sec: 4,
            confidence: 0.93,
            timing_source: "transcript_match",
            status: "placed",
            uncertainty_flags: [],
          },
        ],
      },
    },
    audio_polish: {
      path: "hammer/prep/audio-polish.v1.json",
      updated_at: "2026-03-15T13:00:00.000Z",
      data: overrides?.includeAudioPolish === false ? null : {
        schema_version: 1,
        status: overrides?.audioStatus ?? "prepared",
        prepared_passes: overrides?.audioStatus === "failed" ? [] : ["studio_sound", "noise_cleanup", "level_consistency"],
        source_artifact_paths: [mediaPath],
        settings_summary: {
          source_media_kind: mediaKind,
          source_local_relpath: mediaPath,
          supported_source: overrides?.audioFailureCode !== "unsupported_source",
        },
        source_media_id: "media_release_assembly_01",
        source_media_signature: "sig_release_assembly_01",
        processor_version: "forge-v1.2.0/audio-polish.v1",
        prepared_at: overrides?.audioStatus === "failed" ? null : "2026-03-15T12:58:00.000Z",
        output_local_relpath: overrides?.audioStatus === "failed" ? null : "hammer/prep/audio-polish/release-assembly.wav",
        output_mime_type: overrides?.audioStatus === "failed" ? null : "audio/wav",
        output_duration_ms: overrides?.audioStatus === "failed" ? null : 9000,
        failure_code: overrides?.audioFailureCode ?? null,
        failure_reason: overrides?.audioFailureReason ?? null,
      },
    },
    edit_plan: {
      path: null,
      updated_at: null,
      data: null,
    },
    macro_hooks: {
      recipe_ref: "macro:podcast_cleanup.v1",
      last_run_ref: outputLayerId,
    },
  };
}

test("buildTongsHammerReleaseAssembly summarizes a current downstream-ready handoff", () => {
  const snapshot = buildSnapshot();
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(assembly.summary.status, "attention");
  assert.equal(assembly.summary.ready_count, 4);
  assert.equal(assembly.authority.status, "blocked");
  assert.equal(assembly.authority.safe_for_downstream_handoff, true);
  assert.equal(assembly.authority.allow_preview, true);
  assert.equal(assembly.authority.do_not_publish, true);
  assert.equal(assembly.authority.snapshot_id.startsWith("rha1_"), true);
  assert.equal(assembly.authority.integrity_hash.startsWith("cyrb128:"), true);
  assert.equal(assembly.authority.compatible_consumers.includes("quench_release_packet_stub.v1"), true);
  assert.equal(assembly.authority.warnings[0]?.code, "SUBTITLE_VTT_MISSING");
  assert.equal(assembly.recovery.recovery_status, "recoverable_with_regeneration");
  assert.equal(assembly.recovery.preview_allowed_during_recovery, true);
  assert.equal(assembly.recovery.requires_upstream_prep, true);
  assert.equal(assembly.recovery.can_auto_recover, true);
  assert.equal(assembly.recovery.recovery_plan[0]?.code, "REGENERATE_SUBTITLE_VTT");
  assert.equal(assembly.recovery.recovery_plan[0]?.automatic, true);
  assert.equal(assembly.recovery.artifact_dependencies.some((dependency) => dependency.code === "subtitle_vtt"), true);
  assert.equal(assembly.release_prep.readiness.transcript_output, "ready");
  assert.equal(assembly.release_prep.readiness.subtitles.srt, "ready");
  assert.equal(assembly.release_prep.readiness.subtitles.vtt, "missing");
  assert.equal(assembly.release_prep.readiness.audio_polish, "ready");
  assert.equal(assembly.summary.checks.find((check) => check.id === "audio_polish")?.status, "ready");
  assert.equal(assembly.quench_packet_stub.packet_kind, "quench_release_packet_stub");
  assert.equal(assembly.quench_packet_stub.source.derived_from, "tongs_release_handoff_authority");
  assert.equal(assembly.quench_packet_stub.authority.status, "blocked");
  assert.equal(assembly.quench_packet_stub.authority.allow_preview, true);
  assert.equal(assembly.quench_packet_stub.authority.do_not_publish, true);
  assert.equal(assembly.quench_packet_stub.recovery.recovery_status, "recoverable_with_regeneration");
  assert.equal(assembly.quench_packet_stub.recovery.preview_allowed_during_recovery, true);
  assert.equal(assembly.quench_packet_stub.readiness.overall_status, "attention");
  assert.equal(assembly.quench_packet_stub.summary_flags.safe_for_quench_preview, true);
  assert.equal(assembly.quench_packet_stub.summary_flags.has_attention_items, true);
  assert.equal(assembly.quench_packet_stub.transcript_output.source_kind, "derived");
  assert.equal(assembly.quench_packet_stub.transcript_output.full_text.includes("Welcome back to the show."), true);
  assert.equal(assembly.quench_packet_stub.transcript_output.segments.length, 1);
  assert.equal(assembly.quench_packet_stub.subtitles.srt.status, "ready");
  assert.equal(assembly.quench_packet_stub.subtitles.vtt.status, "missing");
  assert.equal(assembly.quench_packet_stub.readiness.reason_details[0]?.check_id, "subtitle_vtt");
  assert.equal(assembly.quench_packet_stub.assembly.authority_snapshot_id, assembly.authority.snapshot_id);
  assert.equal(assembly.quench_packet_stub.assembly.authority_integrity_hash, assembly.authority.integrity_hash);
});

test("buildTongsHammerReleaseAssembly marks future-ffmpeg audio as blocked without hiding the handoff", () => {
  const snapshot = buildSnapshot({
    mediaKind: "recording_video",
    mediaPath: "recordings/release-assembly.mp4",
    audioStatus: "failed",
    audioFailureCode: "unsupported_source",
    audioFailureReason: "Video sources need FFmpeg-backed working audio before polish can run.",
  });
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(assembly.summary.status, "blocked");
  assert.equal(assembly.authority.status, "blocked");
  assert.equal(assembly.authority.safe_for_downstream_handoff, true);
  assert.equal(assembly.authority.allow_preview, false);
  assert.equal(assembly.recovery.recovery_status, "requires_upstream_action");
  assert.equal(assembly.recovery.preview_allowed_during_recovery, false);
  assert.equal(assembly.recovery.requires_upstream_prep, true);
  assert.equal(assembly.recovery.can_auto_recover, false);
  assert.equal(assembly.recovery.recovery_plan[0]?.code, "ENABLE_FFMPEG_WORKING_AUDIO");
  assert.equal(assembly.recovery.recovery_blockers[0]?.classification, "requires_upstream_action");
  assert.equal(assembly.release_prep.readiness.audio_polish, "requires_future_ffmpeg");
  assert.ok(assembly.summary.blocking_states.includes("requires_future_ffmpeg"));
  assert.equal(
    assembly.summary.checks.find((check) => check.id === "audio_polish")?.status,
    "requires_future_ffmpeg",
  );
  assert.equal(assembly.authority.blockers.some((issue) => issue.observed_status === "requires_future_ffmpeg"), true);
  assert.equal(assembly.quench_packet_stub.summary_flags.safe_for_quench_preview, false);
  assert.equal(assembly.quench_packet_stub.authority.allow_preview, false);
  assert.equal(assembly.quench_packet_stub.recovery.recovery_status, "requires_upstream_action");
  assert.equal(assembly.quench_packet_stub.recovery.preview_allowed_during_recovery, false);
  assert.equal(assembly.quench_packet_stub.audio.status, "requires_future_ffmpeg");
  assert.equal(assembly.quench_packet_stub.media_backbone.audio_plan.readiness, "requires_future_ffmpeg");
  assert.equal(assembly.quench_packet_stub.media_backbone.audio_plan.requires_ffmpeg, true);
  assert.equal(assembly.quench_packet_stub.readiness.reason_details.some((reason) => (
    reason.check_id === "audio_polish" && reason.status === "requires_future_ffmpeg"
  )), true);
});

test("buildTongsHammerReleaseAssembly emits a publish-safe Quench stub when all prep surfaces are current", () => {
  const snapshot = buildSnapshot({ includeVtt: true });
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(assembly.summary.status, "ready");
  assert.equal(assembly.authority.status, "ready");
  assert.equal(assembly.authority.safe_for_downstream_handoff, true);
  assert.equal(assembly.authority.allow_preview, true);
  assert.equal(assembly.authority.do_not_publish, false);
  assert.equal(assembly.recovery.recovery_status, "not_needed");
  assert.deepEqual(assembly.recovery.recovery_plan, []);
  assert.equal(assembly.release_prep.readiness.fully_prepared, true);
  assert.deepEqual(assembly.authority.blockers, []);
  assert.deepEqual(assembly.authority.warnings, []);
  assert.equal(assembly.quench_packet_stub.readiness.overall_status, "ready");
  assert.equal(assembly.quench_packet_stub.summary_flags.safe_for_quench_preview, true);
  assert.deepEqual(assembly.quench_packet_stub.readiness.reason_statuses, []);
  assert.equal(assembly.quench_packet_stub.subtitles.vtt.status, "ready");
  assert.equal(assembly.quench_packet_stub.summary_flags.has_current_subtitles, true);
  assert.equal(assembly.quench_packet_stub.readiness.reason_details.length, 0);
});

test("buildTongsHammerReleaseAssembly preserves stale subtitle drift in the Quench packet stub", () => {
  const snapshot = buildSnapshot({
    includeVtt: true,
    subtitleDrift: "vtt",
  });
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(assembly.summary.status, "attention");
  assert.equal(assembly.authority.status, "blocked");
  assert.equal(assembly.authority.allow_preview, true);
  assert.equal(assembly.authority.warnings.some((issue) => issue.code === "SUBTITLE_VTT_STALE"), true);
  assert.equal(assembly.recovery.recovery_status, "recoverable_with_regeneration");
  assert.equal(assembly.recovery.recovery_plan[0]?.code, "REGENERATE_SUBTITLE_VTT");
  assert.equal(assembly.recovery.recovery_plan[0]?.automatic, true);
  assert.equal(assembly.recovery.preview_allowed_during_recovery, true);
  assert.equal(assembly.quench_packet_stub.subtitles.vtt.status, "stale");
  assert.equal(assembly.quench_packet_stub.subtitles.vtt.stale, true);
  assert.equal(assembly.quench_packet_stub.subtitles.vtt.current, false);
  assert.equal(assembly.quench_packet_stub.assembly.freshness.subtitle_vtt, "stale");
  assert.equal(assembly.quench_packet_stub.readiness.reason_details.some((reason) => (
    reason.check_id === "subtitle_vtt" && reason.status === "stale"
  )), true);
});

test("buildTongsHammerReleaseAssembly marks unsupported source media as blocked in the Quench packet stub", () => {
  const snapshot = buildSnapshot({
    includeVtt: true,
    includeAudioPolish: false,
    mediaKind: "asset_image",
    mediaPath: "assets/release-assembly.png",
  });
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(assembly.summary.status, "blocked");
  assert.equal(assembly.authority.status, "blocked");
  assert.equal(assembly.authority.safe_for_downstream_handoff, true);
  assert.equal(assembly.authority.allow_preview, false);
  assert.equal(assembly.recovery.recovery_status, "incompatible");
  assert.equal(assembly.recovery.preview_allowed_during_recovery, false);
  assert.equal(assembly.recovery.can_auto_recover, false);
  assert.equal(assembly.recovery.recovery_plan[0]?.code, "SWITCH_TO_SUPPORTED_SOURCE_MEDIA");
  assert.equal(assembly.recovery.recovery_blockers[0]?.classification, "incompatible");
  assert.equal(assembly.quench_packet_stub.readiness.overall_status, "blocked");
  assert.equal(assembly.quench_packet_stub.audio.status, "unsupported");
  assert.equal(assembly.quench_packet_stub.media_backbone.audio_plan.readiness, "unsupported");
  assert.equal(assembly.quench_packet_stub.readiness.blocker_statuses.includes("unsupported"), true);
  assert.equal(assembly.quench_packet_stub.source_media.kind, "asset_image");
  assert.equal(assembly.quench_packet_stub.summary_flags.safe_for_quench_preview, false);
});

test("buildTongsHammerReleaseAssembly produces deterministic authority ids and hashes for the same source state", () => {
  const snapshot = buildSnapshot({ includeVtt: true });
  const first = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);
  const second = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(first.authority.status, second.authority.status);
  assert.equal(first.authority.snapshot_id, second.authority.snapshot_id);
  assert.equal(first.authority.integrity_hash, second.authority.integrity_hash);
  assert.deepEqual(first.authority.blockers, second.authority.blockers);
  assert.deepEqual(first.authority.warnings, second.authority.warnings);
  assert.deepEqual(first.authority.remediations, second.authority.remediations);
});

test("buildTongsHammerReleaseAssembly marks target identity drift as unsafe", () => {
  const snapshot = buildSnapshot();
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_mismatch",
  }, snapshot);

  assert.equal(assembly.authority.status, "unsafe");
  assert.equal(assembly.authority.safe_for_downstream_handoff, false);
  assert.equal(assembly.authority.allow_preview, false);
  assert.equal(assembly.recovery.recovery_status, "recoverable");
  assert.equal(assembly.recovery.preview_allowed_during_recovery, false);
  assert.equal(assembly.recovery.can_auto_recover, false);
  assert.equal(assembly.recovery.recovery_plan[0]?.code, "ALIGN_RELEASE_TARGET");
  assert.equal(assembly.recovery.recovery_plan[0]?.classification, "recoverable");
  assert.equal(assembly.summary.status, "blocked");
  assert.equal(assembly.summary.blocking_states.includes("unsafe"), true);
  assert.equal(assembly.quench_packet_stub.authority.status, "unsafe");
  assert.equal(assembly.quench_packet_stub.readiness.blocker_statuses.includes("unsafe"), true);
  assert.equal(assembly.quench_packet_stub.readiness.reason_details.some((reason) => (
    reason.status === "unsafe"
  )), true);
});

test("buildTongsHammerReleaseAssembly marks incompatible snapshot schema before downstream projection", () => {
  const snapshot = buildSnapshot() as HammerPersistenceSnapshot;
  (snapshot as HammerPersistenceSnapshot & { schema_version: number }).schema_version = 99;
  const assembly = buildTongsHammerReleaseAssembly({
    workspaceId: "workspace_release_assembly_01",
    workpieceId: "workpiece_release_assembly_01",
  }, snapshot);

  assert.equal(assembly.authority.status, "incompatible");
  assert.equal(assembly.authority.safe_for_downstream_handoff, false);
  assert.deepEqual(assembly.authority.compatible_consumers, []);
  assert.equal(assembly.recovery.recovery_status, "incompatible");
  assert.equal(assembly.recovery.recovery_plan[0]?.code, "UPGRADE_RELEASE_HANDOFF_SCHEMA");
  assert.equal(assembly.recovery.recovery_blockers[0]?.classification, "incompatible");
  assert.equal(assembly.summary.status, "blocked");
  assert.equal(assembly.summary.blocking_states.includes("incompatible"), true);
  assert.equal(assembly.quench_packet_stub.authority.status, "incompatible");
  assert.equal(assembly.quench_packet_stub.readiness.blocker_statuses.includes("incompatible"), true);
});
