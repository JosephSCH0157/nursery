import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Draft } from "../../domain/draft";
import type { WorkpieceWorkspaceTab } from "../../lib/hearth-workpiece-tab-shell";
import type { FocusTab, HearthMode, UiDensity } from "./hearth-shell-contracts";
import {
  readMode,
  readWorkpieceWorkspaceTab,
  readWorkspaceUiDensity,
  writeMode,
  writeWorkpieceWorkspaceTab,
  writeWorkspaceUiDensity,
} from "./hearth-shell-preferences";

export type HearthMobileOverlayView = "editor" | "ready" | null;

export function useHearthResolvedWorkpieceTabState(args: {
  incomingBarStockIntakeRoute: boolean;
  initialWorkpieceId: string | null;
  initialWorkspaceId: string | null;
}): [WorkpieceWorkspaceTab, Dispatch<SetStateAction<WorkpieceWorkspaceTab>>] {
  return useState<WorkpieceWorkspaceTab>(() => readWorkpieceWorkspaceTab(
    args.incomingBarStockIntakeRoute ? null : args.initialWorkpieceId,
    args.incomingBarStockIntakeRoute ? null : args.initialWorkspaceId,
  ));
}

export function useHearthMobileOverlayState(): [
  HearthMobileOverlayView,
  Dispatch<SetStateAction<HearthMobileOverlayView>>,
] {
  return useState<HearthMobileOverlayView>(null);
}

export function useHearthResponsiveNavigationLifecycle(args: {
  isMobile: boolean;
  mobileOverlayView: HearthMobileOverlayView;
  mode: HearthMode;
  activeDraft: Draft | null;
  workspaceId: string | null;
  setMobileOverlayView: Dispatch<SetStateAction<HearthMobileOverlayView>>;
}): void {
  useEffect(() => {
    if (!args.isMobile && args.mobileOverlayView) {
      args.setMobileOverlayView(null);
    }
  }, [args.isMobile, args.mobileOverlayView, args.setMobileOverlayView]);

  useEffect(() => {
    args.setMobileOverlayView(null);
  }, [args.setMobileOverlayView, args.workspaceId]);

  useEffect(() => {
    if (!args.isMobile) return;
    if (args.mobileOverlayView) return;
    if (args.mode === "focus" && args.activeDraft) {
      args.setMobileOverlayView("editor");
      return;
    }
    if (args.mode === "ready") {
      args.setMobileOverlayView("ready");
    }
  }, [
    args.activeDraft,
    args.isMobile,
    args.mobileOverlayView,
    args.mode,
    args.setMobileOverlayView,
  ]);
}

export function useHearthWorkpieceTabPreferenceLifecycle(args: {
  activeWorkpieceTab: WorkpieceWorkspaceTab;
  workspaceId: string | null;
  workpieceId: string | null;
  setActiveWorkpieceTab: Dispatch<SetStateAction<WorkpieceWorkspaceTab>>;
}): void {
  useEffect(() => {
    args.setActiveWorkpieceTab(readWorkpieceWorkspaceTab(args.workpieceId, args.workspaceId));
  }, [args.setActiveWorkpieceTab, args.workpieceId, args.workspaceId]);

  useEffect(() => {
    writeWorkpieceWorkspaceTab(args.workpieceId, args.workspaceId, args.activeWorkpieceTab);
  }, [args.activeWorkpieceTab, args.workpieceId, args.workspaceId]);

}

export function useHearthDensityPreferenceLifecycle(args: {
  uiDensity: UiDensity;
  workspaceId: string | null;
  setUiDensity: Dispatch<SetStateAction<UiDensity>>;
}): void {
  useEffect(() => {
    args.setUiDensity(readWorkspaceUiDensity(args.workspaceId));
  }, [args.setUiDensity, args.workspaceId]);

  useEffect(() => {
    writeWorkspaceUiDensity(args.workspaceId, args.uiDensity);
  }, [args.uiDensity, args.workspaceId]);
}

export function useHearthModeRestorationLifecycle(args: {
  activeDraft: Draft | null;
  mode: HearthMode;
  workpieceId: string | null;
  pendingFocusOpenCountRef: MutableRefObject<number>;
  restoredModeDraftKeyRef: MutableRefObject<string | null>;
  setMode: Dispatch<SetStateAction<HearthMode>>;
}): void {
  useEffect(() => {
    if (!args.activeDraft) {
      args.restoredModeDraftKeyRef.current = null;
      if (args.mode === "focus" && args.pendingFocusOpenCountRef.current === 0) {
        args.setMode("episodes");
      }
      return;
    }

    const restoreKey = `${args.workpieceId ?? "none"}:${args.activeDraft.id}`;
    if (args.mode !== "sparks") {
      args.restoredModeDraftKeyRef.current = restoreKey;
      return;
    }
    if (args.restoredModeDraftKeyRef.current === restoreKey) return;

    args.restoredModeDraftKeyRef.current = restoreKey;
    const saved = readMode(args.workpieceId);
    if (saved && saved !== "focus") args.setMode(saved);
  }, [
    args.activeDraft?.id,
    args.mode,
    args.pendingFocusOpenCountRef,
    args.restoredModeDraftKeyRef,
    args.setMode,
    args.workpieceId,
  ]);
}

export function useHearthModePreferenceLifecycle(args: {
  mode: HearthMode;
  workpieceId: string | null;
}): void {
  useEffect(() => {
    if (!args.workpieceId || args.mode === "sparks") return;
    writeMode(args.workpieceId, args.mode);
  }, [args.mode, args.workpieceId]);
}

export function useHearthMobileOverlayCommands(args: {
  isMobile: boolean;
  setMode: Dispatch<SetStateAction<HearthMode>>;
  setMobileOverlayView: Dispatch<SetStateAction<HearthMobileOverlayView>>;
}) {
  const openReadyInMobileOverlay = useCallback(() => {
    args.setMode("ready");
    if (args.isMobile) args.setMobileOverlayView("ready");
  }, [args.isMobile, args.setMobileOverlayView, args.setMode]);
  const closeMobileOverlay = useCallback(() => {
    args.setMobileOverlayView(null);
    if (args.isMobile) args.setMode("episodes");
  }, [args.isMobile, args.setMobileOverlayView, args.setMode]);

  return {
    openReadyInMobileOverlay,
    closeMobileOverlay,
  };
}

export function useHearthDesktopNavigationCommands(args: {
  hasActiveEpisode: boolean;
  setFocusTab: Dispatch<SetStateAction<FocusTab>>;
  setMode: Dispatch<SetStateAction<HearthMode>>;
}) {
  const openReady = useCallback(() => args.setMode("ready"), [args.setMode]);
  const focusDraft = useCallback(() => {
    args.setFocusTab("draft");
    args.setMode("focus");
  }, [args.setFocusTab, args.setMode]);
  const focusPlanning = useCallback(() => {
    args.setFocusTab("planning");
    args.setMode("focus");
  }, [args.setFocusTab, args.setMode]);
  const focusSources = useCallback(() => {
    args.setFocusTab("sources");
    args.setMode("focus");
  }, [args.setFocusTab, args.setMode]);
  const focusRevisions = useCallback(() => {
    args.setFocusTab("revisions");
    args.setMode("focus");
  }, [args.setFocusTab, args.setMode]);
  const openApiLedger = useCallback(() => {
    if (!args.hasActiveEpisode) {
      args.setMode("episodes");
      return;
    }
    args.setFocusTab("sources");
    args.setMode("focus");
  }, [args.hasActiveEpisode, args.setFocusTab, args.setMode]);

  return { openReady, focusDraft, focusPlanning, focusSources, focusRevisions, openApiLedger };
}
