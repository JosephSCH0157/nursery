import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackgroundBlurSettings,
  ForegroundMatte,
  SegmentationProviderReadiness,
} from "../types";
import { SimpleMatteRefiner } from "../matte/simpleMatteRefiner";
import { BackgroundBlurRenderer } from "../effects/backgroundBlurRenderer";
import { BackgroundReplacementRenderer } from "../effects/backgroundReplacementRenderer";
import { BackgroundWashRenderer } from "../effects/backgroundWashRenderer";
import { drawSourceContained } from "../effects/mediaFrameGeometry";
import { resolveVisualPreviewQualityPolicy } from "./previewQualityPolicy";
import type { Rect as AutoPlacementRect } from "../../auto-placement/types";
import { extractSpeakerMaskBoundsFromMatte } from "../../auto-placement/speakerMaskAnalysis";
import type { FrameBoundPlacementMatteResult } from "../../auto-placement/canonicalPlacementAuthority";
import type { FaceAnalysisFrame } from "../../eye-contact-assist/types";
import { LatestOwnedAnalysisFrameQueue } from "../../eye-contact-assist/analysis/ownedAnalysisFrameQueue";
import type { PlacementFrameAnalysisAuthority } from "../../auto-placement/placementFrameAnalysisAuthority";
import { resolveCanvasBackingScale, resolveMatteControlScale } from "./visualEffectCssSpace";
import { HammerPreviewRuntime, resolvePreviewAnalysisSize, resolvePreviewBackingSize } from "./hammerPreviewRuntime";

export type HammerBackgroundBlurRuntimeStatus = {
  provider: {
    name: string;
    readiness: SegmentationProviderReadiness;
  };
  quality: {
    mode: BackgroundBlurSettings["qualityMode"];
    policy: {
      maxSegmentationFps: number;
      maxAnalysisLongEdgePx: number;
      edgeFeatherCapPx: number;
      subjectExpansionCapPx: number;
      temporalSmoothingCap: number;
    };
  };
  initMs: number | null;
  avgSegmentationMs: number | null;
  maxSegmentationMs: number | null;
  avgCompositeMs: number | null;
  lastSegmentationMs: number | null;
  lastCompositeMs: number | null;
  lastConfidence: number | null;
  droppedFrames: number;
  skippedSegmentationFrames: number;
  reusedMaskFrames: number;
  effectiveSegmentationFps: number | null;
  effectiveCompositeFps: number | null;
  lastMaskAgeMs: number | null;
  runtime?: {
    scheduler: "request_video_frame_callback" | "request_animation_frame" | "idle";
    sourceRevision: string | null;
    segmentationAttempted: number;
    segmentationCompleted: number;
    segmentationFailed: number;
    segmentationSuperseded: number;
    pendingJobs: 0 | 1;
    analysisResolution: { width: number; height: number } | null;
    backingResolution: { width: number; height: number } | null;
  };
  degradedReason: string | null;
  warnings: string[];
  mask: {
    status: "ok" | "missing" | "rejected";
    reason: string | null;
    providerStatus: "loaded" | "failed" | "pending";
    providerSource: "primary" | "secondary" | "none";
    resolution: { width: number; height: number } | null;
    confidence: number | null;
    generationMs: number | null;
    speakerMaskBounds?: AutoPlacementRect[];
  };
  frameInput: {
    width: number;
    height: number;
    format: "htmlvideoelement";
  } | null;
  statusMessage: string | null;
  debug?: {
    rawMaskDataUrl: string | null;
    expandedMaskDataUrl: string | null;
    featheredMaskDataUrl: string | null;
    refinedMaskDataUrl: string | null;
    matteDataUrl: string | null;
    finalCompositeDataUrl: string | null;
  };
};

const DISPLAY_MAX_FPS = 30;
const MASK_FRESH_MAX_AGE_MS = 750;
const MASK_UNAVAILABLE_MAX_AGE_MS = 2_000;
const STATUS_DEBOUNCE_MS = 250;
const DEGRADE_STICKY_MS = 360;
const SEGMENTATION_LOG_MIN_GAP_MS = 1200;

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveProviderStatus(readiness: SegmentationProviderReadiness): "loaded" | "failed" | "pending" {
  if (readiness.status === "ready") return "loaded";
  if (readiness.status === "failed") return "failed";
  return "pending";
}

function resolveRuntimeStatusMessage(args: {
  providerReadiness: SegmentationProviderReadiness;
  degradedReason: string | null;
}): string | null {
  if (args.providerReadiness.status === "failed") {
    return args.providerReadiness.error
      ? `Segmentation provider failed to initialize: ${args.providerReadiness.error}`
      : "Segmentation provider failed to initialize.";
  }
  switch (args.degradedReason) {
    case "missing_video_or_canvas":
      return "Segmentation unavailable: active video surface is not mounted.";
    case "video_not_ready":
      return "Segmentation waiting for a decoded active frame.";
    case "invalid_frame_dimensions":
      return "Segmentation unavailable: active frame dimensions are not ready.";
    case "provider_error":
      return "Segmentation failed while processing the active frame.";
    case "segmentation_unavailable":
      return "Segmentation unavailable for the current active frame.";
    default:
      return null;
  }
}

function drawPassthroughFrame(args: { source: HTMLVideoElement; output: HTMLCanvasElement }): void {
  const ctx = args.output.getContext("2d");
  if (!ctx) return;
  drawSourceContained({
    ctx,
    source: args.source,
    destWidth: args.output.width,
    destHeight: args.output.height,
  });
}

function isSegmentationMaskValid(mask: Uint8ClampedArray | null | undefined, width: number, height: number): boolean {
  if (!mask) return false;
  if (width <= 0 || height <= 0) return false;
  return mask.length === (width * height);
}

function logSegmentationDiagnostics(args: {
  providerName: string;
  providerStatus: "loaded" | "failed" | "pending";
  providerSource: "primary" | "secondary" | "none";
  maskStatus: "ok" | "missing" | "rejected";
  reason: string | null;
  resolution: { width: number; height: number } | null;
  confidence: number | null;
  generationMs: number | null;
  frameInput: { width: number; height: number; format: "htmlvideoelement" } | null;
}): void {
  if (!isSegmentationFrameLogEnabled()) return;
  const now = nowMs();
  const signature = [
    args.providerName,
    args.providerStatus,
    args.providerSource,
    args.maskStatus,
    args.reason ?? "",
    args.resolution ? `${args.resolution.width}x${args.resolution.height}` : "n/a",
  ].join("|");
  if (
    lastSegmentationLogRef.signature === signature
    && (now - lastSegmentationLogRef.atMs) < SEGMENTATION_LOG_MIN_GAP_MS
  ) {
    return;
  }
  lastSegmentationLogRef.signature = signature;
  lastSegmentationLogRef.atMs = now;
  console.debug("[hammer][segmentation] frame", {
    provider: args.providerName,
    providerStatus: args.providerStatus,
    providerSource: args.providerSource,
    mask: args.maskStatus,
    reason: args.reason,
    maskResolution: args.resolution ? `${args.resolution.width}x${args.resolution.height}` : "n/a",
    confidence: args.confidence,
    maskGenerationMs: args.generationMs,
    frameInput: args.frameInput,
  });
}

const lastSegmentationLogRef: { atMs: number; signature: string | null } = {
  atMs: 0,
  signature: null,
};

function isTruthyDebugToggle(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function isSegmentationFrameLogEnabled(): boolean {
  const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  if (!isDev || typeof window === "undefined") return false;
  try {
    const search = new URLSearchParams(window.location.search ?? "");
    if (isTruthyDebugToggle(search.get("segmentation_frame_log"))) return true;
    if (isTruthyDebugToggle(search.get("hammer_segmentation_debug"))) return true;
    if (isTruthyDebugToggle(search.get("tp_dev_mode"))) return true;
  } catch {
    // ignore
  }
  return false;
}

type CachedAlphaPlane = {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
  updatedAtMs: number;
};

type CachedMatteFrame = {
  matte: ForegroundMatte;
  sourceTimeSec: number;
  generatedAtMs: number;
  providerSource: "primary" | "secondary";
  providerStatus: "loaded" | "failed" | "pending";
  segmentationMs: number;
  confidence: number;
  warnings: string[];
  resolution: { width: number; height: number };
};

function computeEffectiveRate(args: {
  windowStartedAtMs: number;
  sampleCount: number;
}): number | null {
  const elapsedMs = Math.max(0, nowMs() - args.windowStartedAtMs);
  if (elapsedMs < 120) return null;
  return roundToTenth((args.sampleCount * 1000) / elapsedMs);
}

function isMaskReusable(args: {
  cached: CachedMatteFrame | null;
  sourceTimeSec: number;
}): boolean {
  if (!args.cached) return false;
  const ageMs = nowMs() - args.cached.generatedAtMs;
  if (ageMs > MASK_UNAVAILABLE_MAX_AGE_MS) return false;
  return Number.isFinite(args.sourceTimeSec);
}

export default function BackgroundBlurPreviewLayer(props: {
  enabled: boolean;
  settings: BackgroundBlurSettings;
  providerId: string | null;
  analysisAuthority: PlacementFrameAnalysisAuthority;
  debugMasks?: boolean;
  maskPreviewMode?: boolean;
  maskPreviewStage?: "raw" | "expanded" | "feathered" | "refined" | "final_composite";
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaRevision?: string | null;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  onStatus?: (status: HammerBackgroundBlurRuntimeStatus) => void;
  analysisFrame?: FaceAnalysisFrame | null;
  onPlacementMatte?: (result: FrameBoundPlacementMatteResult) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const qualityPolicy = resolveVisualPreviewQualityPolicy(props.settings.qualityMode);
  const settingsRef = useRef(props.settings);
  const qualityPolicyRef = useRef(qualityPolicy);
  const maskPreviewModeRef = useRef(Boolean(props.maskPreviewMode));
  const maskPreviewStageRef = useRef(props.maskPreviewStage);
  settingsRef.current = props.settings;
  qualityPolicyRef.current = qualityPolicy;
  maskPreviewModeRef.current = Boolean(props.maskPreviewMode);
  maskPreviewStageRef.current = props.maskPreviewStage;
  const provider = useMemo(() => ({
    name: props.analysisAuthority.primarySegmentationName(),
    initialize: () => props.analysisAuthority.initialize(),
    getReadiness: () => props.analysisAuthority.primarySegmentationReadiness(),
  }), [props.analysisAuthority]);
  const matteRefiner = useMemo(() => new SimpleMatteRefiner(), []);
  const blurRenderer = useMemo(() => new BackgroundBlurRenderer(), []);
  const replacementRenderer = useMemo(() => new BackgroundReplacementRenderer(), []);
  const washRenderer = useMemo(() => new BackgroundWashRenderer(), []);
  const analysisFrameQueue = useMemo(() => new LatestOwnedAnalysisFrameQueue(), []);
  const onPlacementMatteRef = useRef(props.onPlacementMatte);
  const onCanvasRef = useRef(props.onCanvas);

  useEffect(() => {
    onPlacementMatteRef.current = props.onPlacementMatte;
  }, [props.onPlacementMatte]);

  useEffect(() => {
    onCanvasRef.current = props.onCanvas;
  }, [props.onCanvas]);

  useEffect(() => {
    if (!props.analysisFrame) return;
    analysisFrameQueue.offer(props.analysisFrame);
  }, [analysisFrameQueue, props.analysisFrame]);

  useEffect(() => () => {
    analysisFrameQueue.dispose();
  }, [analysisFrameQueue]);

  const inFlightRef = useRef(false);
  const pendingSegmentationRef = useRef(false);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRuntimeRef = useRef<HammerPreviewRuntime | null>(null);
  const analysisResolutionRef = useRef<{ width: number; height: number } | null>(null);
  const segmentationAttemptedRef = useRef(0);
  const segmentationCompletedRef = useRef(0);
  const segmentationFailedRef = useRef(0);
  const segmentationSupersededRef = useRef(0);
  const lastSegmentationAttemptAtMsRef = useRef<number | null>(null);
  const lastSegmentationSourceTimeSecRef = useRef<number | null>(null);
  const lastCompositeAtMsRef = useRef<number | null>(null);
  const lastCompositeSourceTimeSecRef = useRef<number | null>(null);
  const droppedFramesRef = useRef(0);
  const skippedSegmentationFramesRef = useRef(0);
  const reusedMaskFramesRef = useRef(0);
  const segmentationSampleCountRef = useRef(0);
  const compositeSampleCountRef = useRef(0);
  const sampleWindowStartedAtMsRef = useRef(nowMs());
  const consecutiveMaskFailuresRef = useRef(0);
  const degradedReasonSinceMsRef = useRef<number | null>(null);
  const lastStatusPublishAtMsRef = useRef<number>(0);
  const latestMatteFrameRef = useRef<CachedMatteFrame | null>(null);
  const initStartedAtMsRef = useRef<number | null>(null);
  const initMsRef = useRef<number | null>(null);
  const avgSegMsRef = useRef<number | null>(null);
  const maxSegMsRef = useRef<number | null>(null);
  const avgCompMsRef = useRef<number | null>(null);
  const latestRawPlaneRef = useRef<CachedAlphaPlane | null>(null);
  const latestExpandedPlaneRef = useRef<CachedAlphaPlane | null>(null);
  const latestFeatheredPlaneRef = useRef<CachedAlphaPlane | null>(null);
  const latestMattePlaneRef = useRef<CachedAlphaPlane | null>(null);
  const lastDebugEncodedAtMsRef = useRef<number | null>(null);
  const debugEncodingInFlightRef = useRef(false);
  const debugRawUrlRef = useRef<string | null>(null);
  const debugExpandedUrlRef = useRef<string | null>(null);
  const debugFeatheredUrlRef = useRef<string | null>(null);
  const debugMatteUrlRef = useRef<string | null>(null);
  const debugFinalCompositeUrlRef = useRef<string | null>(null);
  const frameTokenRef = useRef(0);

  const [runtimeStatus, setRuntimeStatus] = useState<HammerBackgroundBlurRuntimeStatus>(() => ({
    provider: { name: provider.name, readiness: provider.getReadiness() },
    quality: {
      mode: props.settings.qualityMode,
      policy: {
        maxSegmentationFps: qualityPolicy.maxSegmentationFps,
        maxAnalysisLongEdgePx: qualityPolicy.maxAnalysisLongEdgePx,
        edgeFeatherCapPx: qualityPolicy.edgeFeatherCapPx,
        subjectExpansionCapPx: qualityPolicy.subjectExpansionCapPx,
        temporalSmoothingCap: qualityPolicy.temporalSmoothingCap,
      },
    },
    initMs: null,
    avgSegmentationMs: null,
    maxSegmentationMs: null,
    avgCompositeMs: null,
    lastSegmentationMs: null,
    lastCompositeMs: null,
    lastConfidence: null,
    droppedFrames: 0,
    skippedSegmentationFrames: 0,
    reusedMaskFrames: 0,
    effectiveSegmentationFps: null,
    effectiveCompositeFps: null,
    lastMaskAgeMs: null,
    degradedReason: null,
    warnings: [],
    mask: {
      status: "missing",
      reason: "provider_pending",
      providerStatus: resolveProviderStatus(provider.getReadiness()),
      providerSource: "none",
      resolution: null,
      confidence: null,
      generationMs: null,
    },
    frameInput: null,
    statusMessage: "Segmentation unavailable – background treatment disabled",
    debug: undefined,
  }));

  // Avoid render loops if the parent passes a non-memoized callback that sets state.
  // We always invoke the latest `onStatus`, but only when `runtimeStatus` changes.
  const onStatusRef = useRef(props.onStatus);
  useEffect(() => {
    onStatusRef.current = props.onStatus;
  }, [props.onStatus]);
  useEffect(() => {
    onStatusRef.current?.(runtimeStatus);
  }, [runtimeStatus]);

  useEffect(() => {
    onCanvasRef.current?.(canvasRef.current);
    return () => {
      onCanvasRef.current?.(null);
    };
  }, []);

  async function encodePlaneToObjectUrl(args: {
    plane: CachedAlphaPlane;
    maxWidth: number;
    maxHeight: number;
  }): Promise<string | null> {
    if (typeof document === "undefined") return null;
    const { plane } = args;
    const scale = Math.min(args.maxWidth / plane.width, args.maxHeight / plane.height, 1);
    const outW = Math.max(1, Math.round(plane.width * scale));
    const outH = Math.max(1, Math.round(plane.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // Build a tiny grayscale thumbnail without iterating over full-res pixels.
    const image = ctx.createImageData(outW, outH);
    for (let y = 0; y < outH; y += 1) {
      const srcY = Math.min(plane.height - 1, Math.floor((y / outH) * plane.height));
      for (let x = 0; x < outW; x += 1) {
        const srcX = Math.min(plane.width - 1, Math.floor((x / outW) * plane.width));
        const srcIdx = (srcY * plane.width) + srcX;
        const a = plane.alpha[srcIdx] ?? 0;
        const outIdx = ((y * outW) + x) * 4;
        image.data[outIdx] = a;
        image.data[outIdx + 1] = a;
        image.data[outIdx + 2] = a;
        image.data[outIdx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async function encodeCanvasToObjectUrl(args: {
    canvas: HTMLCanvasElement;
    maxWidth: number;
    maxHeight: number;
  }): Promise<string | null> {
    if (typeof document === "undefined") return null;
    const src = args.canvas;
    if (!src.width || !src.height) return null;
    const scale = Math.min(args.maxWidth / src.width, args.maxHeight / src.height, 1);
    const outW = Math.max(1, Math.round(src.width * scale));
    const outH = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, outW, outH);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  useEffect(() => {
    if (!props.debugMasks) {
      latestRawPlaneRef.current = null;
      latestExpandedPlaneRef.current = null;
      latestFeatheredPlaneRef.current = null;
      latestMattePlaneRef.current = null;
      lastDebugEncodedAtMsRef.current = null;
      debugEncodingInFlightRef.current = false;
      if (debugRawUrlRef.current) URL.revokeObjectURL(debugRawUrlRef.current);
      if (debugExpandedUrlRef.current) URL.revokeObjectURL(debugExpandedUrlRef.current);
      if (debugFeatheredUrlRef.current) URL.revokeObjectURL(debugFeatheredUrlRef.current);
      if (debugMatteUrlRef.current) URL.revokeObjectURL(debugMatteUrlRef.current);
      if (debugFinalCompositeUrlRef.current) URL.revokeObjectURL(debugFinalCompositeUrlRef.current);
      debugRawUrlRef.current = null;
      debugExpandedUrlRef.current = null;
      debugFeatheredUrlRef.current = null;
      debugMatteUrlRef.current = null;
      debugFinalCompositeUrlRef.current = null;
      setRuntimeStatus((prev) => (prev.debug ? { ...prev, debug: undefined } : prev));
      return;
    }

    let cancelled = false;
    const intervalMs = 500; // ~2fps lane
    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (debugEncodingInFlightRef.current) return;
      const raw = latestRawPlaneRef.current;
      const expanded = latestExpandedPlaneRef.current;
      const feathered = latestFeatheredPlaneRef.current;
      const matte = latestMattePlaneRef.current;
      if (!raw || !expanded || !feathered || !matte) return;
      const newestAt = Math.max(raw.updatedAtMs, expanded.updatedAtMs, feathered.updatedAtMs, matte.updatedAtMs);
      const lastEncodedAt = lastDebugEncodedAtMsRef.current ?? 0;
      if (newestAt <= lastEncodedAt) return;

      debugEncodingInFlightRef.current = true;
      void (async () => {
        try {
          const [rawUrl, expandedUrl, featheredUrl, matteUrl, finalCompositeUrl] = await Promise.all([
            encodePlaneToObjectUrl({ plane: raw, maxWidth: 120, maxHeight: 90 }),
            encodePlaneToObjectUrl({ plane: expanded, maxWidth: 120, maxHeight: 90 }),
            encodePlaneToObjectUrl({ plane: feathered, maxWidth: 120, maxHeight: 90 }),
            encodePlaneToObjectUrl({ plane: matte, maxWidth: 120, maxHeight: 90 }),
            canvasRef.current
              ? encodeCanvasToObjectUrl({ canvas: canvasRef.current, maxWidth: 120, maxHeight: 90 })
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          if (rawUrl) {
            if (debugRawUrlRef.current) URL.revokeObjectURL(debugRawUrlRef.current);
            debugRawUrlRef.current = rawUrl;
          }
          if (expandedUrl) {
            if (debugExpandedUrlRef.current) URL.revokeObjectURL(debugExpandedUrlRef.current);
            debugExpandedUrlRef.current = expandedUrl;
          }
          if (featheredUrl) {
            if (debugFeatheredUrlRef.current) URL.revokeObjectURL(debugFeatheredUrlRef.current);
            debugFeatheredUrlRef.current = featheredUrl;
          }
          if (matteUrl) {
            if (debugMatteUrlRef.current) URL.revokeObjectURL(debugMatteUrlRef.current);
            debugMatteUrlRef.current = matteUrl;
          }
          if (finalCompositeUrl) {
            if (debugFinalCompositeUrlRef.current) URL.revokeObjectURL(debugFinalCompositeUrlRef.current);
            debugFinalCompositeUrlRef.current = finalCompositeUrl;
          }
          lastDebugEncodedAtMsRef.current = newestAt;
          setRuntimeStatus((prev) => ({
            ...prev,
            debug: {
              rawMaskDataUrl: debugRawUrlRef.current,
              expandedMaskDataUrl: debugExpandedUrlRef.current,
              featheredMaskDataUrl: debugFeatheredUrlRef.current,
              refinedMaskDataUrl: debugMatteUrlRef.current,
              matteDataUrl: debugMatteUrlRef.current,
              finalCompositeDataUrl: debugFinalCompositeUrlRef.current,
            },
          }));
        } finally {
          debugEncodingInFlightRef.current = false;
        }
      })();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [props.debugMasks]);

  useEffect(() => {
    if (!props.enabled) {
      matteRefiner.reset();
      inFlightRef.current = false;
      pendingSegmentationRef.current = false;
      lastSegmentationAttemptAtMsRef.current = null;
      lastSegmentationSourceTimeSecRef.current = null;
      lastCompositeAtMsRef.current = null;
      lastCompositeSourceTimeSecRef.current = null;
      latestMatteFrameRef.current = null;
      skippedSegmentationFramesRef.current = 0;
      reusedMaskFramesRef.current = 0;
      droppedFramesRef.current = 0;
      segmentationAttemptedRef.current = 0;
      segmentationCompletedRef.current = 0;
      segmentationFailedRef.current = 0;
      segmentationSupersededRef.current = 0;
      segmentationSampleCountRef.current = 0;
      compositeSampleCountRef.current = 0;
      maxSegMsRef.current = null;
      sampleWindowStartedAtMsRef.current = nowMs();
      consecutiveMaskFailuresRef.current = 0;
      degradedReasonSinceMsRef.current = null;
      lastStatusPublishAtMsRef.current = 0;
      frameTokenRef.current += 1;
      return;
    }
    // Keep the last matte for temporal smoothing while enabled.
  }, [matteRefiner, props.enabled, props.providerId]);

  useEffect(() => {
    if (!props.enabled) return;
    // When compositing controls change on a paused frame, force a redraw instead of
    // waiting for source time to advance.
    lastCompositeAtMsRef.current = null;
    lastCompositeSourceTimeSecRef.current = null;
    degradedReasonSinceMsRef.current = null;
    previewRuntimeRef.current?.updateCompositeSettings();
  }, [
    props.enabled,
    props.maskPreviewMode,
    props.maskPreviewStage,
    props.settings.enabled,
    props.settings.blurPx,
    props.settings.replacementEnabled,
    props.settings.replacementMode,
    props.settings.replacementColor,
    props.settings.replacementImageUrl,
    props.settings.washEnabled,
    props.settings.washDimAmount,
    props.settings.washDesaturateAmount,
    props.settings.fallbackMode,
  ]);

  useEffect(() => {
    if (!props.enabled) return;
    // Preserve the last-good matte while the changed refinement settings are analyzed.
    lastSegmentationAttemptAtMsRef.current = null;
    lastSegmentationSourceTimeSecRef.current = null;
    lastCompositeAtMsRef.current = null;
    lastCompositeSourceTimeSecRef.current = null;
    previewRuntimeRef.current?.updateMatteSettings();
  }, [
    props.enabled,
    props.providerId,
    props.settings.edgeFeatherPx,
    props.settings.temporalSmoothing,
    props.settings.subjectExpansionPx,
    props.settings.qualityMode,
  ]);

  const lastMediaRevisionRef = useRef(props.mediaRevision ?? null);
  useEffect(() => {
    const revision = props.mediaRevision ?? null;
    if (lastMediaRevisionRef.current === revision) return;
    lastMediaRevisionRef.current = revision;
    frameTokenRef.current += 1;
    matteRefiner.reset();
    latestMatteFrameRef.current = null;
    lastSegmentationAttemptAtMsRef.current = null;
    lastSegmentationSourceTimeSecRef.current = null;
    lastCompositeAtMsRef.current = null;
    lastCompositeSourceTimeSecRef.current = null;
  }, [matteRefiner, props.mediaRevision]);

  useEffect(() => {
    if (!props.enabled) return;
    void provider.initialize();
  }, [props.enabled, provider]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const { width, height } = resolvePreviewBackingSize({ cssWidth: rect.width, cssHeight: rect.height, devicePixelRatio: window.devicePixelRatio || 1 });
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      previewRuntimeRef.current?.requestFrame("control_change");
    });
    ro.observe(canvas);
    const rect = canvas.getBoundingClientRect();
    const initial = resolvePreviewBackingSize({ cssWidth: rect.width, cssHeight: rect.height, devicePixelRatio: window.devicePixelRatio || 1 });
    canvas.width = initial.width;
    canvas.height = initial.height;
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!props.enabled) return;
    let cancelled = false;

    const minCompositeGapMs = 1000 / DISPLAY_MAX_FPS;

    const computeCadenceSnapshot = () => ({
      effectiveSegmentationFps: computeEffectiveRate({
        windowStartedAtMs: sampleWindowStartedAtMsRef.current,
        sampleCount: segmentationSampleCountRef.current,
      }),
      effectiveCompositeFps: computeEffectiveRate({
        windowStartedAtMs: sampleWindowStartedAtMsRef.current,
        sampleCount: compositeSampleCountRef.current,
      }),
    });

    const shouldPublishStatus = (force = false): boolean => {
      if (force) return true;
      const now = nowMs();
      if ((now - lastStatusPublishAtMsRef.current) >= STATUS_DEBOUNCE_MS) {
        return true;
      }
      return false;
    };

    const publishStatus = (updater: (prev: HammerBackgroundBlurRuntimeStatus) => HammerBackgroundBlurRuntimeStatus, force = false): void => {
      if (!shouldPublishStatus(force)) return;
      lastStatusPublishAtMsRef.current = nowMs();
      setRuntimeStatus((prev) => updater(prev));
    };

    const runSegmentationJob = async (args: {
      source: CanvasImageSource;
      canvas: HTMLCanvasElement;
      frameInput: { width: number; height: number; format: "htmlvideoelement" };
      sourceTimeSec: number;
      frameToken: number;
      analysisFrame: FaceAnalysisFrame | null;
    }): Promise<void> => {
      if (inFlightRef.current) {
        if (pendingSegmentationRef.current) segmentationSupersededRef.current += 1;
        pendingSegmentationRef.current = true;
        skippedSegmentationFramesRef.current += 1;
        droppedFramesRef.current += 1;
        return;
      }
      inFlightRef.current = true;
      segmentationAttemptedRef.current += 1;
      const segmentStartedAt = nowMs();

      try {
        const readinessBefore = provider.getReadiness();
        if (readinessBefore.status !== "ready") {
          await provider.initialize();
        }

        let segmentationSource = args.source;
        if (!args.analysisFrame) {
          const policy = qualityPolicyRef.current;
          const size = resolvePreviewAnalysisSize({ width: args.frameInput.width, height: args.frameInput.height, maxLongEdge: policy.maxAnalysisLongEdgePx });
          const analysisCanvas = analysisCanvasRef.current ?? document.createElement("canvas");
          analysisCanvasRef.current = analysisCanvas;
          if (analysisCanvas.width !== size.width) analysisCanvas.width = size.width;
          if (analysisCanvas.height !== size.height) analysisCanvas.height = size.height;
          const analysisCtx = analysisCanvas.getContext("2d", { alpha: false });
          analysisCtx?.drawImage(args.source, 0, 0, size.width, size.height);
          analysisResolutionRef.current = size;
          segmentationSource = analysisCanvas;
        }
        const segmentation = await props.analysisAuthority.segmentDisplayedFrame({
          source: segmentationSource,
          sourcePresentationTimeSec: args.sourceTimeSec,
        });
        const seg = segmentation.result;
        const segProviderSource = segmentation.providerSource;

        if (cancelled || args.frameToken !== frameTokenRef.current) return;

        const effectiveProviderStatus = resolveProviderStatus(segmentation.providerReadiness);
        const segConfidence = Number(seg.confidenceSummary.score);
        const maskValid = isSegmentationMaskValid(seg.personMask, seg.width, seg.height);
        const allBackground = maskValid && !seg.personMask.some((alpha) => alpha > 0);
        const maskRejectedReason = !Number.isFinite(segConfidence) || (!allBackground && segConfidence < 0.05)
          ? "low_confidence"
          : null;

        if (!maskValid || maskRejectedReason) {
          consecutiveMaskFailuresRef.current += 1;
          segmentationFailedRef.current += 1;
          const missingReason = !maskValid ? "mask_unavailable" : maskRejectedReason;
          logSegmentationDiagnostics({
            providerName: segmentation.providerName,
            providerStatus: effectiveProviderStatus,
            providerSource: segProviderSource,
            maskStatus: !maskValid ? "missing" : "rejected",
            reason: missingReason,
            resolution: maskValid ? { width: seg.width, height: seg.height } : null,
            confidence: Number.isFinite(segConfidence) ? roundToTenth(segConfidence) : null,
            generationMs: seg.processingMs,
            frameInput: args.frameInput,
          });

          publishStatus((prev) => {
            const cadence = computeCadenceSnapshot();
            return {
              ...prev,
              provider: { name: provider.name, readiness: provider.getReadiness() },
              quality: {
                mode: settingsRef.current.qualityMode,
                policy: {
                  maxSegmentationFps: qualityPolicyRef.current.maxSegmentationFps,
                  maxAnalysisLongEdgePx: qualityPolicyRef.current.maxAnalysisLongEdgePx,
                  edgeFeatherCapPx: qualityPolicyRef.current.edgeFeatherCapPx,
                  subjectExpansionCapPx: qualityPolicyRef.current.subjectExpansionCapPx,
                  temporalSmoothingCap: qualityPolicyRef.current.temporalSmoothingCap,
                },
              },
              frameInput: args.frameInput,
              initMs: initMsRef.current,
              avgSegmentationMs: avgSegMsRef.current,
              maxSegmentationMs: maxSegMsRef.current,
              avgCompositeMs: avgCompMsRef.current,
              lastSegmentationMs: seg.processingMs,
              lastCompositeMs: prev.lastCompositeMs,
              lastConfidence: Number.isFinite(segConfidence) ? roundToTenth(segConfidence) : null,
              droppedFrames: droppedFramesRef.current,
              skippedSegmentationFrames: skippedSegmentationFramesRef.current,
              reusedMaskFrames: reusedMaskFramesRef.current,
              effectiveSegmentationFps: cadence.effectiveSegmentationFps,
              effectiveCompositeFps: cadence.effectiveCompositeFps,
              lastMaskAgeMs: latestMatteFrameRef.current
                ? Math.max(0, Math.round(nowMs() - latestMatteFrameRef.current.generatedAtMs))
                : null,
              degradedReason: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
                ? "reusing_recent_mask"
                : "segmentation_unavailable",
              statusMessage: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
                ? null
                : resolveRuntimeStatusMessage({
                  providerReadiness: provider.getReadiness(),
                  degradedReason: "segmentation_unavailable",
                }),
              warnings: [...new Set([...(seg.warnings ?? []), missingReason === "low_confidence" ? "Mask rejected due to low confidence." : "Segmentation mask unavailable."])],
              mask: {
                status: !maskValid ? "missing" : "rejected",
                reason: missingReason,
                providerStatus: effectiveProviderStatus,
                providerSource: segProviderSource,
                resolution: maskValid ? { width: seg.width, height: seg.height } : null,
                confidence: Number.isFinite(segConfidence) ? roundToTenth(segConfidence) : null,
                generationMs: seg.processingMs,
              },
            };
          });
          if (args.analysisFrame) {
            onPlacementMatteRef.current?.(Object.freeze({
              kind: "failed",
              frameRef: args.analysisFrame.frameRef,
              reason: missingReason ?? "segmentation_unavailable",
            }));
          }
          return;
        }

        const canvasRect = args.canvas.getBoundingClientRect();
        const matteControlScale = resolveMatteControlScale({
          maskWidth: seg.width,
          maskHeight: seg.height,
          surfaceCssWidth: canvasRect?.width ?? seg.width,
          surfaceCssHeight: canvasRect?.height ?? seg.height,
        }).maskPixelsPerCssPixel;
        const settings = settingsRef.current;
        const policy = qualityPolicyRef.current;
        const effectiveFeatherCssPx = Math.min(settings.edgeFeatherPx, policy.edgeFeatherCapPx);
        const effectiveExpansionCssPx = Math.max(
          -policy.subjectExpansionCapPx,
          Math.min(settings.subjectExpansionPx, policy.subjectExpansionCapPx),
        );
        const effectiveFeatherPx = effectiveFeatherCssPx * matteControlScale;
        const effectiveExpansionPx = effectiveExpansionCssPx * matteControlScale;
        const effectiveTemporal = Math.min(settings.temporalSmoothing, policy.temporalSmoothingCap);
        const temporalForStability = Math.max(0, Math.min(1, effectiveTemporal * 0.92));
        const matte = matteRefiner.buildMatte(seg, {
          featherPx: effectiveFeatherPx,
          subjectExpansionPx: effectiveExpansionPx,
          temporalSmoothing: temporalForStability,
          quality: settings.qualityMode,
        });

        latestMatteFrameRef.current = {
          matte,
          sourceTimeSec: args.sourceTimeSec,
          generatedAtMs: nowMs(),
          providerSource: segProviderSource,
          providerStatus: effectiveProviderStatus,
          segmentationMs: seg.processingMs,
          confidence: roundToTenth(seg.confidenceSummary.score),
          warnings: [...seg.warnings],
          resolution: { width: seg.width, height: seg.height },
        };
        if (args.analysisFrame) {
          onPlacementMatteRef.current?.(Object.freeze({
            kind: "success",
            frameRef: args.analysisFrame.frameRef,
            matte,
            speakerMaskBounds: Object.freeze(extractSpeakerMaskBoundsFromMatte({ matte })),
          }));
        }
        consecutiveMaskFailuresRef.current = 0;

        avgSegMsRef.current = avgSegMsRef.current == null
          ? seg.processingMs
          : roundToTenth((avgSegMsRef.current * 0.9) + (seg.processingMs * 0.1));
        maxSegMsRef.current = maxSegMsRef.current == null
          ? seg.processingMs
          : Math.max(maxSegMsRef.current, seg.processingMs);
        segmentationSampleCountRef.current += 1;
        segmentationCompletedRef.current += 1;

        if (props.debugMasks) {
          latestRawPlaneRef.current = {
            width: seg.width,
            height: seg.height,
            alpha: seg.personMask,
            updatedAtMs: nowMs(),
          };
          const expanded = matte.metadata.debugPlanes?.expandedAlphaMask;
          const feathered = matte.metadata.debugPlanes?.featheredAlphaMask;
          if (expanded) {
            latestExpandedPlaneRef.current = {
              width: matte.width,
              height: matte.height,
              alpha: expanded,
              updatedAtMs: nowMs(),
            };
          }
          if (feathered) {
            latestFeatheredPlaneRef.current = {
              width: matte.width,
              height: matte.height,
              alpha: feathered,
              updatedAtMs: nowMs(),
            };
          }
          latestMattePlaneRef.current = {
            width: matte.width,
            height: matte.height,
            alpha: matte.alphaMask,
            updatedAtMs: nowMs(),
          };
        }

        logSegmentationDiagnostics({
          providerName: seg.providerName,
          providerStatus: effectiveProviderStatus,
          providerSource: segProviderSource,
          maskStatus: "ok",
          reason: null,
          resolution: { width: seg.width, height: seg.height },
          confidence: roundToTenth(seg.confidenceSummary.score),
          generationMs: seg.processingMs,
          frameInput: args.frameInput,
        });

        publishStatus((prev) => {
          const cadence = computeCadenceSnapshot();
          return {
            ...prev,
            provider: { name: provider.name, readiness: provider.getReadiness() },
            quality: {
              mode: settingsRef.current.qualityMode,
              policy: {
                maxSegmentationFps: qualityPolicyRef.current.maxSegmentationFps,
                maxAnalysisLongEdgePx: qualityPolicyRef.current.maxAnalysisLongEdgePx,
                edgeFeatherCapPx: qualityPolicyRef.current.edgeFeatherCapPx,
                subjectExpansionCapPx: qualityPolicyRef.current.subjectExpansionCapPx,
                temporalSmoothingCap: qualityPolicyRef.current.temporalSmoothingCap,
              },
            },
            initMs: initMsRef.current,
            avgSegmentationMs: avgSegMsRef.current,
            maxSegmentationMs: maxSegMsRef.current,
            avgCompositeMs: avgCompMsRef.current,
            lastSegmentationMs: seg.processingMs,
            droppedFrames: droppedFramesRef.current,
            skippedSegmentationFrames: skippedSegmentationFramesRef.current,
            reusedMaskFrames: reusedMaskFramesRef.current,
            effectiveSegmentationFps: cadence.effectiveSegmentationFps,
            effectiveCompositeFps: cadence.effectiveCompositeFps,
            lastMaskAgeMs: latestMatteFrameRef.current
              ? Math.max(0, Math.round(nowMs() - latestMatteFrameRef.current.generatedAtMs))
              : null,
            lastConfidence: roundToTenth(seg.confidenceSummary.score),
            degradedReason: prev.degradedReason === "reusing_recent_mask" ? null : prev.degradedReason,
            statusMessage: null,
            warnings: [...new Set([...seg.warnings, ...(prev.warnings ?? [])])],
            mask: {
              status: "ok",
              reason: null,
              providerStatus: effectiveProviderStatus,
              providerSource: segProviderSource,
              resolution: { width: seg.width, height: seg.height },
              confidence: roundToTenth(seg.confidenceSummary.score),
              generationMs: seg.processingMs,
            },
            frameInput: args.frameInput,
          };
        }, true);
      } catch (error) {
        segmentationFailedRef.current += 1;
        if (args.analysisFrame) {
          onPlacementMatteRef.current?.(Object.freeze({
            kind: "failed",
            frameRef: args.analysisFrame.frameRef,
            reason: error instanceof Error ? error.message : "Segmentation failed.",
          }));
        }
        const providerStatus = resolveProviderStatus(provider.getReadiness());
        publishStatus((prev) => {
          const cadence = computeCadenceSnapshot();
          return {
            ...prev,
            provider: { name: provider.name, readiness: provider.getReadiness() },
            quality: {
              mode: settingsRef.current.qualityMode,
              policy: {
                maxSegmentationFps: qualityPolicyRef.current.maxSegmentationFps,
                maxAnalysisLongEdgePx: qualityPolicyRef.current.maxAnalysisLongEdgePx,
                edgeFeatherCapPx: qualityPolicyRef.current.edgeFeatherCapPx,
                subjectExpansionCapPx: qualityPolicyRef.current.subjectExpansionCapPx,
                temporalSmoothingCap: qualityPolicyRef.current.temporalSmoothingCap,
              },
            },
            initMs: initMsRef.current,
            maxSegmentationMs: maxSegMsRef.current,
            droppedFrames: droppedFramesRef.current,
            skippedSegmentationFrames: skippedSegmentationFramesRef.current,
            reusedMaskFrames: reusedMaskFramesRef.current,
            effectiveSegmentationFps: cadence.effectiveSegmentationFps,
            effectiveCompositeFps: cadence.effectiveCompositeFps,
            lastMaskAgeMs: latestMatteFrameRef.current
              ? Math.max(0, Math.round(nowMs() - latestMatteFrameRef.current.generatedAtMs))
              : null,
            degradedReason: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
              ? "reusing_recent_mask"
              : "segmentation_unavailable",
            statusMessage: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
              ? null
              : resolveRuntimeStatusMessage({
                providerReadiness: provider.getReadiness(),
                degradedReason: providerStatus === "failed" ? "provider_error" : "segmentation_unavailable",
              }),
            warnings: [error instanceof Error ? error.message : "Segmentation failed."],
            mask: {
              status: "missing",
              reason: "provider_error",
              providerStatus,
              providerSource: providerStatus === "failed" ? "none" : "primary",
              resolution: null,
              confidence: null,
              generationMs: null,
            },
          };
        });
      } finally {
        args.analysisFrame?.release();
        inFlightRef.current = false;
        const elapsed = nowMs() - segmentStartedAt;
        if (elapsed > ((1000 / Math.max(1, qualityPolicyRef.current.maxSegmentationFps)) * 3)) {
          skippedSegmentationFramesRef.current += 1;
        }
        if (pendingSegmentationRef.current) {
          pendingSegmentationRef.current = false;
          lastSegmentationAttemptAtMsRef.current = null;
          lastSegmentationSourceTimeSecRef.current = null;
          previewRuntimeRef.current?.requestFrame("decoded_frame");
        }
      }
    };

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      const video = props.videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        const readiness = provider.getReadiness();
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness },
          degradedReason: "missing_video_or_canvas",
          statusMessage: resolveRuntimeStatusMessage({
            providerReadiness: readiness,
            degradedReason: "missing_video_or_canvas",
          }),
        }));
        return;
      }

      if (video.readyState < 2) {
        const readiness = provider.getReadiness();
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness },
          degradedReason: "video_not_ready",
          statusMessage: resolveRuntimeStatusMessage({
            providerReadiness: readiness,
            degradedReason: "video_not_ready",
          }),
        }));
        return;
      }

      const settings = settingsRef.current;
      const policy = qualityPolicyRef.current;
      const visualModeActive = settings.enabled
        || settings.replacementEnabled
        || settings.washEnabled
        || maskPreviewModeRef.current
        || analysisFrameQueue.hasPending();
      if (!visualModeActive) {
        drawPassthroughFrame({ source: video, output: canvas });
        publishStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          degradedReason: null,
          statusMessage: null,
        }));
        return;
      }

      const frameInput = {
        width: Math.max(0, Math.round(video.videoWidth || 0)),
        height: Math.max(0, Math.round(video.videoHeight || 0)),
        format: "htmlvideoelement" as const,
      };
      if (frameInput.width <= 0 || frameInput.height <= 0) {
        drawPassthroughFrame({ source: video, output: canvas });
        const providerStatus = resolveProviderStatus(provider.getReadiness());
        logSegmentationDiagnostics({
          providerName: provider.name,
          providerStatus,
          providerSource: "none",
          maskStatus: "missing",
          reason: "invalid_frame_dimensions",
          resolution: null,
          confidence: null,
          generationMs: null,
          frameInput,
        });
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          frameInput,
          degradedReason: "invalid_frame_dimensions",
          mask: {
            status: "missing",
            reason: "invalid_frame_dimensions",
            providerStatus,
            providerSource: "none",
            resolution: null,
            confidence: null,
            generationMs: null,
          },
          statusMessage: resolveRuntimeStatusMessage({
            providerReadiness: provider.getReadiness(),
            degradedReason: "invalid_frame_dimensions",
          }),
          warnings: ["Frame dimensions unavailable for segmentation input."],
        }));
        return;
      }

      const sourceTimeSec = Math.max(0, Number(video.currentTime) || 0);
      const readiness = provider.getReadiness();
      if (readiness.status === "initializing" && initStartedAtMsRef.current == null) {
        initStartedAtMsRef.current = readiness.startedAtMs;
      }
      if (readiness.status === "ready" && initMsRef.current == null && initStartedAtMsRef.current != null) {
        initMsRef.current = roundToTenth(Math.max(0, nowMs() - initStartedAtMsRef.current));
      }

      const now = nowMs();
      const targetSegFps = Math.max(1, policy.maxSegmentationFps);
      const minSegGapMs = 1000 / targetSegFps;
      const minSegSourceDeltaSec = Math.max(1 / (targetSegFps * 1.8), 0.008);
      const lastSegAttempt = lastSegmentationAttemptAtMsRef.current;
      const lastSegSource = lastSegmentationSourceTimeSecRef.current;
      const enoughWallTime = lastSegAttempt == null || (now - lastSegAttempt) >= minSegGapMs;
      const enoughSourceDelta = lastSegSource == null || Math.abs(sourceTimeSec - lastSegSource) >= minSegSourceDeltaSec;
      const hasNoMaskYet = latestMatteFrameRef.current == null;
      const analysisFrame = analysisFrameQueue.take();
      const shouldAttemptSegmentation = Boolean(analysisFrame) || (enoughWallTime && enoughSourceDelta) || hasNoMaskYet;

      if (shouldAttemptSegmentation && !inFlightRef.current) {
        lastSegmentationAttemptAtMsRef.current = now;
        lastSegmentationSourceTimeSecRef.current = sourceTimeSec;
        const frameToken = ++frameTokenRef.current;
        void runSegmentationJob({
          source: analysisFrame?.pixels ?? video,
          canvas,
          frameInput: analysisFrame
            ? { width: analysisFrame.frameRef.width, height: analysisFrame.frameRef.height, format: "htmlvideoelement" }
            : frameInput,
          sourceTimeSec: analysisFrame?.frameRef.sourcePresentationTimeSec ?? sourceTimeSec,
          frameToken,
          analysisFrame,
        });
      } else {
        if (shouldAttemptSegmentation && inFlightRef.current) {
          if (analysisFrame) analysisFrameQueue.offer(analysisFrame);
          if (pendingSegmentationRef.current) segmentationSupersededRef.current += 1;
          pendingSegmentationRef.current = true;
        }
        skippedSegmentationFramesRef.current += 1;
      }

      const lastCompositeAt = lastCompositeAtMsRef.current;
      const lastCompositeSource = lastCompositeSourceTimeSecRef.current;
      if (lastCompositeAt != null && (now - lastCompositeAt) < minCompositeGapMs) {
        return;
      }
      if (lastCompositeSource != null && Math.abs(sourceTimeSec - lastCompositeSource) < 0.002 && !maskPreviewModeRef.current) {
        return;
      }

      const cachedMatte = latestMatteFrameRef.current;
      const canReuseMask = isMaskReusable({
        cached: cachedMatte,
        sourceTimeSec,
      });
      const hasUsableMask = cachedMatte != null && canReuseMask;
      if (!hasUsableMask) {
        if (cachedMatte) {
          const ageMs = Math.max(0, Math.round(nowMs() - cachedMatte.generatedAtMs));
          publishStatus((prev) => ({ ...prev, lastMaskAgeMs: ageMs, degradedReason: "segmentation_unavailable",
            statusMessage: "Preview effect unavailable · retaining last processed frame" }));
          return;
        }
        drawPassthroughFrame({ source: video, output: canvas });
        const nowForDegrade = nowMs();
        if (degradedReasonSinceMsRef.current == null) degradedReasonSinceMsRef.current = nowForDegrade;
        const shouldShowDegradeMessage = (nowForDegrade - degradedReasonSinceMsRef.current) >= DEGRADE_STICKY_MS;
        publishStatus((prev) => {
          const cadence = computeCadenceSnapshot();
          return {
            ...prev,
            provider: { name: provider.name, readiness: provider.getReadiness() },
            frameInput,
            droppedFrames: droppedFramesRef.current,
            skippedSegmentationFrames: skippedSegmentationFramesRef.current,
            reusedMaskFrames: reusedMaskFramesRef.current,
            effectiveSegmentationFps: cadence.effectiveSegmentationFps,
            effectiveCompositeFps: cadence.effectiveCompositeFps,
            lastMaskAgeMs: null,
            degradedReason: shouldShowDegradeMessage ? "segmentation_unavailable" : prev.degradedReason,
            statusMessage: shouldShowDegradeMessage
              ? resolveRuntimeStatusMessage({
                providerReadiness: provider.getReadiness(),
                degradedReason: "segmentation_unavailable",
              })
              : prev.statusMessage,
            mask: {
              ...prev.mask,
              status: "missing",
              reason: "mask_unavailable",
            },
          };
        });
        return;
      }

      degradedReasonSinceMsRef.current = null;
      if (canReuseMask) {
        reusedMaskFramesRef.current += 1;
      }
      const maskAgeMs = Math.max(0, Math.round(nowMs() - cachedMatte.generatedAtMs));

      const matte = cachedMatte.matte;
      const canvasRect = canvas.getBoundingClientRect();
      const backingScale = resolveCanvasBackingScale({
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        surfaceCssWidth: canvasRect.width,
        surfaceCssHeight: canvasRect.height,
      });
      const matteControlScale = resolveMatteControlScale({
        maskWidth: matte.width,
        maskHeight: matte.height,
        surfaceCssWidth: canvasRect.width,
        surfaceCssHeight: canvasRect.height,
      }).maskPixelsPerCssPixel;
      const renderSettings = {
        ...settings,
        blurPx: settings.blurPx * backingScale,
        edgeFeatherPx: settings.edgeFeatherPx * matteControlScale,
      };
      let composite = settings.washEnabled
        ? washRenderer.render({ source: video, matte, settings: renderSettings, output: canvas })
        : settings.replacementEnabled
        ? replacementRenderer.render({ source: video, matte, settings: renderSettings, output: canvas })
        : blurRenderer.render({ source: video, matte, settings: renderSettings, output: canvas });

      const cadenceSnapshot = computeCadenceSnapshot();
      const segRate = cadenceSnapshot.effectiveSegmentationFps ?? targetSegFps;
      const underLoad = inFlightRef.current || segRate < (targetSegFps * 0.55);
      if (settings.replacementEnabled && underLoad) {
        composite = blurRenderer.render({ source: video, matte, settings: renderSettings, output: canvas });
        composite = {
          ...composite,
          degradedReason: composite.degradedReason ?? "replacement_degraded_under_load",
          warnings: [...composite.warnings, "Segmentation cadence is low; temporarily using blur for smoother preview."],
        };
      }

      if (settings.replacementEnabled && cachedMatte.providerSource === "secondary") {
        composite = blurRenderer.render({ source: video, matte, settings: renderSettings, output: canvas });
        composite = {
          ...composite,
          degradedReason: composite.degradedReason ?? "replacement_downgraded_to_blur",
          warnings: [...composite.warnings, "Primary segmentation failed; using lightweight segmentation with blur fallback."],
        };
      }

      compositeSampleCountRef.current += 1;
      avgCompMsRef.current = avgCompMsRef.current == null
        ? composite.compositingMs
        : roundToTenth((avgCompMsRef.current * 0.9) + (composite.compositingMs * 0.1));
      lastCompositeAtMsRef.current = now;
      lastCompositeSourceTimeSecRef.current = sourceTimeSec;

      if (maskPreviewModeRef.current) {
        const maskCtx = canvas.getContext("2d");
        if (maskCtx) {
          const stage = maskPreviewStageRef.current ?? "raw";
          if (stage !== "final_composite") {
            const stageAlpha = stage === "expanded"
              ? (matte.metadata.debugPlanes?.expandedAlphaMask ?? matte.alphaMask)
              : stage === "feathered"
              ? (matte.metadata.debugPlanes?.featheredAlphaMask ?? matte.alphaMask)
              : stage === "refined"
              ? (matte.metadata.debugPlanes?.refinedAlphaMask ?? matte.alphaMask)
              : (latestRawPlaneRef.current?.alpha ?? matte.alphaMask);
            const maskImage = maskCtx.createImageData(matte.width, matte.height);
            for (let i = 0, px = 0; i < maskImage.data.length; i += 4, px += 1) {
              const value = stageAlpha[px] ?? 0;
              maskImage.data[i] = value;
              maskImage.data[i + 1] = value;
              maskImage.data[i + 2] = value;
              maskImage.data[i + 3] = 255;
            }
            const temp = maskPreviewCanvasRef.current ?? document.createElement("canvas");
            maskPreviewCanvasRef.current = temp;
            temp.width = matte.width;
            temp.height = matte.height;
            const tempCtx = temp.getContext("2d");
            if (tempCtx) {
              tempCtx.putImageData(maskImage, 0, 0);
                drawSourceContained({
                  ctx: maskCtx,
                  source: temp,
                  destWidth: canvas.width,
                  destHeight: canvas.height,
                });
            }
          }
        }
      }

      publishStatus((prev) => {
        const cadence = computeCadenceSnapshot();
        return {
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          quality: {
            mode: settings.qualityMode,
            policy: {
              maxSegmentationFps: policy.maxSegmentationFps,
              maxAnalysisLongEdgePx: policy.maxAnalysisLongEdgePx,
              edgeFeatherCapPx: policy.edgeFeatherCapPx,
              subjectExpansionCapPx: policy.subjectExpansionCapPx,
              temporalSmoothingCap: policy.temporalSmoothingCap,
            },
          },
          initMs: initMsRef.current,
          avgSegmentationMs: avgSegMsRef.current,
          maxSegmentationMs: maxSegMsRef.current,
          avgCompositeMs: avgCompMsRef.current,
          lastCompositeMs: composite.compositingMs,
          lastConfidence: cachedMatte.confidence,
          droppedFrames: droppedFramesRef.current,
          skippedSegmentationFrames: skippedSegmentationFramesRef.current,
          reusedMaskFrames: reusedMaskFramesRef.current,
          effectiveSegmentationFps: cadence.effectiveSegmentationFps,
          effectiveCompositeFps: cadence.effectiveCompositeFps,
          lastMaskAgeMs: maskAgeMs,
          runtime: {
            scheduler: previewRuntimeRef.current?.snapshotDiagnostics().scheduler ?? "idle",
            sourceRevision: previewRuntimeRef.current?.snapshotDiagnostics().sourceRevision ?? null,
            segmentationAttempted: segmentationAttemptedRef.current,
            segmentationCompleted: segmentationCompletedRef.current,
            segmentationFailed: segmentationFailedRef.current,
            segmentationSuperseded: segmentationSupersededRef.current,
            pendingJobs: inFlightRef.current ? 1 : 0,
            analysisResolution: analysisResolutionRef.current,
            backingResolution: { width: canvas.width, height: canvas.height },
          },
          degradedReason: maskAgeMs > MASK_FRESH_MAX_AGE_MS ? "reusing_stale_mask" : composite.degradedReason,
          warnings: [...new Set([...(cachedMatte.warnings ?? []), ...composite.warnings])],
          mask: {
            status: "ok",
            reason: canReuseMask ? "reused_recent_mask" : null,
            providerStatus: cachedMatte.providerStatus,
            providerSource: cachedMatte.providerSource,
            resolution: cachedMatte.resolution,
            confidence: cachedMatte.confidence,
            generationMs: cachedMatte.segmentationMs,
            speakerMaskBounds: extractSpeakerMaskBoundsFromMatte({
              matte: cachedMatte.matte,
              maxComponents: 2,
            }),
          },
          frameInput,
          statusMessage: null,
          debug: props.debugMasks
            ? {
              rawMaskDataUrl: debugRawUrlRef.current,
              expandedMaskDataUrl: debugExpandedUrlRef.current,
              featheredMaskDataUrl: debugFeatheredUrlRef.current,
              refinedMaskDataUrl: debugMatteUrlRef.current,
              matteDataUrl: debugMatteUrlRef.current,
              finalCompositeDataUrl: debugFinalCompositeUrlRef.current,
            }
            : undefined,
        };
      });
    };

    const video = props.videoRef.current;
    const runtime = new HammerPreviewRuntime(() => { void tick(); });
    previewRuntimeRef.current = runtime;
    if (video) runtime.attachSource(video, props.mediaRevision ?? (video.currentSrc || video.src || "preview-source"));

    return () => {
      cancelled = true;
      runtime.dispose();
      if (previewRuntimeRef.current === runtime) previewRuntimeRef.current = null;
    };
  }, [
    blurRenderer,
    analysisFrameQueue,
    matteRefiner,
    props.enabled,
    props.videoRef,
    props.mediaRevision,
    provider,
    replacementRenderer,
    washRenderer,
  ]);

  if (!props.enabled) return null;

  const show = props.settings.enabled || props.settings.replacementEnabled || props.settings.washEnabled || props.maskPreviewMode;
  const canvasClassName = show
    ? "hammer-preview-matte-canvas is-visible"
    : "hammer-preview-matte-canvas";

  return (
    <>
      <canvas
        ref={canvasRef}
        className={canvasClassName}
      />
      {props.maskPreviewMode && runtimeStatus.mask.status !== "ok" ? (
        <div className="hammer-preview-matte-overlay">NO MASK</div>
      ) : null}
    </>
  );
}
