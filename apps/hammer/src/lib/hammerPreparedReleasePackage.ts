import type { HammerReleasePrepPackage } from "./hammerReleasePrepPackage";

export const HAMMER_PREPARED_RELEASE_PACKAGE_PATH = "hammer/release-prep/package.v1.json";
export const HAMMER_PREPARED_RELEASE_SRT_PATH = "hammer/release-prep/subtitles/current.srt";
export const HAMMER_PREPARED_RELEASE_VTT_PATH = "hammer/release-prep/subtitles/current.vtt";

export type HammerPreparedReleaseUnitStatus = "ready" | "missing" | "stale";
export type HammerPreparedReleaseOverallStatus = "ready" | "partial" | "stale" | "missing";
export type HammerPreparedReleaseSource = "editor-current" | "saved-transcript" | "generated";
export type HammerPreparedReleaseMediaSourceKind = "raw" | "polished" | "proxy" | "mixed" | "unknown";

export interface HammerPreparedReleasePackage {
  version: 1;
  workpieceId: string;
  workspaceId: string | null;
  preparedAt: string;
  preparedBy: string | null;
  transcript: {
    status: HammerPreparedReleaseUnitStatus;
    fingerprint: string | null;
    revisionId: string | null;
    charCount: number | null;
    source: HammerPreparedReleaseSource;
  };
  subtitles: {
    srt: {
      status: HammerPreparedReleaseUnitStatus;
      fingerprint: string | null;
      artifactPath: string | null;
    };
    vtt: {
      status: HammerPreparedReleaseUnitStatus;
      fingerprint: string | null;
      artifactPath: string | null;
    };
  };
  media: {
    status: HammerPreparedReleaseUnitStatus;
    sourceMediaId: string | null;
    sourceKind: HammerPreparedReleaseMediaSourceKind;
    fingerprint: string | null;
    durationMs: number | null;
  };
  provenance: {
    editorSessionId: string | null;
    timelineRevision: string | null;
    activeAudioFocus: string | null;
  };
  overallStatus: HammerPreparedReleaseOverallStatus;
}

export interface HammerPreparedReleasePackageComparison {
  preparedStatus: "current" | "stale" | "partial" | "missing";
  currentPackage: HammerPreparedReleasePackage;
  staleReasons: string[];
  changed: {
    transcript: boolean;
    subtitles: boolean;
    media: boolean;
  };
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\r\n/g, "\n");
}

function stableHashString(value: string | null): string | null {
  if (!value) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

function toStableJson(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => toStableJson(entry)).join(",")}]`;
  }

  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${toStableJson(row[key])}`).join(",")}}`;
}

function mapReleaseStatus(
  status: "ready" | "missing" | "stale" | "failed" | "unsupported" | "requires_future_ffmpeg",
): HammerPreparedReleaseUnitStatus {
  switch (status) {
    case "ready":
      return "ready";
    case "stale":
    case "requires_future_ffmpeg":
      return "stale";
    default:
      return "missing";
  }
}

function resolveMediaSourceKind(current: HammerReleasePrepPackage): HammerPreparedReleaseMediaSourceKind {
  switch (current.media_prep_outputs.audio.preferred_playback.kind) {
    case "polished":
      return "polished";
    case "raw":
      return "raw";
    default:
      return "unknown";
  }
}

function resolveOverallStatus(args: {
  transcript: HammerPreparedReleaseUnitStatus;
  srt: HammerPreparedReleaseUnitStatus;
  vtt: HammerPreparedReleaseUnitStatus;
  media: HammerPreparedReleaseUnitStatus;
}): HammerPreparedReleaseOverallStatus {
  const statuses = [args.transcript, args.srt, args.vtt, args.media];
  if (statuses.every((status) => status === "missing")) {
    return "missing";
  }
  if (statuses.some((status) => status === "stale")) {
    return "stale";
  }
  if (statuses.every((status) => status === "ready")) {
    return "ready";
  }
  return "partial";
}

export function buildHammerPreparedReleasePackage(args: {
  current: HammerReleasePrepPackage;
  preparedAt?: string;
  preparedBy?: string | null;
  timelineRevision?: string | null;
}): HammerPreparedReleasePackage {
  const preparedAt = args.preparedAt ?? new Date().toISOString();
  const transcriptText = normalizeText(args.current.text_outputs?.resolved_output.full_text ?? null);
  const transcriptRevisionId = args.current.text_outputs?.output_selection.layer_id
    ?? args.current.text_outputs?.transcript_source.transcript_id
    ?? null;
  const transcriptFingerprint = stableHashString(toStableJson({
    transcript_source_id: args.current.identity.transcript_source_id,
    revision_id: transcriptRevisionId,
    segment_count: args.current.text_outputs?.resolved_output.segment_count ?? 0,
    full_text: transcriptText,
  }));
  const srtContent = normalizeText(args.current.text_outputs?.subtitles.srt.artifact?.content ?? null);
  const vttContent = normalizeText(args.current.text_outputs?.subtitles.vtt.artifact?.content ?? null);
  const mediaFingerprint = stableHashString(toStableJson({
    media_id: args.current.media_prep_outputs.audio.raw_source.media_id,
    media_signature: args.current.media_prep_outputs.audio.raw_source.media_signature,
    preferred_playback_kind: args.current.media_prep_outputs.audio.preferred_playback.kind,
    preferred_playback_reason: args.current.media_prep_outputs.audio.preferred_playback.reason,
    preferred_playback_workpiece_path: args.current.media_prep_outputs.audio.preferred_playback.workpiece_path,
    preferred_playback_local_relpath: args.current.media_prep_outputs.audio.preferred_playback.local_relpath,
    source_kind: resolveMediaSourceKind(args.current),
  }));

  const transcriptStatus = mapReleaseStatus(args.current.readiness.transcript_output);
  const srtStatus = mapReleaseStatus(args.current.readiness.subtitles.srt);
  const vttStatus = mapReleaseStatus(args.current.readiness.subtitles.vtt);
  const mediaStatus = mapReleaseStatus(args.current.readiness.audio_polish);

  return {
    version: 1,
    workpieceId: args.current.identity.workpiece_id ?? "",
    workspaceId: args.current.identity.workspace_id,
    preparedAt,
    preparedBy: args.preparedBy ?? null,
    transcript: {
      status: transcriptStatus,
      fingerprint: transcriptFingerprint,
      revisionId: transcriptRevisionId,
      charCount: transcriptText?.length ?? null,
      source: "editor-current",
    },
    subtitles: {
      srt: {
        status: srtStatus,
        fingerprint: stableHashString(toStableJson({
          content: srtContent,
          source_layer_id: args.current.text_outputs?.subtitles.srt.artifact?.source_layer_id ?? null,
          source_kind: args.current.text_outputs?.subtitles.srt.artifact?.source_kind ?? null,
        })),
        artifactPath: srtContent ? HAMMER_PREPARED_RELEASE_SRT_PATH : null,
      },
      vtt: {
        status: vttStatus,
        fingerprint: stableHashString(toStableJson({
          content: vttContent,
          source_layer_id: args.current.text_outputs?.subtitles.vtt.artifact?.source_layer_id ?? null,
          source_kind: args.current.text_outputs?.subtitles.vtt.artifact?.source_kind ?? null,
        })),
        artifactPath: vttContent ? HAMMER_PREPARED_RELEASE_VTT_PATH : null,
      },
    },
    media: {
      status: mediaStatus,
      sourceMediaId: args.current.media_prep_outputs.audio.raw_source.media_id,
      sourceKind: resolveMediaSourceKind(args.current),
      fingerprint: mediaFingerprint,
      durationMs: args.current.media_prep_outputs.audio.polish.output_duration_ms
        ?? args.current.media_prep_outputs.audio.raw_source.duration_ms
        ?? null,
    },
    provenance: {
      editorSessionId: args.current.identity.editor_session_id,
      timelineRevision: args.timelineRevision ?? null,
      activeAudioFocus: args.current.media_prep_outputs.audio.preferred_playback.reason,
    },
    overallStatus: resolveOverallStatus({
      transcript: transcriptStatus,
      srt: srtStatus,
      vtt: vttStatus,
      media: mediaStatus,
    }),
  };
}

export function compareHammerPreparedReleasePackageToCurrent(
  prepared: HammerPreparedReleasePackage | null | undefined,
  current: HammerReleasePrepPackage,
  options?: {
    timelineRevision?: string | null;
  },
): HammerPreparedReleasePackageComparison {
  const currentPackage = buildHammerPreparedReleasePackage({
    current,
    preparedAt: prepared?.preparedAt ?? new Date().toISOString(),
    preparedBy: prepared?.preparedBy ?? null,
    timelineRevision: options?.timelineRevision ?? null,
  });

  if (!prepared) {
    return {
      preparedStatus: "missing",
      currentPackage,
      staleReasons: [],
      changed: {
        transcript: false,
        subtitles: false,
        media: false,
      },
    };
  }

  const transcriptChanged = prepared.transcript.fingerprint !== currentPackage.transcript.fingerprint
    || prepared.transcript.revisionId !== currentPackage.transcript.revisionId;
  const subtitlesChanged = prepared.subtitles.srt.fingerprint !== currentPackage.subtitles.srt.fingerprint
    || prepared.subtitles.vtt.fingerprint !== currentPackage.subtitles.vtt.fingerprint;
  const mediaChanged = prepared.media.fingerprint !== currentPackage.media.fingerprint
    || prepared.media.sourceMediaId !== currentPackage.media.sourceMediaId
    || prepared.media.sourceKind !== currentPackage.media.sourceKind;

  const staleReasons: string[] = [];
  if (transcriptChanged) staleReasons.push("Transcript changed");
  if (subtitlesChanged) staleReasons.push("Subtitles changed");
  if (mediaChanged) staleReasons.push("Media source changed");

  const preparedStatus = staleReasons.length > 0
    ? "stale"
    : prepared.overallStatus === "ready"
    ? "current"
    : prepared.overallStatus;

  return {
    preparedStatus,
    currentPackage,
    staleReasons,
    changed: {
      transcript: transcriptChanged,
      subtitles: subtitlesChanged,
      media: mediaChanged,
    },
  };
}
