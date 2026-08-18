import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createEmptyVisualTimelineState } from "../visuals/model/hammerVisualDefaults";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { selectClipById } from "../visuals/state/hammerVisualSelectors";
import { selectWorkspaceVisualTimelineClip } from "./hammerWorkspaceMutationGateway";

export function createHammerWorkspaceVisualSelectionCommand(args: {
  fallbackTimeline: HammerVisualTimelineState | null;
  setVisualTimeline: Dispatch<SetStateAction<HammerVisualTimelineState | null>>;
  lastDebugSelectionKeyRef: MutableRefObject<string | null>;
  debugEnabled: () => boolean;
  now?: () => string;
}) {
  return (clipId: string | null): void => {
    args.setVisualTimeline((current) => {
      const base = current ?? args.fallbackTimeline ?? createEmptyVisualTimelineState({
        updated_at: (args.now ?? (() => new Date().toISOString()))(), debug_origin: "empty_init",
      });
      if (base.selected_clip_id === clipId) return current ?? base;
      const next = selectWorkspaceVisualTimelineClip(base, clipId);
      if (args.debugEnabled() && clipId) {
        const resolved = selectClipById(next, clipId);
        const selectionLogKey = `${clipId}|${resolved?.clip_id ?? ""}`;
        if (selectionLogKey !== args.lastDebugSelectionKeyRef.current) {
          args.lastDebugSelectionKeyRef.current = selectionLogKey;
          console.debug("[HammerVisuals] clip selection", {
            clicked_clip_id: clipId, resolved_selected_clip_id: resolved?.clip_id ?? null,
          });
        }
      }
      return next;
    });
  };
}
