import type { HammerPlacementOutboundDiagnostics, HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";

export function countSnapshotPlacements(snapshot: HammerWorkspaceSnapshot | null | undefined): number {
  if (!snapshot) return 0;
  if (snapshot.visualTimeline) return snapshot.visualTimeline.clips.length;
  return snapshot.visualPlacements?.placements.length ?? 0;
}

export function countSnapshotAnchors(snapshot: HammerWorkspaceSnapshot | null | undefined): number {
  if (!snapshot?.visualTimeline) return 0;
  return snapshot.visualTimeline.clips.reduce((count, clip) => {
    if (clip.anchor_hint.anchor_segment_id || clip.anchor_hint.matched_segment_ids.length > 0) return count + 1;
    return count;
  }, 0);
}

export function shouldBlockTransientPlacementDrop(args: {
  diagnostics: HammerPlacementOutboundDiagnostics | undefined;
  persistedPlacementCount: number;
  previousSnapshotPlacementCount: number;
  previousSnapshotAnchorCount: number;
  incomingPlacementCount: number;
  incomingAnchorCount: number;
}): boolean {
  const diagnostics = args.diagnostics;
  if (!diagnostics) return false;
  const hasPriorPlacementRichState = (
    args.persistedPlacementCount > 0
    || args.previousSnapshotPlacementCount > 0
    || args.previousSnapshotAnchorCount > 0
  );
  return (
    (diagnostics.reason === "history:baseline_init" || diagnostics.reason === "history:mutation_apply")
    && diagnostics.source === "source_desk_refresh"
    && diagnostics.explicitUserAction === false
    && hasPriorPlacementRichState
    && args.incomingPlacementCount === 0
    && args.incomingAnchorCount === 0
  );
}
