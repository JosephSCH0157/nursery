import { useEffect, useMemo, useRef } from "react";
import type { FaceAnalysisFrame, FaceAnalysisFrameRef, FaceAnalysisResult } from "../types";
import { FaceAnalysisFrameCapture, acceptFaceAnalysisForFrame, cloneFaceAnalysisFrame } from "../analysis/faceAnalysisAuthority";
import { createFaceLandmarkProvider, isFaceLandmarkProviderId, type FaceLandmarkProviderId } from "../providers/faceLandmarkProviderRegistry";

export default function FaceAnalysisPreviewLayer(props: {
  demand: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  providerId?: string | null;
  onResult(result: FaceAnalysisResult | null): void;
  onCapturedFrame?(frame: FaceAnalysisFrame): void;
}) {
  const providerId: FaceLandmarkProviderId = isFaceLandmarkProviderId(props.providerId)
    ? props.providerId
    : "mediapipe_face_landmarker";
  const provider = useMemo(() => createFaceLandmarkProvider(providerId), [providerId]);
  const capture = useMemo(() => new FaceAnalysisFrameCapture(), []);
  const lastRunMs = useRef(0);
  const lastSharedCaptureMs = useRef(Number.NEGATIVE_INFINITY);
  const latestFrameRef = useRef<FaceAnalysisFrameRef | null>(null);

  useEffect(() => () => { void provider.dispose(); }, [provider]);

  useEffect(() => {
    if (!props.demand) return;
    let cancelled = false;
    let animationFrame = 0;
    let inFlight = false;
    void provider.initialize();

    const tick = (nowMs: number) => {
      animationFrame = requestAnimationFrame(tick);
      if (cancelled || inFlight || nowMs - lastRunMs.current < (1000 / 12)) return;
      const video = props.videoRef.current;
      if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
        props.onResult({ kind: "unavailable", reason: "analysis_frame_unavailable" });
        return;
      }
      lastRunMs.current = nowMs;
      inFlight = true;
      const frame = capture.capture({
        source: video,
        sourceIdentity: video.currentSrc || video.src || "hammer-preview-video",
        sourcePresentationTimeSec: video.currentTime,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      latestFrameRef.current = frame.frameRef;
      if (props.onCapturedFrame && nowMs - lastSharedCaptureMs.current >= 500) {
        lastSharedCaptureMs.current = nowMs;
        props.onCapturedFrame(cloneFaceAnalysisFrame(frame));
      }
      props.onResult(null);
      void provider.analyzeFrame(frame)
        .then((result) => {
          if (cancelled || !latestFrameRef.current) return;
          const current = acceptFaceAnalysisForFrame(result, latestFrameRef.current);
          if (current) props.onResult(current);
        })
        .catch((error) => {
          if (!cancelled) props.onResult({ kind: "failed", frameRef: frame.frameRef, reason: "provider_inference_failed", warnings: [error instanceof Error ? error.message : String(error)] });
        })
        .finally(() => { frame.release(); inFlight = false; });
    };
    animationFrame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [capture, props.demand, props.onCapturedFrame, props.onResult, props.videoRef, provider]);

  return null;
}
