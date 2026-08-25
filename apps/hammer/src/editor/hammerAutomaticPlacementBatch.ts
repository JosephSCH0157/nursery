import type { TimelinePlacementAnalysisEntry } from "../features/auto-placement/timelinePlacementAnalysisQueue";
import type { HammerVisualClip, HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
import { geometryToTransform, transformToGeometry } from "./hammerWorkspaceShellVisualUtils";

export type AutomaticPlacementBatchChange = Readonly<{
  placementId: string;
  transform: PreviewPlacementTransform;
  geometry: HammerVisualClip["geometry"];
}>;

export type AutomaticPlacementBatchPlan = Readonly<{
  changes: readonly AutomaticPlacementBatchChange[];
  safeExisting: number;
  review: number;
  stale: number;
  unchanged: number;
}>;

export function automaticPlacementCanonicalRevision(timeline: HammerVisualTimelineState, clip: HammerVisualClip): string {
  return `${timeline.revision}:${clip.updated_at}:${clip.start_sec}:${clip.end_sec}:${clip.asset_id ?? ""}`;
}

function transformsEqual(a: PreviewPlacementTransform, b: PreviewPlacementTransform): boolean {
  return Math.abs(a.leftPct - b.leftPct) < 0.001 && Math.abs(a.topPct - b.topPct) < 0.001
    && Math.abs(a.widthPct - b.widthPct) < 0.001 && Math.abs(a.heightPct - b.heightPct) < 0.001;
}

export function selectAutomaticPlacementBatch(args: {
  timeline: HammerVisualTimelineState | null;
  mediaRevision: string | null;
  entries: readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[];
}): AutomaticPlacementBatchPlan {
  if (!args.timeline || !args.mediaRevision) return { changes: [], safeExisting: 0, review: 0, stale: 0, unchanged: 0 };
  const clips = new Map(args.timeline.clips.map((clip) => [clip.clip_id, clip]));
  const changes: AutomaticPlacementBatchChange[] = [];
  let safeExisting = 0; let review = 0; let stale = 0; let unchanged = 0;
  for (const entry of args.entries) {
    if (entry.status === "safe-existing") { safeExisting += 1; continue; }
    if (entry.status !== "resolved-safe" || !entry.resolvedTransform) { review += 1; continue; }
    const clip = clips.get(entry.item.placementId);
    if (!clip || !clip.enabled || clip.placement_status !== "placed"
      || entry.item.mediaRevision !== args.mediaRevision
      || entry.item.sourceIdentity === ""
      || entry.item.compositionPresentationTimeSec !== Math.max(0, clip.start_sec)
      || entry.item.canonicalRevision !== automaticPlacementCanonicalRevision(args.timeline, clip)) {
      stale += 1; continue;
    }
    const canonical = geometryToTransform(clip.geometry);
    if (transformsEqual(canonical, entry.resolvedTransform)) { unchanged += 1; continue; }
    changes.push(Object.freeze({ placementId: clip.clip_id, transform: entry.resolvedTransform,
      geometry: transformToGeometry(entry.resolvedTransform) }));
  }
  changes.sort((a, b) => a.placementId.localeCompare(b.placementId));
  return Object.freeze({ changes: Object.freeze(changes), safeExisting, review, stale, unchanged });
}
