import type { HammerCompositionTrackV2, HammerCompositionV2 } from "./hammerCompositionV2";
import type { HammerLegacyCompositionProjectionInput } from "./hammerLegacyCompositionProjection";
import type { HammerMediaProvenance } from "./hammerMediaProvenance";

export type HammerBaseMediaIdentity = Readonly<{
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string;
  recordingRevisionId: string;
  mediaId: string;
  mediaPath: string;
  mediaSha256: string;
  mimeType: string | null;
  durationMs: number;
  transcriptId: string | null;
  createdAt: string;
}>;

export type HammerBaseCompositionDecision =
  | Readonly<{ kind: "initialize"; projection: HammerLegacyCompositionProjectionInput; expectedRevisionUpdatedAt: string }>
  | Readonly<{ kind: "preserve_existing"; composition: HammerCompositionV2 }>;

export function resolveHammerBaseCompositionDurationSec(args: {
  transcriptDurationSec: number;
  mediaDurationMs: number | null | undefined;
}): number {
  const transcript = Number.isFinite(args.transcriptDurationSec) ? Math.max(0, args.transcriptDurationSec) : 0;
  const media = typeof args.mediaDurationMs === "number" && Number.isFinite(args.mediaDurationMs) && args.mediaDurationMs > 0
    ? args.mediaDurationMs / 1000
    : 0;
  return media > 0 ? media : transcript;
}

function baseClip(args: {
  clipId: string;
  trackId: string;
  mediaId: string;
  durationSec: number;
  linkedGroupId: string;
}) {
  return Object.freeze({
    clip_id: args.clipId,
    track_id: args.trackId,
    kind: "media" as const,
    source_media_id: args.mediaId,
    source_start_sec: 0,
    source_end_sec: args.durationSec,
    timeline_start_sec: 0,
    timeline_end_sec: args.durationSec,
    enabled: true,
    linked_group_id: args.linkedGroupId,
    payload: Object.freeze({ base_media: true }),
  });
}

/**
 * Builds the untouched source composition. Transcript timings are overlays and
 * never trim the opening silence or tail from the media tracks.
 */
export function buildHammerBaseMediaProjection(identity: HammerBaseMediaIdentity): HammerLegacyCompositionProjectionInput {
  if (!Number.isSafeInteger(identity.durationMs) || identity.durationMs <= 0) {
    throw new Error("hammer_base_composition_duration_invalid");
  }
  const sourceSha256 = identity.mediaSha256.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(sourceSha256)) throw new Error("hammer_base_composition_fingerprint_invalid");
  const durationSec = identity.durationMs / 1000;
  const linkedGroupId = `hammer-base-media:${identity.canonicalRecordingId}`;
  const source: HammerMediaProvenance = Object.freeze({
    schema_version: 1,
    media_id: identity.mediaId,
    canonical_asset_id: null,
    role: "program_video",
    content_fingerprint: sourceSha256,
    canonical_path: identity.mediaPath,
    mime_type: identity.mimeType,
    duration_ms: identity.durationMs,
    availability: "available",
    relinked_from_path: null,
    derived_from_fingerprint: null,
    generator_version: null,
  });
  const tracks: readonly HammerCompositionTrackV2[] = Object.freeze([
    Object.freeze({
      track_id: "program-video",
      kind: "video" as const,
      role: "program_video",
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      clips: Object.freeze([baseClip({ clipId: "program-video:base", trackId: "program-video", mediaId: identity.mediaId, durationSec, linkedGroupId })]),
    }),
    Object.freeze({
      track_id: "program-audio",
      kind: "audio" as const,
      role: "program_audio",
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      clips: Object.freeze([baseClip({ clipId: "program-audio:base", trackId: "program-audio", mediaId: identity.mediaId, durationSec, linkedGroupId })]),
    }),
  ]);
  return Object.freeze({
    workspace_id: identity.workspaceId,
    workpiece_id: identity.workpieceId,
    canonical_recording_id: identity.canonicalRecordingId,
    recording_revision_id: identity.recordingRevisionId,
    created_at: identity.createdAt,
    source_media: Object.freeze([source]),
    projected_tracks: tracks,
    transcript_id: identity.transcriptId,
    caption_artifact_id: null,
  });
}

/**
 * The revision timestamp is the existing Tongs compare-and-swap token. A
 * composition observed after discovery always wins; this helper never replaces
 * work created by another editor while the base candidate was being prepared.
 */
export function decideHammerBaseCompositionInitialization(args: {
  identity: HammerBaseMediaIdentity;
  existingComposition: HammerCompositionV2 | null;
  expectedRevisionUpdatedAt: string | null;
}): HammerBaseCompositionDecision {
  if (args.existingComposition) return Object.freeze({ kind: "preserve_existing", composition: args.existingComposition });
  if (!args.expectedRevisionUpdatedAt?.trim()) throw new Error("hammer_base_composition_cas_required");
  return Object.freeze({
    kind: "initialize",
    projection: buildHammerBaseMediaProjection(args.identity),
    expectedRevisionUpdatedAt: args.expectedRevisionUpdatedAt,
  });
}
