import type {
  EpisodeImageMapEntry,
  EpisodeImageMapVisualPriority,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
} from "./episode-package-v2";
import { mapImageEntriesToMediaMapEntries } from "./hearth-media-map-builder";

function isImageMapDerivedMediaMapEntry(entry: EpisodeMediaMapEntry): boolean {
  return entry.id.startsWith("mm_imap_");
}

function resolveImageMapVisualPriority(
  mediaEntry: EpisodeMediaMapEntry,
  existingEntry: EpisodeImageMapEntry | null,
): EpisodeImageMapVisualPriority {
  if (mediaEntry.critical) return "primary";
  if (mediaEntry.optional) return "optional";
  return existingEntry?.visual_priority ?? "supporting";
}

export function syncMediaMapImageEntriesFromImageMap(args: {
  mediaMap: EpisodeMediaMap;
  imageEntries: EpisodeImageMapEntry[];
  nowIso?: string;
}): EpisodeMediaMap {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const refreshedEntries = mapImageEntriesToMediaMapEntries(args.imageEntries, nowIso, "mm_imap_");
  const refreshedById = new Map(refreshedEntries.map((entry) => [entry.id, entry] as const));
  const nextEntries: EpisodeMediaMapEntry[] = [];
  const seenIds = new Set<string>();
  const markNeedsAttention =
    args.mediaMap.status === "activated"
    || args.mediaMap.status === "fulfilling"
    || args.mediaMap.status === "fulfilled"
    || args.mediaMap.status === "needs_attention";

  for (const entry of args.mediaMap.entries) {
    if (!isImageMapDerivedMediaMapEntry(entry)) {
      nextEntries.push(entry);
      continue;
    }

    const refreshed = refreshedById.get(entry.id);
    if (!refreshed) continue;
    seenIds.add(entry.id);
    nextEntries.push({
      ...refreshed,
      created_at: entry.created_at || refreshed.created_at,
      stale: markNeedsAttention,
      updated_at: nowIso,
    });
  }

  for (const entry of refreshedEntries) {
    if (seenIds.has(entry.id)) continue;
    nextEntries.push({
      ...entry,
      stale: markNeedsAttention,
      updated_at: nowIso,
    });
  }

  return {
    ...args.mediaMap,
    status: markNeedsAttention ? "needs_attention" : args.mediaMap.status,
    entries: nextEntries,
    generated_at: nowIso,
  };
}

export function syncImageMapEntryFromMediaMapEntry(args: {
  mediaEntry: EpisodeMediaMapEntry;
  existingEntry: EpisodeImageMapEntry | null;
  entryId?: string;
  beatOrder: number;
}): EpisodeImageMapEntry {
  const { mediaEntry, existingEntry, beatOrder } = args;
  const nextAnchor = mediaEntry.anchor.target;
  const anchorChanged = (existingEntry?.anchor ?? "") !== nextAnchor;
  const isGlobalAnchor = mediaEntry.anchor.mode === "section_marker";
  const isAbsoluteTimeAnchor = mediaEntry.anchor.mode === "absolute_time";
  const preservesScriptAnchor =
    !anchorChanged
    && !isGlobalAnchor
    && !isAbsoluteTimeAnchor
    && mediaEntry.anchor.mode !== "speaker_turn";
  const nextBeatAnchor = mediaEntry.anchor.mode === "speaker_turn"
    ? (mediaEntry.beat_anchor ?? (!anchorChanged ? (existingEntry?.beat_anchor ?? null) : null))
    : null;
  const selectedAssetId = mediaEntry.source.status === "selected" || mediaEntry.source.status === "attached"
    ? mediaEntry.source.asset_id
    : null;
  const sectionIntentTarget = mediaEntry.anchor.target.trim();

  return {
    id: existingEntry?.id ?? args.entryId ?? mediaEntry.id.replace(/^mm_imap_/, ""),
    anchor: nextAnchor,
    script_anchor: preservesScriptAnchor ? (existingEntry?.script_anchor ?? null) : null,
    beat_anchor: nextBeatAnchor,
    anchor_scope: isGlobalAnchor
      ? "global"
      : preservesScriptAnchor
        ? (existingEntry?.anchor_scope ?? "attached")
        : nextBeatAnchor
          ? "beat"
          : "orphaned",
    purpose: mediaEntry.purpose,
    description: mediaEntry.description,
    visual_intent: mediaEntry.description,
    prompt_basis: mediaEntry.description,
    style_preset: existingEntry?.style_preset ?? null,
    intent: mediaEntry.intent || existingEntry?.intent || "cutaway",
    source_type: existingEntry?.source_type ?? (selectedAssetId ? "external" : "stock"),
    origin: existingEntry?.origin ?? "hearth",
    visual_priority: resolveImageMapVisualPriority(mediaEntry, existingEntry),
    visual_type: existingEntry?.visual_type ?? "still_image",
    section_intent_note: isGlobalAnchor
      ? (sectionIntentTarget && sectionIntentTarget !== "global:image"
        ? sectionIntentTarget
        : (existingEntry?.section_intent_note ?? null))
      : (existingEntry?.section_intent_note ?? null),
    beat_order: beatOrder,
    paragraph_beat_order: 1,
    candidate_assets: existingEntry?.candidate_assets ?? [],
    selected_asset_id: selectedAssetId,
    status: selectedAssetId ? "selected" : (preservesScriptAnchor || nextBeatAnchor ? "mapped" : "draft"),
    placement_hint: isAbsoluteTimeAnchor
      ? "exact_timestamp"
      : (existingEntry?.placement_hint === "exact_timestamp" ? null : (existingEntry?.placement_hint ?? null)),
  };
}
