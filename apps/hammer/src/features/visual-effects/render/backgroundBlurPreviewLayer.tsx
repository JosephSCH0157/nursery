import { useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundBlurSettings, ForegroundMatte, SegmentationProviderReadiness } from "../types";
import type { SegmentationProvider } from "../types";
import type { SegmentationProviderId } from "../providers/segmentationProviderRegistry";
import { createSegmentationProvider, isSegmentationProviderId } from "../providers/segmentationProviderRegistry";
import { MediapipeSelfieSegmentationProvider } from "../providers/mediapipeSelfieSegmentationProvider";
import { SimpleMatteRefiner } from "../matte/simpleMatteRefiner";
import { BackgroundBlurRenderer } from "../effects/backgroundBlurRenderer";
import { BackgroundReplacementRenderer } from "../effects/backgroundReplacementRenderer";
import { BackgroundWashRenderer } from "../effects/backgroundWashRenderer";
import { resolveVisualPreviewQualityPolicy } from "./previewQualityPolicy";

export type HammerBackgroundBlurRuntimeStatus = {
  provider: {
    name: string;
    readiness: SegmentationProviderReadiness;
  };
  quality: {
    mode: BackgroundBlurSettings["qualityMode"];
    policy: {
      maxSegmentationFps: number;
      edgeFeatherCapPx: number;
      subjectExpansionCapPx: number;
      temporalSmoothingCap: number;
    };
  };
  initMs: number | null;
  avgSegmentationMs: number | null;
  avgCompositeMs: number | null;
  lastSegmentationMs: number | null;
  lastCompositeMs: number | null;
  lastConfidence: number | null;
  droppedFrames: number;
  skippedSegmentationFrames: number;
  reusedMaskFrames: number;
  effectiveSegmentationFps: number | null;
  effectiveCompositeFps: number | null;
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
const MASK_REUSE_MAX_AGE_MS = 260;
const MASK_REUSE_MAX_DELTA_SEC = 0.12;
const STATUS_DEBOUNCE_MS = 140;
const DEGRADE_STICKY_MS = 360;

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

function drawPassthroughFrame(args: { source: HTMLVideoElement; output: HTMLCanvasElement }): void {
  const ctx = args.output.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, args.output.width, args.output.height);
  ctx.drawImage(args.source, 0, 0, args.output.width, args.output.height);
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

function computeCanvasSize(args: { element: HTMLCanvasElement; dpr: number }): { width: number; height: number } {
  const rect = args.element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * args.dpr));
  const height = Math.max(1, Math.round(rect.height * args.dpr));
  return { width, height };
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
  if (ageMs > MASK_REUSE_MAX_AGE_MS) return false;
  const sourceDelta = Math.abs(args.sourceTimeSec - args.cached.sourceTimeSec);
  return sourceDelta <= MASK_REUSE_MAX_DELTA_SEC;
}

function useDefaultSegmentationProvider(enabled: boolean, providerId: SegmentationProviderId): SegmentationProvider {
  const providerRef = useRef<SegmentationProvider | null>(null);
  const lastProviderIdRef = useRef<SegmentationProviderId | null>(null);

  if (!providerRef.current || lastProviderIdRef.current !== providerId) {
    void providerRef.current?.dispose();
    providerRef.current = createSegmentationProvider(providerId);
    lastProviderIdRef.current = providerId;
  }
  useEffect(() => {
    if (!enabled) return;
    void providerRef.current?.initialize();
    return () => {
      // Keep provider alive while the editor is open. Dispose on unmount only.
    };
  }, [enabled]);
  return providerRef.current;
}

function createSecondaryProvider(): SegmentationProvider {
  return new MediapipeSelfieSegmentationProvider({ modelSelection: 0 });
}

export default function BackgroundBlurPreviewLayer(props: {
  enabled: boolean;
  settings: BackgroundBlurSettings;
  providerId: string | null;
  debugMasks?: boolean;
  maskPreviewMode?: boolean;
  maskPreviewStage?: "raw" | "expanded" | "feathered" | "refined" | "final_composite";
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  onStatus?: (status: HammerBackgroundBlurRuntimeStatus) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolvedProviderId: SegmentationProviderId = isSegmentationProviderId(props.providerId)
    ? props.providerId
    : "mediapipe_selfie_segmentation";
  const qualityPolicy = resolveVisualPreviewQualityPolicy(props.settings.qualityMode);
  const provider = useDefaultSegmentationProvider(props.enabled, resolvedProviderId);
  const matteRefiner = useMemo(() => new SimpleMatteRefiner(), []);
  const blurRenderer = useMemo(() => new BackgroundBlurRenderer(), []);
  const replacementRenderer = useMemo(() => new BackgroundReplacementRenderer(), []);
  const washRenderer = useMemo(() => new BackgroundWashRenderer(), []);
  const secondaryProviderRef = useRef<SegmentationProvider | null>(null);

  const inFlightRef = useRef(false);
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
        edgeFeatherCapPx: qualityPolicy.edgeFeatherCapPx,
        subjectExpansionCapPx: qualityPolicy.subjectExpansionCapPx,
        temporalSmoothingCap: qualityPolicy.temporalSmoothingCap,
      },
    },
    initMs: null,
    avgSegmentationMs: null,
    avgCompositeMs: null,
    lastSegmentationMs: null,
    lastCompositeMs: null,
    lastConfidence: null,
    droppedFrames: 0,
    skippedSegmentationFrames: 0,
    reusedMaskFrames: 0,
    effectiveSegmentationFps: null,
    effectiveCompositeFps: null,
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

  useEffect(() => {
    props.onStatus?.(runtimeStatus);
  }, [props, runtimeStatus]);

  useEffect(() => {
    props.onCanvas?.(canvasRef.current);
    return () => {
      props.onCanvas?.(null);
    };
  }, [props.onCanvas]);

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
      lastSegmentationAttemptAtMsRef.current = null;
      lastSegmentationSourceTimeSecRef.current = null;
      lastCompositeAtMsRef.current = null;
      lastCompositeSourceTimeSecRef.current = null;
      latestMatteFrameRef.current = null;
      skippedSegmentationFramesRef.current = 0;
      reusedMaskFramesRef.current = 0;
      droppedFramesRef.current = 0;
      segmentationSampleCountRef.current = 0;
      compositeSampleCountRef.current = 0;
      sampleWindowStartedAtMsRef.current = nowMs();
      consecutiveMaskFailuresRef.current = 0;
      degradedReasonSinceMsRef.current = null;
      lastStatusPublishAtMsRef.current = 0;
      frameTokenRef.current += 1;
      return;
    }
    // Keep the last matte for temporal smoothing while enabled.
  }, [matteRefiner, props.enabled, resolvedProviderId]);

  useEffect(() => {
    if (!props.enabled) return;
    void provider.initialize();
  }, [props.enabled, provider]);

  useEffect(() => {
    if (!props.enabled) return;
    if (!secondaryProviderRef.current) {
      secondaryProviderRef.current = createSecondaryProvider();
    }
    return () => {
      // Keep fallback provider warm while preview shell is mounted.
    };
  }, [props.enabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const ro = new ResizeObserver(() => {
      const { width, height } = computeCanvasSize({ element: canvas, dpr });
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    });
    ro.observe(canvas);
    const initial = computeCanvasSize({ element: canvas, dpr });
    canvas.width = initial.width;
    canvas.height = initial.height;
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!props.enabled) return;
    let cancelled = false;

    const targetSegFps = Math.max(1, qualityPolicy.maxSegmentationFps);
    const minSegGapMs = 1000 / targetSegFps;
    const minSegSourceDeltaSec = Math.max(1 / (targetSegFps * 1.8), 0.008);
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
      video: HTMLVideoElement;
      canvas: HTMLCanvasElement;
      frameInput: { width: number; height: number; format: "htmlvideoelement" };
      sourceTimeSec: number;
      frameToken: number;
    }): Promise<void> => {
      if (inFlightRef.current) {
        skippedSegmentationFramesRef.current += 1;
        droppedFramesRef.current += 1;
        return;
      }
      inFlightRef.current = true;
      const segmentStartedAt = nowMs();

      try {
        const readinessBefore = provider.getReadiness();
        if (readinessBefore.status !== "ready") {
          await provider.initialize();
        }

        let segProvider: SegmentationProvider | null = provider;
        let segProviderSource: "primary" | "secondary" = "primary";
        let seg = await provider.segmentFrame({ video: args.video, timestampSec: args.sourceTimeSec });

        const confidence = Number(seg.confidenceSummary.score);
        const lowConfidence = Number.isFinite(confidence) && confidence < 0.05;
        const primaryMaskValid = isSegmentationMaskValid(seg.personMask, seg.width, seg.height);
        if (!primaryMaskValid || lowConfidence) {
          const secondary = secondaryProviderRef.current;
          if (secondary) {
            const secondaryReadiness = secondary.getReadiness();
            if (secondaryReadiness.status !== "ready") {
              await secondary.initialize();
            }
            if (secondary.getReadiness().status === "ready") {
              seg = await secondary.segmentFrame({ video: args.video, timestampSec: args.sourceTimeSec });
              segProvider = secondary;
              segProviderSource = "secondary";
            }
          }
        }

        if (cancelled || args.frameToken !== frameTokenRef.current) return;

        const effectiveProviderStatus = resolveProviderStatus(segProvider?.getReadiness() ?? provider.getReadiness());
        const segConfidence = Number(seg.confidenceSummary.score);
        const maskValid = isSegmentationMaskValid(seg.personMask, seg.width, seg.height);
        const maskRejectedReason = !Number.isFinite(segConfidence) || segConfidence < 0.05
          ? "low_confidence"
          : null;

        if (!maskValid || maskRejectedReason) {
          consecutiveMaskFailuresRef.current += 1;
          const missingReason = !maskValid ? "mask_unavailable" : maskRejectedReason;
          logSegmentationDiagnostics({
            providerName: segProvider?.name ?? provider.name,
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
                mode: props.settings.qualityMode,
                policy: {
                  maxSegmentationFps: qualityPolicy.maxSegmentationFps,
                  edgeFeatherCapPx: qualityPolicy.edgeFeatherCapPx,
                  subjectExpansionCapPx: qualityPolicy.subjectExpansionCapPx,
                  temporalSmoothingCap: qualityPolicy.temporalSmoothingCap,
                },
              },
              frameInput: args.frameInput,
              initMs: initMsRef.current,
              avgSegmentationMs: avgSegMsRef.current,
              avgCompositeMs: avgCompMsRef.current,
              lastSegmentationMs: seg.processingMs,
              lastCompositeMs: prev.lastCompositeMs,
              lastConfidence: Number.isFinite(segConfidence) ? roundToTenth(segConfidence) : null,
              droppedFrames: droppedFramesRef.current,
              skippedSegmentationFrames: skippedSegmentationFramesRef.current,
              reusedMaskFrames: reusedMaskFramesRef.current,
              effectiveSegmentationFps: cadence.effectiveSegmentationFps,
              effectiveCompositeFps: cadence.effectiveCompositeFps,
              degradedReason: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
                ? "reusing_recent_mask"
                : "segmentation_unavailable",
              statusMessage: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
                ? null
                : "Segmentation unavailable – background treatment disabled",
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
          return;
        }

        const effectiveFeatherPx = Math.min(props.settings.edgeFeatherPx, qualityPolicy.edgeFeatherCapPx);
        const effectiveExpansionPx = Math.max(
          -qualityPolicy.subjectExpansionCapPx,
          Math.min(props.settings.subjectExpansionPx, qualityPolicy.subjectExpansionCapPx),
        );
        const effectiveTemporal = Math.min(props.settings.temporalSmoothing, qualityPolicy.temporalSmoothingCap);
        const temporalForStability = Math.max(0, Math.min(1, effectiveTemporal * 0.92));
        const matte = matteRefiner.buildMatte(seg, {
          featherPx: effectiveFeatherPx,
          subjectExpansionPx: effectiveExpansionPx,
          temporalSmoothing: temporalForStability,
          quality: props.settings.qualityMode,
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
        consecutiveMaskFailuresRef.current = 0;

        avgSegMsRef.current = avgSegMsRef.current == null
          ? seg.processingMs
          : roundToTenth((avgSegMsRef.current * 0.9) + (seg.processingMs * 0.1));
        segmentationSampleCountRef.current += 1;

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
              mode: props.settings.qualityMode,
              policy: {
                maxSegmentationFps: qualityPolicy.maxSegmentationFps,
                edgeFeatherCapPx: qualityPolicy.edgeFeatherCapPx,
                subjectExpansionCapPx: qualityPolicy.subjectExpansionCapPx,
                temporalSmoothingCap: qualityPolicy.temporalSmoothingCap,
              },
            },
            initMs: initMsRef.current,
            avgSegmentationMs: avgSegMsRef.current,
            avgCompositeMs: avgCompMsRef.current,
            lastSegmentationMs: seg.processingMs,
            droppedFrames: droppedFramesRef.current,
            skippedSegmentationFrames: skippedSegmentationFramesRef.current,
            reusedMaskFrames: reusedMaskFramesRef.current,
            effectiveSegmentationFps: cadence.effectiveSegmentationFps,
            effectiveCompositeFps: cadence.effectiveCompositeFps,
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
        const providerStatus = resolveProviderStatus(provider.getReadiness());
        publishStatus((prev) => {
          const cadence = computeCadenceSnapshot();
          return {
            ...prev,
            provider: { name: provider.name, readiness: provider.getReadiness() },
            quality: {
              mode: props.settings.qualityMode,
              policy: {
                maxSegmentationFps: qualityPolicy.maxSegmentationFps,
                edgeFeatherCapPx: qualityPolicy.edgeFeatherCapPx,
                subjectExpansionCapPx: qualityPolicy.subjectExpansionCapPx,
                temporalSmoothingCap: qualityPolicy.temporalSmoothingCap,
              },
            },
            initMs: initMsRef.current,
            droppedFrames: droppedFramesRef.current,
            skippedSegmentationFrames: skippedSegmentationFramesRef.current,
            reusedMaskFrames: reusedMaskFramesRef.current,
            effectiveSegmentationFps: cadence.effectiveSegmentationFps,
            effectiveCompositeFps: cadence.effectiveCompositeFps,
            degradedReason: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
              ? "reusing_recent_mask"
              : "segmentation_unavailable",
            statusMessage: isMaskReusable({ cached: latestMatteFrameRef.current, sourceTimeSec: args.sourceTimeSec })
              ? null
              : "Segmentation unavailable – background treatment disabled",
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
        inFlightRef.current = false;
        const elapsed = nowMs() - segmentStartedAt;
        if (elapsed > (minSegGapMs * 3)) {
          skippedSegmentationFramesRef.current += 1;
        }
      }
    };

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      const video = props.videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          degradedReason: "missing_video_or_canvas",
        }));
        return;
      }

      if (video.readyState < 2) {
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          degradedReason: "video_not_ready",
          statusMessage: "Segmentation unavailable – background treatment disabled",
        }));
        return;
      }

      const visualModeActive = props.settings.enabled || props.settings.replacementEnabled || props.settings.washEnabled || props.maskPreviewMode;
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
          statusMessage: "Segmentation unavailable – background treatment disabled",
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
      const lastSegAttempt = lastSegmentationAttemptAtMsRef.current;
      const lastSegSource = lastSegmentationSourceTimeSecRef.current;
      const enoughWallTime = lastSegAttempt == null || (now - lastSegAttempt) >= minSegGapMs;
      const enoughSourceDelta = lastSegSource == null || Math.abs(sourceTimeSec - lastSegSource) >= minSegSourceDeltaSec;
      const hasNoMaskYet = latestMatteFrameRef.current == null;
      const shouldAttemptSegmentation = (enoughWallTime && enoughSourceDelta) || hasNoMaskYet;

      if (shouldAttemptSegmentation) {
        lastSegmentationAttemptAtMsRef.current = now;
        lastSegmentationSourceTimeSecRef.current = sourceTimeSec;
        segmentationSampleCountRef.current += 1;
        const frameToken = ++frameTokenRef.current;
        void runSegmentationJob({ video, canvas, frameInput, sourceTimeSec, frameToken });
      } else {
        skippedSegmentationFramesRef.current += 1;
      }

      const lastCompositeAt = lastCompositeAtMsRef.current;
      const lastCompositeSource = lastCompositeSourceTimeSecRef.current;
      if (lastCompositeAt != null && (now - lastCompositeAt) < minCompositeGapMs) {
        return;
      }
      if (lastCompositeSource != null && Math.abs(sourceTimeSec - lastCompositeSource) < 0.002 && !props.maskPreviewMode) {
        return;
      }

      const cachedMatte = latestMatteFrameRef.current;
      const canReuseMask = isMaskReusable({
        cached: cachedMatte,
        sourceTimeSec,
      });
      const hasUsableMask = cachedMatte != null && (canReuseMask || Math.abs(sourceTimeSec - cachedMatte.sourceTimeSec) < 0.2);
      if (!hasUsableMask) {
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
            degradedReason: shouldShowDegradeMessage ? "segmentation_unavailable" : prev.degradedReason,
            statusMessage: shouldShowDegradeMessage
              ? "Segmentation unavailable – background treatment disabled"
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

      const matte = cachedMatte.matte;
      let composite = props.settings.washEnabled
        ? washRenderer.render({ source: video, matte, settings: props.settings, output: canvas })
        : props.settings.replacementEnabled
        ? replacementRenderer.render({ source: video, matte, settings: props.settings, output: canvas })
        : blurRenderer.render({ source: video, matte, settings: props.settings, output: canvas });

      const cadenceSnapshot = computeCadenceSnapshot();
      const segRate = cadenceSnapshot.effectiveSegmentationFps ?? targetSegFps;
      const underLoad = inFlightRef.current || segRate < (targetSegFps * 0.55);
      if (props.settings.replacementEnabled && underLoad) {
        composite = blurRenderer.render({ source: video, matte, settings: props.settings, output: canvas });
        composite = {
          ...composite,
          degradedReason: composite.degradedReason ?? "replacement_degraded_under_load",
          warnings: [...composite.warnings, "Segmentation cadence is low; temporarily using blur for smoother preview."],
        };
      }

      if (props.settings.replacementEnabled && cachedMatte.providerSource === "secondary") {
        composite = blurRenderer.render({ source: video, matte, settings: props.settings, output: canvas });
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

      if (props.maskPreviewMode) {
        const maskCtx = canvas.getContext("2d");
        if (maskCtx) {
          const stage = props.maskPreviewStage ?? "raw";
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
            const temp = document.createElement("canvas");
            temp.width = matte.width;
            temp.height = matte.height;
            const tempCtx = temp.getContext("2d");
            if (tempCtx) {
              tempCtx.putImageData(maskImage, 0, 0);
              maskCtx.clearRect(0, 0, canvas.width, canvas.height);
              maskCtx.drawImage(temp, 0, 0, canvas.width, canvas.height);
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
            mode: props.settings.qualityMode,
            policy: {
              maxSegmentationFps: qualityPolicy.maxSegmentationFps,
              edgeFeatherCapPx: qualityPolicy.edgeFeatherCapPx,
              subjectExpansionCapPx: qualityPolicy.subjectExpansionCapPx,
              temporalSmoothingCap: qualityPolicy.temporalSmoothingCap,
            },
          },
          initMs: initMsRef.current,
          avgSegmentationMs: avgSegMsRef.current,
          avgCompositeMs: avgCompMsRef.current,
          lastCompositeMs: composite.compositingMs,
          lastConfidence: cachedMatte.confidence,
          droppedFrames: droppedFramesRef.current,
          skippedSegmentationFrames: skippedSegmentationFramesRef.current,
          reusedMaskFrames: reusedMaskFramesRef.current,
          effectiveSegmentationFps: cadence.effectiveSegmentationFps,
          effectiveCompositeFps: cadence.effectiveCompositeFps,
          degradedReason: canReuseMask
            ? "reusing_recent_mask"
            : composite.degradedReason,
          warnings: [...new Set([...(cachedMatte.warnings ?? []), ...composite.warnings])],
          mask: {
            status: "ok",
            reason: canReuseMask ? "reused_recent_mask" : null,
            providerStatus: cachedMatte.providerStatus,
            providerSource: cachedMatte.providerSource,
            resolution: cachedMatte.resolution,
            confidence: cachedMatte.confidence,
            generationMs: cachedMatte.segmentationMs,
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
    const requestVideoFrameCallback = video ? (video as any).requestVideoFrameCallback?.bind(video) as ((cb: (now: number, metadata: { mediaTime?: number }) => void) => number) | null : null;
    const cancelVideoFrameCallback = video ? (video as any).cancelVideoFrameCallback?.bind(video) as ((handle: number) => void) | null : null;
    if (video && typeof requestVideoFrameCallback === "function") {
      let handle = 0;
      const loop = (_now: number, metadata: { mediaTime?: number }) => {
        if (typeof metadata?.mediaTime === "number" && Number.isFinite(metadata.mediaTime)) {
          const lastSource = lastSegmentationSourceTimeSecRef.current;
          if (lastSource != null && Math.abs(metadata.mediaTime - lastSource) < 0.0005) {
            skippedSegmentationFramesRef.current += 1;
          }
        }
        void tick();
        handle = requestVideoFrameCallback(loop);
      };
      handle = requestVideoFrameCallback(loop);
      return () => {
        cancelled = true;
        if (typeof cancelVideoFrameCallback === "function") cancelVideoFrameCallback(handle);
      };
    }

    let raf = 0;
    const loop = () => {
      void tick();
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [
    blurRenderer,
    matteRefiner,
    props.enabled,
    props.maskPreviewMode,
    props.maskPreviewStage,
    props.settings,
    props.videoRef,
    provider,
    qualityPolicy,
    replacementRenderer,
    washRenderer,
  ]);

  if (!props.enabled) return null;

  const show = (props.settings.enabled || props.settings.replacementEnabled || props.settings.washEnabled) && (
    props.settings.fallbackMode === "passthrough"
      ? true
      : runtimeStatus.degradedReason == null || runtimeStatus.mask.status !== "ok"
  );
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
      ) : runtimeStatus.statusMessage ? (
        <div className="hammer-preview-matte-overlay">{runtimeStatus.statusMessage}</div>
      ) : null}
    </>
  );
}
