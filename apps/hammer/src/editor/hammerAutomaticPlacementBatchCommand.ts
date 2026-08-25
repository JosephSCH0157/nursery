import type { TimelinePlacementAnalysisEntry } from "../features/auto-placement/timelinePlacementAnalysisQueue";
import type { HammerVisualTimelineAction } from "../visuals/state/hammerVisualActions";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import { selectAutomaticPlacementBatch, type AutomaticPlacementBatchPlan } from "./hammerAutomaticPlacementBatch";

export function executeAutomaticPlacementBatch(args: {
  timeline: HammerVisualTimelineState | null;
  mediaRevision: string | null;
  entries: readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[];
  applyHistoryMutation: (mutation: { label: string; kind: "visual_adjustment"; toolId: string; affectedPlacementIds: string[];
    immediatePersist: true; computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable }) => HammerHistoryEntry | null;
  resolveCanonicalTimeline: (before: HammerEditorStateSerializable) => HammerVisualTimelineState;
  applyTimelineActions: (before: HammerEditorStateSerializable, actions: HammerVisualTimelineAction[]) => HammerEditorStateSerializable;
  requestDurablePersistBoundary: () => void;
}): Readonly<{ applied: boolean; plan: AutomaticPlacementBatchPlan }> {
  const currentPlan = selectAutomaticPlacementBatch(args);
  if (currentPlan.changes.length === 0) return { applied: false, plan: currentPlan };
  let finalPlan = currentPlan;
  const updatedAt = new Date().toISOString();
  const entry = args.applyHistoryMutation({ label: "Apply automatic visual placements", kind: "visual_adjustment", toolId: "video",
    affectedPlacementIds: currentPlan.changes.map((change) => change.placementId), immediatePersist: true,
    computeAfter: (before) => {
      finalPlan = selectAutomaticPlacementBatch({ timeline: args.resolveCanonicalTimeline(before), mediaRevision: args.mediaRevision, entries: args.entries });
      return finalPlan.changes.length === 0 ? before : args.applyTimelineActions(before, finalPlan.changes.map((change) => ({
        type: "UPDATE_CLIP_GEOMETRY", clip_id: change.placementId, geometry: change.geometry, updated_at: updatedAt,
      })));
    } });
  const applied = Boolean(entry) && finalPlan.changes.length > 0;
  if (applied) args.requestDurablePersistBoundary();
  return { applied, plan: finalPlan };
}
