import type {
  EpisodeImageMapEntry,
  EpisodePackageV2,
  EpisodeSpokenBeat,
} from "./episode-package-v2";

export function replaceEpisodePackageImageMap(
  pkg: EpisodePackageV2,
  entries: EpisodeImageMapEntry[],
  spokenBeats?: EpisodeSpokenBeat[] | null,
): EpisodePackageV2 {
  return {
    ...pkg,
    ...(spokenBeats ? { spoken_beats: spokenBeats } : {}),
    image_map: {
      entries,
    },
  };
}
