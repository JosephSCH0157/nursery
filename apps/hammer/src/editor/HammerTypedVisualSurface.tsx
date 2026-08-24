import type { JSX } from "react";
import type { HammerToolBayContextSurface } from "./hammerToolBayContext";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import type { HammerVisualLutPreset } from "./hammerWorkspaceShellCore";

function isTruthyDevToggle(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function isDevBlurControlsEnabled(): boolean {
  if (!import.meta.env?.DEV || typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    return isTruthyDevToggle(params.get("dev")) || isTruthyDevToggle(params.get("tp_dev_mode"));
  } catch {
    return false;
  }
}

export function HammerTypedVisualSurface(props: { surface: Extract<HammerToolBayContextSurface, "visual_polish" | "image_placement" | "image_timing" | "image_transform" | "image_animation">; model: unknown }): JSX.Element {
  const { surface } = props;
  type Command = (...args: unknown[]) => void;
  const ctx = props.model as Record<string, unknown>;
  const activeExposureAdjustment = ctx.activeExposureAdjustment as any;
  const activeLookPreset = ctx.activeLookPreset as any;
  const anchorLabelDraft = ctx.anchorLabelDraft as any;
  const anchorTextDraft = ctx.anchorTextDraft as any;
  const applyExposureAdjustment = ctx.applyExposureAdjustment as Command;
  const applyLookPresetSelection = ctx.applyLookPresetSelection as Command;
  const backgroundBlurProviderDescriptor = ctx.backgroundBlurProviderDescriptor as any;
  const clampImagePlacementTransform = ctx.clampImagePlacementTransform as any;
  const commitImagePlacementTransform = ctx.commitImagePlacementTransform as Command;
  const commitVisualAnchorRefinement = ctx.commitVisualAnchorRefinement as Command;
  const commitVisualPlacementWindow = ctx.commitVisualPlacementWindow as Command;
  const DEFAULT_IMAGE_PLACEMENT_TRANSFORM = ctx.DEFAULT_IMAGE_PLACEMENT_TRANSFORM as any;
  const MIN_IMAGE_PLACEMENT_DURATION_SEC = ctx.MIN_IMAGE_PLACEMENT_DURATION_SEC as any;
  const removeVisualPlacement = ctx.removeVisualPlacement as Command;
  const roundToTenth = ctx.roundToTenth as any;
  const SEGMENTATION_PROVIDER_DESCRIPTORS = ctx.SEGMENTATION_PROVIDER_DESCRIPTORS as any;
  const imagePlacementSnapshot = ctx["selected" + "ImagePlacement"] as any;
  const imagePlacementSnapshotTransform = ctx.selectedImagePlacementTransform as any;
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
  const selectedVisualAnchorSegment = ctx.selectedVisualAnchorSegment as any;
  const selectedVisualAnchorSegmentId = ctx.selectedVisualAnchorSegmentId as any;
  const selectedVisualClip = ctx.selectedVisualClip as any;
  const setAnchorLabelDraft = ctx.setAnchorLabelDraft as any;
  const setAnchorTextDraft = ctx.setAnchorTextDraft as any;
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
  const sourceImageLibraryItems = ctx.sourceImageLibraryItems as any;
  const selectedBackgroundReplacementAssetId = ctx.selectedBackgroundReplacementAssetId as string | null;
  const visualBackgroundReplaceImageAssetPath = ctx.visualBackgroundReplaceImageAssetPath as string | null;
  const handleSourceDeskUpload = ctx.handleSourceDeskUpload as ((category: "images" | "broll" | "introoutro", fileList: FileList | null) => Promise<void>) | undefined;
  const uploadingCategory = ctx.uploadingCategory as ("images" | "broll" | "introoutro" | null);
  const updateImagePlacementTransform = ctx.updateImagePlacementTransform as any;
  const updateVisualPlacementTiming = ctx.updateVisualPlacementTiming as any;
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
  const setFocusOverride = ctx.setFocusOverride as (mode: "auto" | "source-focus" | "tool-focus" | "time-focus") => void;
  const selectedPlacementId = imagePlacementSnapshot?.id ?? null;
  const selectedOverlayAssetPresent = Boolean(imagePlacementSnapshot?.assetPath);
  const selectedVisualAssetPresent = Boolean(selectedVisualClip?.asset_id);
  const selectedClipPresent = Boolean(selectedVisualClip?.clip_id);
  const previewAutoPositionDisabledReason = !imagePlacementSnapshot ? "No selected image placement." : !selectedOverlayAssetPresent && !selectedVisualAssetPresent ? "Selected placement has no visual asset." : !previewAutoPosition ? "Automatic placement action unavailable (not wired)." : null;
  const resetPreviewPositionDisabledReason = !imagePlacementSnapshot ? "No selected image placement." : !selectedAutoPreviewActive ? "No active auto preview override." : !resetPreviewAutoPosition ? "Reset action unavailable." : null;
  const devBlurControlsEnabled = isDevBlurControlsEnabled();
  return <div data-hammer-tool-bay-surface={surface}>
    {surface === "visual_polish" ? (
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
                ) : (
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
                    {imagePlacementSnapshot ? (
                      <>
                        <div className="hammer-tool-hint">
                          Selected: {imagePlacementSnapshot.label}
                          {` (${imagePlacementSnapshot.startSec.toFixed(1)}s - ${imagePlacementSnapshot.endSec.toFixed(1)}s)`}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Start (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={imagePlacementSnapshot.startSec}
                            onChange={(event) => {
                              const nextStart = Math.max(0, Number(event.target.value) || 0);
                              const minEnd = roundToTenth(nextStart + MIN_IMAGE_PLACEMENT_DURATION_SEC);
                              commitVisualPlacementWindow(imagePlacementSnapshot.id, {
                                startSec: nextStart,
                                endSec: Math.max(minEnd, imagePlacementSnapshot.endSec),
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
                            value={imagePlacementSnapshot.endSec}
                            onChange={(event) => {
                              const nextEnd = Math.max(0, Number(event.target.value) || 0);
                              commitVisualPlacementWindow(imagePlacementSnapshot.id, {
                                startSec: imagePlacementSnapshot.startSec,
                                endSec: Math.max(
                                  roundToTenth(imagePlacementSnapshot.startSec + MIN_IMAGE_PLACEMENT_DURATION_SEC),
                                  nextEnd,
                                ),
                                label: "Adjust image clip end",
                              });
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button type="button" onClick={() => updateVisualPlacementTiming(imagePlacementSnapshot.id, -0.5)}>
                            Move -0.5s
                          </button>
                          <button type="button" onClick={() => updateVisualPlacementTiming(imagePlacementSnapshot.id, 0.5)}>
                            Move +0.5s
                          </button>
                          <button type="button" onClick={() => removeVisualPlacement(imagePlacementSnapshot.id)}>
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
                              clipId: imagePlacementSnapshot.id,
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
                              clipId: imagePlacementSnapshot.id,
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
                          <span>Position X ({Math.round(imagePlacementSnapshotTransform.leftPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={imagePlacementSnapshotTransform.leftPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...imagePlacementSnapshotTransform,
                                leftPct: next,
                              });
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => updated);
                              commitImagePlacementTransform(imagePlacementSnapshot.id, updated, "Adjust visual overlay X");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Position Y ({Math.round(imagePlacementSnapshotTransform.topPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={imagePlacementSnapshotTransform.topPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...imagePlacementSnapshotTransform,
                                topPct: next,
                              });
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => updated);
                              commitImagePlacementTransform(imagePlacementSnapshot.id, updated, "Adjust visual overlay Y");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>
                            Scale ({Math.round((imagePlacementSnapshotTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}%)
                          </span>
                          <input
                            type="range"
                            min={50}
                            max={200}
                            step={1}
                            value={Math.round((imagePlacementSnapshotTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}
                            onChange={(event) => {
                              const scale = Number(event.target.value) / 100;
                              const updated = clampImagePlacementTransform({
                                ...imagePlacementSnapshotTransform,
                                widthPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct * scale,
                                heightPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct * scale,
                              });
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => updated);
                              commitImagePlacementTransform(imagePlacementSnapshot.id, updated, "Adjust visual overlay scale");
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => DEFAULT_IMAGE_PLACEMENT_TRANSFORM);
                              commitImagePlacementTransform(
                                imagePlacementSnapshot.id,
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
                )}
  </div>;
}


