import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";

type TimelineDiagnostics = {
  clipCount: number;
  anchorCount: number;
  assetBackedClipCount: number;
};

function countAnchors(timeline: HammerVisualTimelineState | null): number {
  if (!timeline) return 0;
  let total = 0;
  for (const clip of timeline.clips) {
    const hasAnchorSegment = Boolean(clip.anchor_hint.anchor_segment_id);
    const matchedCount = clip.anchor_hint.matched_segment_ids.length;
    if (hasAnchorSegment || matchedCount > 0) total += 1;
  }
  return total;
}

function buildClipIdSet(timeline: HammerVisualTimelineState): Set<string> {
  return new Set(timeline.clips.map((clip) => clip.clip_id));
}

function hasSameClipSet(a: HammerVisualTimelineState, b: HammerVisualTimelineState): boolean {
  if (a.clips.length !== b.clips.length) return false;
  const aIds = buildClipIdSet(a);
  if (aIds.size !== b.clips.length) return false;
  for (const clip of b.clips) {
    if (!aIds.has(clip.clip_id)) return false;
  }
  return true;
}

function mergeAssetsPreferIncoming(
  previous: HammerVisualTimelineState["assets"],
  incoming: HammerVisualTimelineState["assets"],
): HammerVisualTimelineState["assets"] {
  const incomingById = new Map(incoming.map((asset) => [asset.asset_id, asset] as const));
  const merged = previous.map((asset) => {
    const hydrated = incomingById.get(asset.asset_id);
    return hydrated ? { ...asset, ...hydrated } : asset;
  });
  for (const asset of incoming) {
    if (merged.some((candidate) => candidate.asset_id === asset.asset_id)) continue;
    merged.push(asset);
  }
  return merged;
}

function mergeClipsPreferPlacementMetadata(
  previous: HammerVisualTimelineState["clips"],
  incoming: HammerVisualTimelineState["clips"],
): HammerVisualTimelineState["clips"] {
  const incomingById = new Map(incoming.map((clip) => [clip.clip_id, clip] as const));
  const merged = previous.map((clip) => {
    const hydrated = incomingById.get(clip.clip_id);
    if (!hydrated) return clip;
    return {
      ...clip,
      placement_status: hydrated.placement_status,
      confidence: hydrated.confidence,
      updated_at: hydrated.updated_at,
    };
  });
  for (const clip of incoming) {
    if (merged.some((candidate) => candidate.clip_id === clip.clip_id)) continue;
    merged.push(clip);
  }
  return merged;
}

export function buildVisualTimelineDiagnostics(
  timeline: HammerVisualTimelineState | null,
): TimelineDiagnostics {
  if (!timeline) {
    return { clipCount: 0, anchorCount: 0, assetBackedClipCount: 0 };
  }
  const assetIds = new Set(timeline.assets.map((asset) => asset.asset_id));
  const assetBackedClipCount = timeline.clips.reduce((count, clip) => {
    if (clip.asset_id && assetIds.has(clip.asset_id)) return count + 1;
    return count;
  }, 0);
  return {
    clipCount: timeline.clips.length,
    anchorCount: countAnchors(timeline),
    assetBackedClipCount,
  };
}

export function preservePlacementRichTimelineDuringHydration(args: {
  previous: HammerVisualTimelineState | null;
  incoming: HammerVisualTimelineState | null;
}): { timeline: HammerVisualTimelineState | null; reason: string } {
  const { previous, incoming } = args;
  if (!incoming || !previous) {
    return { timeline: incoming ?? previous, reason: incoming ? "incoming_only" : "previous_only" };
  }
  if (!hasSameClipSet(previous, incoming)) {
    return { timeline: incoming, reason: "clip_set_changed" };
  }
  const previousAnchors = countAnchors(previous);
  const incomingAnchors = countAnchors(incoming);
  if (incomingAnchors >= previousAnchors) {
    return { timeline: incoming, reason: "incoming_not_degraded" };
  }

  const mergedClips = mergeClipsPreferPlacementMetadata(previous.clips, incoming.clips);
  const mergedAssets = mergeAssetsPreferIncoming(previous.assets, incoming.assets);
  const selectedClipId = incoming.selected_clip_id && mergedClips.some((clip) => clip.clip_id === incoming.selected_clip_id)
    ? incoming.selected_clip_id
    : previous.selected_clip_id;

  return {
    timeline: {
      ...incoming,
      selected_clip_id: selectedClipId,
      assets: mergedAssets,
      clips: mergedClips,
    },
    reason: "preserved_anchor_rich_timeline",
  };
}
