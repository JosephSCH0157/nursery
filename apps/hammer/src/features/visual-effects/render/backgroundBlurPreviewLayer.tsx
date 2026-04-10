import { useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundBlurSettings, SegmentationProviderReadiness } from "../types";
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
    matteDataUrl: string | null;
  };
};

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

export default function BackgroundBlurPreviewLayer(props: {
  enabled: boolean;
  settings: BackgroundBlurSettings;
  providerId: string | null;
  debugMasks?: boolean;
  maskPreviewMode?: boolean;
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
  const lastFrameAtMsRef = useRef<number | null>(null);
  const droppedFramesRef = useRef(0);
  const initStartedAtMsRef = useRef<number | null>(null);
  const initMsRef = useRef<number | null>(null);
  const avgSegMsRef = useRef<number | null>(null);
  const avgCompMsRef = useRef<number | null>(null);
  const latestRawPlaneRef = useRef<CachedAlphaPlane | null>(null);
  const latestMattePlaneRef = useRef<CachedAlphaPlane | null>(null);
  const lastDebugEncodedAtMsRef = useRef<number | null>(null);
  const debugEncodingInFlightRef = useRef(false);
  const debugRawUrlRef = useRef<string | null>(null);
  const debugMatteUrlRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!props.debugMasks) {
      latestRawPlaneRef.current = null;
      latestMattePlaneRef.current = null;
      lastDebugEncodedAtMsRef.current = null;
      debugEncodingInFlightRef.current = false;
      if (debugRawUrlRef.current) URL.revokeObjectURL(debugRawUrlRef.current);
      if (debugMatteUrlRef.current) URL.revokeObjectURL(debugMatteUrlRef.current);
      debugRawUrlRef.current = null;
      debugMatteUrlRef.current = null;
      setRuntimeStatus((prev) => (prev.debug ? { ...prev, debug: undefined } : prev));
      return;
    }

    let cancelled = false;
    const intervalMs = 500; // ~2fps lane
    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (debugEncodingInFlightRef.current) return;
      const raw = latestRawPlaneRef.current;
      const matte = latestMattePlaneRef.current;
      if (!raw || !matte) return;
      const newestAt = Math.max(raw.updatedAtMs, matte.updatedAtMs);
      const lastEncodedAt = lastDebugEncodedAtMsRef.current ?? 0;
      if (newestAt <= lastEncodedAt) return;

      debugEncodingInFlightRef.current = true;
      void (async () => {
        try {
          const [rawUrl, matteUrl] = await Promise.all([
            encodePlaneToObjectUrl({ plane: raw, maxWidth: 120, maxHeight: 90 }),
            encodePlaneToObjectUrl({ plane: matte, maxWidth: 120, maxHeight: 90 }),
          ]);
          if (cancelled) return;
          if (rawUrl) {
            if (debugRawUrlRef.current) URL.revokeObjectURL(debugRawUrlRef.current);
            debugRawUrlRef.current = rawUrl;
          }
          if (matteUrl) {
            if (debugMatteUrlRef.current) URL.revokeObjectURL(debugMatteUrlRef.current);
            debugMatteUrlRef.current = matteUrl;
          }
          lastDebugEncodedAtMsRef.current = newestAt;
          setRuntimeStatus((prev) => ({
            ...prev,
            debug: {
              rawMaskDataUrl: debugRawUrlRef.current,
              matteDataUrl: debugMatteUrlRef.current,
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
      lastFrameAtMsRef.current = null;
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
    if (!props.enabled) {
      void secondaryProviderRef.current?.dispose();
      secondaryProviderRef.current = null;
      return;
    }
    if (!secondaryProviderRef.current) {
      secondaryProviderRef.current = new MediapipeSelfieSegmentationProvider({ modelSelection: 0 });
    }
    return () => {
      void secondaryProviderRef.current?.dispose();
      secondaryProviderRef.current = null;
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

      const readiness = provider.getReadiness();
      if (readiness.status === "initializing" && initStartedAtMsRef.current == null) {
        initStartedAtMsRef.current = readiness.startedAtMs;
      }
      if (readiness.status === "ready" && initMsRef.current == null && initStartedAtMsRef.current != null) {
        initMsRef.current = roundToTenth(Math.max(0, nowMs() - initStartedAtMsRef.current));
      }
      if (readiness.status === "failed") {
        try {
          if (!secondaryProviderRef.current) {
            secondaryProviderRef.current = new MediapipeSelfieSegmentationProvider({ modelSelection: 0 });
          }
          await secondaryProviderRef.current.initialize();
        } catch {
          // fallback provider readiness is handled below
        }
      }

      // Basic throttling: cap segmentation to ~10fps in v1.
      const now = nowMs();
      const minFrameGapMs = 1000 / Math.max(1, qualityPolicy.maxSegmentationFps);
      const lastAt = lastFrameAtMsRef.current;
      if (lastAt != null && (now - lastAt) < minFrameGapMs) return;

      if (inFlightRef.current) {
        droppedFramesRef.current += 1;
        setRuntimeStatus((prev) => ({
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
          droppedFrames: droppedFramesRef.current,
          degradedReason: prev.degradedReason ?? "segmentation_busy",
        }));
        return;
      }

      inFlightRef.current = true;
      lastFrameAtMsRef.current = now;
      const frameToken = ++frameTokenRef.current;
      try {
        await provider.initialize();
        const primaryReadiness = provider.getReadiness();
        const primaryStatus = resolveProviderStatus(primaryReadiness);

        let segProvider: SegmentationProvider | null = provider;
        let segProviderSource: "primary" | "secondary" = "primary";
        let seg = await provider.segmentFrame({ video, timestampSec: video.currentTime || 0 });

        const confidence = Number(seg.confidenceSummary.score);
        const lowConfidence = Number.isFinite(confidence) && confidence < 0.05;
        const primaryMaskValid = isSegmentationMaskValid(seg.personMask, seg.width, seg.height);
        if (!primaryMaskValid || lowConfidence) {
          const secondary = secondaryProviderRef.current;
          if (secondary) {
            await secondary.initialize();
            if (secondary.getReadiness().status === "ready") {
              seg = await secondary.segmentFrame({ video, timestampSec: video.currentTime || 0 });
              segProvider = secondary;
              segProviderSource = "secondary";
            }
          }
        }

        if (cancelled || frameToken !== frameTokenRef.current) return;

        const effectiveProviderStatus = resolveProviderStatus(segProvider?.getReadiness() ?? provider.getReadiness());
        const maskValid = isSegmentationMaskValid(seg.personMask, seg.width, seg.height);
        const segConfidence = Number(seg.confidenceSummary.score);
        const maskRejectedReason = !Number.isFinite(segConfidence) || segConfidence < 0.05
          ? "low_confidence"
          : null;

        if (!maskValid || maskRejectedReason) {
          drawPassthroughFrame({ source: video, output: canvas });
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
            frameInput,
          });
          setRuntimeStatus((prev) => ({
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
            frameInput,
            initMs: initMsRef.current,
            avgSegmentationMs: avgSegMsRef.current,
            avgCompositeMs: avgCompMsRef.current,
            lastSegmentationMs: seg.processingMs,
            lastCompositeMs: null,
            lastConfidence: Number.isFinite(segConfidence) ? roundToTenth(segConfidence) : null,
            degradedReason: "segmentation_unavailable",
            statusMessage: "Segmentation unavailable – background treatment disabled",
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
          }));
          return;
        }

        const effectiveFeatherPx = Math.min(props.settings.edgeFeatherPx, qualityPolicy.edgeFeatherCapPx);
        const effectiveExpansionPx = Math.min(props.settings.subjectExpansionPx, qualityPolicy.subjectExpansionCapPx);
        const effectiveTemporal = Math.min(props.settings.temporalSmoothing, qualityPolicy.temporalSmoothingCap);
        const matte = matteRefiner.buildMatte(seg, {
          featherPx: effectiveFeatherPx,
          subjectExpansionPx: effectiveExpansionPx,
          temporalSmoothing: effectiveTemporal,
          quality: props.settings.qualityMode,
        });
        let composite = props.settings.washEnabled
          ? washRenderer.render({ source: video, matte, settings: props.settings, output: canvas })
          : props.settings.replacementEnabled
          ? replacementRenderer.render({ source: video, matte, settings: props.settings, output: canvas })
          : blurRenderer.render({ source: video, matte, settings: props.settings, output: canvas });

        if (props.settings.replacementEnabled && segProviderSource === "secondary") {
          composite = blurRenderer.render({ source: video, matte, settings: props.settings, output: canvas });
          composite = {
            ...composite,
            degradedReason: composite.degradedReason ?? "replacement_downgraded_to_blur",
            warnings: [...composite.warnings, "Primary segmentation failed; using lightweight segmentation with blur fallback."],
          };
        }

        avgSegMsRef.current = avgSegMsRef.current == null
          ? seg.processingMs
          : roundToTenth((avgSegMsRef.current * 0.9) + (seg.processingMs * 0.1));
        avgCompMsRef.current = avgCompMsRef.current == null
          ? composite.compositingMs
          : roundToTenth((avgCompMsRef.current * 0.9) + (composite.compositingMs * 0.1));

        if (props.debugMasks) {
          latestRawPlaneRef.current = {
            width: seg.width,
            height: seg.height,
            alpha: seg.personMask,
            updatedAtMs: nowMs(),
          };
          latestMattePlaneRef.current = {
            width: matte.width,
            height: matte.height,
            alpha: matte.alphaMask,
            updatedAtMs: nowMs(),
          };
        }

        if (props.maskPreviewMode) {
          const maskCtx = canvas.getContext("2d");
          if (maskCtx) {
            const maskImage = maskCtx.createImageData(seg.width, seg.height);
            for (let i = 0, px = 0; i < maskImage.data.length; i += 4, px += 1) {
              const value = seg.personMask[px] ?? 0;
              maskImage.data[i] = value;
              maskImage.data[i + 1] = value;
              maskImage.data[i + 2] = value;
              maskImage.data[i + 3] = 255;
            }
            const temp = document.createElement("canvas");
            temp.width = seg.width;
            temp.height = seg.height;
            const tempCtx = temp.getContext("2d");
            if (tempCtx) {
              tempCtx.putImageData(maskImage, 0, 0);
              maskCtx.clearRect(0, 0, canvas.width, canvas.height);
              maskCtx.drawImage(temp, 0, 0, canvas.width, canvas.height);
            }
          }
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
          frameInput,
        });

        setRuntimeStatus({
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
          lastCompositeMs: composite.compositingMs,
          lastConfidence: roundToTenth(seg.confidenceSummary.score),
          droppedFrames: droppedFramesRef.current,
          degradedReason: composite.degradedReason,
          warnings: [...new Set([...seg.warnings, ...composite.warnings])],
          mask: {
            status: "ok",
            reason: null,
            providerStatus: effectiveProviderStatus,
            providerSource: segProviderSource,
            resolution: { width: seg.width, height: seg.height },
            confidence: roundToTenth(seg.confidenceSummary.score),
            generationMs: seg.processingMs,
          },
          frameInput,
          statusMessage: null,
          debug: props.debugMasks
            ? {
              rawMaskDataUrl: debugRawUrlRef.current,
              matteDataUrl: debugMatteUrlRef.current,
            }
            : undefined,
        });
      } catch (error) {
        drawPassthroughFrame({ source: video, output: canvas });
        const fallbackReadiness = secondaryProviderRef.current?.getReadiness() ?? provider.getReadiness();
        const providerStatus = resolveProviderStatus(fallbackReadiness);
        logSegmentationDiagnostics({
          providerName: provider.name,
          providerStatus,
          providerSource: providerStatus === "failed" ? "none" : "primary",
          maskStatus: "missing",
          reason: "provider_error",
          resolution: null,
          confidence: null,
          generationMs: null,
          frameInput: {
            width: Math.max(0, Math.round(video.videoWidth || 0)),
            height: Math.max(0, Math.round(video.videoHeight || 0)),
            format: "htmlvideoelement",
          },
        });
        setRuntimeStatus((prev) => ({
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
          degradedReason: "segmentation_unavailable",
          statusMessage: "Segmentation unavailable – background treatment disabled",
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
        }));
      } finally {
        inFlightRef.current = false;
      }
    };

    const video = props.videoRef.current;
    const requestVideoFrameCallback = video ? (video as any).requestVideoFrameCallback?.bind(video) as ((cb: () => void) => number) | null : null;
    const cancelVideoFrameCallback = video ? (video as any).cancelVideoFrameCallback?.bind(video) as ((handle: number) => void) | null : null;
    if (video && typeof requestVideoFrameCallback === "function") {
      let handle = 0;
      const loop = () => {
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
  }, [blurRenderer, matteRefiner, props.enabled, props.maskPreviewMode, props.settings, props.videoRef, provider, qualityPolicy, replacementRenderer, washRenderer]);

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
