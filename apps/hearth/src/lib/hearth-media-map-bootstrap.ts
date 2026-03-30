import type { EpisodeImageMapEntry } from "./episode-package-v2";
import { generateImageMapEntriesFromScript } from "./hearth-image-map-beats";

export function resolveImageMapEntriesForMediaMapBootstrap(args: {
  currentEntries: readonly EpisodeImageMapEntry[];
  scriptText: string;
}): {
  entries: EpisodeImageMapEntry[];
  seededFromScript: boolean;
} {
  if (args.currentEntries.length > 0) {
    return {
      entries: [...args.currentEntries],
      seededFromScript: false,
    };
  }

  const generatedEntries = generateImageMapEntriesFromScript(args.scriptText);
  return {
    entries: generatedEntries,
    seededFromScript: generatedEntries.length > 0,
  };
}
