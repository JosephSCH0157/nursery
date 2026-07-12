import type {
  EpisodeImageMapEntry,
  EpisodeMediaMap,
  EpisodePackageV2,
  EpisodeSpokenBeat,
} from "./episode-package-v2";

export type CanonicalImageMapArtifact = {
  entries: readonly EpisodeImageMapEntry[];
  spokenBeats: readonly EpisodeSpokenBeat[];
};

export type CanonicalVisualArtifactInputs = {
  metadataPackage: EpisodePackageV2;
  imageMap?: CanonicalImageMapArtifact | null;
  mediaMap?: EpisodeMediaMap | null;
};

/**
 * Episode metadata owns the package shell. The image-map endpoint and media-map
 * file own their respective artifacts. Embedded copies are compatibility data
 * only and may be used only when no canonical artifact was read.
 */
export function resolveCanonicalVisualArtifacts(
  input: CanonicalVisualArtifactInputs,
): EpisodePackageV2 {
  const withImageMap = input.imageMap
    ? {
      ...input.metadataPackage,
      spoken_beats: [...input.imageMap.spokenBeats],
      image_map: {
        ...input.metadataPackage.image_map,
        entries: [...input.imageMap.entries],
      },
    }
    : input.metadataPackage;

  if (!input.mediaMap) return withImageMap;
  return {
    ...withImageMap,
    media_map: input.mediaMap,
  };
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
