import type { EpisodeImageMapEntry, EpisodeSpokenBeat } from "./episode-package-v2";
import { generateImageMapEntriesFromScript } from "./hearth-image-map-beats";
import {
  generateImageMapEntriesFromBulletScript,
  isBulletOutlineScript,
} from "./hearth-spoken-beats";

export function resolveImageMapEntriesForMediaMapBootstrap(args: {
  currentEntries: readonly EpisodeImageMapEntry[];
  currentSpokenBeats?: readonly EpisodeSpokenBeat[];
  scriptText: string;
  preferBeatAnchors?: boolean;
}): {
  entries: EpisodeImageMapEntry[];
  spokenBeats: EpisodeSpokenBeat[];
  seededFromScript: boolean;
  anchorMode: "script_text" | "bullet_beat";
} {
  if (args.currentEntries.length > 0) {
    return {
      entries: [...args.currentEntries],
      spokenBeats: [...(args.currentSpokenBeats ?? [])],
      seededFromScript: false,
      anchorMode: args.currentEntries.some((entry) => entry.beat_anchor)
        ? "bullet_beat"
        : "script_text",
    };
  }

  const useBeatAnchors = args.preferBeatAnchors === true || isBulletOutlineScript(args.scriptText);
  if (useBeatAnchors) {
    const generated = generateImageMapEntriesFromBulletScript({
      scriptText: args.scriptText,
      existingBeats: args.currentSpokenBeats ?? [],
    });
    return {
      entries: generated.entries,
      spokenBeats: generated.spokenBeats,
      seededFromScript: generated.entries.length > 0,
      anchorMode: "bullet_beat",
    };
  }

  const generatedEntries = generateImageMapEntriesFromScript(args.scriptText);
  return {
    entries: generatedEntries,
    spokenBeats: [],
    seededFromScript: generatedEntries.length > 0,
    anchorMode: "script_text",
  };
}
