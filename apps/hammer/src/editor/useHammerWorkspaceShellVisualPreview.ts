import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { HammerPersistedVisualPreviewSettings } from "../persistence/hammerPersistenceContract";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import type { HammerBackgroundBlurRuntimeStatus } from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import type { HammerEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import { summarizeBackgroundEffectRuntimeStatus } from "../features/visual-effects/render/backgroundEffectStatusSummary";
import { summarizeEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistStatusSummary";
import { resolveSegmentationProviderDescriptor } from "../features/visual-effects/providers/segmentationProviderRegistry";
import { normalizeVisualPreviewSettings } from "./hammerWorkspaceShellStateAdapters";
import type { HammerVisualLutPreset } from "./hammerWorkspaceShellCore";
import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import { createApplyExposureInstruction, createApplyLookInstruction, setAuthorityOperationLifecycle } from "./hammerAuthorityOps";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";

/**
 * Visual-preview authority projects existing visual settings into preview. It does not own
 * timeline placement, automatic placement, Source Desk orchestration, canonical media
 * selection, or release rendering.
 */

export function createHammerVisualLookExposureCommands(args: {
  activeLookPreset: HammerVisualLutPreset | null;
  activeExposureAdjustment: number | null;
  applyHistoryMutation: (mutation: HammerHistoryMutationArgs) => HammerHistoryEntry | null;
  appendAuthorityInstruction: (state: HammerEditorStateSerializable, instruction: HammerEditInstruction) =>
    HammerEditorStateSerializable["editorialAuthorityGraph"];
}) {
  const applyLookPresetSelection = (preset: HammerVisualLutPreset | "neutral"): void => {
    if ((args.activeLookPreset ?? "neutral") === preset) return;
    args.applyHistoryMutation({
      label: preset === "neutral" ? "Clear look preset" : `Apply ${preset.replace(/_/g, " ")} look`,
      kind: "editor_state_change", toolId: "video", immediatePersist: true,
      computeAfter: (before) => {
        let graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        for (const operation of graph.operations) {
          if (operation.lifecycle !== "active" || operation.instruction.type !== "apply_look") continue;
          graph = setAuthorityOperationLifecycle({ graph, operationId: operation.operation_id, lifecycle: "superseded" }) ?? graph;
        }
        if (preset === "neutral") return { ...before, editorialAuthorityGraph: graph };
        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) return { ...before, editorialAuthorityGraph: graph };
        const instruction = createApplyLookInstruction({ segmentId: segment.segment_id, preset });
        return { ...before, editorialAuthorityGraph: args.appendAuthorityInstruction(
          { ...before, editorialAuthorityGraph: graph }, instruction,
        ) };
      },
    });
  };
  const applyExposureAdjustment = (nextExposure: number): void => {
    const normalizedExposure = Math.max(-100, Math.min(100, Math.round(nextExposure)));
    if ((args.activeExposureAdjustment ?? 0) === normalizedExposure) return;
    args.applyHistoryMutation({
      label: normalizedExposure === 0 ? "Reset exposure"
        : `Set exposure to ${normalizedExposure > 0 ? "+" : ""}${normalizedExposure}`,
      kind: "editor_state_change", toolId: "video", immediatePersist: true,
      computeAfter: (before) => {
        let graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        for (const operation of graph.operations) {
          if (operation.lifecycle !== "active" || operation.instruction.type !== "apply_exposure") continue;
          graph = setAuthorityOperationLifecycle({ graph, operationId: operation.operation_id, lifecycle: "superseded" }) ?? graph;
        }
        if (normalizedExposure === 0) return { ...before, editorialAuthorityGraph: graph };
        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) return { ...before, editorialAuthorityGraph: graph };
        const instruction = createApplyExposureInstruction({ segmentId: segment.segment_id, exposure: normalizedExposure });
        return { ...before, editorialAuthorityGraph: args.appendAuthorityInstruction(
          { ...before, editorialAuthorityGraph: graph }, instruction,
        ) };
      },
    });
  };
  return { applyLookPresetSelection, applyExposureAdjustment };
}

export function resolveHammerVisualPresetFilter(preset: HammerVisualLutPreset): string {
  switch (preset) {
    case "clean_daylight": return "contrast(1.03) saturate(1.05)";
    case "warm_studio": return "sepia(0.08) saturate(1.08)";
    case "cool_evening": return "hue-rotate(-8deg) saturate(0.95) contrast(1.02)";
    case "high_contrast": return "contrast(1.12) saturate(1.04)";
    case "soft_documentary": return "brightness(1.02) contrast(0.96) saturate(0.92)";
    case "neutral":
    default: return "none";
  }
}

export function buildHammerVisualPreviewFilter(args: {
  lookPreset: HammerVisualLutPreset | null;
  exposureAdjustment: number | null;
  whiteBalance: number;
  colorAmount: number;
}): string {
  const base = resolveHammerVisualPresetFilter(args.lookPreset ?? "neutral");
  const exposureBoost = 1 + ((args.exposureAdjustment ?? 0) / 100) * 0.35;
  const temperatureShift = args.whiteBalance / 3;
  const colorBoost = 1 + (args.colorAmount / 100) * 0.25;
  return [
    base !== "none" ? base : "",
    `brightness(${exposureBoost.toFixed(2)})`,
    `hue-rotate(${temperatureShift.toFixed(1)}deg)`,
    `saturate(${colorBoost.toFixed(2)})`,
  ].filter(Boolean).join(" ");
}

export function buildHammerBackgroundBlurSettings(args: {
  enabled: boolean; blurPx: number; replacementEnabled: boolean;
  replacementMode: "solid" | "image" | "checkerboard"; replacementColor: string;
  replacementImageUrl: string; washEnabled: boolean; washDimAmount: number;
  washDesaturateAmount: number; edgeFeatherPx: number; temporalSmoothing: number;
  subjectExpansionPx: number; qualityMode: BackgroundBlurSettings["qualityMode"];
  fallbackMode: BackgroundBlurSettings["fallbackMode"];
}): BackgroundBlurSettings {
  return {
    enabled: args.enabled,
    blurPx: Math.max(0, Math.min(64, Number(args.blurPx) || 0)),
    replacementEnabled: args.replacementEnabled,
    replacementMode: args.replacementMode,
    replacementColor: args.replacementColor,
    replacementImageUrl: args.replacementImageUrl.trim() ? args.replacementImageUrl.trim() : null,
    washEnabled: args.washEnabled,
    washDimAmount: Math.max(0, Math.min(1, Number(args.washDimAmount) || 0)),
    washDesaturateAmount: Math.max(0, Math.min(1, Number(args.washDesaturateAmount) || 0)),
    edgeFeatherPx: Math.max(0, Math.min(64, Number(args.edgeFeatherPx) || 0)),
    temporalSmoothing: Math.max(0, Math.min(1, Number(args.temporalSmoothing) || 0)),
    subjectExpansionPx: Math.max(-12, Math.min(12, Number(args.subjectExpansionPx) || 0)),
    qualityMode: args.qualityMode,
    fallbackMode: args.fallbackMode,
  };
}

export function useHammerVisualPreviewState(initialSettings: HammerPersistedVisualPreviewSettings | null | undefined) {
  const initial = normalizeVisualPreviewSettings(initialSettings);
  const [visualWhiteBalance, setVisualWhiteBalance] = useState(initial.white_balance);
  const [visualColorAmount, setVisualColorAmount] = useState(initial.color_amount);
  const [visualEyeContactAssistEnabled, setVisualEyeContactAssistEnabled] = useState(Boolean(initial.eye_contact_assist_enabled ?? false));
  const [visualEyeContactAssistStrength, setVisualEyeContactAssistStrength] = useState(Number(initial.eye_contact_assist_strength ?? 0.25));
  const [visualBackgroundBlur, setVisualBackgroundBlur] = useState(initial.background_blur);
  const [visualBackgroundBlurPx, setVisualBackgroundBlurPx] = useState(Number(initial.background_blur_px ?? 14));
  const [visualBackgroundBlurFeatherPx, setVisualBackgroundBlurFeatherPx] = useState(Number(initial.background_blur_feather_px ?? 3));
  const [visualBackgroundBlurTemporalSmoothing, setVisualBackgroundBlurTemporalSmoothing] = useState(Number(initial.background_blur_temporal_smoothing ?? 0.25));
  const [visualBackgroundBlurSubjectExpansionPx, setVisualBackgroundBlurSubjectExpansionPx] = useState(Number(initial.background_blur_subject_expansion_px ?? 5));
  const [visualBackgroundBlurQualityMode, setVisualBackgroundBlurQualityMode] = useState<BackgroundBlurSettings["qualityMode"]>((initial.background_blur_quality_mode as BackgroundBlurSettings["qualityMode"]) ?? "medium");
  const [visualBackgroundBlurFallbackMode, setVisualBackgroundBlurFallbackMode] = useState<BackgroundBlurSettings["fallbackMode"]>((initial.background_blur_fallback_mode as BackgroundBlurSettings["fallbackMode"]) ?? "disable");
  const [visualBackgroundBlurProviderId, setVisualBackgroundBlurProviderId] = useState<string | null>(typeof initial.background_blur_provider === "string" ? initial.background_blur_provider : "mediapipe_selfie_segmentation");
  const [visualBackgroundReplaceEnabled, setVisualBackgroundReplaceEnabled] = useState(Boolean(initial.background_replace_enabled ?? false));
  const [visualBackgroundReplaceMode, setVisualBackgroundReplaceMode] = useState<"solid" | "image" | "checkerboard">(initial.background_replace_mode === "image" ? "image" : initial.background_replace_mode === "checkerboard" ? "checkerboard" : "solid");
  const [visualBackgroundReplaceColor, setVisualBackgroundReplaceColor] = useState(String(initial.background_replace_color ?? "#2b2b2b"));
  const [visualBackgroundReplaceImageUrl, setVisualBackgroundReplaceImageUrl] = useState(String(initial.background_replace_image_url ?? ""));
  const [visualBackgroundReplaceImageAssetPath, setVisualBackgroundReplaceImageAssetPath] = useState<string | null>(typeof initial.background_replace_image_asset_path === "string" ? initial.background_replace_image_asset_path : null); const [visualBackgroundReplaceImageAssetId, setVisualBackgroundReplaceImageAssetId] = useState<string | null>(typeof initial.background_replace_image_asset_id === "string" ? initial.background_replace_image_asset_id : null);
  const [visualBackgroundWashEnabled, setVisualBackgroundWashEnabled] = useState(Boolean(initial.background_wash_enabled ?? false));
  const [visualBackgroundWashDimAmount, setVisualBackgroundWashDimAmount] = useState(Number(initial.background_wash_dim_amount ?? 0.35));
  const [visualBackgroundWashDesaturateAmount, setVisualBackgroundWashDesaturateAmount] = useState(Number(initial.background_wash_desaturate_amount ?? 0.25));
  const [visualBackgroundBlurDebugMask, setVisualBackgroundBlurDebugMask] = useState(false);
  const [visualBackgroundMaskPreviewMode, setVisualBackgroundMaskPreviewMode] = useState(false);
  const [visualBackgroundMaskPreviewStage, setVisualBackgroundMaskPreviewStage] = useState<"raw" | "expanded" | "feathered" | "refined" | "final_composite">("raw");
  const [visualEyeContactAssistDebugOverlay, setVisualEyeContactAssistDebugOverlay] = useState(false);
  const visualBackgroundEffectCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const applyHydratedVisualPreviewSettings = useCallback((settings: HammerPersistedVisualPreviewSettings) => {
    const next = normalizeVisualPreviewSettings(settings);
    setVisualWhiteBalance(next.white_balance); setVisualColorAmount(next.color_amount);
    setVisualEyeContactAssistEnabled(Boolean(next.eye_contact_assist_enabled ?? false));
    setVisualEyeContactAssistStrength(Math.max(0, Math.min(1, Number(next.eye_contact_assist_strength ?? 0.25))));
    setVisualBackgroundBlur(next.background_blur); setVisualBackgroundBlurPx(Number(next.background_blur_px ?? 14));
    setVisualBackgroundBlurFeatherPx(Number(next.background_blur_feather_px ?? 3));
    setVisualBackgroundBlurTemporalSmoothing(Number(next.background_blur_temporal_smoothing ?? 0.25));
    setVisualBackgroundBlurSubjectExpansionPx(Number(next.background_blur_subject_expansion_px ?? 5));
    setVisualBackgroundBlurQualityMode((next.background_blur_quality_mode as BackgroundBlurSettings["qualityMode"]) ?? "medium");
    setVisualBackgroundBlurFallbackMode((next.background_blur_fallback_mode as BackgroundBlurSettings["fallbackMode"]) ?? "disable");
    setVisualBackgroundBlurProviderId(typeof next.background_blur_provider === "string" ? next.background_blur_provider : "mediapipe_selfie_segmentation");
    setVisualBackgroundReplaceEnabled(Boolean(next.background_replace_enabled ?? false));
    setVisualBackgroundReplaceMode(next.background_replace_mode === "image" ? "image" : next.background_replace_mode === "checkerboard" ? "checkerboard" : "solid");
    setVisualBackgroundReplaceColor(String(next.background_replace_color ?? "#2b2b2b"));
    setVisualBackgroundReplaceImageUrl(String(next.background_replace_image_url ?? ""));
    setVisualBackgroundReplaceImageAssetPath(typeof next.background_replace_image_asset_path === "string" ? next.background_replace_image_asset_path : null); setVisualBackgroundReplaceImageAssetId(typeof next.background_replace_image_asset_id === "string" ? next.background_replace_image_asset_id : null);
    setVisualBackgroundWashEnabled(Boolean(next.background_wash_enabled ?? false));
    setVisualBackgroundWashDimAmount(Number(next.background_wash_dim_amount ?? 0.35));
    setVisualBackgroundWashDesaturateAmount(Number(next.background_wash_desaturate_amount ?? 0.25));
  }, []);

  return { visualWhiteBalance, setVisualWhiteBalance, visualColorAmount, setVisualColorAmount,
    visualEyeContactAssistEnabled, setVisualEyeContactAssistEnabled, visualEyeContactAssistStrength, setVisualEyeContactAssistStrength,
    visualBackgroundBlur, setVisualBackgroundBlur, visualBackgroundBlurPx, setVisualBackgroundBlurPx,
    visualBackgroundBlurFeatherPx, setVisualBackgroundBlurFeatherPx, visualBackgroundBlurTemporalSmoothing, setVisualBackgroundBlurTemporalSmoothing,
    visualBackgroundBlurSubjectExpansionPx, setVisualBackgroundBlurSubjectExpansionPx, visualBackgroundBlurQualityMode, setVisualBackgroundBlurQualityMode,
    visualBackgroundBlurFallbackMode, setVisualBackgroundBlurFallbackMode, visualBackgroundBlurProviderId, setVisualBackgroundBlurProviderId,
    visualBackgroundReplaceEnabled, setVisualBackgroundReplaceEnabled, visualBackgroundReplaceMode, setVisualBackgroundReplaceMode,
    visualBackgroundReplaceColor, setVisualBackgroundReplaceColor, visualBackgroundReplaceImageUrl, setVisualBackgroundReplaceImageUrl,
    visualBackgroundReplaceImageAssetPath, setVisualBackgroundReplaceImageAssetPath, visualBackgroundReplaceImageAssetId, setVisualBackgroundReplaceImageAssetId, visualBackgroundWashEnabled, setVisualBackgroundWashEnabled,
    visualBackgroundWashDimAmount, setVisualBackgroundWashDimAmount, visualBackgroundWashDesaturateAmount, setVisualBackgroundWashDesaturateAmount,
    visualBackgroundBlurDebugMask, setVisualBackgroundBlurDebugMask, visualBackgroundMaskPreviewMode, setVisualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage, setVisualBackgroundMaskPreviewStage, visualEyeContactAssistDebugOverlay, setVisualEyeContactAssistDebugOverlay,
    visualBackgroundEffectCanvasRef, applyHydratedVisualPreviewSettings };
}

export function useHammerVisualPreviewProjection(args: Parameters<typeof buildHammerVisualPreviewFilter>[0]) {
  const { colorAmount, exposureAdjustment, lookPreset, whiteBalance } = args;
  return useMemo(() => buildHammerVisualPreviewFilter({ colorAmount, exposureAdjustment, lookPreset, whiteBalance }), [colorAmount, exposureAdjustment, lookPreset, whiteBalance]);
}

export function useHammerBackgroundBlurProjection(args: Parameters<typeof buildHammerBackgroundBlurSettings>[0]) {
  const { enabled, blurPx, replacementEnabled, replacementMode, replacementColor, replacementImageUrl, washEnabled, washDimAmount, washDesaturateAmount, edgeFeatherPx, temporalSmoothing, subjectExpansionPx, qualityMode, fallbackMode } = args;
  const settings = useMemo(() => buildHammerBackgroundBlurSettings({ enabled, blurPx, replacementEnabled, replacementMode, replacementColor, replacementImageUrl, washEnabled, washDimAmount, washDesaturateAmount, edgeFeatherPx, temporalSmoothing, subjectExpansionPx, qualityMode, fallbackMode }), [enabled, blurPx, replacementEnabled, replacementMode, replacementColor, replacementImageUrl, washEnabled, washDimAmount, washDesaturateAmount, edgeFeatherPx, temporalSmoothing, subjectExpansionPx, qualityMode, fallbackMode]);
  const [previewSettings, setPreviewSettings] = useState(settings);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (frameRef.current != null) { window.cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      timerRef.current = window.setTimeout(() => { timerRef.current = null; setPreviewSettings(settings); }, 48);
    });
    return () => {
      if (frameRef.current != null) { window.cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [settings]);
  return { backgroundBlurSettings: settings, previewBackgroundBlurSettings: previewSettings };
}

export function useHammerVisualPreviewRuntimeState() {
  const [visualBackgroundBlurRuntimeStatus, setVisualBackgroundBlurRuntimeStatus] = useState<HammerBackgroundBlurRuntimeStatus | null>(null);
  const [visualEyeContactAssistRuntimeStatus, setVisualEyeContactAssistRuntimeStatus] = useState<HammerEyeContactAssistRuntimeStatus | null>(null);
  return { visualBackgroundBlurRuntimeStatus, setVisualBackgroundBlurRuntimeStatus, visualEyeContactAssistRuntimeStatus, setVisualEyeContactAssistRuntimeStatus };
}

export function useHammerVisualPreviewRuntimeDerived(args: {
  blurEnabled: boolean; replacementEnabled: boolean; washEnabled: boolean;
  providerId: string | null; debugMask: boolean; fallbackMode: BackgroundBlurSettings["fallbackMode"];
  blurStatus: HammerBackgroundBlurRuntimeStatus | null;
  eyeContactDebugOverlay: boolean; eyeContactStatus: HammerEyeContactAssistRuntimeStatus | null;
}) {
  const provider = useMemo(() => resolveSegmentationProviderDescriptor(args.providerId) ?? resolveSegmentationProviderDescriptor("mediapipe_selfie_segmentation"), [args.providerId]);
  const visualBackgroundBlurStatusSummary = useMemo(() => args.blurStatus ? summarizeBackgroundEffectRuntimeStatus({ status: args.blurStatus, providerLabel: provider?.displayName ?? null, showDebugDetails: args.debugMask }) : null, [args.blurStatus, args.debugMask, provider]);
  const eyeContactUseBackgroundCanvasAsSource = useMemo(() => {
    if (!(args.blurEnabled || args.replacementEnabled || args.washEnabled) || !args.blurStatus) return false;
    return args.fallbackMode === "passthrough" || args.blurStatus.degradedReason == null;
  }, [args.blurEnabled, args.replacementEnabled, args.washEnabled, args.blurStatus, args.fallbackMode]);
  const visualEyeContactAssistStatusSummary = useMemo(() => args.eyeContactStatus ? summarizeEyeContactAssistRuntimeStatus({ status: args.eyeContactStatus, showDebugDetails: args.eyeContactDebugOverlay }) : null, [args.eyeContactStatus, args.eyeContactDebugOverlay]);
  return { visualBackgroundBlurStatusSummary, eyeContactUseBackgroundCanvasAsSource, visualEyeContactAssistStatusSummary };
}

export type HammerVisualRuntimeStatusSetter = Dispatch<SetStateAction<HammerBackgroundBlurRuntimeStatus | null>>;
