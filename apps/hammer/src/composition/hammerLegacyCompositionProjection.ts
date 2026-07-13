import {
  hammerStableFingerprint,
  type HammerCompositionTrackV2,
  type HammerCompositionV2,
} from "./hammerCompositionV2";
import type { HammerMediaProvenance } from "./hammerMediaProvenance";

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
    audio_treatments: [],
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
