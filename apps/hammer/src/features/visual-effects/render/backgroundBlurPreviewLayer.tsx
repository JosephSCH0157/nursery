import { useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundBlurSettings, SegmentationProviderReadiness } from "../types";
import type { SegmentationProvider } from "../types";
import type { SegmentationProviderId } from "../providers/segmentationProviderRegistry";
import { createSegmentationProvider, isSegmentationProviderId } from "../providers/segmentationProviderRegistry";
import { SimpleMatteRefiner } from "../matte/simpleMatteRefiner";
import { BackgroundBlurRenderer } from "../effects/backgroundBlurRenderer";

export type HammerBackgroundBlurRuntimeStatus = {
  provider: {
    name: string;
    readiness: SegmentationProviderReadiness;
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
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStatus?: (status: HammerBackgroundBlurRuntimeStatus) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolvedProviderId: SegmentationProviderId = isSegmentationProviderId(props.providerId)
    ? props.providerId
    : "mediapipe_selfie_segmentation";
  const provider = useDefaultSegmentationProvider(props.enabled, resolvedProviderId);
  const matteRefiner = useMemo(() => new SimpleMatteRefiner(), []);
  const renderer = useMemo(() => new BackgroundBlurRenderer(), []);

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

  const [runtimeStatus, setRuntimeStatus] = useState<HammerBackgroundBlurRuntimeStatus>(() => ({
    provider: { name: provider.name, readiness: provider.getReadiness() },
    initMs: null,
    avgSegmentationMs: null,
    avgCompositeMs: null,
    lastSegmentationMs: null,
    lastCompositeMs: null,
    lastConfidence: null,
    droppedFrames: 0,
    degradedReason: null,
    warnings: [],
    debug: undefined,
  }));

  useEffect(() => {
    props.onStatus?.(runtimeStatus);
  }, [props, runtimeStatus]);

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
      return;
    }
    // Keep the last matte for temporal smoothing while enabled.
  }, [matteRefiner, props.enabled]);

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
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness },
          initMs: initMsRef.current,
          degradedReason: "segmentation_provider_failed",
          warnings: [readiness.error],
        }));
        return;
      }

      // Basic throttling: cap segmentation to ~10fps in v1.
      const now = nowMs();
      const maxFps = 10;
      const minFrameGapMs = 1000 / maxFps;
      const lastAt = lastFrameAtMsRef.current;
      if (lastAt != null && (now - lastAt) < minFrameGapMs) return;

      if (inFlightRef.current) {
        droppedFramesRef.current += 1;
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          droppedFrames: droppedFramesRef.current,
          degradedReason: prev.degradedReason ?? "segmentation_busy",
        }));
        return;
      }

      inFlightRef.current = true;
      lastFrameAtMsRef.current = now;
      try {
        await provider.initialize();
        const seg = await provider.segmentFrame({ video, timestampSec: video.currentTime || 0 });
        const matte = matteRefiner.buildMatte(seg, {
          featherPx: props.settings.edgeFeatherPx,
          subjectExpansionPx: props.settings.subjectExpansionPx,
          temporalSmoothing: props.settings.temporalSmoothing,
          quality: props.settings.qualityMode,
        });
        const composite = renderer.render({
          source: video,
          matte,
          settings: props.settings,
          output: canvas,
        });

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

        setRuntimeStatus({
          provider: { name: provider.name, readiness: provider.getReadiness() },
          initMs: initMsRef.current,
          avgSegmentationMs: avgSegMsRef.current,
          avgCompositeMs: avgCompMsRef.current,
          lastSegmentationMs: seg.processingMs,
          lastCompositeMs: composite.compositingMs,
          lastConfidence: roundToTenth(seg.confidenceSummary.score),
          droppedFrames: droppedFramesRef.current,
          degradedReason: composite.degradedReason,
          warnings: [...new Set([...seg.warnings, ...composite.warnings])],
          debug: props.debugMasks
            ? {
              rawMaskDataUrl: debugRawUrlRef.current,
              matteDataUrl: debugMatteUrlRef.current,
            }
            : undefined,
        });
      } catch (error) {
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: provider.name, readiness: provider.getReadiness() },
          initMs: initMsRef.current,
          degradedReason: "segmentation_error",
          warnings: [error instanceof Error ? error.message : "Segmentation failed."],
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
  }, [matteRefiner, props.enabled, props.settings, props.videoRef, provider, renderer]);

  if (!props.enabled) return null;

  const show = props.settings.enabled && (
    props.settings.fallbackMode === "passthrough"
      ? true
      : runtimeStatus.degradedReason == null
  );
  const opacity = show ? 1 : 0;

  return (
    <canvas
      ref={canvasRef}
      className="hammer-preview-matte-canvas"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
      }}
    />
  );
}
