import { sameFaceAnalysisFrame } from "../eye-contact-assist/analysis/faceAnalysisAuthority";
import type { FaceAnalysisFrameRef, FaceAnalysisResult } from "../eye-contact-assist/types";
import type { FrameBoundPlacementMatteResult } from "./canonicalPlacementAuthority";

export type FrameBoundPlacementEvidencePair = Readonly<{
  frameRef: FaceAnalysisFrameRef;
  matte: FrameBoundPlacementMatteResult;
  face: FaceAnalysisResult;
}>;

type RetainedFrameMap = Readonly<{
  size: number;
  keys: () => MapIterator<string>;
  delete: (key: string) => boolean;
}>;

function frameKey(frameRef: Pick<FaceAnalysisFrameRef, "captureEpoch" | "captureRevision">): string {
  return `${frameRef.captureEpoch}:${frameRef.captureRevision}`;
}

export class PlacementAnalysisLifecycle {
  private currentFrameRef: FaceAnalysisFrameRef | null = null;
  private readonly matteByFrame = new Map<string, FrameBoundPlacementMatteResult>();
  private readonly faceByFrame = new Map<string, FaceAnalysisResult>();
  private readonly retentionLimit: number;

  public constructor(retentionLimit = 8) {
    this.retentionLimit = retentionLimit;
  }

  public requestFrame(frameRef: FaceAnalysisFrameRef): FrameBoundPlacementEvidencePair | null {
    this.currentFrameRef = frameRef;
    return this.currentPair();
  }

  public acceptMatte(result: FrameBoundPlacementMatteResult): FrameBoundPlacementEvidencePair | null {
    this.matteByFrame.set(frameKey(result.frameRef), result);
    this.trim(this.matteByFrame);
    return this.currentPair();
  }

  public acceptFace(
    result: FaceAnalysisResult,
    unavailableFrameRef?: FaceAnalysisFrameRef,
  ): FrameBoundPlacementEvidencePair | null {
    const associatedFrame = result.kind === "unavailable"
      ? unavailableFrameRef ?? this.currentFrameRef
      : result.frameRef;
    if (!associatedFrame) return null;
    this.faceByFrame.set(frameKey(associatedFrame), result);
    this.trim(this.faceByFrame);
    return this.currentPair();
  }

  public currentPair(): FrameBoundPlacementEvidencePair | null {
    const frameRef = this.currentFrameRef;
    if (!frameRef) return null;
    const key = frameKey(frameRef);
    const matte = this.matteByFrame.get(key);
    const face = this.faceByFrame.get(key);
    if (!matte || !face || !sameFaceAnalysisFrame(matte.frameRef, frameRef)) return null;
    if (face.kind !== "unavailable" && !sameFaceAnalysisFrame(face.frameRef, frameRef)) return null;
    return Object.freeze({ frameRef, matte, face });
  }

  public reset(): void {
    this.currentFrameRef = null;
    this.matteByFrame.clear();
    this.faceByFrame.clear();
  }

  public diagnostics(): Readonly<{ currentFrame: string | null; retainedMattes: number; retainedFaces: number }> {
    return Object.freeze({
      currentFrame: this.currentFrameRef ? frameKey(this.currentFrameRef) : null,
      retainedMattes: this.matteByFrame.size,
      retainedFaces: this.faceByFrame.size,
    });
  }

  private trim(map: RetainedFrameMap): void {
    const limit = Math.max(1, Math.floor(this.retentionLimit));
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (typeof oldest !== "string") break;
      map.delete(oldest);
    }
  }
}
