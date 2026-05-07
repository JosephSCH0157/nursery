import type {
  EyeContactAssistApplicability,
  EyeContactAssistDisabledReason,
  FaceLandmarksFrame,
  FacePoint2D,
  GazeEstimate,
} from "../types";

export type EyeRegionStabilityHistory = {
  lastTimestampSec: number;
  lastConfidence: number;
  lastLeftOffsetX: number;
  lastLeftOffsetY: number;
  lastRightOffsetX: number;
  lastRightOffsetY: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: FacePoint2D, b: FacePoint2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(eye: FaceLandmarksFrame["leftEye"]): number | null {
  const width = distance(eye.innerCorner, eye.outerCorner);
  const height = distance(eye.upperLid, eye.lowerLid);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0) return null;
  return height / width;
}

function decide(
  active: boolean,
  reason?: EyeContactAssistDisabledReason,
  detail?: string,
): EyeContactAssistApplicability {
  if (active) return { active: true };
  return { active: false, reason: reason ?? "low_confidence", detail };
}

export function decideEyeContactAssistApplicability(args: {
  frame: FaceLandmarksFrame | null;
  gaze: GazeEstimate | null;
  history: EyeRegionStabilityHistory | null;
}): {
  applicability: EyeContactAssistApplicability;
  nextHistory: EyeRegionStabilityHistory | null;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!args.frame) {
    return {
      applicability: decide(false, "no_face"),
      nextHistory: null,
      reasons: ["no_face"],
    };
  }
  if (!args.gaze) {
    return {
      applicability: decide(false, "low_confidence", "missing_gaze"),
      nextHistory: null,
      reasons: ["missing_gaze"],
    };
  }

  const yaw = args.frame.pose.yawDeg;
  const pitch = args.frame.pose.pitchDeg;
  const maxYaw = 12;
  const maxPitch = 10;
  if ((yaw != null && Math.abs(yaw) > maxYaw) || (pitch != null && Math.abs(pitch) > maxPitch)) {
    reasons.push("extreme_pose");
    return {
      applicability: decide(false, "extreme_pose", `yaw=${yaw?.toFixed(1) ?? "?"} pitch=${pitch?.toFixed(1) ?? "?"}`),
      nextHistory: null,
      reasons,
    };
  }

  const leftEar = eyeAspectRatio(args.frame.leftEye);
  const rightEar = eyeAspectRatio(args.frame.rightEye);
  const blinkThreshold = 0.2;
  if (
    (leftEar != null && leftEar < blinkThreshold)
    || (rightEar != null && rightEar < blinkThreshold)
  ) {
    reasons.push("blink_or_eyelid_occlusion");
    return {
      applicability: decide(false, "blink_or_eyelid_occlusion", `earL=${leftEar?.toFixed(2) ?? "?"} earR=${rightEar?.toFixed(2) ?? "?"}`),
      nextHistory: null,
      reasons,
    };
  }

  const leftIrisCount = Array.isArray(args.frame.leftEye.iris) ? args.frame.leftEye.iris.length : 0;
  const rightIrisCount = Array.isArray(args.frame.rightEye.iris) ? args.frame.rightEye.iris.length : 0;
  const minIrisPoints = 4;
  if (leftIrisCount < minIrisPoints || rightIrisCount < minIrisPoints) {
    reasons.push("partial_face_or_one_eye_uncertain");
    return {
      applicability: decide(
        false,
        "partial_face_or_one_eye_uncertain",
        `irisL=${leftIrisCount} irisR=${rightIrisCount}`,
      ),
      nextHistory: null,
      reasons,
    };
  }

  const frameConfidence = clamp(args.frame.confidenceScore, 0, 1);
  const gazeConfidence = clamp(args.gaze.confidenceScore, 0, 1);
  const minConfidence = 0.7;
  if (frameConfidence < minConfidence || gazeConfidence < minConfidence) {
    reasons.push("low_confidence");
    return {
      applicability: decide(false, "low_confidence", `frame=${frameConfidence.toFixed(2)} gaze=${gazeConfidence.toFixed(2)}`),
      nextHistory: null,
      reasons,
    };
  }

  const eyeDivergence = Math.max(
    Math.abs(args.gaze.left.correctionX - args.gaze.right.correctionX),
    Math.abs(args.gaze.left.correctionY - args.gaze.right.correctionY),
  );
  const maxEyeDivergence = 0.12;
  if (eyeDivergence > maxEyeDivergence) {
    reasons.push("asymmetric_eye_divergence");
    return {
      applicability: decide(
        false,
        "asymmetric_eye_divergence",
        `divergence=${eyeDivergence.toFixed(2)}`,
      ),
      nextHistory: null,
      reasons,
    };
  }

  const prev = args.history;
  const dt = prev ? Math.abs(args.frame.sourceTimestampSec - prev.lastTimestampSec) : null;
  if (prev && dt != null && dt > 0 && dt < 0.25) {
    const dlx = Math.abs(args.gaze.left.offsetX - prev.lastLeftOffsetX);
    const dly = Math.abs(args.gaze.left.offsetY - prev.lastLeftOffsetY);
    const drx = Math.abs(args.gaze.right.offsetX - prev.lastRightOffsetX);
    const dry = Math.abs(args.gaze.right.offsetY - prev.lastRightOffsetY);
    const maxDelta = Math.max(dlx, dly, drx, dry);
    if (maxDelta >= 0.22) {
      reasons.push("unstable_eye_region");
      return {
        applicability: decide(false, "unstable_eye_region", `max_delta=${maxDelta.toFixed(2)} dt=${dt.toFixed(2)}s`),
        nextHistory: null,
        reasons,
      };
    }

    const confDrop = prev.lastConfidence - gazeConfidence;
    if (confDrop >= 0.2) {
      reasons.push("unstable_eye_region");
      return {
        applicability: decide(false, "unstable_eye_region", `confidence_drop=${confDrop.toFixed(2)}`),
        nextHistory: null,
        reasons,
      };
    }
  }

  const nextHistory: EyeRegionStabilityHistory = {
    lastTimestampSec: args.frame.sourceTimestampSec,
    lastConfidence: gazeConfidence,
    lastLeftOffsetX: args.gaze.left.offsetX,
    lastLeftOffsetY: args.gaze.left.offsetY,
    lastRightOffsetX: args.gaze.right.offsetX,
    lastRightOffsetY: args.gaze.right.offsetY,
  };

  return {
    applicability: decide(true),
    nextHistory,
    reasons,
  };
}

