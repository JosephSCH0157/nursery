export type EyeContactAssistDisabledReason =
  | "no_face"
  | "low_confidence"
  | "extreme_pose"
  | "blink_or_eyelid_occlusion"
  | "unstable_eye_region"
  | "partial_face_or_one_eye_uncertain"
  | "asymmetric_eye_divergence";

export type FaceLandmarkProviderReadiness =
  | { status: "idle" }
  | { status: "initializing"; startedAtMs: number }
  | { status: "ready" }
  | { status: "failed"; error: string };

export type FacePoint2D = {
  x: number; // 0..1, normalized to image width
  y: number; // 0..1, normalized to image height
  z?: number; // optional provider hint (typically normalized depth)
};

export type FaceAnalysisFrameRef = Readonly<{
  captureEpoch: string;
  captureRevision: number;
  sourceIdentity: string;
  sourcePresentationTimeSec: number;
  inferenceTimestampMs: number;
  width: number;
  height: number;
  coordinateSpace: "placement_source_pixels";
  geometricRevision: string;
}>;

export type FaceAnalysisPixelBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

export type FaceAnalysisFrame = Readonly<{
  pixels: CanvasImageSource;
  frameRef: FaceAnalysisFrameRef;
  release(): void;
}>;

export type EyeLandmarks = {
  innerCorner: FacePoint2D;
  outerCorner: FacePoint2D;
  upperLid: FacePoint2D;
  lowerLid: FacePoint2D;
  iris: FacePoint2D[]; // expected length 5 when available
};

export type FacePoseHint = {
  yawDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
};

export type FaceLandmarksFrame = {
  providerName: string;
  sourceTimestampSec: number;
  processingMs: number;
  confidenceScore: number; // 0..1
  warnings: string[];
  pose: FacePoseHint;
  leftEye: EyeLandmarks;
  rightEye: EyeLandmarks;
};

export type AnalyzedFace = Readonly<{
  providerIndex: number;
  normalizedLandmarks: readonly FacePoint2D[];
  faceBoundsPx: FaceAnalysisPixelBounds;
  headSafeBoundsPx: FaceAnalysisPixelBounds;
  eyeContactEvidence: FaceLandmarksFrame | null;
}>;

export type FaceAnalysisResult =
  | Readonly<{ kind: "success"; frameRef: FaceAnalysisFrameRef; faces: readonly AnalyzedFace[]; warnings: readonly string[] }>
  | Readonly<{ kind: "unavailable"; reason: string }>
  | Readonly<{ kind: "failed"; frameRef: FaceAnalysisFrameRef; reason: string; warnings: readonly string[] }>;

export type EvaluatedFaceAnalysis =
  | Readonly<{ kind: "current"; result: FaceAnalysisResult }>
  | Readonly<{ kind: "stale"; result: Exclude<FaceAnalysisResult, { kind: "unavailable" }>; requestedFrameRef: FaceAnalysisFrameRef }>;

export type GazeEstimate = {
  confidenceScore: number; // 0..1
  warnings: string[];
  left: { offsetX: number; offsetY: number; correctionX: number; correctionY: number };
  right: { offsetX: number; offsetY: number; correctionX: number; correctionY: number };
  combined: { correctionX: number; correctionY: number };
};

export type EyeContactAssistApplicability =
  | { active: true }
  | { active: false; reason: EyeContactAssistDisabledReason; detail?: string };

export type EyeContactAssistSettings = {
  enabled: boolean;
  strength: number; // 0..1
};

export interface FaceLandmarkProvider {
  readonly name: string;
  initialize(): Promise<void>;
  isReady(): boolean;
  getReadiness(): FaceLandmarkProviderReadiness;
  analyzeFrame(frame: FaceAnalysisFrame): Promise<FaceAnalysisResult>;
  dispose(): Promise<void>;
}
