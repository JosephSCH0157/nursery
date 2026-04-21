import { useCallback, useMemo } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import {
  resolveSelectionFromTimeline,
  resolveSelectionFromTranscript,
  resolveSelectionFromVisual,
  type HammerLinkedSelection,
} from "./hammerLinkedSelection";
import type { HammerWorkspaceFocusOverride } from "./hammerWorkspaceTimeline";
import {
  toHammerLinkedSelectionVisualItems,
  type HammerSelectedTranscriptRange,
  type HammerSelectedTranscriptRangeDetail,
  type HammerWorkspaceShellSelectionOrigin,
  type HammerWorkspaceShellSelectionPlacementItem,
} from "./hammerWorkspaceShellSelectionUtils";

type HammerSelectionSeekFn = (
  nextTimeSec: number,
  origin?: "timeline" | "playhead",
  options?: { snapToBoundary?: boolean },
) => void;

export type UseHammerWorkspaceShellSelectionArgs = {
  transcriptSegments: HammerTranscriptSegment[];
  visualPlacementItems: HammerWorkspaceShellSelectionPlacementItem[];
  linkedSelection: HammerLinkedSelection | null;
  selectionOriginRef: MutableRefObject<HammerWorkspaceShellSelectionOrigin>;
  selectedTranscriptRangeDetailRef: MutableRefObject<HammerSelectedTranscriptRangeDetail | null>;
  setLinkedSelection: Dispatch<SetStateAction<HammerLinkedSelection | null>>;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  setSelectedSegmentId: Dispatch<SetStateAction<string | null>>;
  setTranscriptSelectionAnchorSegmentId: Dispatch<SetStateAction<string | null>>;
  setTranscriptSelectionFocusSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedClipId: (clipId: string | null) => void;
  setSelectedTranscriptRange: Dispatch<SetStateAction<HammerSelectedTranscriptRange | null>>;
  setVisualTimelineFocusNonce: Dispatch<SetStateAction<number>>;
  seekPlayheadToTime: HammerSelectionSeekFn;
  revealBottomTimelineAtTime: (timeSec: number) => void;
  revealVisualSelectionUI: (placement: HammerWorkspaceShellSelectionPlacementItem) => void;
};

export type UseHammerWorkspaceShellSelectionResult = {
  applyLinkedSelectionState: (args: {
    selection: HammerLinkedSelection | null;
    origin: HammerWorkspaceShellSelectionOrigin;
    focusOverride?: HammerWorkspaceFocusOverride;
    transcriptTextRange?: HammerSelectedTranscriptRangeDetail | null;
    seekTimeSec?: number | null;
    revealTimeSec?: number | null;
    clearTranscriptTextRange?: boolean;
    syncSelectedClip?: boolean;
  }) => void;
  clearTranscriptSelection: () => void;
  selectLinkedTimelineRange: (args: {
    startSec: number;
    endSec: number;
    segmentIds?: string[];
    anchorId?: string | null;
    clipId?: string | null;
  }) => void;
  selectLinkedTranscriptTarget: (args: {
    anchorSegmentId: string | null;
    focusSegmentId?: string | null;
    textRange?: HammerSelectedTranscriptRangeDetail | null;
  }) => void;
  selectLinkedVisualTarget: (args: {
    clipId: string;
    origin: "tool_window" | "timeline" | "preview";
    revealUI?: boolean;
    allowSurfaceSwitch?: boolean;
    snapPlayhead?: boolean;
  }) => void;
  selectVisualClip: (args: {
    clipId: string;
    origin: "tool_window" | "timeline" | "preview";
    snapPlayhead?: boolean;
    revealUI?: boolean;
    allowSurfaceSwitch?: boolean;
  }) => void;
};

export function useHammerWorkspaceShellSelection(
  args: UseHammerWorkspaceShellSelectionArgs,
): UseHammerWorkspaceShellSelectionResult {
  const visualItems = useMemo(
    () => toHammerLinkedSelectionVisualItems(args.visualPlacementItems),
    [args.visualPlacementItems],
  );

  const applyLinkedSelectionState = useCallback((nextArgs: {
    selection: HammerLinkedSelection | null;
    origin: HammerWorkspaceShellSelectionOrigin;
    focusOverride?: HammerWorkspaceFocusOverride;
    transcriptTextRange?: HammerSelectedTranscriptRangeDetail | null;
    seekTimeSec?: number | null;
    revealTimeSec?: number | null;
    clearTranscriptTextRange?: boolean;
    syncSelectedClip?: boolean;
  }): void => {
    args.selectionOriginRef.current = nextArgs.origin;
    args.setLinkedSelection(nextArgs.selection);
    if (nextArgs.focusOverride) {
      args.setFocusOverride(nextArgs.focusOverride);
    }

    const transcriptSegmentIds = nextArgs.selection?.transcriptRange?.segmentIds ?? [];
    const nextAnchorSegmentId = nextArgs.selection?.anchorId ?? transcriptSegmentIds[0] ?? null;
    const nextFocusSegmentId = transcriptSegmentIds.length > 0
      ? transcriptSegmentIds[transcriptSegmentIds.length - 1] ?? nextAnchorSegmentId
      : nextAnchorSegmentId;

    args.setSelectedSegmentId(nextAnchorSegmentId);
    args.setTranscriptSelectionAnchorSegmentId(transcriptSegmentIds[0] ?? nextAnchorSegmentId);
    args.setTranscriptSelectionFocusSegmentId(nextFocusSegmentId);
    const shouldSyncSelectedClip = nextArgs.syncSelectedClip
      ?? (nextArgs.origin === "timeline" || nextArgs.origin === "playhead");
    if (shouldSyncSelectedClip) {
      args.setSelectedClipId(nextArgs.selection?.primaryVisualId ?? null);
    }

    if (Object.prototype.hasOwnProperty.call(nextArgs, "transcriptTextRange")) {
      args.selectedTranscriptRangeDetailRef.current = nextArgs.transcriptTextRange ?? null;
      args.setSelectedTranscriptRange(nextArgs.transcriptTextRange ? {
        start: nextArgs.transcriptTextRange.start,
        end: nextArgs.transcriptTextRange.end,
        text: nextArgs.transcriptTextRange.text,
      } : null);
    } else if (nextArgs.clearTranscriptTextRange) {
      args.selectedTranscriptRangeDetailRef.current = null;
      args.setSelectedTranscriptRange(null);
    }

    if (
      nextArgs.selection?.primaryVisualId
      && nextArgs.selection.primaryVisualId !== args.linkedSelection?.primaryVisualId
    ) {
      args.setVisualTimelineFocusNonce((current) => current + 1);
    }

    if (typeof nextArgs.seekTimeSec === "number") {
      args.seekPlayheadToTime(nextArgs.seekTimeSec, "playhead", { snapToBoundary: false });
    }
    if (typeof nextArgs.revealTimeSec === "number") {
      args.revealBottomTimelineAtTime(nextArgs.revealTimeSec);
    }
  }, [args]);

  const selectLinkedTimelineRange = useCallback((nextArgs: {
    startSec: number;
    endSec: number;
    segmentIds?: string[];
    anchorId?: string | null;
    clipId?: string | null;
  }): void => {
    const nextSelection = resolveSelectionFromTimeline({
      transcriptSegments: args.transcriptSegments,
      visualItems,
      startSec: nextArgs.startSec,
      endSec: nextArgs.endSec,
      segmentIds: nextArgs.segmentIds,
      anchorId: nextArgs.anchorId,
      clipId: nextArgs.clipId,
      currentPrimaryVisualId: args.linkedSelection?.primaryVisualId ?? null,
    });
    applyLinkedSelectionState({
      selection: nextSelection,
      origin: "timeline",
      focusOverride: "time-focus",
      clearTranscriptTextRange: true,
      seekTimeSec: nextArgs.startSec,
      revealTimeSec: nextArgs.startSec,
    });
  }, [applyLinkedSelectionState, args.linkedSelection?.primaryVisualId, args.transcriptSegments, visualItems]);

  const selectLinkedTranscriptTarget = useCallback((nextArgs: {
    anchorSegmentId: string | null;
    focusSegmentId?: string | null;
    textRange?: HammerSelectedTranscriptRangeDetail | null;
  }): void => {
    const nextSelection = resolveSelectionFromTranscript({
      transcriptSegments: args.transcriptSegments,
      visualItems,
      anchorSegmentId: nextArgs.anchorSegmentId,
      focusSegmentId: nextArgs.focusSegmentId,
      textSelection: nextArgs.textRange ?? null,
      currentPrimaryVisualId: args.linkedSelection?.primaryVisualId ?? null,
    });
    applyLinkedSelectionState({
      selection: nextSelection,
      origin: "transcript",
      focusOverride: "source-focus",
      transcriptTextRange: nextArgs.textRange,
      seekTimeSec: nextSelection?.timeRange?.startSec ?? null,
      revealTimeSec: nextSelection?.timeRange?.startSec ?? null,
    });
  }, [applyLinkedSelectionState, args.linkedSelection?.primaryVisualId, args.transcriptSegments, visualItems]);

  const selectLinkedVisualTarget = useCallback((nextArgs: {
    clipId: string;
    origin: "tool_window" | "timeline" | "preview";
    revealUI?: boolean;
    allowSurfaceSwitch?: boolean;
    snapPlayhead?: boolean;
  }): void => {
    const placement = args.visualPlacementItems.find((item) => item.id === nextArgs.clipId) ?? null;
    // Surface/tool switches are opt-in only; passive selection sync must remain non-navigating.
    if (nextArgs.revealUI && nextArgs.allowSurfaceSwitch && placement) {
      args.revealVisualSelectionUI(placement);
    }

    const nextSelection = resolveSelectionFromVisual({
      transcriptSegments: args.transcriptSegments,
      visualItems,
      visualId: nextArgs.clipId,
      currentPrimaryVisualId: nextArgs.clipId,
      kind: "visual",
    });

    const nextRevealTime = nextSelection?.timeRange?.startSec ?? placement?.startSec ?? null;
    applyLinkedSelectionState({
      selection: nextSelection,
      origin: nextArgs.origin === "preview"
        ? "playhead"
        : "timeline",
      focusOverride: "time-focus",
      clearTranscriptTextRange: true,
      seekTimeSec: nextArgs.snapPlayhead === false ? null : nextRevealTime,
      revealTimeSec: nextRevealTime,
    });
  }, [applyLinkedSelectionState, args, visualItems]);

  const clearTranscriptSelection = useCallback((): void => {
    applyLinkedSelectionState({
      selection: null,
      origin: "transcript",
      focusOverride: "source-focus",
      transcriptTextRange: null,
    });
  }, [applyLinkedSelectionState]);

  const selectVisualClip = useCallback((nextArgs: {
    clipId: string;
    origin: "tool_window" | "timeline" | "preview";
    snapPlayhead?: boolean;
    revealUI?: boolean;
    allowSurfaceSwitch?: boolean;
  }) => {
    selectLinkedVisualTarget(nextArgs);
  }, [selectLinkedVisualTarget]);

  return {
    applyLinkedSelectionState,
    clearTranscriptSelection,
    selectLinkedTimelineRange,
    selectLinkedTranscriptTarget,
    selectLinkedVisualTarget,
    selectVisualClip,
  };
}
