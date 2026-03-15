import type {
  ReleasePacketStub,
  ReleasePacketStubBlockingReason,
  ReleasePacketStubMediaSourceHint,
  ReleasePacketStubSubtitleEntry,
  ReleasePacketStubSubtitleFormat,
} from "../../../quench/src/core/release-packet.stub.types";
import type { TongsHammerReleaseAssembly } from "./tongsReleaseAssembly";

type TongsQuenchStubSource = Pick<TongsHammerReleaseAssembly, "target" | "release_prep" | "summary">;

function buildBlockingReasons(assembly: TongsQuenchStubSource): ReleasePacketStubBlockingReason[] {
  return assembly.summary.checks
    .filter((check) => check.status !== "ready")
    .map((check) => ({
      check_id: check.id,
      label: check.label,
      status: check.status,
      detail: check.detail,
    }));
}

function buildSubtitleEntry(
  assembly: TongsQuenchStubSource,
  format: ReleasePacketStubSubtitleFormat,
): ReleasePacketStubSubtitleEntry {
  const releasePrep = assembly.release_prep;
  const textOutputs = releasePrep.text_outputs;
  const subtitle = textOutputs?.subtitles[format];
  const artifact = subtitle?.artifact ?? null;

  return {
    format,
    status: releasePrep.readiness.subtitles[format],
    freshness: subtitle?.freshness ?? "missing",
    ref_kind: "embedded_structured_transcript",
    structured_transcript_path: releasePrep.artifact_refs.structured_transcript_path,
    transcript_id: textOutputs?.transcript_source.transcript_id ?? releasePrep.identity.transcript_source_id ?? null,
    source_transcript_id: artifact?.source_transcript_id ?? null,
    source_layer_id: artifact?.source_layer_id ?? null,
    source_kind: artifact?.source_kind ?? null,
    source_recipe_ref: artifact?.source_recipe_ref ?? null,
    entry_count: artifact?.entry_count ?? 0,
    content_present: Boolean(artifact?.content?.trim()),
  };
}

function normalizeMediaSourceHint(value: string | null): ReleasePacketStubMediaSourceHint | null {
  switch (value) {
    case "local":
    case "cloud":
    case "unknown":
      return value;
    default:
      return null;
  }
}

export function buildTongsQuenchReleasePacketStub(
  assembly: TongsQuenchStubSource,
): ReleasePacketStub {
  const releasePrep = assembly.release_prep;
  const textOutputs = releasePrep.text_outputs;
  const safeToPublish = (
    assembly.summary.status === "ready"
    && releasePrep.readiness.fully_prepared
    && assembly.summary.blocking_states.length === 0
  );

  return {
    schema_version: 1,
    packet_kind: "quench_release_packet_stub",
    source: {
      producer: "tongs",
      derived_from: "hammer_release_prep",
      target: {
        workspace_id: assembly.target.workspace_id,
        workpiece_id: assembly.target.workpiece_id,
      },
    },
    identity: {
      workspace_id: assembly.target.workspace_id,
      workpiece_id: assembly.target.workpiece_id,
      editor_session_id: releasePrep.identity.editor_session_id,
      transcript_source_id: releasePrep.identity.transcript_source_id,
      media_id: releasePrep.identity.media_id,
    },
    context: {
      prep_status: releasePrep.identity.prep_status,
      alignment_status: releasePrep.identity.alignment_status,
      source_mode: releasePrep.identity.source_mode,
      preview_mode: releasePrep.identity.preview_mode,
    },
    readiness: {
      summary_status: assembly.summary.status,
      safe_to_publish: safeToPublish,
      fully_prepared: releasePrep.readiness.fully_prepared,
      ready_count: assembly.summary.ready_count,
      attention_count: assembly.summary.attention_count,
      blocking_statuses: [...assembly.summary.blocking_states],
      status_flags: {
        ready: releasePrep.readiness.status_flags.ready,
        missing: releasePrep.readiness.status_flags.missing,
        stale: releasePrep.readiness.status_flags.stale,
        failed: releasePrep.readiness.status_flags.failed,
        unsupported: releasePrep.readiness.status_flags.unsupported,
        requires_future_ffmpeg: releasePrep.readiness.status_flags.requires_future_ffmpeg,
      },
      message: assembly.summary.message,
      blocking_reasons: buildBlockingReasons(assembly),
    },
    transcript_output: {
      status: releasePrep.readiness.transcript_output,
      ref_kind: "structured_transcript_selection",
      structured_transcript_path: releasePrep.artifact_refs.structured_transcript_path,
      transcript_id: textOutputs?.transcript_source.transcript_id ?? releasePrep.identity.transcript_source_id ?? null,
      source_kind: textOutputs?.output_selection.source_kind ?? null,
      layer_id: textOutputs?.output_selection.layer_id ?? null,
      recipe_ref: textOutputs?.output_selection.recipe_ref ?? null,
      macro_kind: textOutputs?.output_selection.macro_kind ?? null,
      based_on_transcript_id: textOutputs?.output_selection.based_on_transcript_id ?? null,
      segment_count: textOutputs?.resolved_output.segment_count ?? 0,
      caption_preview_row_count: textOutputs?.resolved_output.caption_preview_row_count ?? 0,
      approximate_caption_timing: textOutputs?.resolved_output.approximate_caption_timing ?? false,
      full_text_present: Boolean(textOutputs?.resolved_output.full_text.trim()),
    },
    subtitles: {
      last_generated_format: textOutputs?.subtitles.last_generated_format ?? null,
      srt: buildSubtitleEntry(assembly, "srt"),
      vtt: buildSubtitleEntry(assembly, "vtt"),
    },
    visuals: {
      status: releasePrep.readiness.visuals,
      ref_kind: "visual_placements_artifact",
      artifact_path: releasePrep.artifact_refs.visual_placements_path,
      prep_status: releasePrep.media_prep_outputs.visuals.status,
      freshness: releasePrep.media_prep_outputs.visuals.freshness,
      transcript_source_ref: releasePrep.media_prep_outputs.visuals.transcript_source_ref,
      source_refs: [...releasePrep.media_prep_outputs.visuals.source_refs],
      placement_count: releasePrep.media_prep_outputs.visuals.placement_count,
      uncertain_placement_count: releasePrep.media_prep_outputs.visuals.uncertain_placement_count,
      uncertainty_flags: [...releasePrep.media_prep_outputs.visuals.uncertainty_flags],
    },
    audio: {
      status: releasePrep.readiness.audio_polish,
      ref_kind: "audio_polish_artifact",
      artifact_path: releasePrep.artifact_refs.audio_polish_path,
      prep_status: releasePrep.media_prep_outputs.audio.polish.status,
      freshness: releasePrep.media_prep_outputs.audio.polish.freshness,
      plan_readiness: releasePrep.media_backbone.audio_polish_plan?.readiness ?? null,
      plan_detail: releasePrep.media_backbone.audio_polish_plan?.detail ?? null,
      failure_code: releasePrep.media_prep_outputs.audio.polish.failure_code,
      failure_reason: releasePrep.media_prep_outputs.audio.polish.failure_reason,
      prepared_passes: [...releasePrep.media_prep_outputs.audio.polish.prepared_passes],
      processor_version: releasePrep.media_prep_outputs.audio.polish.processor_version,
      settings_summary: { ...releasePrep.media_prep_outputs.audio.polish.settings_summary },
      output_local_relpath: releasePrep.media_prep_outputs.audio.polish.output_local_relpath,
      output_mime_type: releasePrep.media_prep_outputs.audio.polish.output_mime_type,
      output_duration_ms: releasePrep.media_prep_outputs.audio.polish.output_duration_ms,
      preferred_playback: {
        kind: releasePrep.media_prep_outputs.audio.preferred_playback.kind,
        reason: releasePrep.media_prep_outputs.audio.preferred_playback.reason,
        media_id: releasePrep.media_prep_outputs.audio.preferred_playback.media_id,
        local_relpath: releasePrep.media_prep_outputs.audio.preferred_playback.local_relpath,
        mime_type: releasePrep.media_prep_outputs.audio.preferred_playback.mime_type,
        source_label: releasePrep.media_prep_outputs.audio.preferred_playback.source_label,
      },
      raw_source: {
        media_id: releasePrep.media_prep_outputs.audio.raw_source.media_id,
        kind: releasePrep.media_prep_outputs.audio.raw_source.kind,
        media_signature: releasePrep.media_prep_outputs.audio.raw_source.media_signature,
        local_relpath: releasePrep.media_prep_outputs.audio.raw_source.local_relpath,
        cloud_uri: releasePrep.media_prep_outputs.audio.raw_source.cloud_uri,
        source_hint: normalizeMediaSourceHint(releasePrep.media_prep_outputs.audio.raw_source.source_hint),
        media_source_label: releasePrep.media_prep_outputs.audio.raw_source.media_source_label,
        duration_ms: releasePrep.media_prep_outputs.audio.raw_source.duration_ms,
      },
    },
  };
}
