import type { EpisodeImageMapAnchorScope, EpisodeImageMapEntry } from "./episode-package-v2";

export function resolveImageMapEntryAnchorScope(entry: EpisodeImageMapEntry | null | undefined): EpisodeImageMapAnchorScope {
  if (!entry) return "orphaned";
  if (entry.anchor_scope) return entry.anchor_scope;
  if (entry.beat_anchor) return "beat";
  return entry.script_anchor ? "attached" : "orphaned";
}

export function hasStructuredImageMapAnchor(entry: EpisodeImageMapEntry | null | undefined): boolean {
  if (!entry) return false;
  return Boolean(entry.script_anchor || entry.beat_anchor);
}
