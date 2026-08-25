import type { TimelinePlacementAnalysisEntry } from "../features/auto-placement/timelinePlacementAnalysisQueue";
import type { PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
import type { HammerTimelineAutomaticPlacementProgress } from "./useHammerTimelineAutomaticPlacement";

export function HammerTimelineAutomaticPlacementStatus(props: { progress: HammerTimelineAutomaticPlacementProgress; entries: readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[];
  eligibleBatchCount: number; onApplyAll: () => void; resultSummary: string | null }) {
  return <>
    <div className="hammer-tool-hint" role="status">
      {props.progress.queued > 0 ? `Auto placement: ${props.progress.analyzed}/${props.progress.eligible} analyzed`
        : `${props.progress.resolvedSafe} safe · ${props.progress.safeExisting} already safe · ${props.progress.review} review`}
    </div>
    <button type="button" className="hammer-button" disabled={props.eligibleBatchCount === 0} onClick={props.onApplyAll}>
      Apply All Safe Placements{props.eligibleBatchCount > 0 ? ` (${props.eligibleBatchCount})` : ""}
    </button>
    {props.resultSummary ? <div className="hammer-tool-hint" role="status">{props.resultSummary}</div> : null}
    {import.meta.env.DEV ? <output hidden data-hammer-auto-placement-queue="true">
      {props.entries.map((entry) => `${entry.item.placementId}:${entry.status}${entry.reason ? `(${entry.reason})` : ""}`).join("|")}
    </output> : null}
  </>;
}
