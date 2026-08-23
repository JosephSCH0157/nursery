import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { HammerPassId, HammerPassStatusMap } from "../persistence/hammerPersistenceContract";
import type { HammerWorkspaceFocusOverride } from "./hammerWorkspaceTimeline";
import type { HammerSelectedVisualContext } from "./hammerSelectedVisualContext";
import { applyHammerToolBayRouteDecision } from "./hammerToolBayRouteApplication";
import {
  deriveHammerToolBayRouteState,
  HAMMER_SUPPORTED_TOOL_BAY_SURFACES,
  resolveHammerToolBayEditorModeForPass,
  resolveHammerToolBayRoute,
  type HammerToolBayRouteDecision,
  type HammerToolBaySurface,
  type HammerToolBayUnsupportedReason,
} from "./hammerToolBayRouteDecision";
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
  activeVisualTool: HammerVisualToolRackId | null;
  selectedSourceTab: HammerSourceTabId;
  videoPanelRoute: HammerVideoPanelRoute;
  selectedVisualContext: HammerSelectedVisualContext;
  unsupportedReason: HammerToolBayUnsupportedReason | null;
  activeSurface: HammerToolBaySurface | null;
  passSelectorContextRef: MutableRefObject<HammerPassSelectorContext | null>;
  currentPassSelectorResultRef: MutableRefObject<HammerPassSelectorResult | null>;
  setCurrentPass: Dispatch<SetStateAction<HammerPassId>>;
  setPassStatus: Dispatch<SetStateAction<HammerPassStatusMap>>;
  setEditorMode: Dispatch<SetStateAction<HammerEditorMode>>;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  setTranscriptTimingHint: Dispatch<SetStateAction<string | null>>;
  setUnsupportedReason: Dispatch<SetStateAction<HammerToolBayUnsupportedReason | null>>;
  setActiveSurface: Dispatch<SetStateAction<HammerToolBaySurface | null>>;
};

export type UseHammerWorkspaceShellRoutingResult = {
  selectEditorMode: (
    mode: HammerEditorMode,
    options?: { preferredPass?: HammerPassId; focusOverride?: HammerWorkspaceFocusOverride },
  ) => void;
  selectPass: (passId: HammerPassId) => void;
  selectVisualTool: (tool: HammerVisualToolRackId) => void;
  applyRouteDecision: (decision: HammerToolBayRouteDecision) => void;
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
    selectedVisualContext,
    unsupportedReason,
    activeSurface,
    passSelectorContextRef,
    currentPassSelectorResultRef,
    setCurrentPass,
    setPassStatus,
    setEditorMode,
    setFocusOverride,
    setTranscriptTimingHint,
    setUnsupportedReason,
    setActiveSurface,
  } = args;

  const applyRouteDecision = useCallback((decision: HammerToolBayRouteDecision): void => {
    applyHammerToolBayRouteDecision({
      decision, currentPass, editorMode, unsupportedReason, currentSurface: activeSurface,
      setCurrentPass, setEditorMode, setUnsupportedReason,
      setSurface: setActiveSurface,
    });
  }, [activeSurface, currentPass, editorMode, setActiveSurface, setCurrentPass, setEditorMode, setUnsupportedReason, unsupportedReason]);

  useEffect(() => {
    setPassStatus((previous) => normalizePassStatus(previous, currentPass));
  }, [currentPass, setPassStatus]);

  const selectEditorMode = useCallback((nextMode: HammerEditorMode, options?: {
    preferredPass?: HammerPassId;
    focusOverride?: HammerWorkspaceFocusOverride;
  }): void => {
    const targetPass = options?.preferredPass ?? resolveRepresentativePassForEditorMode(nextMode);
    const targetState = deriveHammerToolBayRouteState(targetPass, nextMode);
    const decision = resolveHammerToolBayRoute({
      selectedVisualContext, currentPass: targetPass, editorMode: nextMode,
      activeTool: targetState?.activeTool ?? null, activeVisualTool: targetState?.activeVisualTool ?? null,
      intent: "editor_mode", lifecycleSettled: true, supportedSurfaces: HAMMER_SUPPORTED_TOOL_BAY_SURFACES,
    });
    applyRouteDecision(decision);
    if (decision.status === "resolved" && targetPass !== currentPass) {
      setPassStatus((previous) => {
        const normalized = normalizePassStatus(previous, targetPass);
        if (normalized[targetPass] === "not_started") normalized[targetPass] = "in_progress";
        return normalized;
      });
    }
    if (options?.focusOverride) setFocusOverride(options.focusOverride);
  }, [applyRouteDecision, currentPass, selectedVisualContext, setFocusOverride, setPassStatus]);

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
    const nextMode = resolveHammerToolBayEditorModeForPass(passId);
    const targetState = deriveHammerToolBayRouteState(passId, nextMode);
    const decision = resolveHammerToolBayRoute({
      selectedVisualContext, currentPass: passId, editorMode: nextMode,
      activeTool: targetState?.activeTool ?? null, activeVisualTool: targetState?.activeVisualTool ?? null,
      intent: "current_pass", lifecycleSettled: true, supportedSurfaces: HAMMER_SUPPORTED_TOOL_BAY_SURFACES,
    });
    applyRouteDecision(decision);
    if (decision.status !== "resolved") return;
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, passId);
      if (normalized[passId] === "not_started") normalized[passId] = "in_progress";
      return normalized;
    });
    setFocusOverride("tool-focus");
  }, [applyRouteDecision, passSelectorContextRef, selectedVisualContext, setFocusOverride, setPassStatus, setTranscriptTimingHint]);

  const selectVisualTool = useCallback((nextTool: HammerVisualToolRackId): void => {
    const decision = resolveHammerToolBayRoute({
      selectedVisualContext, currentPass, editorMode, activeTool, activeVisualTool,
      intent: "manual_navigation", lifecycleSettled: true,
      manualSelection: { activeTool: "video", activeVisualTool: nextTool },
      supportedSurfaces: HAMMER_SUPPORTED_TOOL_BAY_SURFACES,
    });
    applyRouteDecision(decision);
    if (decision.status === "resolved") setFocusOverride("tool-focus");
  }, [activeTool, activeVisualTool, applyRouteDecision, currentPass, editorMode, selectedVisualContext, setFocusOverride]);

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

  return { selectEditorMode, selectPass, selectVisualTool, applyRouteDecision, markCurrentPassComplete };
}
