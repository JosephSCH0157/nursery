import type { JSX } from "react";
import type { HammerVisualPolishToolBayContext } from "./hammerToolBayContext";
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

export function HammerTypedVisualPolishSurface(props: { context: HammerVisualPolishToolBayContext }): JSX.Element {
  const surface = props.context.surface;
  const { segmentationProviderDescriptors: SEGMENTATION_PROVIDER_DESCRIPTORS, ...data } = props.context.data;
  const {
    activeExposureAdjustment, activeLookPreset, backgroundBlurProviderDescriptor, sourceImageLibraryItems,
    selectedBackgroundReplacementAssetId, uploadingCategory, visualBackgroundBlur, visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode, visualBackgroundMaskPreviewStage, visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx, visualBackgroundBlurSubjectExpansionPx, visualBackgroundBlurPx,
    visualBackgroundBlurQualityMode, visualBackgroundBlurRuntimeStatus, visualBackgroundBlurStatusSummary,
    visualBackgroundBlurTemporalSmoothing, visualBackgroundReplaceColor, visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageAssetPath, visualBackgroundReplaceImageUrl, visualBackgroundReplaceMode,
    visualBackgroundWashDesaturateAmount, visualBackgroundWashDimAmount, visualBackgroundWashEnabled,
    visualColorAmount, visualEyeContactAssistDebugOverlay, visualEyeContactAssistEnabled,
    visualEyeContactAssistRuntimeStatus, visualEyeContactAssistStatusSummary, visualEyeContactAssistStrength,
    visualWhiteBalance,
  } = data;
  const {
    applyExposureAdjustment, applyLookPresetSelection, handleSourceDeskUpload, setFocusOverride,
    setVisualBackgroundBlur, setVisualBackgroundBlurDebugMask, setVisualBackgroundMaskPreviewMode,
    setVisualBackgroundMaskPreviewStage, setVisualBackgroundBlurFallbackMode, setVisualBackgroundBlurFeatherPx,
    setVisualBackgroundBlurSubjectExpansionPx, setVisualBackgroundBlurProviderId, setVisualBackgroundBlurPx,
    setVisualBackgroundBlurQualityMode, setVisualBackgroundBlurRuntimeStatus, setVisualBackgroundBlurTemporalSmoothing,
    setVisualBackgroundReplaceColor, setVisualBackgroundReplaceEnabled, setVisualBackgroundReplaceImageAssetPath,
    setVisualBackgroundReplaceImageUrl, setVisualBackgroundReplaceMode, setVisualBackgroundWashDesaturateAmount,
    setVisualBackgroundWashDimAmount, setVisualBackgroundWashEnabled, setVisualColorAmount,
    setVisualEyeContactAssistDebugOverlay, setVisualEyeContactAssistEnabled, setVisualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistStrength, setVisualWhiteBalance,
  } = props.context.commands;
  const devBlurControlsEnabled = isDevBlurControlsEnabled();
  return <div data-hammer-tool-bay-surface={surface}>
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
                            {sourceImageLibraryItems.map((item) => (
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
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor) => (
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
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor) => (
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
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor) => (
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
                                  setVisualBackgroundMaskPreviewStage(event.target.value as typeof visualBackgroundMaskPreviewStage);
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
  </div>;
}
