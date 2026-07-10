import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EyeContactAssistDisabledReason,
  EyeContactAssistSettings,
  FaceLandmarkProviderReadiness,
  FaceLandmarksFrame,
  GazeEstimate,
  FaceAnalysisResult,
} from "../types";
import { estimateGaze } from "../analysis/gazeEstimator";
import { decideEyeContactAssistApplicability, type EyeRegionStabilityHistory } from "../analysis/applicability";
import { smoothGazeCorrection, type TemporalGazeState } from "../analysis/temporalGazeSmoother";
import { EyeContactAssistRenderer } from "./eyeContactAssistRenderer";
import { selectEyeContactEvidence } from "../analysis/faceAnalysisAuthority";

export type HammerEyeContactAssistRuntimeStatus = {
  provider: {
    name: string;
    readiness: FaceLandmarkProviderReadiness;
  };
  enabled: boolean;
  strength: number;
  active: boolean;
  disabledReason: EyeContactAssistDisabledReason | null;
  disabledDetail: string | null;
  confidence: {
    frame: number | null;
    gaze: number | null;
  };
  pose: FaceLandmarksFrame["pose"] | null;
  correction: {
    rawX: number | null;
    rawY: number | null;
    smoothedX: number | null;
    smoothedY: number | null;
    smoothingWeight: number | null;
  };
  timing: {
    lastProviderMs: number | null;
    avgProviderMs: number | null;
    lastRenderMs: number | null;
    avgRenderMs: number | null;
  };
  warnings: string[];
  debug?: {
    applicabilityReasons: string[];
    smoothingResetReasons: string[];
  };
};

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeCanvasSize(args: { element: HTMLCanvasElement; dpr: number }): { width: number; height: number } {
  const rect = args.element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * args.dpr));
  const height = Math.max(1, Math.round(rect.height * args.dpr));
  return { width, height };
}

function computeContainTransform(args: {
  canvasWidth: number;
  canvasHeight: number;
  videoWidth: number;
  videoHeight: number;
}): { scale: number; offsetX: number; offsetY: number; displayW: number; displayH: number } {
  const vw = Math.max(1, args.videoWidth);
  const vh = Math.max(1, args.videoHeight);
  const scale = Math.min(args.canvasWidth / vw, args.canvasHeight / vh);
  const displayW = vw * scale;
  const displayH = vh * scale;
  const offsetX = (args.canvasWidth - displayW) / 2;
  const offsetY = (args.canvasHeight - displayH) / 2;
  return { scale, offsetX, offsetY, displayW, displayH };
}

export default function EyeContactAssistPreviewLayer(props: {
  enabled: boolean;
  settings: EyeContactAssistSettings;
  providerId?: string | null;
  debugOverlay?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  backgroundCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  useBackgroundCanvasAsSource?: boolean;
  onStatus?: (status: HammerEyeContactAssistRuntimeStatus) => void;
  faceAnalysisResult: FaceAnalysisResult | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderer = useMemo(() => new EyeContactAssistRenderer(), []);
  const providerName = "mediapipe_face_landmarker";

  const baseFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseFrameCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const stabilityHistoryRef = useRef<EyeRegionStabilityHistory | null>(null);
  const temporalRef = useRef<TemporalGazeState | null>(null);

  const avgProviderMsRef = useRef<number | null>(null);
  const avgRenderMsRef = useRef<number | null>(null);
  const lastProcessedAtMsRef = useRef<number | null>(null);

  const [runtimeStatus, setRuntimeStatus] = useState<HammerEyeContactAssistRuntimeStatus>(() => ({
    provider: { name: providerName, readiness: { status: "idle" } },
    enabled: props.settings.enabled,
    strength: props.settings.strength,
    active: false,
    disabledReason: null,
    disabledDetail: null,
    confidence: { frame: null, gaze: null },
    pose: null,
    correction: { rawX: null, rawY: null, smoothedX: null, smoothedY: null, smoothingWeight: null },
    timing: { lastProviderMs: null, avgProviderMs: null, lastRenderMs: null, avgRenderMs: null },
    warnings: [],
    debug: props.debugOverlay ? { applicabilityReasons: [], smoothingResetReasons: [] } : undefined,
  }));

  useEffect(() => {
    props.onStatus?.(runtimeStatus);
  }, [props.onStatus, runtimeStatus]);

  useEffect(() => {
    if (!props.enabled) {
      stabilityHistoryRef.current = null;
      temporalRef.current = null;
      lastProcessedAtMsRef.current = null;
    }
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

    async function tick(): Promise<void> {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const video = props.videoRef.current;
      if (!canvas || !video) {
        const ctx = canvas?.getContext("2d");
        ctx?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
        setRuntimeStatus((prev) => ({
          ...prev,
          provider: { name: providerName, readiness: { status: "idle" } },
          enabled: props.settings.enabled,
          strength: props.settings.strength,
          active: false,
          disabledReason: "no_face",
          disabledDetail: "missing_video_or_canvas",
          warnings: ["missing_video_or_canvas"],
        }));
        return;
      }

      const targetFps = 12;
      const intervalMs = 1000 / targetFps;
      const now = nowMs();
      const lastProcessed = lastProcessedAtMsRef.current;
      if (lastProcessed != null && (now - lastProcessed) < (intervalMs * 0.9)) {
        return;
      }
      lastProcessedAtMsRef.current = now;

      const useBg = Boolean(props.useBackgroundCanvasAsSource) && Boolean(props.backgroundCanvasRef?.current);
      const bgCanvas = props.backgroundCanvasRef?.current ?? null;

      if (!baseFrameCanvasRef.current) {
        baseFrameCanvasRef.current = document.createElement("canvas");
        baseFrameCtxRef.current = baseFrameCanvasRef.current.getContext("2d", { willReadFrequently: false });
      }
      const baseCanvas = baseFrameCanvasRef.current;
      const baseCtx = baseFrameCtxRef.current;
      if (!baseCanvas || !baseCtx) {
        setRuntimeStatus((prev) => ({
          ...prev,
          warnings: ["base_frame_canvas_unavailable"],
        }));
        return;
      }

      if (baseCanvas.width !== canvas.width) baseCanvas.width = canvas.width;
      if (baseCanvas.height !== canvas.height) baseCanvas.height = canvas.height;
      baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);

      if (useBg && bgCanvas) {
        baseCtx.drawImage(bgCanvas, 0, 0, baseCanvas.width, baseCanvas.height);
      } else {
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        if (vw > 0 && vh > 0) {
          const t = computeContainTransform({
            canvasWidth: baseCanvas.width,
            canvasHeight: baseCanvas.height,
            videoWidth: vw,
            videoHeight: vh,
          });
          baseCtx.drawImage(video, t.offsetX, t.offsetY, t.displayW, t.displayH);
        } else {
          baseCtx.drawImage(video, 0, 0, baseCanvas.width, baseCanvas.height);
        }
      }

      let frame: FaceLandmarksFrame | null = null;
      let gaze: GazeEstimate | null = null;
      const providerMs: number | null = null;
      const warnings: string[] = [];
      const analysis = props.faceAnalysisResult;
      const readiness: FaceLandmarkProviderReadiness = analysis?.kind === "unavailable"
        ? { status: "failed", error: analysis.reason }
        : analysis ? { status: "ready" } : { status: "idle" };
      if (analysis?.kind === "success") {
        frame = selectEyeContactEvidence(analysis.faces);
        warnings.push(...analysis.warnings);
        if (!frame && analysis.faces.length > 0) warnings.push("no_eye_contact_eligible_face");
      } else if (analysis?.kind === "failed") warnings.push(`provider_error:${analysis.reason}`);
      else if (analysis?.kind === "unavailable") warnings.push(`provider_unavailable:${analysis.reason}`);

      if (frame) {
        gaze = estimateGaze(frame);
      }

      const { applicability, nextHistory, reasons: applicabilityReasons } = decideEyeContactAssistApplicability({
        frame,
        gaze,
        history: stabilityHistoryRef.current,
      });
      stabilityHistoryRef.current = nextHistory;

      const disabledReason: EyeContactAssistDisabledReason | null = applicability.active ? null : applicability.reason;
      const disabledDetail = applicability.active ? null : (applicability.detail ?? null);

      const smoothing = smoothGazeCorrection({
        previous: temporalRef.current,
        next: {
          providerName,
          timestampSec: frame?.sourceTimestampSec ?? video.currentTime,
          confidence: gaze?.confidenceScore ?? 0,
          correctionX: gaze?.combined.correctionX ?? 0,
          correctionY: gaze?.combined.correctionY ?? 0,
          disabledReason,
        },
        requestedWeight: 0.82,
      });
      temporalRef.current = smoothing.nextState;

      const renderStart = nowMs();
      const result = applicability.active && props.settings.enabled && props.settings.strength > 0 && frame && gaze
        ? renderer.render({
          source: baseCanvas,
          output: canvas,
          frame,
          correction: { x: smoothing.correctionX, y: smoothing.correctionY },
          settings: props.settings,
          confidence: {
            frame: clamp(frame.confidenceScore, 0, 1),
            gaze: clamp(gaze.confidenceScore, 0, 1),
          },
          mapping: useBg ? { mode: "stretch" } : { mode: "contain", videoWidth: video.videoWidth || 1, videoHeight: video.videoHeight || 1 },
          debugOverlay: Boolean(props.debugOverlay),
        })
        : (() => {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          return { applied: false, warnings: [] };
        })();
      const renderEnd = nowMs();
      const renderMs = roundToTenth(renderEnd - renderStart);

      avgProviderMsRef.current = providerMs == null
        ? avgProviderMsRef.current
        : (avgProviderMsRef.current == null ? providerMs : roundToTenth((avgProviderMsRef.current * 0.85) + (providerMs * 0.15)));
      avgRenderMsRef.current = (avgRenderMsRef.current == null)
        ? renderMs
        : roundToTenth((avgRenderMsRef.current * 0.85) + (renderMs * 0.15));

      warnings.push(...(frame?.warnings ?? []));
      warnings.push(...(gaze?.warnings ?? []));
      warnings.push(...result.warnings);

      setRuntimeStatus({
        provider: { name: providerName, readiness },
        enabled: props.settings.enabled,
        strength: props.settings.strength,
        active: Boolean(result.applied) && applicability.active,
        disabledReason,
        disabledDetail,
        confidence: {
          frame: frame ? clamp(frame.confidenceScore, 0, 1) : null,
          gaze: gaze ? clamp(gaze.confidenceScore, 0, 1) : null,
        },
        pose: frame ? frame.pose : null,
        correction: {
          rawX: gaze ? gaze.combined.correctionX : null,
          rawY: gaze ? gaze.combined.correctionY : null,
          smoothedX: gaze ? smoothing.correctionX : null,
          smoothedY: gaze ? smoothing.correctionY : null,
          smoothingWeight: gaze ? smoothing.appliedWeight : null,
        },
        timing: {
          lastProviderMs: providerMs,
          avgProviderMs: avgProviderMsRef.current,
          lastRenderMs: renderMs,
          avgRenderMs: avgRenderMsRef.current,
        },
        warnings,
        debug: props.debugOverlay ? {
          applicabilityReasons,
          smoothingResetReasons: smoothing.resetReasons,
        } : undefined,
      });
    }

    const video = props.videoRef.current;
    const videoFrameSource = video as (HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    }) | null;
    const requestVideoFrameCallback = videoFrameSource?.requestVideoFrameCallback?.bind(videoFrameSource) ?? null;
    const cancelVideoFrameCallback = videoFrameSource?.cancelVideoFrameCallback?.bind(videoFrameSource) ?? null;
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
  }, [
    props.backgroundCanvasRef,
    props.debugOverlay,
    props.enabled,
    props.faceAnalysisResult,
    props.settings,
    props.useBackgroundCanvasAsSource,
    props.videoRef,
    renderer,
  ]);

  if (!props.enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className={props.debugOverlay ? "hammer-preview-eye-contact-canvas is-debug" : "hammer-preview-eye-contact-canvas"}
    />
  );
}

