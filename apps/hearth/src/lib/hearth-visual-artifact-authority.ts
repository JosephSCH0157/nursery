import type {
  EpisodeImageMapEntry,
  EpisodeMediaMap,
  EpisodePackageV2,
  EpisodeSpokenBeat,
} from "./episode-package-v2";
import { createEmptyEpisodePackageV2 } from "./episode-package-v2";

export type CanonicalImageMapArtifact = {
  entries: readonly EpisodeImageMapEntry[];
  spokenBeats: readonly EpisodeSpokenBeat[];
};

export type CanonicalVisualArtifactInputs = {
  metadataPackage: EpisodePackageV2;
  imageMap: CanonicalArtifactRead<CanonicalImageMapArtifact>;
  mediaMap: CanonicalArtifactRead<EpisodeMediaMap>;
};

export type CanonicalArtifactRead<T> =
  | { kind: "available"; value: T }
  | { kind: "missing" }
  | { kind: "unavailable" };

/**
 * Approval authority hydrates independently from visual artifacts on cold boot.
 * A temporarily missing approved version is not evidence that an applied plan
 * is stale; only a different canonical approved version can invalidate it.
 */
export function shouldInvalidateMediaMapForScriptVersion(
  mediaMapScriptVersionId: string | null,
  approvedScriptVersion: number | null,
): boolean {
  if (approvedScriptVersion === null) return false;
  return mediaMapScriptVersionId !== String(approvedScriptVersion);
}

/**
 * Episode metadata owns the package shell. The image-map endpoint and media-map
 * file own their respective artifacts. Embedded copies are compatibility data
 * only and may be used only when no canonical artifact was read.
 */
export function resolveCanonicalVisualArtifacts(
  input: CanonicalVisualArtifactInputs,
): EpisodePackageV2 {
  const emptyPackage = createEmptyEpisodePackageV2();
  const withImageMap = input.imageMap.kind === "available"
    ? {
      ...input.metadataPackage,
      spoken_beats: [...input.imageMap.value.spokenBeats],
      image_map: {
        ...input.metadataPackage.image_map,
        entries: [...input.imageMap.value.entries],
      },
    }
    : input.imageMap.kind === "unavailable"
      ? {
        ...input.metadataPackage,
        spoken_beats: emptyPackage.spoken_beats,
        image_map: emptyPackage.image_map,
      }
      : input.metadataPackage;

  if (input.mediaMap.kind === "missing") return withImageMap;
  return input.mediaMap.kind === "available"
    ? { ...withImageMap, media_map: input.mediaMap.value }
    : { ...withImageMap, media_map: emptyPackage.media_map };
}

/**
 * A metadata acknowledgement may contain compatibility copies of standalone
 * artifacts. Keep the exact canonical artifacts already held by the caller.
 */
export function retainCanonicalVisualArtifacts(
  metadataPackage: EpisodePackageV2,
  canonicalPackage: EpisodePackageV2,
): EpisodePackageV2 {
  return {
    ...metadataPackage,
    spoken_beats: canonicalPackage.spoken_beats,
    image_map: canonicalPackage.image_map,
    media_map: canonicalPackage.media_map,
  };
}

/**
 * Full metadata writes must not accept standalone artifact fields from their
 * caller. Preserve the currently persisted compatibility copies instead.
 */
export function retainPersistedArtifactsForMetadataCommit(
  requestedPackage: EpisodePackageV2,
  persistedPackage: EpisodePackageV2,
): EpisodePackageV2 {
  return retainCanonicalVisualArtifacts(requestedPackage, persistedPackage);
}
