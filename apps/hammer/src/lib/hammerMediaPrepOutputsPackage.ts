import type { MediaKind, MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { cloneVisualPlacements } from "./hammerVisualPlacements";
import { cloneHammerAudioPolish } from "../prep/hammerAudioPolish";
import type {
  HammerPersistenceSnapshot,
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../persistence/hammerPersistenceContract";

export type HammerMediaPrepFreshness = "missing" | "current" | "stale";

export interface HammerMediaPrepOutputsPackageVisuals {
  status: HammerPersistedVisualPlacements["status"] | "missing";
  freshness: HammerMediaPrepFreshness;
  transcript_source_ref: string | null;
  source_refs: string[];
  placement_count: number;
  uncertain_placement_count: number;
  uncertainty_flags: string[];
  placements: HammerVisualPlacementRecord[];
}

export interface HammerMediaPrepOutputsPackageRawAudioSource {
  media_id: string | null;
  kind: MediaKind | null;
  media_signature: string | null;
  local_relpath: string | null;
  cloud_uri: string | null;
  source_hint: string | null;
  media_source_label: string | null;
  duration_ms: number | null;
}

export interface HammerMediaPrepOutputsPackageAudioPolish {
  status: HammerPersistedAudioPolish["status"] | "missing";
  freshness: HammerMediaPrepFreshness;
  prepared_passes: HammerPersistedAudioPolish["prepared_passes"];
  failure_code: HammerPersistedAudioPolish["failure_code"] | null;
  failure_reason: string | null;
  processor_version: string | null;
  settings_summary: HammerPersistedAudioPolish["settings_summary"];
  output_local_relpath: string | null;
  output_workpiece_path: string | null;
  output_mime_type: string | null;
  output_duration_ms: number | null;
}

export interface HammerMediaPrepOutputsPackagePreferredPlayback {
  kind: "polished" | "raw" | "none";
  reason:
    | "prepared_audio_polish"
    | "audio_polish_stale"
    | "audio_polish_failed"
    | "audio_polish_unsupported"
    | "audio_polish_missing"
    | "raw_source_available"
    | "no_media_source";
  media_id: string | null;
  local_relpath: string | null;
  workpiece_path: string | null;
  mime_type: string | null;
  source_label: string | null;
}

export interface HammerMediaPrepOutputsPackage {
  schema_version: 1;
  visuals: HammerMediaPrepOutputsPackageVisuals;
  audio: {
    raw_source: HammerMediaPrepOutputsPackageRawAudioSource;
    polish: HammerMediaPrepOutputsPackageAudioPolish;
    preferred_playback: HammerMediaPrepOutputsPackagePreferredPlayback;
  };
}

export interface BuildHammerMediaPrepOutputsPackageArgs {
  structuredTranscript: HammerPersistedStructuredTranscript | null | undefined;
  visualPlacements: HammerPersistedVisualPlacements | null | undefined;
  audioPolish: HammerPersistedAudioPolish | null | undefined;
  mediaRef?: MediaRef | null | undefined;
  mediaSourceLabel?: string | null | undefined;
}

function cloneMediaRef(ref: MediaRef | null | undefined): MediaRef | null {
  return ref ? { ...ref } : null;
}

function resolveVisualFreshness(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  visualPlacements: HammerPersistedVisualPlacements | null,
): HammerMediaPrepFreshness {
  if (!visualPlacements) return "missing";
  const transcriptRef = transcript?.transcript_id ? `transcript:${transcript.transcript_id}` : null;
  if (!transcriptRef) return "missing";
  if (visualPlacements.source_refs.includes(transcriptRef)) return "current";
  if (visualPlacements.source_refs.some((value) => value.startsWith("transcript:"))) return "stale";
  return "missing";
}

function resolveRawAudioSource(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  mediaRef: MediaRef | null,
  mediaSourceLabel: string | null | undefined,
): HammerMediaPrepOutputsPackageRawAudioSource {
  const sourceMediaRef = cloneMediaRef(transcript?.source_media_ref ?? mediaRef);
  return {
    media_id: sourceMediaRef?.media_id ?? transcript?.media_id ?? null,
    kind: sourceMediaRef?.kind ?? null,
    media_signature: transcript?.media_signature ?? null,
    local_relpath: sourceMediaRef?.local_relpath ?? null,
    cloud_uri: sourceMediaRef?.cloud_uri ?? null,
    source_hint: sourceMediaRef?.source_hint ?? null,
    media_source_label: mediaSourceLabel ?? null,
    duration_ms: typeof sourceMediaRef?.duration_ms === "number" ? sourceMediaRef.duration_ms : null,
  };
}

function resolveAudioFreshness(
  polish: HammerPersistedAudioPolish | null,
  rawSource: HammerMediaPrepOutputsPackageRawAudioSource,
): HammerMediaPrepFreshness {
  if (!polish) return "missing";
  if (!rawSource.media_id && !rawSource.media_signature) return "missing";
  const mediaIdMatches = polish.source_media_id === rawSource.media_id;
  const signatureMatches = polish.source_media_signature === rawSource.media_signature;
  return mediaIdMatches && signatureMatches ? "current" : "stale";
}

function resolvePreferredPlayback(args: {
  rawSource: HammerMediaPrepOutputsPackageRawAudioSource;
  polish: HammerPersistedAudioPolish | null;
  polishFreshness: HammerMediaPrepFreshness;
}): HammerMediaPrepOutputsPackagePreferredPlayback {
  const { rawSource, polish, polishFreshness } = args;
  if (
    polish
    && polish.status === "prepared"
    && polishFreshness === "current"
    && (polish.output_local_relpath || polish.output_workpiece_path)
  ) {
    return {
      kind: "polished",
      reason: "prepared_audio_polish",
      media_id: polish.source_media_id,
      local_relpath: polish.output_local_relpath,
      workpiece_path: polish.output_workpiece_path,
      mime_type: polish.output_mime_type,
      source_label: "audio polish artifact",
    };
  }

  if (rawSource.media_id || rawSource.local_relpath || rawSource.cloud_uri) {
    if (polishFreshness === "stale") {
      return {
        kind: "raw",
        reason: "audio_polish_stale",
        media_id: rawSource.media_id,
        local_relpath: rawSource.local_relpath,
        workpiece_path: null,
        mime_type: null,
        source_label: rawSource.media_source_label,
      };
    }
    if (polish?.status === "failed" && polish.failure_code === "unsupported_source") {
      return {
        kind: "raw",
        reason: "audio_polish_unsupported",
        media_id: rawSource.media_id,
        local_relpath: rawSource.local_relpath,
        workpiece_path: null,
        mime_type: null,
        source_label: rawSource.media_source_label,
      };
    }
    if (polish?.status === "failed") {
      return {
        kind: "raw",
        reason: "audio_polish_failed",
        media_id: rawSource.media_id,
        local_relpath: rawSource.local_relpath,
        workpiece_path: null,
        mime_type: null,
        source_label: rawSource.media_source_label,
      };
    }
    return {
      kind: "raw",
      reason: polish ? "raw_source_available" : "audio_polish_missing",
      media_id: rawSource.media_id,
      local_relpath: rawSource.local_relpath,
      workpiece_path: null,
      mime_type: null,
      source_label: rawSource.media_source_label,
    };
  }

  return {
    kind: "none",
    reason: "no_media_source",
    media_id: null,
    local_relpath: null,
    workpiece_path: null,
    mime_type: null,
    source_label: null,
  };
}

export function buildHammerMediaPrepOutputsPackage(
  args: BuildHammerMediaPrepOutputsPackageArgs,
): HammerMediaPrepOutputsPackage {
  const visualPlacements = cloneVisualPlacements(args.visualPlacements);
  const audioPolish = cloneHammerAudioPolish(args.audioPolish);
  const rawSource = resolveRawAudioSource(
    args.structuredTranscript,
    cloneMediaRef(args.mediaRef),
    args.mediaSourceLabel,
  );
  const visualFreshness = resolveVisualFreshness(args.structuredTranscript, visualPlacements);
  const audioFreshness = resolveAudioFreshness(audioPolish, rawSource);

  return {
    schema_version: 1,
    visuals: {
      status: visualPlacements?.status ?? "missing",
      freshness: visualFreshness,
      transcript_source_ref: args.structuredTranscript?.transcript_id
        ? `transcript:${args.structuredTranscript.transcript_id}`
        : null,
      source_refs: visualPlacements?.source_refs ? [...visualPlacements.source_refs] : [],
      placement_count: visualPlacements?.placements.length ?? 0,
      uncertain_placement_count: visualPlacements?.placements.filter((placement) => placement.status === "uncertain").length ?? 0,
      uncertainty_flags: visualPlacements?.uncertainty_flags ? [...visualPlacements.uncertainty_flags] : [],
      placements: visualPlacements?.placements ? visualPlacements.placements.map((placement) => ({
        ...placement,
        matched_segment_ids: [...placement.matched_segment_ids],
        uncertainty_flags: [...placement.uncertainty_flags],
      })) : [],
    },
    audio: {
      raw_source: rawSource,
      polish: {
        status: audioPolish?.status ?? "missing",
        freshness: audioFreshness,
        prepared_passes: audioPolish?.prepared_passes ? [...audioPolish.prepared_passes] : [],
        failure_code: audioPolish?.failure_code ?? null,
        failure_reason: audioPolish?.failure_reason ?? null,
        processor_version: audioPolish?.processor_version ?? null,
        settings_summary: audioPolish?.settings_summary ? { ...audioPolish.settings_summary } : {},
        output_local_relpath: audioPolish?.output_local_relpath ?? null,
        output_workpiece_path: audioPolish?.output_workpiece_path ?? null,
        output_mime_type: audioPolish?.output_mime_type ?? null,
        output_duration_ms: audioPolish?.output_duration_ms ?? null,
      },
      preferred_playback: resolvePreferredPlayback({
        rawSource,
        polish: audioPolish,
        polishFreshness: audioFreshness,
      }),
    },
  };
}

export function buildHammerMediaPrepOutputsPackageFromSnapshot(
  snapshot: HammerPersistenceSnapshot | null | undefined,
): HammerMediaPrepOutputsPackage {
  const editorSession: HammerPersistedEditorSession | null | undefined = snapshot?.editor_session.data;
  return buildHammerMediaPrepOutputsPackage({
    structuredTranscript: snapshot?.structured_transcript.data,
    visualPlacements: snapshot?.visual_placements.data,
    audioPolish: snapshot?.audio_polish.data,
    mediaRef: editorSession?.media_ref ?? null,
    mediaSourceLabel: editorSession?.media_source_label ?? null,
  });
}
