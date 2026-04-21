import { useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { HammerPassId } from "../persistence/hammerPersistenceContract";
import type { HammerDeadAirAnalysis } from "./hammerDeadAirClosure";
import { clampActiveCandidateIndex, type HammerCandidateCard, type HammerCandidateReviewKind } from "./hammerCandidateQueue";
import {
  LARGE_PLAYHEAD_NUDGE_SEC,
  resolveWorkspaceFocusMode,
  SMALL_PLAYHEAD_NUDGE_SEC,
  type HammerWorkspaceFocusMode,
  type HammerWorkspaceFocusOverride,
  type HammerWorkspaceToolId,
} from "./hammerWorkspaceTimeline";

function isKeyboardEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute("role")?.toLowerCase() ?? "";
  if (role === "textbox" || role === "combobox") return true;
  return false;
}

export type UseHammerWorkspaceShellShortcutsArgs = {
  activeTool: HammerWorkspaceToolId;
  focusOverride: HammerWorkspaceFocusOverride;
  isTranscriptCandidateReviewPass: boolean;
  isTranscriptToolSurface: boolean;
  activeTranscriptToolSection: "fillers" | "retakes" | "silence_gaps";
  activeReviewKind: HammerCandidateReviewKind;
  activeFillerCandidateCard: HammerCandidateCard | null;
  activeRetakeCandidateCard: HammerCandidateCard | null;
  fillerCandidateCardsLength: number;
  retakeCandidateCardsLength: number;
  fillerDecisionInFlight: boolean;
  retakeDecisionInFlight: boolean;
  deadAirAnalysis: HammerDeadAirAnalysis | null;
  deadAirApplyInFlight: boolean;
  zoomTimelineIn: () => void;
  zoomTimelineOut: () => void;
  setActiveReviewKind: Dispatch<SetStateAction<HammerCandidateReviewKind>>;
  setActiveTranscriptToolSection: Dispatch<SetStateAction<"fillers" | "retakes" | "silence_gaps">>;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  setFillerActiveCandidateIndex: Dispatch<SetStateAction<number>>;
  setRetakeActiveCandidateIndex: Dispatch<SetStateAction<number>>;
  handleCandidateDecision: (kind: HammerCandidateReviewKind, accept: boolean) => void;
  selectPass: (passId: HammerPassId) => void;
  analyzeDeadAirClosure: () => void;
  applyDeadAirClosureBatch: () => void;
  nudgePlayhead: (deltaSec: number) => void;
  selectAdjacentSegment: (direction: "previous" | "next") => void;
  jumpToSelectionBoundary: (boundary: "start" | "end") => void;
  jumpToEditPoint: (direction: "previous" | "next") => void;
  jumpToMarker: (direction: "previous" | "next") => void;
  togglePlayback: () => void;
  splitSelectedSegmentAtPlayhead: () => void;
  toggleSelectionLoopPlayback: () => void;
  playSelectionWithRoll: () => void;
  addMarkerAtPlayhead: () => void;
  deleteSelectedSegmentAndRipple: () => void;
  clearTranscriptSelection: () => void;
  toggleSelectedSegmentDisabled: () => void;
  adjustSelectedSegmentGain: (deltaDb: number) => void;
  undoHistory: () => void;
  redoHistory: () => void;
};

export type UseHammerWorkspaceShellShortcutsResult = {
  workspaceFocusMode: HammerWorkspaceFocusMode;
};

export function useHammerWorkspaceShellShortcuts(
  args: UseHammerWorkspaceShellShortcutsArgs,
): UseHammerWorkspaceShellShortcutsResult {
  const keydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    keydownHandlerRef.current = (event: KeyboardEvent): void => {
      if (!event.defaultPrevented && !isTextEditingTarget(event.target) && !(event.ctrlKey || event.metaKey || event.altKey)) {
        const key = event.key;
        const lower = key.toLowerCase();

        const isTimelineZoomInKey = event.code === "NumpadAdd" || key === "+" || key === "=";
        const isTimelineZoomOutKey = event.code === "NumpadSubtract" || key === "-" || key === "_";
        if (isTimelineZoomInKey || isTimelineZoomOutKey) {
          event.preventDefault();
          if (isTimelineZoomInKey) {
            args.zoomTimelineIn();
          } else {
            args.zoomTimelineOut();
          }
        } else if (args.isTranscriptCandidateReviewPass) {
          if (!event.shiftKey && (key === "1" || key === "2")) {
            if (!event.repeat) {
              event.preventDefault();
              const nextKind = key === "1" ? "fillers" : "retakes";
              args.setActiveReviewKind(nextKind);
              args.setActiveTranscriptToolSection(nextKind);
              args.setFocusOverride("tool-focus");
            }
          } else if (!event.shiftKey && (lower === "j" || lower === "k")) {
            event.preventDefault();
            const kind = args.activeReviewKind;
            if (kind === "fillers") {
              const length = args.fillerCandidateCardsLength;
              if (length > 1) {
                args.setFillerActiveCandidateIndex((previous) => clampActiveCandidateIndex(
                  previous + (lower === "j" ? 1 : -1),
                  length,
                ));
              }
            } else {
              const length = args.retakeCandidateCardsLength;
              if (length > 1) {
                args.setRetakeActiveCandidateIndex((previous) => clampActiveCandidateIndex(
                  previous + (lower === "j" ? 1 : -1),
                  length,
                ));
              }
            }
            args.setFocusOverride("tool-focus");
          } else if (!event.shiftKey && (lower === "a" || lower === "r")) {
            if (!event.repeat) {
              event.preventDefault();
              const kind = args.activeReviewKind;
              args.setActiveTranscriptToolSection(kind);
              const activeCard = kind === "retakes" ? args.activeRetakeCandidateCard : args.activeFillerCandidateCard;
              const inFlight = kind === "retakes" ? args.retakeDecisionInFlight : args.fillerDecisionInFlight;
              if (activeCard && !inFlight) {
                args.handleCandidateDecision(kind, lower === "a");
              }
            }
          }
        }

        if (event.shiftKey && lower === "d") {
          if (!event.repeat) {
            event.preventDefault();
            args.selectPass("gap_pacing");
            args.setActiveTranscriptToolSection("silence_gaps");
          }
        }

        if (args.isTranscriptToolSurface && args.activeTranscriptToolSection === "silence_gaps") {
          if (event.shiftKey && lower === "a") {
            if (!event.repeat) {
              event.preventDefault();
              args.analyzeDeadAirClosure();
            }
          } else if (!event.shiftKey && key === "Enter") {
            if (!event.repeat) {
              event.preventDefault();
              if (args.deadAirAnalysis && !args.deadAirApplyInFlight && args.deadAirAnalysis.eligibleGapCount > 0) {
                args.applyDeadAirClosureBatch();
              }
            }
          }
        }
      }

      if (isKeyboardEditingTarget(event.target)) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          args.nudgePlayhead(event.shiftKey ? -LARGE_PLAYHEAD_NUDGE_SEC : -SMALL_PLAYHEAD_NUDGE_SEC);
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          args.nudgePlayhead(event.shiftKey ? LARGE_PLAYHEAD_NUDGE_SEC : SMALL_PLAYHEAD_NUDGE_SEC);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          args.selectAdjacentSegment("previous");
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          args.selectAdjacentSegment("next");
          return;
        }

        if (event.key === "Home") {
          event.preventDefault();
          event.stopPropagation();
          args.jumpToSelectionBoundary("start");
          return;
        }

        if (event.key === "End") {
          event.preventDefault();
          event.stopPropagation();
          args.jumpToSelectionBoundary("end");
          return;
        }

        if (event.key === ",") {
          event.preventDefault();
          event.stopPropagation();
          args.jumpToEditPoint("previous");
          return;
        }

        if (event.key === ".") {
          event.preventDefault();
          event.stopPropagation();
          args.jumpToEditPoint("next");
          return;
        }

        if (event.key === "PageUp") {
          event.preventDefault();
          event.stopPropagation();
          args.jumpToMarker("previous");
          return;
        }

        if (event.key === "PageDown") {
          event.preventDefault();
          event.stopPropagation();
          args.jumpToMarker("next");
          return;
        }

        if (event.key === " " || event.code === "Space") {
          event.preventDefault();
          event.stopPropagation();
          args.togglePlayback();
          return;
        }

        if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopPropagation();
          args.splitSelectedSegmentAtPlayhead();
          return;
        }

        if (event.key.toLowerCase() === "l") {
          event.preventDefault();
          event.stopPropagation();
          args.toggleSelectionLoopPlayback();
          return;
        }

        if (event.key.toLowerCase() === "p") {
          event.preventDefault();
          event.stopPropagation();
          args.playSelectionWithRoll();
          return;
        }

        if (event.key.toLowerCase() === "k") {
          event.preventDefault();
          event.stopPropagation();
          args.addMarkerAtPlayhead();
          return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          args.deleteSelectedSegmentAndRipple();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          args.clearTranscriptSelection();
          return;
        }

        if (event.key.toLowerCase() === "m") {
          event.preventDefault();
          event.stopPropagation();
          args.toggleSelectedSegmentDisabled();
          return;
        }

        if (event.key === "[" || event.key === "]") {
          event.preventDefault();
          event.stopPropagation();
          args.adjustSelectedSegmentGain(event.key === "]" ? 1 : -1);
          return;
        }
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = (key === "z" && event.shiftKey) || key === "y";
      if (!wantsUndo && !wantsRedo) return;

      event.preventDefault();
      event.stopPropagation();

      if (wantsUndo) {
        args.undoHistory();
        return;
      }
      args.redoHistory();
    };
  }, [args]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      keydownHandlerRef.current?.(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const workspaceFocusMode = useMemo(
    () => (args.focusOverride === "auto" ? resolveWorkspaceFocusMode(args.activeTool) : args.focusOverride),
    [args.activeTool, args.focusOverride],
  );

  return {
    workspaceFocusMode,
  };
}