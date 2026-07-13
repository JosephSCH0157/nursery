import {
  hammerStableFingerprint,
  type HammerCompositionTrackV2,
  type HammerCompositionV2,
} from "./hammerCompositionV2";
import type { HammerMediaProvenance } from "./hammerMediaProvenance";
import { readAcknowledgedHammerCompositionV2, type HammerCompositionTransactionV2 } from "./hammerCompositionTransactionV2";

export type HammerLegacyCompositionProjectionInput = Readonly<{
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  canonical_recording_id: string;
  created_at: string;
  source_media: readonly HammerMediaProvenance[];
  projected_tracks: readonly HammerCompositionTrackV2[];
  transcript_id: string | null;
  caption_artifact_id: string | null;
  audio_treatments?: readonly Readonly<Record<string, unknown>>[];
  editorial_authority?: Readonly<Record<string, unknown>>;
  automated_placements?: readonly Readonly<{ placement_id: string; payload: Readonly<Record<string, unknown>> }>[];
  intro_clip_id?: string | null;
  outro_clip_id?: string | null;
  thumbnail_asset_id?: string | null;
}>;

function identityMatches(composition: HammerCompositionV2, input: HammerLegacyCompositionProjectionInput): boolean {
  return composition.workspace_id === input.workspace_id
    && composition.workpiece_id === input.workpiece_id
    && composition.recording_revision_id === input.recording_revision_id;
}

/**
 * Deterministically projects the already-authoritative legacy artifacts into a
 * candidate V2 document. Persisting and promoting the candidate is a separate,
 * acknowledged Tongs operation; projection failure cannot overwrite legacy state.
 */
export function projectLegacyHammerCompositionV2(
  input: HammerLegacyCompositionProjectionInput,
  existing?: HammerCompositionV2 | null,
): HammerCompositionV2 {
  if (existing) {
    if (!identityMatches(existing, input)) throw new Error("composition_v2_identity_conflict");
    return existing;
  }
  if (input.source_media.length === 0) throw new Error("composition_v2_source_missing");
  const sourceIds = new Set(input.source_media.map((source) => source.media_id));
  for (const track of input.projected_tracks) {
    for (const clip of track.clips) {
      if (clip.source_media_id && !sourceIds.has(clip.source_media_id)) throw new Error("composition_v2_clip_source_unresolved");
    }
  }
  const seed = {
    schema_version: 2 as const,
    composition_id: `hammer-composition:${input.canonical_recording_id}`,
    workspace_id: input.workspace_id,
    workpiece_id: input.workpiece_id,
    recording_revision_id: input.recording_revision_id,
    revision: 0,
    parent_revision: null,
    created_at: input.created_at,
    updated_at: input.created_at,
    source_media: input.source_media,
    tracks: input.projected_tracks,
    transcript: Object.freeze({ transcript_id: input.transcript_id, corrections: [] }),
    captions: Object.freeze({ artifact_id: input.caption_artifact_id, based_on_transcript_id: input.transcript_id, stale: false }),
    audio_treatments: input.audio_treatments ?? [],
    editorial_authority: input.editorial_authority ?? Object.freeze({}),
    automated_placements: input.automated_placements ?? [],
    packaging: Object.freeze({
      intro_clip_id: input.intro_clip_id ?? null,
      outro_clip_id: input.outro_clip_id ?? null,
      thumbnail_asset_id: input.thumbnail_asset_id ?? null,
    }),
    history_head_id: null,
    fingerprint: "",
  };
  return Object.freeze({ ...seed, fingerprint: hammerStableFingerprint({ ...seed, fingerprint: undefined }) });
}

export type HammerCreativeAuthorityResolution =
  | Readonly<{ kind: "canonical_v2"; composition: HammerCompositionV2 }>
  | Readonly<{ kind: "legacy_projection_pending"; candidate: HammerCompositionV2 }>;

export function resolveHammerCreativeAuthority(args: {
  legacy: HammerLegacyCompositionProjectionInput;
  transaction?: HammerCompositionTransactionV2 | null;
  acknowledgedRevision?: number | null;
  acknowledgedFingerprint?: string | null;
  acknowledgedHistoryHeadId?: string | null;
}): HammerCreativeAuthorityResolution {
  if (!args.transaction) return Object.freeze({ kind: "legacy_projection_pending", candidate: projectLegacyHammerCompositionV2(args.legacy) });
  return Object.freeze({
    kind: "canonical_v2",
    composition: readAcknowledgedHammerCompositionV2({
      transaction: args.transaction,
      recordingRevisionId: args.legacy.recording_revision_id,
      acknowledgedRevision: args.acknowledgedRevision ?? null,
      acknowledgedFingerprint: args.acknowledgedFingerprint ?? null,
      acknowledgedHistoryHeadId: args.acknowledgedHistoryHeadId ?? null,
    }),
  });
}
