import type { FaceAnalysisFrameRef } from "../eye-contact-assist/types";

export type PlacementDisplaySnapshot = Readonly<{
  sourceIdentity: string;
  sourcePresentationTimeSec: number;
  width: number;
  height: number;
  coordinateSpace: FaceAnalysisFrameRef["coordinateSpace"];
  geometricRevision: string;
  playbackActive: boolean;
}>;

export type PlacementFrameDisplayEvaluation =
  | Readonly<{ kind: "current" }>
  | Readonly<{
    kind: "changed";
    reason: "playback_active" | "source_changed" | "presentation_time_changed" | "dimensions_changed" | "coordinate_space_changed" | "geometry_changed";
  }>;

export function evaluatePlacementFrameAgainstDisplay(
  requested: FaceAnalysisFrameRef,
  displayed: PlacementDisplaySnapshot,
): PlacementFrameDisplayEvaluation {
  if (displayed.playbackActive) return Object.freeze({ kind: "changed", reason: "playback_active" });
  if (displayed.sourceIdentity !== requested.sourceIdentity) return Object.freeze({ kind: "changed", reason: "source_changed" });
  if (Math.abs(displayed.sourcePresentationTimeSec - requested.sourcePresentationTimeSec) > 0.001) {
    return Object.freeze({ kind: "changed", reason: "presentation_time_changed" });
  }
  if (displayed.width !== requested.width || displayed.height !== requested.height) {
    return Object.freeze({ kind: "changed", reason: "dimensions_changed" });
  }
  if (displayed.coordinateSpace !== requested.coordinateSpace) {
    return Object.freeze({ kind: "changed", reason: "coordinate_space_changed" });
  }
  if (displayed.geometricRevision !== requested.geometricRevision) {
    return Object.freeze({ kind: "changed", reason: "geometry_changed" });
  }
  return Object.freeze({ kind: "current" });
}

export function readPlacementDisplaySnapshot(args: {
  video: HTMLVideoElement | null;
  playbackActive: boolean;
}): PlacementDisplaySnapshot | null {
  const video = args.video;
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  return Object.freeze({
    sourceIdentity: video.currentSrc || video.src || "hammer-preview-video",
    sourcePresentationTimeSec: video.currentTime,
    width: video.videoWidth,
    height: video.videoHeight,
    coordinateSpace: "placement_source_pixels",
    geometricRevision: `${video.videoWidth}x${video.videoHeight}:identity`,
    playbackActive: args.playbackActive,
  });
}
