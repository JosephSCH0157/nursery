import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { HammerVisualTimelineAction } from "../visuals/state/hammerVisualActions";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
import type { TimelinePlacementAnalysisEntry } from "../features/auto-placement/timelinePlacementAnalysisQueue";
import { selectAutomaticPlacementBatch } from "./hammerAutomaticPlacementBatch";
import { executeAutomaticPlacementBatch } from "./hammerAutomaticPlacementBatchCommand";

export function useHammerAutomaticPlacementBatchAcceptance(args: {
  timeline: HammerVisualTimelineState | null;
  mediaRevision: string | null;
  entries: readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[];
  applyHistoryMutation: (mutation: { label: string; kind: "visual_adjustment"; toolId: string; affectedPlacementIds: string[];
    immediatePersist: true; computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable }) => HammerHistoryEntry | null;
  resolveCanonicalTimeline: (before: HammerEditorStateSerializable) => HammerVisualTimelineState;
  applyTimelineActions: (before: HammerEditorStateSerializable, actions: HammerVisualTimelineAction[]) => HammerEditorStateSerializable;
  requestDurablePersistBoundary: () => void;
  setOverrides: Dispatch<SetStateAction<Record<string, PreviewPlacementTransform>>>;
}) {
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const { entries, mediaRevision, timeline } = args;
  const plan = useMemo(
    () => selectAutomaticPlacementBatch({ timeline, mediaRevision, entries }),
    [entries, mediaRevision, timeline],
  );
  const applyAll = useCallback(() => {
    const result = executeAutomaticPlacementBatch(args);
    const appliedPlan = result.plan;
    if (!result.applied) { setResultSummary("No current safe placement changes to apply."); return; }
    const appliedIds = new Set(appliedPlan.changes.map((change) => change.placementId));
    args.setOverrides((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !appliedIds.has(id))));
    setResultSummary(`${appliedPlan.changes.length} applied · ${appliedPlan.safeExisting + appliedPlan.unchanged} already safe · ${appliedPlan.review} needs review · ${appliedPlan.stale} stale`);
  }, [args]);
  return { eligibleCount: plan.changes.length, applyAll, resultSummary };
}
