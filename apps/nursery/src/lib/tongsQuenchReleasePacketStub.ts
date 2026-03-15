import type {
  ReleasePacketStub,
  ReleasePacketStubAuthorityIssue,
  ReleasePacketStubBlockingReason,
  ReleasePacketStubMediaSourceHint,
  ReleasePacketStubReasonStatus,
  ReleasePacketStubSubtitleEntry,
  ReleasePacketStubSubtitleFormat,
} from "../../../quench/src/core/release-packet.stub.types";
import type { TongsHammerReleaseAssembly } from "./tongsReleaseAssembly";

type TongsQuenchStubSource = Pick<
  TongsHammerReleaseAssembly,
  "target" | "source_artifacts" | "release_prep" | "authority" | "recovery" | "summary"
>;

function uniqueStatuses(values: ReleasePacketStubReasonStatus[]): ReleasePacketStubReasonStatus[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function buildAuthorityIssues(
  issues: TongsQuenchStubSource["authority"]["blockers"] | TongsQuenchStubSource["authority"]["warnings"],
): ReleasePacketStubAuthorityIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    priority: issue.priority,
    affected_domain: issue.affected_domain,
    message: issue.message,
    remediation_code: issue.remediation_code,
    check_id: issue.check_id,
    label: issue.label,
    observed_status: issue.observed_status,
  }));
}

function buildReasonDetails(assembly: TongsQuenchStubSource): ReleasePacketStubBlockingReason[] {
  const issues = [...assembly.authority.blockers, ...assembly.authority.warnings]
    .sort((left, right) => left.priority - right.priority);

  return issues.map((issue) => ({
    check_id: issue.check_id,
    label: issue.label,
    status: issue.observed_status,
    detail: issue.message,
  }));
}

function buildReasonStatuses(assembly: TongsQuenchStubSource): ReleasePacketStubReasonStatus[] {
  return uniqueStatuses([
    ...assembly.authority.blockers.map((issue) => issue.observed_status),
    ...assembly.authority.warnings.map((issue) => issue.observed_status),
  ]);
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
    artifact_updated_at: assembly.source_artifacts.structured_transcript.updated_at,
    transcript_id: textOutputs?.transcript_source.transcript_id ?? releasePrep.identity.transcript_source_id ?? null,
    generated_at: artifact?.generated_at ?? null,
    source_transcript_id: artifact?.source_transcript_id ?? null,
    source_layer_id: artifact?.source_layer_id ?? null,
    source_kind: artifact?.source_kind ?? null,
    source_recipe_ref: artifact?.source_recipe_ref ?? null,
    approximate_timing: artifact?.approximate_timing ?? null,
    entry_count: artifact?.entry_count ?? 0,
    content_present: Boolean(artifact?.content?.trim()),
    present: artifact != null,
    current: subtitle?.freshness === "current",
    stale: subtitle?.freshness === "stale",
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

function maxIsoTimestamp(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || value > latest) latest = value;
  }
  return latest;
}

function mapAuthorityToStubOverallStatus(
  assembly: TongsQuenchStubSource,
): ReleasePacketStub["readiness"]["overall_status"] {
  if (assembly.authority.status === "ready") return "ready";
  return assembly.authority.allow_preview ? "attention" : "blocked";
}

export function buildTongsQuenchReleasePacketStub(
  assembly: TongsQuenchStubSource,
): ReleasePacketStub {
  const releasePrep = assembly.release_prep;
  const textOutputs = releasePrep.text_outputs;
  const subtitleSrt = buildSubtitleEntry(assembly, "srt");
  const subtitleVtt = buildSubtitleEntry(assembly, "vtt");
  const reasonStatuses = buildReasonStatuses(assembly);
  const blockerStatuses = uniqueStatuses(
    assembly.authority.blockers.map((issue) => issue.observed_status),
  ).filter((status): status is ReleasePacketStub["readiness"]["blocker_statuses"][number] => (
    status === "failed"
    || status === "unsupported"
    || status === "requires_future_ffmpeg"
    || status === "unsafe"
    || status === "incompatible"
  ));
  const attentionStatuses = uniqueStatuses(
    assembly.authority.warnings.map((issue) => issue.observed_status),
  ).filter((status): status is ReleasePacketStub["readiness"]["attention_statuses"][number] => (
    status === "missing" || status === "stale"
  ));
  const preferredPlaybackCloudUri = releasePrep.media_prep_outputs.audio.preferred_playback.kind === "raw"
    ? releasePrep.media_prep_outputs.audio.raw_source.cloud_uri
    : null;
  const hasOutputText = Boolean(textOutputs?.resolved_output.full_text.trim()) && (textOutputs?.resolved_output.segment_count ?? 0) > 0;
  const hasCurrentSubtitles = subtitleSrt.current || subtitleVtt.current;
  const hasVisualGuidance = releasePrep.media_prep_outputs.visuals.placement_count > 0;
  const hasPreferredAudioPath = Boolean(
    releasePrep.media_prep_outputs.audio.preferred_playback.local_relpath
    || preferredPlaybackCloudUri,
  );
  const safeForQuenchPreview = assembly.authority.allow_preview;
  const deterministicSourceUpdatedAt = maxIsoTimestamp([
    assembly.source_artifacts.state_updated_at,
    assembly.source_artifacts.editor_session.updated_at,
    assembly.source_artifacts.structured_transcript.updated_at,
    assembly.source_artifacts.visual_placements.updated_at,
    assembly.source_artifacts.audio_polish.updated_at,
  ]);

  return {
    schema_version: 1,
    packet_kind: "quench_release_packet_stub",
    source: {
      producer: "tongs",
      derived_from: "tongs_release_handoff_authority",
      target: {
        workspace_id: assembly.target.workspace_id,
        workpiece_id: assembly.target.workpiece_id,
        workspace_name: null,
        workpiece_name: null,
      },
    },
    assembly: {
      authority_schema_version: assembly.authority.schema_version,
      authority_snapshot_id: assembly.authority.snapshot_id,
      authority_snapshot_created_at: assembly.authority.snapshot_created_at,
      authority_integrity_hash: assembly.authority.integrity_hash,
      release_prep_schema_version: releasePrep.schema_version,
      deterministic_source_updated_at: deterministicSourceUpdatedAt,
      source_timestamps: {
        state_updated_at: assembly.source_artifacts.state_updated_at,
        editor_session: {
          artifact_path: assembly.source_artifacts.editor_session.path,
          updated_at: assembly.source_artifacts.editor_session.updated_at,
        },
        structured_transcript: {
          artifact_path: assembly.source_artifacts.structured_transcript.path,
          updated_at: assembly.source_artifacts.structured_transcript.updated_at,
        },
        visual_placements: {
          artifact_path: assembly.source_artifacts.visual_placements.path,
          updated_at: assembly.source_artifacts.visual_placements.updated_at,
        },
        audio_polish: {
          artifact_path: assembly.source_artifacts.audio_polish.path,
          updated_at: assembly.source_artifacts.audio_polish.updated_at,
        },
      },
      freshness: {
        transcript_output: releasePrep.readiness.transcript_output,
        subtitle_srt: subtitleSrt.freshness,
        subtitle_vtt: subtitleVtt.freshness,
        visuals: releasePrep.media_prep_outputs.visuals.freshness,
        audio_polish: releasePrep.media_prep_outputs.audio.polish.freshness,
      },
    },
    identity: {
      workspace_id: assembly.target.workspace_id,
      workpiece_id: assembly.target.workpiece_id,
      workspace_name: null,
      workpiece_name: null,
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
    source_media: {
      media_id: releasePrep.media_prep_outputs.audio.raw_source.media_id,
      kind: releasePrep.media_prep_outputs.audio.raw_source.kind,
      media_signature: releasePrep.media_prep_outputs.audio.raw_source.media_signature,
      source_hint: normalizeMediaSourceHint(releasePrep.media_prep_outputs.audio.raw_source.source_hint),
      local_relpath: releasePrep.media_prep_outputs.audio.raw_source.local_relpath,
      cloud_uri: releasePrep.media_prep_outputs.audio.raw_source.cloud_uri,
      duration_ms: releasePrep.media_prep_outputs.audio.raw_source.duration_ms,
      media_source_label: releasePrep.media_prep_outputs.audio.raw_source.media_source_label,
      transcript_id: textOutputs?.transcript_source.transcript_id ?? null,
      transcript_prepared_at: textOutputs?.transcript_source.prepared_at ?? null,
      transcript_segment_count: textOutputs?.transcript_source.segment_count ?? 0,
    },
    authority: {
      status: assembly.authority.status,
      safe_for_downstream_handoff: assembly.authority.safe_for_downstream_handoff,
      allow_preview: assembly.authority.allow_preview,
      do_not_publish: assembly.authority.do_not_publish,
      compatible_consumers: [...assembly.authority.compatible_consumers],
      blockers: buildAuthorityIssues(assembly.authority.blockers),
      warnings: buildAuthorityIssues(assembly.authority.warnings),
      remediations: assembly.authority.remediations.map((remediation) => ({
        code: remediation.code,
        priority: remediation.priority,
        action: remediation.action,
      })),
    },
    recovery: {
      recovery_status: assembly.recovery.recovery_status,
      preview_allowed_during_recovery: assembly.recovery.preview_allowed_during_recovery,
      publish_blocked_during_recovery: assembly.recovery.publish_blocked_during_recovery,
      requires_upstream_prep: assembly.recovery.requires_upstream_prep,
      can_auto_recover: assembly.recovery.can_auto_recover,
      recovery_plan: assembly.recovery.recovery_plan.map((step) => ({
        code: step.code,
        domain: step.domain,
        classification: step.classification,
        action: step.action,
        reason: step.reason,
        priority: step.priority,
        automatic: step.automatic,
        issue_codes: [...step.issue_codes],
        depends_on: [...step.depends_on],
        artifact_dependencies: [...step.artifact_dependencies],
      })),
      recovery_blockers: assembly.recovery.recovery_blockers.map((blocker) => ({
        code: blocker.code,
        classification: blocker.classification,
        reason: blocker.reason,
        issue_codes: [...blocker.issue_codes],
      })),
      artifact_dependencies: assembly.recovery.artifact_dependencies.map((dependency) => ({
        code: dependency.code,
        domain: dependency.domain,
        reason: dependency.reason,
        required_by: [...dependency.required_by],
      })),
    },
    readiness: {
      overall_status: mapAuthorityToStubOverallStatus(assembly),
      fully_prepared: releasePrep.readiness.fully_prepared,
      ready_check_count: assembly.summary.ready_count,
      attention_check_count: assembly.summary.attention_count,
      reason_statuses: reasonStatuses,
      blocker_statuses: blockerStatuses,
      attention_statuses: attentionStatuses,
      status_flags: {
        ready: assembly.authority.status === "ready",
        missing: reasonStatuses.includes("missing"),
        stale: reasonStatuses.includes("stale"),
        failed: reasonStatuses.includes("failed"),
        unsupported: reasonStatuses.includes("unsupported"),
        requires_future_ffmpeg: reasonStatuses.includes("requires_future_ffmpeg"),
        unsafe: assembly.authority.status === "unsafe",
        incompatible: assembly.authority.status === "incompatible",
      },
      message: assembly.authority.message,
      reason_details: buildReasonDetails(assembly),
    },
    summary_flags: {
      safe_for_quench_preview: safeForQuenchPreview,
      has_blockers: assembly.authority.blockers.length > 0,
      has_attention_items: assembly.authority.warnings.length > 0,
      has_output_text: hasOutputText,
      has_current_subtitles: hasCurrentSubtitles,
      has_visual_guidance: hasVisualGuidance,
      has_preferred_audio_path: hasPreferredAudioPath,
    },
    transcript_output: {
      status: releasePrep.readiness.transcript_output,
      ref_kind: "structured_transcript_selection",
      structured_transcript_path: releasePrep.artifact_refs.structured_transcript_path,
      artifact_updated_at: assembly.source_artifacts.structured_transcript.updated_at,
      transcript_id: textOutputs?.transcript_source.transcript_id ?? releasePrep.identity.transcript_source_id ?? null,
      source_kind: textOutputs?.output_selection.source_kind ?? null,
      layer_id: textOutputs?.output_selection.layer_id ?? null,
      recipe_ref: textOutputs?.output_selection.recipe_ref ?? null,
      macro_kind: textOutputs?.output_selection.macro_kind ?? null,
      based_on_transcript_id: textOutputs?.output_selection.based_on_transcript_id ?? null,
      full_text: textOutputs?.resolved_output.full_text ?? "",
      segment_count: textOutputs?.resolved_output.segment_count ?? 0,
      caption_preview_row_count: textOutputs?.resolved_output.caption_preview_row_count ?? 0,
      approximate_caption_timing: textOutputs?.resolved_output.approximate_caption_timing ?? false,
      full_text_present: Boolean(textOutputs?.resolved_output.full_text.trim()),
      segments: textOutputs?.resolved_output.segments.map((segment) => ({
        segment_id: segment.segment_id,
        speaker: segment.speaker,
        start_sec: segment.start_sec,
        end_sec: segment.end_sec,
        text: segment.text,
      })) ?? [],
    },
    subtitles: {
      last_generated_format: textOutputs?.subtitles.last_generated_format ?? null,
      srt: subtitleSrt,
      vtt: subtitleVtt,
    },
    visuals: {
      status: releasePrep.readiness.visuals,
      ref_kind: "visual_placements_artifact",
      artifact_path: releasePrep.artifact_refs.visual_placements_path,
      artifact_updated_at: assembly.source_artifacts.visual_placements.updated_at,
      prep_status: releasePrep.media_prep_outputs.visuals.status,
      freshness: releasePrep.media_prep_outputs.visuals.freshness,
      transcript_source_ref: releasePrep.media_prep_outputs.visuals.transcript_source_ref,
      source_refs: [...releasePrep.media_prep_outputs.visuals.source_refs],
      placement_count: releasePrep.media_prep_outputs.visuals.placement_count,
      uncertain_placement_count: releasePrep.media_prep_outputs.visuals.uncertain_placement_count,
      uncertainty_flags: [...releasePrep.media_prep_outputs.visuals.uncertainty_flags],
      has_placements: releasePrep.media_prep_outputs.visuals.placement_count > 0,
    },
    audio: {
      status: releasePrep.readiness.audio_polish,
      ref_kind: "audio_polish_artifact",
      artifact_path: releasePrep.artifact_refs.audio_polish_path,
      artifact_updated_at: assembly.source_artifacts.audio_polish.updated_at,
      prep_status: releasePrep.media_prep_outputs.audio.polish.status,
      freshness: releasePrep.media_prep_outputs.audio.polish.freshness,
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
        cloud_uri: preferredPlaybackCloudUri,
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
    media_backbone: {
      runtime: {
        preferred_backend: releasePrep.media_backbone.runtime.preferred_backend,
        ffmpeg_install_state: releasePrep.media_backbone.runtime.ffmpeg.install_state,
        ffmpeg_available: releasePrep.media_backbone.runtime.ffmpeg.ffmpeg_available,
        ffprobe_available: releasePrep.media_backbone.runtime.ffmpeg.ffprobe_available,
        future_operations: releasePrep.media_backbone.runtime.future_operations.map((operation) => ({
          operation: operation.operation,
          backend: operation.backend,
          install_state: operation.install_state,
          detail: operation.detail,
        })),
      },
      audio_plan: {
        readiness: releasePrep.media_backbone.audio_polish_plan?.readiness ?? null,
        executable: releasePrep.media_backbone.audio_polish_plan?.executable ?? false,
        backend: releasePrep.media_backbone.audio_polish_plan?.backend ?? "none",
        current_strategy: releasePrep.media_backbone.audio_polish_plan?.current_strategy ?? null,
        future_strategy: releasePrep.media_backbone.audio_polish_plan?.future_strategy ?? null,
        requires_ffmpeg: releasePrep.media_backbone.audio_polish_plan?.requires_ffmpeg ?? false,
        detail: releasePrep.media_backbone.audio_polish_plan?.detail ?? null,
      },
    },
  };
}
