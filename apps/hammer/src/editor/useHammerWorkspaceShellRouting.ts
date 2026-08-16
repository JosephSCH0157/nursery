import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { HammerPassId, HammerPassStatusMap } from "../persistence/hammerPersistenceContract";
import type { HammerWorkspaceFocusOverride } from "./hammerWorkspaceTimeline";
import {
  canEnterPass,
  getPassBlockedReason,
  getPassStatus,
  type HammerPassSelectorContext,
  type HammerPassSelectorResult,
} from "./hammerPassSelectors";
import {
  PASS_ORDER,
  isHammerModeRoutingDebugEnabled,
  normalizePassStatus,
  resolveEditorModeFromPass,
  resolvePassMeta,
  resolveRepresentativePassForEditorMode,
  type HammerEditorMode,
  type HammerSourceTabId,
  type HammerVideoPanelRoute,
  type HammerVisualToolRackId,
} from "./hammerWorkspaceShellCore";

export type UseHammerWorkspaceShellRoutingArgs = {
  currentPass: HammerPassId;
  editorMode: HammerEditorMode;
  activeTool: string;
  activeVisualTool: HammerVisualToolRackId;
  selectedSourceTab: HammerSourceTabId;
  videoPanelRoute: HammerVideoPanelRoute;
  passSelectorContextRef: MutableRefObject<HammerPassSelectorContext | null>;
  currentPassSelectorResultRef: MutableRefObject<HammerPassSelectorResult | null>;
  setCurrentPass: Dispatch<SetStateAction<HammerPassId>>;
  setPassStatus: Dispatch<SetStateAction<HammerPassStatusMap>>;
  setEditorMode: Dispatch<SetStateAction<HammerEditorMode>>;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  setTranscriptTimingHint: Dispatch<SetStateAction<string | null>>;
};

export type UseHammerWorkspaceShellRoutingResult = {
  selectEditorMode: (
    mode: HammerEditorMode,
    options?: { preferredPass?: HammerPassId; focusOverride?: HammerWorkspaceFocusOverride },
  ) => void;
  selectPass: (passId: HammerPassId) => void;
  selectVisualTool: (tool: HammerVisualToolRackId) => void;
  markCurrentPassComplete: () => void;
};

export function useHammerWorkspaceShellRouting(
  args: UseHammerWorkspaceShellRoutingArgs,
): UseHammerWorkspaceShellRoutingResult {
  const {
    currentPass,
    editorMode,
    activeTool,
    activeVisualTool,
    selectedSourceTab,
    videoPanelRoute,
    passSelectorContextRef,
    currentPassSelectorResultRef,
    setCurrentPass,
    setPassStatus,
    setEditorMode,
    setFocusOverride,
    setTranscriptTimingHint,
  } = args;

  useEffect(() => {
    setPassStatus((previous) => normalizePassStatus(previous, currentPass));
  }, [currentPass, setPassStatus]);

  const selectEditorMode = useCallback((nextMode: HammerEditorMode, options?: {
    preferredPass?: HammerPassId;
    focusOverride?: HammerWorkspaceFocusOverride;
  }): void => {
    setEditorMode(nextMode);
    const targetPass = options?.preferredPass ?? resolveRepresentativePassForEditorMode(nextMode);
    if (targetPass !== currentPass) {
      setCurrentPass(targetPass);
      setPassStatus((previous) => {
        const normalized = normalizePassStatus(previous, targetPass);
        if (normalized[targetPass] === "not_started") normalized[targetPass] = "in_progress";
        return normalized;
      });
    }
    if (options?.focusOverride) setFocusOverride(options.focusOverride);
  }, [currentPass, setCurrentPass, setEditorMode, setFocusOverride, setPassStatus]);

  const selectPass = useCallback((passId: HammerPassId): void => {
    const context = passSelectorContextRef.current;
    if (!context) return;
    const nextPassResult = getPassStatus(passId, context);
    if (!canEnterPass(passId, context)) {
      const blockedReason = getPassBlockedReason(passId, context);
      setTranscriptTimingHint(
        blockedReason
          ? `${resolvePassMeta(passId).label} blocked: ${nextPassResult.humanLabel}.`
          : `${resolvePassMeta(passId).label} is currently blocked.`,
      );
      return;
    }
    const nextMeta = resolvePassMeta(passId);
    if (isHammerModeRoutingDebugEnabled()) {
      console.debug("[HammerModeRouting] selectPass", {
        passId,
        label: nextMeta.label,
        sourceTab: nextMeta.sourceTab,
        toolId: nextMeta.toolId,
      });
    }
    setCurrentPass(passId);
    setEditorMode(resolveEditorModeFromPass(passId));
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, passId);
      if (normalized[passId] === "not_started") normalized[passId] = "in_progress";
      return normalized;
    });
    setFocusOverride("tool-focus");
  }, [passSelectorContextRef, setCurrentPass, setEditorMode, setFocusOverride, setPassStatus, setTranscriptTimingHint]);

  const selectVisualTool = useCallback((nextTool: HammerVisualToolRackId): void => {
    if (nextTool === "polish") {
      selectEditorMode("images", { preferredPass: "visual_finishing", focusOverride: "tool-focus" });
      return;
    }
    if (nextTool === "images") {
      selectEditorMode("images", { preferredPass: "image_placement", focusOverride: "tool-focus" });
      return;
    }
    selectEditorMode("broll", { preferredPass: "image_animation", focusOverride: "tool-focus" });
  }, [selectEditorMode]);

  const markCurrentPassComplete = useCallback((): void => {
    const currentResult = currentPassSelectorResultRef.current;
    if (!currentResult) return;
    if (currentResult.isBlocking || currentResult.isDegraded) {
      setTranscriptTimingHint(`${resolvePassMeta(currentPass).label} cannot be marked complete: ${currentResult.humanLabel}.`);
      return;
    }
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, currentPass);
      normalized[currentPass] = "completed";
      const currentIndex = PASS_ORDER.findIndex((pass) => pass.id === currentPass);
      const nextPass = currentIndex >= 0 ? PASS_ORDER[currentIndex + 1] : null;
      if (nextPass && normalized[nextPass.id] === "not_started") normalized[nextPass.id] = "in_progress";
      return normalized;
    });
    const currentIndex = PASS_ORDER.findIndex((pass) => pass.id === currentPass);
    const nextPass = currentIndex >= 0 ? PASS_ORDER[currentIndex + 1] : null;
    if (nextPass) selectPass(nextPass.id);
  }, [currentPass, currentPassSelectorResultRef, selectPass, setPassStatus, setTranscriptTimingHint]);

  useEffect(() => {
    if (!isHammerModeRoutingDebugEnabled()) return;
    console.debug("[HammerModeRouting] state", {
      editorMode,
      currentPass,
      activeTool,
      activeVisualTool,
      selectedSourceTab,
      videoPanelRoute,
    });
  }, [activeTool, activeVisualTool, currentPass, editorMode, selectedSourceTab, videoPanelRoute]);

  return { selectEditorMode, selectPass, selectVisualTool, markCurrentPassComplete };
}
