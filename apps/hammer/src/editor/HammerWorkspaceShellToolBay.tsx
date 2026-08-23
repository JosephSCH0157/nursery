import type { JSX } from "react";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import type { HammerVisualLutPreset } from "./hammerWorkspaceShellCore";
import type {
  HammerLogoOverlayPosition,
  HammerLogoOverlaySize,
} from "./hammerWorkspaceShellVisualUtils";
import HammerBrollSelectionControls from "./HammerBrollSelectionControls";
import type { HammerToolBayRouteDecision } from "./hammerToolBayRouteDecision";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "./HammerTypedToolBaySurfaces";
import type { HammerToolBayRuntimeContexts } from "./hammerToolBayRuntimeContext";
export type HammerWorkspaceShellToolBayVM = {
  passLabel: string;
  passStatus: string;
  onMarkComplete: () => void;
  activeVisualTool?: "polish" | "images" | "broll";
  onSelectVisualTool?: (nextTool: "polish" | "images" | "broll") => void;
  routeDecision?: HammerToolBayRouteDecision;
};
export type PackagingIntroStatusView = {
  selectionStatusLine: string;
  placementStatusLine: string;
  applyActionLabel: string;
  removeActionLabel: string;
  canApply: boolean;
  canRemove: boolean;
};

export function derivePackagingIntroStatusView(args: {
  selectedIntroAssetId: string | null;
  selectedIntroPath: string | null;
  introPlaced: boolean;
}): PackagingIntroStatusView {
  const hasSelection = Boolean(args.selectedIntroAssetId);
  const hasResolvedSelection = Boolean(args.selectedIntroAssetId && args.selectedIntroPath);
  const selectedSourceLine = hasSelection
    ? (hasResolvedSelection
      ? `Selected intro from Source Desk: ${args.selectedIntroPath}`
      : `Selected intro from Source Desk is unresolved (${args.selectedIntroAssetId}).`)
    : "No intro selected in Source Desk.";
  const placementLine = args.introPlaced
    ? "Timeline packaging intro: placed."
    : "Timeline packaging intro: not placed.";
  return {
    selectionStatusLine: selectedSourceLine,
    placementStatusLine: placementLine,
    applyActionLabel: "Apply Selected Intro to Timeline",
    removeActionLabel: "Remove Intro from Timeline",
    canApply: hasResolvedSelection,
    canRemove: args.introPlaced,
  };
}

function isTruthyDevToggle(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function isDevBlurControlsEnabled(): boolean {
  const isDevBuild = import.meta.env?.DEV;
  if (!isDevBuild || typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    if (isTruthyDevToggle(params.get("dev"))) return true;
    if (isTruthyDevToggle(params.get("tp_dev_mode"))) return true;
  } catch {
    // ignore
  }
  return false;
}

export default function HammerWorkspaceShellToolBay(p: { vm: HammerWorkspaceShellToolBayVM; runtimeContexts: HammerToolBayRuntimeContexts }): JSX.Element {
  const vm = p.vm;

  const ctx = vm as any;
  const props = ctx.shellProps as any;
  const activeExposureAdjustment = ctx.activeExposureAdjustment as any;
  const activeLookPreset = ctx.activeLookPreset as any;
  const addMinimalTransition = ctx.addMinimalTransition as any;
  const anchorLabelDraft = ctx.anchorLabelDraft as any;
  const anchorTextDraft = ctx.anchorTextDraft as any;
  const applyExposureAdjustment = ctx.applyExposureAdjustment as any;
  const applyIntroPlacement = ctx.applyIntroPlacement as any;
  const applyLogoOverlayStyle = ctx.applyLogoOverlayStyle as any;
  const applyLookPresetSelection = ctx.applyLookPresetSelection as any;
  const applyOutroPlacement = ctx.applyOutroPlacement as any;
  const backgroundBlurProviderDescriptor = ctx.backgroundBlurProviderDescriptor as any;
  const boundAttentionQueue = ctx.boundAttentionQueue as any;
  const boundAttentionSummary = ctx.boundAttentionSummary as any;
  const clampImagePlacementTransform = ctx.clampImagePlacementTransform as any;
  const commitImagePlacementTransform = ctx.commitImagePlacementTransform as any;
  const commitVisualAnchorRefinement = ctx.commitVisualAnchorRefinement as any;
  const commitVisualPlacementWindow = ctx.commitVisualPlacementWindow as any;
  const DEFAULT_IMAGE_PLACEMENT_TRANSFORM = ctx.DEFAULT_IMAGE_PLACEMENT_TRANSFORM as any;
  const discardHearthBrollSuggestion = ctx.discardHearthBrollSuggestion as any;
  const editableVisualPlacements = ctx.editableVisualPlacements as any;
  const finishingChecklist = ctx.finishingChecklist as any;
  const focusBoundAttentionOperation = ctx.focusBoundAttentionOperation as any;
  const introOutroSelectedIntroPath = ctx.introOutroSelectedIntroPath as any;
  const introOutroSelectedOutroPath = ctx.introOutroSelectedOutroPath as any;
  const introOutroSelection = ctx.introOutroSelection as any;
  const LOGO_POSITION_OPTIONS = ctx.LOGO_POSITION_OPTIONS as any;
  const LOGO_SIZE_OPTIONS = ctx.LOGO_SIZE_OPTIONS as any;
  const MIN_IMAGE_PLACEMENT_DURATION_SEC = ctx.MIN_IMAGE_PLACEMENT_DURATION_SEC as any;
  const moveResolvedBrollBinding = ctx.moveResolvedBrollBinding as any;
  const navigateBoundAttention = ctx.navigateBoundAttention as any;
  const outputSelectionSummary = ctx.outputSelectionSummary as any;
  const PACKAGING_INTRO_ENTRY_ID = ctx.PACKAGING_INTRO_ENTRY_ID as any;
  const PACKAGING_OUTRO_ENTRY_ID = ctx.PACKAGING_OUTRO_ENTRY_ID as any;
  const packagingIntroPlacement = ctx.packagingIntroPlacement as any;
  const packagingLogoAssetPath = ctx.packagingLogoAssetPath as any;
  const packagingLogoPlacement = ctx.packagingLogoPlacement as any;
  const packagingLogoPosition = ctx.packagingLogoPosition as any;
  const packagingLogoSize = ctx.packagingLogoSize as any;
  const packagingOutroPlacement = ctx.packagingOutroPlacement as any;
  const previewTruthPosture = ctx.previewTruthPosture as any;
  const releasePrepOpenHref = ctx.releasePrepOpenHref as any;
  const removePackagingPlacement = ctx.removePackagingPlacement as any;
  const removeVisualPlacement = ctx.removeVisualPlacement as any;
  const replaceResolvedBrollBinding = ctx.replaceResolvedBrollBinding as any;
  const resolvedBrollBindingItems = ctx.resolvedBrollBindingItems as any;
  const resolveHearthBrollSuggestion = ctx.resolveHearthBrollSuggestion as any;
  const revertResolvedBrollBinding = ctx.revertResolvedBrollBinding as any;
  const roundToTenth = ctx.roundToTenth as any;
  const SEGMENTATION_PROVIDER_DESCRIPTORS = ctx.SEGMENTATION_PROVIDER_DESCRIPTORS as any;
  const selectedBoundBrollInspectorState = ctx.selectedBoundBrollInspectorState as any;
  const selectedBoundBrollOperationId = ctx.selectedBoundBrollOperationId as any;
  const selectedImagePlacement = ctx.selectedImagePlacement as any;
  const selectedImagePlacementTransform = ctx.selectedImagePlacementTransform as any;
  const autoPlacementDebugEnabled = ctx.autoPlacementDebugEnabled as boolean;
  const selectedAutoPreviewActive = ctx.selectedAutoPreviewActive as boolean;
  const previewAutoPositionStatus = ctx.previewAutoPositionStatus as string | null;
  const previewAutoPosition = ctx.previewAutoPosition as (() => void) | undefined;
  const resetPreviewAutoPosition = ctx.resetPreviewAutoPosition as (() => void) | undefined;
  const previewDiagnosticsSummary = ctx.previewDiagnosticsSummary as {
    diagnosticsEnabled: boolean;
    resolvedPlacementExists: boolean;
    diagnosticsResolvedPlacement: boolean;
    candidateCount: number;
    maskBoundsCount: number;
    currentFrameAvailable: boolean;
    segmentationMaskAvailable: boolean;
    resolverStatus: string;
    resolverReason: string;
    selectedScale: number | null;
    scaleAttempts: Array<{
      scale: number;
      candidateCount: number;
      rejectedCount: number;
      bestRejectionReason: string | null;
      resolved: boolean;
    }>;
  } | undefined;
  const episodeHealthSnapshot = ctx.episodeHealthSnapshot as Record<string, unknown> | undefined;
  const selectedTransitionBoundObject = ctx.selectedTransitionBoundObject as any;
  const selectedVisualAnchorSegment = ctx.selectedVisualAnchorSegment as any;
  const selectedVisualAnchorSegmentId = ctx.selectedVisualAnchorSegmentId as any;
  const selectedVisualClip = ctx.selectedVisualClip as any;
  const selectedPlacementId = (selectedImagePlacement?.id ?? null) as string | null;
  const selectedOverlayAssetPresent = Boolean(selectedImagePlacement?.assetPath);
  const selectedVisualAssetPresent = Boolean(selectedVisualClip?.asset_id);
  const selectedClipPresent = Boolean(selectedVisualClip?.clip_id);
  const previewAutoPositionDisabledReason = !selectedImagePlacement
    ? "No selected image placement."
    : !selectedOverlayAssetPresent && !selectedVisualAssetPresent
    ? "Selected placement has no visual asset."
    : !previewAutoPosition
    ? "Automatic placement action unavailable (not wired)."
    : null;
  const resetPreviewPositionDisabledReason = !selectedImagePlacement
    ? "No selected image placement."
    : !selectedAutoPreviewActive
    ? "No active auto preview override."
    : !resetPreviewAutoPosition
    ? "Reset action unavailable."
    : null;
  const setAnchorLabelDraft = ctx.setAnchorLabelDraft as any;
  const setAnchorTextDraft = ctx.setAnchorTextDraft as any;
  const setFinishingChecklist = ctx.setFinishingChecklist as any;
  const setTranscriptTimingHint = ctx.setTranscriptTimingHint as any;
  const setVideoSnapMode = ctx.setVideoSnapMode as any;
  const setVisualBackgroundBlur = ctx.setVisualBackgroundBlur as any;
  const setVisualBackgroundBlurDebugMask = ctx.setVisualBackgroundBlurDebugMask as any;
  const setVisualBackgroundMaskPreviewMode = ctx.setVisualBackgroundMaskPreviewMode as any;
  const setVisualBackgroundMaskPreviewStage = ctx.setVisualBackgroundMaskPreviewStage as any;
  const setVisualBackgroundBlurFallbackMode = ctx.setVisualBackgroundBlurFallbackMode as any;
  const setVisualBackgroundBlurFeatherPx = ctx.setVisualBackgroundBlurFeatherPx as any;
  const setVisualBackgroundBlurSubjectExpansionPx = ctx.setVisualBackgroundBlurSubjectExpansionPx as any;
  const setVisualBackgroundBlurProviderId = ctx.setVisualBackgroundBlurProviderId as any;
  const setVisualBackgroundBlurPx = ctx.setVisualBackgroundBlurPx as any;
  const setVisualBackgroundBlurQualityMode = ctx.setVisualBackgroundBlurQualityMode as any;
  const setVisualBackgroundBlurRuntimeStatus = ctx.setVisualBackgroundBlurRuntimeStatus as any;
  const setVisualBackgroundBlurTemporalSmoothing = ctx.setVisualBackgroundBlurTemporalSmoothing as any;
  const setVisualBackgroundReplaceColor = ctx.setVisualBackgroundReplaceColor as any;
  const setVisualBackgroundReplaceEnabled = ctx.setVisualBackgroundReplaceEnabled as any;
  const setVisualBackgroundReplaceImageAssetPath = ctx.setVisualBackgroundReplaceImageAssetPath as any;
  const setVisualBackgroundReplaceImageUrl = ctx.setVisualBackgroundReplaceImageUrl as any;
  const setVisualBackgroundReplaceMode = ctx.setVisualBackgroundReplaceMode as any;
  const setVisualBackgroundWashDesaturateAmount = ctx.setVisualBackgroundWashDesaturateAmount as any;
  const setVisualBackgroundWashDimAmount = ctx.setVisualBackgroundWashDimAmount as any;
  const setVisualBackgroundWashEnabled = ctx.setVisualBackgroundWashEnabled as any;
  const setVisualColorAmount = ctx.setVisualColorAmount as any;
  const setVisualEyeContactAssistDebugOverlay = ctx.setVisualEyeContactAssistDebugOverlay as any;
  const setVisualEyeContactAssistEnabled = ctx.setVisualEyeContactAssistEnabled as any;
  const setVisualEyeContactAssistRuntimeStatus = ctx.setVisualEyeContactAssistRuntimeStatus as any;
  const setVisualEyeContactAssistStrength = ctx.setVisualEyeContactAssistStrength as any;
  const setVisualWhiteBalance = ctx.setVisualWhiteBalance as any;
  const sourceBrollItems = ctx.sourceBrollItems as any;
  const sourceImageLibraryItems = ctx.sourceImageLibraryItems as any;
  const selectedBackgroundReplacementAssetId = ctx.selectedBackgroundReplacementAssetId as string | null;
  const visualBackgroundReplaceImageAssetPath = ctx.visualBackgroundReplaceImageAssetPath as string | null;
  const handleSourceDeskUpload = ctx.handleSourceDeskUpload as ((category: "images" | "broll" | "introoutro", fileList: FileList | null) => Promise<void>) | undefined;
  const uploadingCategory = ctx.uploadingCategory as ("images" | "broll" | "introoutro" | null);
  const toggleLogoOverlay = ctx.toggleLogoOverlay as any;
  const trimResolvedBrollBinding = ctx.trimResolvedBrollBinding as any;
  const unresolvedBrollSuggestionItems = ctx.unresolvedBrollSuggestionItems as any;
  const updateImagePlacementTransform = ctx.updateImagePlacementTransform as any;
  const updateVisualPlacementTiming = ctx.updateVisualPlacementTiming as any;
  const videoSnapMode = ctx.videoSnapMode as any;
  const viewingModeSummary = ctx.viewingModeSummary as any;
  const visualBackgroundBlur = ctx.visualBackgroundBlur as any;
  const visualBackgroundBlurDebugMask = ctx.visualBackgroundBlurDebugMask as any;
  const visualBackgroundMaskPreviewMode = ctx.visualBackgroundMaskPreviewMode as any;
  const visualBackgroundMaskPreviewStage = ctx.visualBackgroundMaskPreviewStage as any;
  const visualBackgroundBlurFallbackMode = ctx.visualBackgroundBlurFallbackMode as any;
  const visualBackgroundBlurFeatherPx = ctx.visualBackgroundBlurFeatherPx as any;
  const visualBackgroundBlurSubjectExpansionPx = ctx.visualBackgroundBlurSubjectExpansionPx as any;
  const visualBackgroundBlurPx = ctx.visualBackgroundBlurPx as any;
  const visualBackgroundBlurQualityMode = ctx.visualBackgroundBlurQualityMode as any;
  const visualBackgroundBlurRuntimeStatus = ctx.visualBackgroundBlurRuntimeStatus as any;
  const visualBackgroundBlurStatusSummary = ctx.visualBackgroundBlurStatusSummary as any;
  const visualBackgroundBlurTemporalSmoothing = ctx.visualBackgroundBlurTemporalSmoothing as any;
  const visualBackgroundReplaceColor = ctx.visualBackgroundReplaceColor as any;
  const visualBackgroundReplaceEnabled = ctx.visualBackgroundReplaceEnabled as any;
  const visualBackgroundReplaceImageUrl = ctx.visualBackgroundReplaceImageUrl as any;
  const visualBackgroundReplaceMode = ctx.visualBackgroundReplaceMode as any;
  const visualBackgroundWashDesaturateAmount = ctx.visualBackgroundWashDesaturateAmount as any;
  const visualBackgroundWashDimAmount = ctx.visualBackgroundWashDimAmount as any;
  const visualBackgroundWashEnabled = ctx.visualBackgroundWashEnabled as any;
  const visualColorAmount = ctx.visualColorAmount as any;
  const visualEyeContactAssistDebugOverlay = ctx.visualEyeContactAssistDebugOverlay as any;
  const visualEyeContactAssistEnabled = ctx.visualEyeContactAssistEnabled as any;
  const visualEyeContactAssistRuntimeStatus = ctx.visualEyeContactAssistRuntimeStatus as any;
  const visualEyeContactAssistStatusSummary = ctx.visualEyeContactAssistStatusSummary as any;
  const visualEyeContactAssistStrength = ctx.visualEyeContactAssistStrength as any;
  const visualWhiteBalance = ctx.visualWhiteBalance as any;
  const workspaceFocusMode = ctx.workspaceFocusMode as any;


  const activeTool = ctx.activeTool as string;
  const currentPass = ctx.currentPass as string;
  const activeVisualTool = (ctx.activeVisualTool ?? vm.activeVisualTool ?? "polish") as "polish" | "images" | "broll";
  const onSelectVisualTool = (ctx.onSelectVisualTool ?? vm.onSelectVisualTool ?? null) as ((nextTool: "polish" | "images" | "broll") => void) | null;
  const setFocusOverride = ctx.setFocusOverride as (mode: "auto" | "source-focus" | "tool-focus" | "time-focus") => void;
  const devBlurControlsEnabled = isDevBlurControlsEnabled();
  const introStatusView = derivePackagingIntroStatusView({
    selectedIntroAssetId: introOutroSelection?.intro_asset_id ?? null,
    selectedIntroPath: introOutroSelectedIntroPath ?? null,
    introPlaced: Boolean(packagingIntroPlacement),
  });


  const unsupportedRoute = p.runtimeContexts.body?.surface === "unsupported"; const activeSurface = vm.routeDecision?.status === "resolved" ? vm.routeDecision.surface : null;
  return (
    <>
      {p.runtimeContexts.completion ? <HammerTypedPassCompletionHeader context={p.runtimeContexts.completion} /> : <header className="hammer-bay-head">
        <strong>Tool Rack</strong>
        <span className="hammer-toolbay-live-marker">TOOLBAY FILE IS LIVE</span>
        <div className="hammer-pass-head">
          <span>{vm.passLabel}</span>
          <span className={`hammer-pass-badge hammer-pass-badge--${vm.passStatus}`}>
            {vm.passStatus}
          </span>
          {!unsupportedRoute ? <button type="button" onClick={vm.onMarkComplete}>
            Mark Complete
          </button> : null}
        </div>
      </header>}
      <div className="hammer-bay-body" data-hammer-routed-surface={activeSurface}>
        {p.runtimeContexts.body ? <HammerTypedToolBayBody context={p.runtimeContexts.body} /> : <>
        {activeTool === "video" ? (
          <section className="hammer-tool-card hammer-visual-tool-selector" aria-label="Visual tool selector">
            <header className="hammer-tool-card__head">Visual Tools</header>
            <div className="hammer-source-card__actions" aria-label="Visual tools">
              <button
                type="button"
                className={activeVisualTool === "polish" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("polish")}
              >
                Polish
              </button>
              <button
                type="button"
                className={activeVisualTool === "images" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("images")}
              >
                Images
              </button>
              <button
                type="button"
                className={activeVisualTool === "broll" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("broll")}
              >
                B-roll
              </button>
            </div>
          </section>
        ) : null}
              {activeTool === "video" ? (
                activeVisualTool === "polish" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Visual Polish</header>
                    <div className="hammer-tool-hint">
                      Look Preset and Exposure affect preview and export. White balance, color, and blur stay preview-only in this phase.
                    </div>
                    <label className="hammer-tool-field">
                      <span>Look Preset</span>
                      <select
                        value={activeLookPreset ?? "neutral"}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          applyLookPresetSelection(event.target.value as HammerVisualLutPreset | "neutral");
                        }}
                      >
                        <option value="neutral">Neutral</option>
                        <option value="clean_daylight">Clean Daylight</option>
                        <option value="warm_studio">Warm Studio</option>
                        <option value="cool_evening">Cool Evening</option>
                        <option value="high_contrast">High Contrast</option>
                        <option value="soft_documentary">Soft Documentary</option>
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Exposure ({activeExposureAdjustment ?? 0})</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={activeExposureAdjustment ?? 0}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          applyExposureAdjustment(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualEyeContactAssistEnabled}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualEyeContactAssistEnabled(event.target.checked);
                          setVisualEyeContactAssistRuntimeStatus(null);
                        }}
                      />
                      <span>Eye Contact Assist (Preview)</span>
                    </label>
                    {visualEyeContactAssistEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Strength ({visualEyeContactAssistStrength.toFixed(2)})</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualEyeContactAssistStrength}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualEyeContactAssistStrength(Number(event.target.value));
                            }}
                          />
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualEyeContactAssistDebugOverlay}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualEyeContactAssistDebugOverlay(event.target.checked);
                            }}
                          />
                          <span>Show gaze debug (overlay/status)</span>
                        </label>
                        <div className="hammer-tool-hint">
                          Experimental preview-only. Uses subtle correction; review carefully.
                        </div>
                        <div className="hammer-tool-hint">
                          {visualEyeContactAssistStatusSummary
                            ? visualEyeContactAssistStatusSummary.primaryLine
                            : "Eye contact status unavailable."}
                        </div>
                        {visualEyeContactAssistDebugOverlay && visualEyeContactAssistRuntimeStatus?.debug ? (
                          <div className="hammer-tool-hint">
                            {visualEyeContactAssistStatusSummary?.debugLine ? (
                              <div>{visualEyeContactAssistStatusSummary.debugLine}</div>
                            ) : null}
                            {visualEyeContactAssistRuntimeStatus.debug.applicabilityReasons.length > 0 ? (
                              <div>Applicability: {visualEyeContactAssistRuntimeStatus.debug.applicabilityReasons.join(", ")}</div>
                            ) : null}
                            {visualEyeContactAssistRuntimeStatus.debug.smoothingResetReasons.length > 0 ? (
                              <div>Smoothing reset: {visualEyeContactAssistRuntimeStatus.debug.smoothingResetReasons.join(", ")}</div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <label className="hammer-tool-field">
                      <span>Preview White Balance ({visualWhiteBalance})</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={visualWhiteBalance}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualWhiteBalance(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-field">
                      <span>Preview Color ({visualColorAmount})</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={visualColorAmount}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualColorAmount(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualBackgroundBlur}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          const enabled = event.target.checked;
                          setVisualBackgroundBlur(enabled);
                          if (enabled) {
                            setVisualBackgroundReplaceEnabled(false);
                            setVisualBackgroundWashEnabled(false);
                            if (!devBlurControlsEnabled) {
                              setVisualBackgroundBlurQualityMode("high");
                              setVisualBackgroundBlurPx(5);
                              setVisualBackgroundBlurFeatherPx(9);
                              setVisualBackgroundBlurTemporalSmoothing(0.6);
                              setVisualBackgroundBlurSubjectExpansionPx(0);
                              setVisualBackgroundMaskPreviewMode(false);
                              setVisualBackgroundMaskPreviewStage("refined");
                              setVisualBackgroundBlurFallbackMode("passthrough");
                            }
                          }
                        }}
                      />
                      <span>Background Blur</span>
                    </label>
                    <div className="hammer-tool-hint">
                      {visualBackgroundBlur
                        ? ((visualBackgroundBlurRuntimeStatus?.degradedReason === "reusing_recent_mask"
                          || visualBackgroundBlurRuntimeStatus?.degradedReason === "replacement_degraded_under_load"
                          || visualBackgroundBlurRuntimeStatus?.degradedReason === "replacement_downgraded_to_blur")
                          ? "Using fallback"
                          : visualBackgroundBlurRuntimeStatus?.statusMessage
                          ? "Preparing blur..."
                          : visualBackgroundBlurRuntimeStatus?.mask?.status === "ok"
                          ? "Blur active"
                          : visualBackgroundBlurStatusSummary?.primaryLine
                          ? "Ready"
                          : "Blur unavailable")
                        : "Ready"}
                    </div>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualBackgroundReplaceEnabled}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          const enabled = event.target.checked;
                          setVisualBackgroundReplaceEnabled(enabled);
                          if (enabled) {
                            setVisualBackgroundBlur(false);
                            setVisualBackgroundWashEnabled(false);
                            setVisualBackgroundReplaceMode("image");
                          }
                        }}
                      />
                      <span>Background Replacement</span>
                    </label>
                    {visualBackgroundReplaceEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Selected Background</span>
                          <select
                            value={visualBackgroundReplaceImageAssetPath ?? ""}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              const nextPath = event.target.value.trim();
                              setVisualBackgroundReplaceImageAssetPath(nextPath || null);
                              if (nextPath) {
                                setVisualBackgroundReplaceMode("image");
                                setVisualBackgroundReplaceImageUrl("");
                              }
                            }}
                          >
                            <option value="">No background selected</option>
                            {sourceImageLibraryItems.map((item: any) => (
                              <option key={`bg-replace-${item.path}`} value={item.path}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="hammer-source-card__actions">
                          <label className="hammer-diagnostics-banner__button">
                            Upload Background
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(event) => {
                                const files = event.currentTarget.files;
                                if (!files || files.length === 0 || !handleSourceDeskUpload) return;
                                setFocusOverride("tool-focus");
                                void handleSourceDeskUpload("images", files).finally(() => {
                                  event.currentTarget.value = "";
                                });
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundReplaceImageAssetPath(null);
                              setVisualBackgroundReplaceImageUrl("");
                            }}
                            disabled={!visualBackgroundReplaceImageAssetPath && !visualBackgroundReplaceImageUrl.trim()}
                          >
                            Clear Background
                          </button>
                        </div>
                        <div className="hammer-tool-hint">
                          {visualBackgroundReplaceImageAssetPath
                            ? `Background asset selected${selectedBackgroundReplacementAssetId ? ` · ${selectedBackgroundReplacementAssetId}` : ""}`
                            : "No background asset selected"}
                          {uploadingCategory === "images" ? " · Uploading..." : ""}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Edge feather ({Math.round(visualBackgroundBlurFeatherPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={visualBackgroundBlurFeatherPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFeatherPx(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {devBlurControlsEnabled ? (
                      <details className="hammer-tool-fieldset">
                        <summary>Advanced Blur Controls</summary>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundReplaceEnabled}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              const enabled = event.target.checked;
                              setVisualBackgroundReplaceEnabled(enabled);
                              if (enabled) {
                                setVisualBackgroundBlur(false);
                                setVisualBackgroundWashEnabled(false);
                              }
                            }}
                          />
                          <span>Background Replace (Segmentation Preview)</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundWashEnabled}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              const enabled = event.target.checked;
                              setVisualBackgroundWashEnabled(enabled);
                              if (enabled) {
                                setVisualBackgroundBlur(false);
                                setVisualBackgroundReplaceEnabled(false);
                              }
                            }}
                          />
                          <span>Background Wash (Segmentation Preview)</span>
                        </label>
                    {visualBackgroundBlur ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Segmentation Provider</span>
                          <select
                            value={backgroundBlurProviderDescriptor?.id ?? "mediapipe_selfie_segmentation"}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurProviderId(event.target.value);
                              setVisualBackgroundBlurRuntimeStatus(null);
                            }}
                          >
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor: any) => (
                              <option key={descriptor.id} value={descriptor.id}>
                                {descriptor.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Blur strength ({Math.round(visualBackgroundBlurPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            step={1}
                            value={visualBackgroundBlurPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurPx(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {visualBackgroundReplaceEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Segmentation Provider</span>
                          <select
                            value={backgroundBlurProviderDescriptor?.id ?? "mediapipe_selfie_segmentation"}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurProviderId(event.target.value);
                              setVisualBackgroundBlurRuntimeStatus(null);
                            }}
                          >
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor: any) => (
                              <option key={descriptor.id} value={descriptor.id}>
                                {descriptor.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Replacement Mode</span>
                          <select
                            value={visualBackgroundReplaceMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundReplaceMode(event.target.value as "solid" | "image" | "checkerboard");
                            }}
                          >
                            <option value="solid">Solid Color</option>
                            <option value="checkerboard">Checkerboard (Debug)</option>
                            <option value="image">Image (Preview)</option>
                          </select>
                        </label>
                        {visualBackgroundReplaceMode === "solid" ? (
                          <label className="hammer-tool-field">
                            <span>Replacement Color</span>
                            <input
                              type="color"
                              value={visualBackgroundReplaceColor}
                              onChange={(event) => {
                                setFocusOverride("tool-focus");
                                setVisualBackgroundReplaceColor(event.target.value);
                              }}
                            />
                          </label>
                        ) : visualBackgroundReplaceMode === "image" ? (
                          <label className="hammer-tool-field">
                            <span>Replacement Image URL</span>
                            <input
                              type="text"
                              value={visualBackgroundReplaceImageUrl}
                              placeholder="https://..."
                              onChange={(event) => {
                                setFocusOverride("tool-focus");
                                setVisualBackgroundReplaceImageUrl(event.target.value);
                              }}
                            />
                            {visualBackgroundBlurRuntimeStatus?.degradedReason === "replacement_image_load_failed" ? (
                              <div className="hammer-tool-hint">
                                Image load failed. If this is a remote URL, it may be blocked by CORS. Try an image host that sends permissive CORS headers, or use a local/static asset URL.
                              </div>
                            ) : null}
                          </label>
                        ) : null}
                        <label className="hammer-tool-field">
                          <span>Edge feather ({Math.round(visualBackgroundBlurFeatherPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={visualBackgroundBlurFeatherPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFeatherPx(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {visualBackgroundWashEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Segmentation Provider</span>
                          <select
                            value={backgroundBlurProviderDescriptor?.id ?? "mediapipe_selfie_segmentation"}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurProviderId(event.target.value);
                              setVisualBackgroundBlurRuntimeStatus(null);
                            }}
                          >
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor: any) => (
                              <option key={descriptor.id} value={descriptor.id}>
                                {descriptor.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Background dim ({Math.round(visualBackgroundWashDimAmount * 100)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualBackgroundWashDimAmount}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundWashDimAmount(Number(event.target.value));
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Desaturate ({Math.round(visualBackgroundWashDesaturateAmount * 100)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualBackgroundWashDesaturateAmount}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundWashDesaturateAmount(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {visualBackgroundBlur || visualBackgroundReplaceEnabled || visualBackgroundWashEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Edge feather ({Math.round(visualBackgroundBlurFeatherPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={visualBackgroundBlurFeatherPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFeatherPx(Number(event.target.value));
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Temporal smoothing ({visualBackgroundBlurTemporalSmoothing.toFixed(2)})</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualBackgroundBlurTemporalSmoothing}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                                setVisualBackgroundBlurTemporalSmoothing(Number(event.target.value));
                              }}
                            />
                          </label>
                        <div className="hammer-tool-hint">
                          Temporal smoothing stabilizes mask edges across moving frames and is most visible during playback.
                        </div>
                        <label className="hammer-tool-field">
                          <span>Quality</span>
                          <select
                            value={visualBackgroundBlurQualityMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurQualityMode(event.target.value as BackgroundBlurSettings["qualityMode"]);
                            }}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Fallback</span>
                          <select
                            value={visualBackgroundBlurFallbackMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFallbackMode(event.target.value as BackgroundBlurSettings["fallbackMode"]);
                            }}
                          >
                            <option value="disable">Disable on degraded</option>
                            <option value="passthrough">Show passthrough</option>
                          </select>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundBlurDebugMask}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurDebugMask(event.target.checked);
                            }}
                          />
                          <span>Show mask thumbnails (debug)</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundMaskPreviewMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundMaskPreviewMode(event.target.checked);
                            }}
                          />
                          <span>Mask preview mode</span>
                        </label>
                        {visualBackgroundBlurDebugMask ? (
                          <>
                            <label className="hammer-tool-field">
                              <span>Subject expansion ({visualBackgroundBlurSubjectExpansionPx.toFixed(1)}px)</span>
                              <input
                                type="range"
                                min={-6}
                                max={6}
                                step={0.5}
                                value={visualBackgroundBlurSubjectExpansionPx}
                                onChange={(event) => {
                                  setFocusOverride("tool-focus");
                                  setVisualBackgroundBlurSubjectExpansionPx(Number(event.target.value));
                                }}
                              />
                            </label>
                            <label className="hammer-tool-field">
                              <span>Mask preview stage</span>
                              <select
                                value={visualBackgroundMaskPreviewStage}
                                onChange={(event) => {
                                  setFocusOverride("tool-focus");
                                  setVisualBackgroundMaskPreviewStage(event.target.value);
                                }}
                              >
                                <option value="raw">Raw</option>
                                <option value="expanded">Expanded/Contracted</option>
                                <option value="feathered">Feathered</option>
                                <option value="refined">Refined</option>
                                <option value="final_composite">Final Composite</option>
                              </select>
                            </label>
                          </>
                        ) : null}
                        <div className="hammer-tool-hint">
                          {visualBackgroundBlurStatusSummary ? (
                            visualBackgroundBlurStatusSummary.primaryLine
                          ) : (
                            "Segmentation status unavailable."
                          )}
                        </div>
                        {visualBackgroundBlurRuntimeStatus ? (
                          <div className="hammer-tool-hint hammer-background-blur-debug">
                            <div>
                              <strong>
                                mask: {visualBackgroundBlurRuntimeStatus.mask.status === "ok"
                                  ? "OK"
                                  : visualBackgroundBlurRuntimeStatus.mask.status}
                              </strong>
                              {visualBackgroundBlurRuntimeStatus.mask.reason
                                ? ` (${visualBackgroundBlurRuntimeStatus.mask.reason})`
                                : ""}
                            </div>
                            <div>
                              provider: {visualBackgroundBlurRuntimeStatus.mask.providerStatus} ({visualBackgroundBlurRuntimeStatus.mask.providerSource})
                            </div>
                            <div>
                              mask resolution: {visualBackgroundBlurRuntimeStatus.mask.resolution
                                ? `${visualBackgroundBlurRuntimeStatus.mask.resolution.width}x${visualBackgroundBlurRuntimeStatus.mask.resolution.height}`
                                : "n/a"}
                            </div>
                            <div>
                              confidence: {visualBackgroundBlurRuntimeStatus.mask.confidence == null
                                ? "n/a"
                                : visualBackgroundBlurRuntimeStatus.mask.confidence.toFixed(2)}
                              {" · "}
                              mask gen: {visualBackgroundBlurRuntimeStatus.mask.generationMs == null
                                ? "n/a"
                                : `${visualBackgroundBlurRuntimeStatus.mask.generationMs.toFixed(1)}ms`}
                            </div>
                            {visualBackgroundBlurRuntimeStatus.statusMessage ? (
                              <div>{visualBackgroundBlurRuntimeStatus.statusMessage}</div>
                            ) : null}
                          </div>
                        ) : null}
                        {visualBackgroundBlurDebugMask && visualBackgroundBlurRuntimeStatus ? (
                          <div className="hammer-tool-hint hammer-background-blur-debug">
                            {visualBackgroundBlurStatusSummary?.debugLine ? (
                              <div>{visualBackgroundBlurStatusSummary.debugLine}</div>
                            ) : null}
                            <div className="hammer-background-blur-debug__row">
                              <div className="hammer-background-blur-debug__card">
                                <strong>Raw Mask</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.rawMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.rawMaskDataUrl}
                                    alt="Raw segmentation mask"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Expanded/Contracted</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.expandedMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.expandedMaskDataUrl}
                                    alt="Expanded or contracted segmentation mask"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Feathered</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.featheredMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.featheredMaskDataUrl}
                                    alt="Feathered segmentation mask"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Refined Matte</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.refinedMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.refinedMaskDataUrl}
                                    alt="Refined foreground matte"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Final Composite</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.finalCompositeDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.finalCompositeDataUrl}
                                    alt="Final background treatment composite"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                      </details>
                    ) : null}
                    <div className="hammer-tool-hint">
                      White balance, color, background blur, and background replacement remain preview-only in Phase 1. Look Preset and Exposure carry into the export packet.
                    </div>
                  </section>
                ) : activeVisualTool === "images" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Image Placement</header>
                    <div className="hammer-toolbay-live-marker hammer-toolbay-live-marker--inline">TOOLBAY FILE IS LIVE</div>
                    <div className="hammer-dev-auto-preview-controls">
                      <div className="hammer-dev-auto-preview-controls__title">DEV AUTO PREVIEW CONTROLS</div>
                      <div>debug flag enabled: {autoPlacementDebugEnabled ? "yes" : "no"}</div>
                      <div>selected placement id: {selectedPlacementId ?? "none"}</div>
                      <div>selected overlay asset: {selectedOverlayAssetPresent ? "yes" : "no"}</div>
                      <div>selected visual asset: {selectedVisualAssetPresent ? "yes" : "no"}</div>
                      <div>selected clip: {selectedClipPresent ? "yes" : "no"}</div>
                      <div>selected auto preview active: {selectedAutoPreviewActive ? "yes" : "no"}</div>
                      <div>resolved placement exists: {previewDiagnosticsSummary?.resolvedPlacementExists ? "yes" : "no"}</div>
                      <div>diagnostics enabled: {previewDiagnosticsSummary?.diagnosticsEnabled ? "yes" : "no"}</div>
                      <div>diagnostics resolvedPlacement: {previewDiagnosticsSummary?.diagnosticsResolvedPlacement ? "yes" : "no"}</div>
                      <div>candidateCount: {previewDiagnosticsSummary?.candidateCount ?? 0}</div>
                      <div>maskBoundsCount: {previewDiagnosticsSummary?.maskBoundsCount ?? 0}</div>
                      <div>current frame available: {previewDiagnosticsSummary?.currentFrameAvailable ? "yes" : "no"}</div>
                      <div>segmentation mask available: {previewDiagnosticsSummary?.segmentationMaskAvailable ? "yes" : "no"}</div>
                      <div>resolver status: {previewDiagnosticsSummary?.resolverStatus ?? "unknown"}</div>
                      <div>resolver reason: {previewDiagnosticsSummary?.resolverReason ?? "unknown"}</div>
                      <div>selectedScale: {previewDiagnosticsSummary?.selectedScale == null ? "n/a" : previewDiagnosticsSummary.selectedScale.toFixed(2)}</div>
                      {(previewDiagnosticsSummary?.scaleAttempts ?? []).map((attempt, idx) => (
                        <div key={`dev-scale-attempt-${idx}`}>
                          scale {attempt.scale.toFixed(2)} {"->"} candidates {attempt.candidateCount}, rejected {attempt.rejectedCount}, best rejection {attempt.bestRejectionReason ?? "none"}, resolved {attempt.resolved ? "yes" : "no"}
                        </div>
                      ))}
                      <div className="hammer-tool-hint">
                        Episode health snapshot:
                        <pre>{JSON.stringify(episodeHealthSnapshot ?? { missing: true }, null, 2)}</pre>
                      </div>
                      <div className="hammer-source-card__actions">
                        <button
                          type="button"
                          onClick={() => previewAutoPosition?.()}
                          disabled={Boolean(previewAutoPositionDisabledReason)}
                        >
                          Preview Auto Position
                        </button>
                        <button
                          type="button"
                          onClick={() => resetPreviewAutoPosition?.()}
                          disabled={Boolean(resetPreviewPositionDisabledReason)}
                        >
                          Reset Preview Position
                        </button>
                      </div>
                      <div>
                        Preview button: {previewAutoPositionDisabledReason ? `disabled - ${previewAutoPositionDisabledReason}` : "enabled"}
                      </div>
                      <div>
                        Reset button: {resetPreviewPositionDisabledReason ? `disabled - ${resetPreviewPositionDisabledReason}` : "enabled"}
                      </div>
                      {previewDiagnosticsSummary && !previewDiagnosticsSummary.resolvedPlacementExists ? (
                        <div>
                          Plain English: No usable resolver placement yet because {previewDiagnosticsSummary.resolverReason}.
                        </div>
                      ) : null}
                      <div>
                        {selectedAutoPreviewActive ? "AUTO PREVIEW ACTIVE (unsaved)" : "Auto preview inactive"}
                        {previewAutoPositionStatus ? ` · ${previewAutoPositionStatus}` : ""}
                      </div>
                    </div>
                    <div className="hammer-tool-hint">
                      Direct manipulation mode. Drag and resize image clips in timeline or preview. Hold Shift while dragging to snap to 0.1s steps.
                    </div>
                    {selectedImagePlacement ? (
                      <>
                        <div className="hammer-tool-hint">
                          Selected: {selectedImagePlacement.label}
                          {` (${selectedImagePlacement.startSec.toFixed(1)}s - ${selectedImagePlacement.endSec.toFixed(1)}s)`}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Start (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={selectedImagePlacement.startSec}
                            onChange={(event) => {
                              const nextStart = Math.max(0, Number(event.target.value) || 0);
                              const minEnd = roundToTenth(nextStart + MIN_IMAGE_PLACEMENT_DURATION_SEC);
                              commitVisualPlacementWindow(selectedImagePlacement.id, {
                                startSec: nextStart,
                                endSec: Math.max(minEnd, selectedImagePlacement.endSec),
                                label: "Adjust image clip start",
                              });
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>End (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={selectedImagePlacement.endSec}
                            onChange={(event) => {
                              const nextEnd = Math.max(0, Number(event.target.value) || 0);
                              commitVisualPlacementWindow(selectedImagePlacement.id, {
                                startSec: selectedImagePlacement.startSec,
                                endSec: Math.max(
                                  roundToTenth(selectedImagePlacement.startSec + MIN_IMAGE_PLACEMENT_DURATION_SEC),
                                  nextEnd,
                                ),
                                label: "Adjust image clip end",
                              });
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button type="button" onClick={() => updateVisualPlacementTiming(selectedImagePlacement.id, -0.5)}>
                            Move -0.5s
                          </button>
                          <button type="button" onClick={() => updateVisualPlacementTiming(selectedImagePlacement.id, 0.5)}>
                            Move +0.5s
                          </button>
                          <button type="button" onClick={() => removeVisualPlacement(selectedImagePlacement.id)}>
                            Remove Clip
                          </button>
                        </div>
                        <div className="hammer-tool-hint">
                          Anchor segment: {selectedVisualAnchorSegmentId ?? "n/a"}
                          {` · matches ${selectedVisualClip?.anchor_hint.matched_segment_ids.length ?? 0}`}
                          {selectedVisualClip?.anchor_hint.detached ? " · detached" : " · attached"}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Anchor Text</span>
                          <textarea
                            value={anchorTextDraft}
                            rows={3}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setAnchorTextDraft(event.target.value);
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Anchor Label</span>
                          <input
                            value={anchorLabelDraft}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setAnchorLabelDraft(event.target.value);
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => previewAutoPosition?.()}
                            disabled={Boolean(previewAutoPositionDisabledReason)}
                          >
                            Apply Auto Position
                          </button>
                          <button
                            type="button"
                            onClick={() => commitVisualAnchorRefinement({
                              clipId: selectedImagePlacement.id,
                              anchorText: anchorTextDraft,
                              anchorLabel: anchorLabelDraft,
                              detached: true,
                              label: "Refine visual anchor",
                            })}
                          >
                            Save Anchor
                          </button>
                          <button
                            type="button"
                            onClick={() => commitVisualAnchorRefinement({
                              clipId: selectedImagePlacement.id,
                              anchorText: selectedVisualAnchorSegment?.text ?? "",
                              anchorLabel: anchorLabelDraft,
                              detached: false,
                              label: "Reset visual anchor",
                            })}
                            disabled={!selectedVisualAnchorSegment}
                          >
                            Reset to Segment
                          </button>
                        </div>
                        <label className="hammer-tool-field">
                          <span>Position X ({Math.round(selectedImagePlacementTransform.leftPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={selectedImagePlacementTransform.leftPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...selectedImagePlacementTransform,
                                leftPct: next,
                              });
                              updateImagePlacementTransform(selectedImagePlacement.id, () => updated);
                              commitImagePlacementTransform(selectedImagePlacement.id, updated, "Adjust visual overlay X");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Position Y ({Math.round(selectedImagePlacementTransform.topPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={selectedImagePlacementTransform.topPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...selectedImagePlacementTransform,
                                topPct: next,
                              });
                              updateImagePlacementTransform(selectedImagePlacement.id, () => updated);
                              commitImagePlacementTransform(selectedImagePlacement.id, updated, "Adjust visual overlay Y");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>
                            Scale ({Math.round((selectedImagePlacementTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}%)
                          </span>
                          <input
                            type="range"
                            min={50}
                            max={200}
                            step={1}
                            value={Math.round((selectedImagePlacementTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}
                            onChange={(event) => {
                              const scale = Number(event.target.value) / 100;
                              const updated = clampImagePlacementTransform({
                                ...selectedImagePlacementTransform,
                                widthPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct * scale,
                                heightPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct * scale,
                              });
                              updateImagePlacementTransform(selectedImagePlacement.id, () => updated);
                              commitImagePlacementTransform(selectedImagePlacement.id, updated, "Adjust visual overlay scale");
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              updateImagePlacementTransform(selectedImagePlacement.id, () => DEFAULT_IMAGE_PLACEMENT_TRANSFORM);
                              commitImagePlacementTransform(
                                selectedImagePlacement.id,
                                DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
                                "Center visual overlay",
                              );
                            }}
                          >
                            Center
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="hammer-tool-hint">
                        Select an image clip in the timeline to open inspector controls.
                      </div>
                    )}
                  </section>
                ) : activeVisualTool === "broll" ? (
                  <section className="hammer-tool-card">
                    <HammerBrollSelectionControls placement={selectedImagePlacement} onRemove={removeVisualPlacement} />
                  <label className="hammer-tool-field">
                    <span>Snap Mode</span>
                    <select
                      value={videoSnapMode}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setVideoSnapMode(event.target.value as "timeline" | "segment");
                      }}
                    >
                      <option value="timeline">Timeline grid</option>
                      <option value="segment">Segment boundaries</option>
                    </select>
                  </label>
                  <div className="hammer-tool-hint">Placed visuals: {editableVisualPlacements?.placements.length ?? 0}</div>
                  <div className="hammer-tool-hint">
                    Resolved bindings: {resolvedBrollBindingItems.length} · unresolved suggestions: {unresolvedBrollSuggestionItems.length}
                  </div>
                  <div className="hammer-tool-hint">
                    Needs review: {boundAttentionSummary.total}
                    {` (unresolved ${boundAttentionSummary.unresolvedCount}, degraded ${boundAttentionSummary.degradedCount}, superseded ${boundAttentionSummary.supersededCount}, transitions ${boundAttentionSummary.transitionCount})`}
                  </div>
                  <div className="hammer-source-card__actions">
                    <button type="button" onClick={() => addMinimalTransition("hard_cut")}>Add Hard Cut</button>
                    <button type="button" onClick={() => addMinimalTransition("crossfade")}>Add Crossfade</button>
                    <button type="button" onClick={() => addMinimalTransition("dip_to_black")}>Add Dip To Black</button>
                    <button type="button" onClick={() => addMinimalTransition("fade_audio")}>Add Fade Audio</button>
                  </div>
                  <div className="hammer-source-card__actions">
                    <button
                      type="button"
                      onClick={() => navigateBoundAttention("previous")}
                      disabled={boundAttentionQueue.length === 0}
                    >
                      Previous Attention
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateBoundAttention("next")}
                      disabled={boundAttentionQueue.length === 0}
                    >
                      Next Attention
                    </button>
                  </div>
                  {boundAttentionQueue.length > 0 ? (
                    <div className="hammer-source-list">
                      {boundAttentionQueue.slice(0, 5).map((item: any) => (
                        <article key={`attention:${item.operationId}`} className={selectedBoundBrollOperationId === item.operationId ? "hammer-source-card is-selected" : "hammer-source-card"}>
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>{item.kind.replace(/_/g, " ")}</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.reasons.join(" ")}</span>
                          </div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => focusBoundAttentionOperation(item.operationId)}
                            >
                              Open In Inspector
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {selectedBoundBrollInspectorState ? (
                    <section className="hammer-cleanup-tool">
                      <div className="hammer-cleanup-tool__head">
                        <strong>Bound Object Inspector</strong>
                        <span>{selectedBoundBrollInspectorState.operationId}</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Intent: {selectedBoundBrollInspectorState.intentSource}
                        {selectedBoundBrollInspectorState.intentDescription
                          ? ` · ${selectedBoundBrollInspectorState.intentDescription}`
                          : ""}
                      </div>
                      <div className="hammer-tool-hint">
                        Binding: {selectedBoundBrollInspectorState.bindingState} · lifecycle: {selectedBoundBrollInspectorState.lifecycle}
                      </div>
                      <div className="hammer-tool-hint">
                        Window: {selectedBoundBrollInspectorState.startSec.toFixed(1)}s - {selectedBoundBrollInspectorState.endSec.toFixed(1)}s
                      </div>
                      <div className="hammer-tool-hint">Asset: {selectedBoundBrollInspectorState.assetRef}</div>
                      <div className="hammer-tool-hint">
                        Posture: preview {selectedBoundBrollInspectorState.previewPosture}
                        {` · export ${selectedBoundBrollInspectorState.exportPosture} · handoff ${selectedBoundBrollInspectorState.handoffPosture}`}
                      </div>
                      {selectedBoundBrollInspectorState.linkedDuck ? (
                        <div className="hammer-tool-hint">
                          Linked duck {selectedBoundBrollInspectorState.linkedDuck.operationId}
                          {`: ${selectedBoundBrollInspectorState.linkedDuck.startSec.toFixed(1)}s - ${selectedBoundBrollInspectorState.linkedDuck.endSec.toFixed(1)}s`}
                          {` · aligned ${selectedBoundBrollInspectorState.linkedDuck.aligned ? "yes" : "no"}`}
                          {` · ${selectedBoundBrollInspectorState.linkedDuck.capability}`}
                        </div>
                      ) : (
                        <div className="hammer-tool-hint">Linked duck: none</div>
                      )}
                      {selectedBoundBrollInspectorState.needsAttention ? (
                        <div className="hammer-tool-hint">
                          Attention: {selectedBoundBrollInspectorState.attentionFlags.join(" ")}
                        </div>
                      ) : (
                        <div className="hammer-tool-hint">Attention: none</div>
                      )}
                      {selectedBoundBrollInspectorState.bindingState === "resolved"
                        && selectedBoundBrollInspectorState.lifecycle === "active" ? (
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => moveResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, -0.5)}
                          >
                            Move -0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => moveResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, 0.5)}
                          >
                            Move +0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => trimResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, "start", 0.25)}
                          >
                            Trim In +0.25s
                          </button>
                          <button
                            type="button"
                            onClick={() => trimResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, "end", -0.25)}
                          >
                            Trim Out -0.25s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const replacement = sourceBrollItems.find(
                                (item: any) => item.assetPath && item.assetPath !== selectedBoundBrollInspectorState.assetRef,
                              )?.assetPath ?? null;
                              if (!replacement) {
                                setTranscriptTimingHint("Upload another b-roll asset before replacing this binding.");
                                return;
                              }
                              replaceResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, replacement);
                            }}
                          >
                            Replace Asset
                          </button>
                          <button
                            type="button"
                            onClick={() => revertResolvedBrollBinding(selectedBoundBrollInspectorState.operationId)}
                          >
                            Revert Binding
                          </button>
                        </div>
                      ) : null}
                      {selectedBoundBrollInspectorState.bindingState === "unresolved"
                        && selectedBoundBrollInspectorState.lifecycle === "active" ? (
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              const candidate = sourceBrollItems.find((item: any) => item.assetPath)?.assetPath ?? null;
                              if (!candidate) {
                                setTranscriptTimingHint("Upload B-roll before resolving this suggestion.");
                                return;
                              }
                              resolveHearthBrollSuggestion({
                                operationId: selectedBoundBrollInspectorState.operationId,
                                assetPath: candidate,
                                label: "Resolved from inspector",
                              });
                            }}
                          >
                            Resolve With First Asset
                          </button>
                          <button
                            type="button"
                            onClick={() => discardHearthBrollSuggestion(selectedBoundBrollInspectorState.operationId)}
                          >
                            Discard Suggestion
                          </button>
                        </div>
                      ) : null}
                    </section>
                  ) : selectedTransitionBoundObject ? (
                    <section className="hammer-cleanup-tool">
                      <div className="hammer-cleanup-tool__head">
                        <strong>Transition Inspector</strong>
                        <span>{selectedTransitionBoundObject.object_id}</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Type: {selectedTransitionBoundObject.payload.transition_kind}
                      </div>
                      <div className="hammer-tool-hint">
                        Window: {selectedTransitionBoundObject.placement_window.start_sec.toFixed(1)}s - {selectedTransitionBoundObject.placement_window.end_sec.toFixed(1)}s
                      </div>
                      <div className="hammer-tool-hint">
                        Posture: preview {selectedTransitionBoundObject.posture.preview}
                        {` · export ${selectedTransitionBoundObject.posture.export} · handoff ${selectedTransitionBoundObject.posture.handoff}`}
                      </div>
                      <div className="hammer-tool-hint">
                        Attention: {selectedTransitionBoundObject.attention_flags.length > 0
                          ? selectedTransitionBoundObject.attention_flags.join(", ")
                          : "none"}
                      </div>
                    </section>
                  ) : (
                    <div className="hammer-tool-hint">
                      Select a bound object from the queue or Source Desk to inspect canonical linkage and attention state.
                    </div>
                  )}
                </section>
              ) : null
            ) : null}

              {activeTool === "finishing" ? (
                currentPass === "packaging" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Packaging</header>
                    <div className="hammer-tool-hint">
                      Packaging placement controls only. Choose intro/outro assets in Source Desk.
                    </div>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyIntroPlacement();
                        }}
                        disabled={!introStatusView.canApply}
                      >
                        {introStatusView.applyActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          removePackagingPlacement(PACKAGING_INTRO_ENTRY_ID, "Remove packaging intro");
                        }}
                        disabled={!introStatusView.canRemove}
                      >
                        {introStatusView.removeActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyOutroPlacement();
                        }}
                        disabled={!introOutroSelection.outro_asset_id || !introOutroSelectedOutroPath}
                      >
                        Apply Outro
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          removePackagingPlacement(PACKAGING_OUTRO_ENTRY_ID, "Remove packaging outro");
                        }}
                        disabled={!packagingOutroPlacement}
                      >
                        Remove Outro
                      </button>
                    </div>
                    <div className="hammer-tool-hint">
                      {introStatusView.selectionStatusLine} ·
                      {" "}Outro: {introOutroSelection.outro_asset_id
                        ? (introOutroSelectedOutroPath ? "selected" : "selected (unresolved)")
                        : "not selected"}
                    </div>
                    <div className="hammer-tool-hint">
                      {introStatusView.placementStatusLine} ·
                      {" "}Outro applied: {packagingOutroPlacement ? "yes" : "no"}
                    </div>

                    <label className="hammer-tool-field">
                      <span>Logo Asset</span>
                      <select
                        value={packagingLogoAssetPath ?? ""}
                        onChange={(event) => {
                          const nextPath = event.target.value || null;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ assetPath: nextPath });
                        }}
                      >
                        <option value="">No logo selected</option>
                        {sourceImageLibraryItems.map((item: any) => (
                          <option key={`logo-${item.path}`} value={item.path}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          toggleLogoOverlay();
                        }}
                        disabled={!packagingLogoPlacement && !packagingLogoAssetPath}
                      >
                        {packagingLogoPlacement ? "Disable Logo Overlay" : "Toggle Logo Overlay"}
                      </button>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Logo Position</span>
                      <select
                        value={packagingLogoPosition}
                        onChange={(event) => {
                          const next = event.target.value as HammerLogoOverlayPosition;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ position: next });
                        }}
                      >
                        {LOGO_POSITION_OPTIONS.map((option: any) => (
                          <option key={`logo-position-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Logo Size</span>
                      <select
                        value={packagingLogoSize}
                        onChange={(event) => {
                          const next = event.target.value as HammerLogoOverlaySize;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ size: next });
                        }}
                      >
                        {LOGO_SIZE_OPTIONS.map((option: any) => (
                          <option key={`logo-size-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-tool-hint">
                      Logo overlay: {packagingLogoPlacement ? "enabled (episode-wide)" : "disabled"}
                    </div>
                    <div className="hammer-tool-hint">
                      Thumbnails and visual prompts are generated in Hearth. Hammer only consumes existing assets from Tongs / workspace.
                    </div>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Finishing Checklist</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.transcriptReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current: any) => ({
                          ...current,
                          transcriptReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Transcript reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.visualsReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current: any) => ({
                          ...current,
                          visualsReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Visuals reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.audioReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current: any) => ({
                          ...current,
                          audioReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Audio reviewed</span>
                  </label>
                </section>
                )
              ) : null}


              <div className="hammer-tool-state-grid">
                <div>Workspace mode: {workspaceFocusMode}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Viewing: {viewingModeSummary}</div>
                <div>Output source: {outputSelectionSummary}</div>
                <div>Release prep: {releasePrepOpenHref ? "available" : "unavailable"}</div>
                <div>Preview truth: {previewTruthPosture}</div>
              </div>
        </>}
      </div>
    </>
  );
}
