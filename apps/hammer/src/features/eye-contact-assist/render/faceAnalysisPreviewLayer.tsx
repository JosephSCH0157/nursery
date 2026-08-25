import { useEffect, useMemo, useRef } from "react";
import type { FaceAnalysisFrame, FaceAnalysisFrameRef, FaceAnalysisResult } from "../types";
import { FaceAnalysisFrameCapture, acceptFaceAnalysisForFrame, cloneFaceAnalysisFrame } from "../analysis/faceAnalysisAuthority";
import type { PlacementFrameAnalysisAuthority } from "../../auto-placement/placementFrameAnalysisAuthority";

export default function FaceAnalysisPreviewLayer(props: {
  demand: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  analysisAuthority: PlacementFrameAnalysisAuthority;
  onResult(result: FaceAnalysisResult | null): void;
  onCapturedFrame?(frame: FaceAnalysisFrame): void;
}) {
  const capture = useMemo(() => new FaceAnalysisFrameCapture(), []);
  const lastRunMs = useRef(0);
  const lastSharedCaptureMs = useRef(Number.NEGATIVE_INFINITY);
  const latestFrameRef = useRef<FaceAnalysisFrameRef | null>(null);

  useEffect(() => {
    if (!props.demand) return;
    let cancelled = false;
    let animationFrame = 0;
    let inFlight = false;
    void props.analysisAuthority.initialize();

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
      void props.analysisAuthority.analyzeFace(frame)
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
  }, [capture, props.analysisAuthority, props.demand, props.onCapturedFrame, props.onResult, props.videoRef]);

  return null;
}
