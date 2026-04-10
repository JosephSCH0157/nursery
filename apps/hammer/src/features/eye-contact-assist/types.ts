export type EyeContactAssistDisabledReason =
  | "no_face"
  | "low_confidence"
  | "extreme_pose"
  | "blink_or_eyelid_occlusion"
  | "unstable_eye_region";

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
  analyzeFrame(args: { video: HTMLVideoElement; timestampSec: number }): Promise<FaceLandmarksFrame | null>;
  dispose(): Promise<void>;
}
