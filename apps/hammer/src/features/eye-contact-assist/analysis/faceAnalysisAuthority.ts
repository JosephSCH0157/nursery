import type {
  EvaluatedFaceAnalysis,
  FaceAnalysisFrame,
  FaceAnalysisFrameRef,
  FaceAnalysisPixelBounds,
  FaceAnalysisResult,
  FacePoint2D,
  AnalyzedFace,
  FaceLandmarksFrame,
} from "../types";

export const MAX_ANALYZED_FACES = 8;
export const HEAD_SAFE_EXPANSION = Object.freeze({ side: 0.2, top: 0.35, bottom: 0.18 });

export function sameFaceAnalysisFrame(a: FaceAnalysisFrameRef, b: FaceAnalysisFrameRef): boolean {
  return a.captureEpoch === b.captureEpoch
    && a.captureRevision === b.captureRevision
    && a.sourceIdentity === b.sourceIdentity
    && a.sourcePresentationTimeSec === b.sourcePresentationTimeSec
    && a.width === b.width
    && a.height === b.height
    && a.coordinateSpace === b.coordinateSpace
    && a.geometricRevision === b.geometricRevision;
}

export function evaluateFaceAnalysis(result: FaceAnalysisResult, requestedFrameRef: FaceAnalysisFrameRef): EvaluatedFaceAnalysis {
  if (result.kind === "unavailable") return { kind: "current", result };
  return sameFaceAnalysisFrame(result.frameRef, requestedFrameRef)
    ? { kind: "current", result }
    : { kind: "stale", result, requestedFrameRef };
}

export function acceptFaceAnalysisForFrame(
  result: FaceAnalysisResult,
  requestedFrameRef: FaceAnalysisFrameRef,
): FaceAnalysisResult | null {
  return evaluateFaceAnalysis(result, requestedFrameRef).kind === "current" ? result : null;
}

export function selectEyeContactEvidence(faces: readonly AnalyzedFace[]): FaceLandmarksFrame | null {
  return faces.find((face) => face.eyeContactEvidence != null)?.eyeContactEvidence ?? null;
}

export function deriveFaceBoundsPx(points: readonly FacePoint2D[], frame: Pick<FaceAnalysisFrameRef, "width" | "height">): FaceAnalysisPixelBounds | null {
  if (points.length === 0 || frame.width <= 0 || frame.height <= 0) return null;
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length !== points.length) return null;
  const minX = Math.max(0, Math.min(1, Math.min(...finite.map((point) => point.x))));
  const maxX = Math.max(0, Math.min(1, Math.max(...finite.map((point) => point.x))));
  const minY = Math.max(0, Math.min(1, Math.min(...finite.map((point) => point.y))));
  const maxY = Math.max(0, Math.min(1, Math.max(...finite.map((point) => point.y))));
  if (maxX <= minX || maxY <= minY) return null;
  return { x: minX * frame.width, y: minY * frame.height, width: (maxX - minX) * frame.width, height: (maxY - minY) * frame.height };
}

export function deriveHeadSafeBoundsPx(face: FaceAnalysisPixelBounds, frame: Pick<FaceAnalysisFrameRef, "width" | "height">): FaceAnalysisPixelBounds {
  const left = Math.max(0, face.x - (face.width * HEAD_SAFE_EXPANSION.side));
  const top = Math.max(0, face.y - (face.height * HEAD_SAFE_EXPANSION.top));
  const right = Math.min(frame.width, face.x + face.width + (face.width * HEAD_SAFE_EXPANSION.side));
  const bottom = Math.min(frame.height, face.y + face.height + (face.height * HEAD_SAFE_EXPANSION.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export class FaceAnalysisFrameCapture {
  private revision = 0;
  private inferenceTimestampMs = 0;
  private readonly epoch: string;
  public constructor(
    epochFactory: () => string = () => crypto.randomUUID(),
    privateCanvasFactory: () => HTMLCanvasElement = () => document.createElement("canvas"),
  ) {
    this.epoch = epochFactory();
    this.canvasFactory = privateCanvasFactory;
  }
  private readonly canvasFactory: () => HTMLCanvasElement;

  public capture(args: { source: CanvasImageSource; sourceIdentity: string; sourcePresentationTimeSec: number; width: number; height: number; geometricRevision?: string }): FaceAnalysisFrame {
    const canvas = this.canvasFactory();
    canvas.width = args.width;
    canvas.height = args.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Face analysis capture canvas unavailable.");
    ctx.drawImage(args.source, 0, 0, args.width, args.height);
    this.revision += 1;
    this.inferenceTimestampMs += 1;
    const frameRef: FaceAnalysisFrameRef = Object.freeze({
      captureEpoch: this.epoch,
      captureRevision: this.revision,
      sourceIdentity: args.sourceIdentity,
      sourcePresentationTimeSec: args.sourcePresentationTimeSec,
      inferenceTimestampMs: this.inferenceTimestampMs,
      width: args.width,
      height: args.height,
      coordinateSpace: "placement_source_pixels",
      geometricRevision: args.geometricRevision ?? `${args.width}x${args.height}:identity`,
    });
    return Object.freeze({ pixels: canvas, frameRef, release: () => { canvas.width = 0; canvas.height = 0; } });
  }
}
