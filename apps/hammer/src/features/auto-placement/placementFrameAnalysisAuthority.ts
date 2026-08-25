import type { FaceAnalysisFrame, FaceAnalysisFrameRef, FaceAnalysisResult, FaceLandmarkProvider } from "../eye-contact-assist/types";
import { createFaceLandmarkProvider, type FaceLandmarkProviderId } from "../eye-contact-assist/providers/faceLandmarkProviderRegistry";
import type { SegmentationProvider, SegmentationProviderReadiness, SegmentationResult } from "../visual-effects/types";
import { createSegmentationProvider, type SegmentationProviderId } from "../visual-effects/providers/segmentationProviderRegistry";
import { MediapipeSelfieSegmentationProvider } from "../visual-effects/providers/mediapipeSelfieSegmentationProvider";
import type { FrameBoundPlacementMatteResult } from "./canonicalPlacementAuthority";
import { PlacementAnalysisLifecycle, type FrameBoundPlacementEvidencePair } from "./placementAnalysisLifecycle";
import { sameFaceAnalysisFrame } from "../eye-contact-assist/analysis/faceAnalysisAuthority";

export type PlacementSegmentationBundleResult = Readonly<{
  result: SegmentationResult;
  providerSource: "primary" | "secondary";
  providerName: string;
  providerReadiness: SegmentationProviderReadiness;
}>;

type ProviderFactories = Readonly<{
  face?: (id: FaceLandmarkProviderId) => FaceLandmarkProvider;
  primarySegmentation?: (id: SegmentationProviderId) => SegmentationProvider;
  fallbackSegmentation?: () => SegmentationProvider;
}>;

function validMask(result: SegmentationResult): boolean {
  return result.width > 0 && result.height > 0
    && result.personMask.length === result.width * result.height;
}

/** Owns exact-frame analysis only; never placement geometry, history, or persistence. */
export class PlacementFrameAnalysisAuthority {
  private static nextAuthorityId = 1;
  private readonly authorityId = `placement-analysis-${PlacementFrameAnalysisAuthority.nextAuthorityId++}`;
  private readonly faceProvider: FaceLandmarkProvider;
  private readonly primarySegmentationProvider: SegmentationProvider;
  private readonly fallbackSegmentationProvider: SegmentationProvider;
  private readonly pairing = new PlacementAnalysisLifecycle();
  private disposed = false;
  private faceAnalysisCount = 0;
  private segmentationAnalysisCount = 0;
  private fallbackSelectionCount = 0;
  private requestedFrameRef: FaceAnalysisFrameRef | null = null;
  private faceInitialization: Promise<void> | null = null;
  private primarySegmentationInitialization: Promise<void> | null = null;
  private fallbackSegmentationInitialization: Promise<void> | null = null;

  public constructor(args: { faceProviderId?: FaceLandmarkProviderId; segmentationProviderId?: SegmentationProviderId; factories?: ProviderFactories } = {}) {
    const faceProviderId = args.faceProviderId ?? "mediapipe_face_landmarker";
    const segmentationProviderId = args.segmentationProviderId ?? "mediapipe_selfie_segmentation";
    this.faceProvider = (args.factories?.face ?? createFaceLandmarkProvider)(faceProviderId);
    this.primarySegmentationProvider = (args.factories?.primarySegmentation ?? createSegmentationProvider)(segmentationProviderId);
    this.fallbackSegmentationProvider = (args.factories?.fallbackSegmentation ?? (() => new MediapipeSelfieSegmentationProvider({ modelSelection: 0 })))();
  }

  public async initialize(): Promise<void> {
    this.assertActive();
    await Promise.all([this.initializeFaceProvider(), this.initializePrimarySegmentationProvider()]);
  }

  public async analyzeFace(frame: FaceAnalysisFrame): Promise<FaceAnalysisResult> {
    this.assertActive();
    await this.initializeFaceProvider();
    this.faceAnalysisCount += 1;
    return this.faceProvider.analyzeFrame(frame);
  }

  public async segmentDisplayedFrame(args: { source: CanvasImageSource; sourcePresentationTimeSec: number }): Promise<PlacementSegmentationBundleResult> {
    this.assertActive();
    await this.initializePrimarySegmentationProvider();
    this.segmentationAnalysisCount += 1;
    let provider = this.primarySegmentationProvider;
    let providerSource: "primary" | "secondary" = "primary";
    let result = await provider.segmentFrame({ source: args.source, timestampSec: args.sourcePresentationTimeSec });
    const maskValid = validMask(result);
    const allBackground = maskValid && !result.personMask.some((alpha) => alpha > 0);
    const confidence = Number(result.confidenceSummary.score);
    const lowConfidence = !allBackground && Number.isFinite(confidence) && confidence < 0.05;
    if (!maskValid || lowConfidence) {
      await this.initializeFallbackSegmentationProvider();
      if (this.fallbackSegmentationProvider.getReadiness().status === "ready") {
        provider = this.fallbackSegmentationProvider;
        providerSource = "secondary";
        result = await provider.segmentFrame({ source: args.source, timestampSec: args.sourcePresentationTimeSec });
        this.fallbackSelectionCount += 1;
      }
    }
    return Object.freeze({ result, providerSource, providerName: provider.name, providerReadiness: provider.getReadiness() });
  }

  public requestDisplayedFrame(frameRef: FaceAnalysisFrameRef): FrameBoundPlacementEvidencePair | null {
    this.assertActive();
    this.requestedFrameRef = frameRef;
    return this.pairing.requestFrame(frameRef);
  }

  public acceptFace(result: FaceAnalysisResult, frameRef?: FaceAnalysisFrameRef): FrameBoundPlacementEvidencePair | null {
    this.assertActive();
    const resultFrameRef = result.kind === "unavailable" ? frameRef ?? this.requestedFrameRef : result.frameRef;
    if (!this.requestedFrameRef || !resultFrameRef || !sameFaceAnalysisFrame(resultFrameRef, this.requestedFrameRef)) return null;
    return this.pairing.acceptFace(result, frameRef);
  }

  public acceptMatte(result: FrameBoundPlacementMatteResult): FrameBoundPlacementEvidencePair | null {
    this.assertActive();
    if (!this.requestedFrameRef || !sameFaceAnalysisFrame(result.frameRef, this.requestedFrameRef)) return null;
    return this.pairing.acceptMatte(result);
  }

  public primarySegmentationName(): string { return this.primarySegmentationProvider.name; }
  public primarySegmentationReadiness(): SegmentationProviderReadiness { return this.primarySegmentationProvider.getReadiness(); }

  public reset(): void {
    if (!this.disposed) {
      this.requestedFrameRef = null;
      this.pairing.reset();
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.requestedFrameRef = null;
    this.pairing.reset();
    await Promise.all([this.faceProvider.dispose(), this.primarySegmentationProvider.dispose(), this.fallbackSegmentationProvider.dispose()]);
  }

  public diagnostics() {
    return Object.freeze({ authorityId: this.authorityId, disposed: this.disposed,
      faceProviderName: this.faceProvider.name, primarySegmentationProviderName: this.primarySegmentationProvider.name,
      fallbackSegmentationProviderName: this.fallbackSegmentationProvider.name, faceAnalysisCount: this.faceAnalysisCount,
      segmentationAnalysisCount: this.segmentationAnalysisCount, fallbackSelectionCount: this.fallbackSelectionCount,
      ...this.pairing.diagnostics() });
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Placement frame analysis authority is disposed.");
  }

  private initializeFaceProvider(): Promise<void> {
    this.faceInitialization ??= this.faceProvider.initialize();
    return this.faceInitialization;
  }

  private initializePrimarySegmentationProvider(): Promise<void> {
    this.primarySegmentationInitialization ??= this.primarySegmentationProvider.initialize();
    return this.primarySegmentationInitialization;
  }

  private initializeFallbackSegmentationProvider(): Promise<void> {
    this.fallbackSegmentationInitialization ??= this.fallbackSegmentationProvider.initialize();
    return this.fallbackSegmentationInitialization;
  }
}
