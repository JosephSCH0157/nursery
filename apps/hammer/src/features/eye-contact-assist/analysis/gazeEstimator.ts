import type { FaceLandmarksFrame, FacePoint2D, GazeEstimate } from "../types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function meanPoint(points: FacePoint2D[]): FacePoint2D | null {
  if (points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function eyeCenter(frameEye: FaceLandmarksFrame["leftEye"]): FacePoint2D {
  return {
    x: (frameEye.innerCorner.x + frameEye.outerCorner.x) / 2,
    y: (frameEye.innerCorner.y + frameEye.outerCorner.y) / 2,
  };
}

function distance(a: FacePoint2D, b: FacePoint2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function computeEyeOffsets(args: {
  eye: FaceLandmarksFrame["leftEye"];
}): {
  offsetX: number;
  offsetY: number;
  irisAvailable: boolean;
  eyeWidth: number;
  eyeHeight: number;
} {
  const center = eyeCenter(args.eye);
  const eyeWidth = distance(args.eye.innerCorner, args.eye.outerCorner);
  const eyeHeight = distance(args.eye.upperLid, args.eye.lowerLid);
  const irisCenter = meanPoint(args.eye.iris);
  if (!irisCenter || eyeWidth <= 0 || eyeHeight <= 0) {
    return { offsetX: 0, offsetY: 0, irisAvailable: false, eyeWidth, eyeHeight };
  }

  const offsetX = (irisCenter.x - center.x) / eyeWidth;
  const offsetY = (irisCenter.y - center.y) / eyeHeight;
  return { offsetX, offsetY, irisAvailable: true, eyeWidth, eyeHeight };
}

export function estimateGaze(frame: FaceLandmarksFrame): GazeEstimate {
  const warnings: string[] = [];
  const leftOffsets = computeEyeOffsets({ eye: frame.leftEye });
  const rightOffsets = computeEyeOffsets({ eye: frame.rightEye });

  const maxCorrection = 0.35;
  const leftCorrectionX = clamp(-leftOffsets.offsetX, -maxCorrection, maxCorrection);
  const leftCorrectionY = clamp(-leftOffsets.offsetY, -maxCorrection, maxCorrection);
  const rightCorrectionX = clamp(-rightOffsets.offsetX, -maxCorrection, maxCorrection);
  const rightCorrectionY = clamp(-rightOffsets.offsetY, -maxCorrection, maxCorrection);

  const combined = {
    correctionX: (leftCorrectionX + rightCorrectionX) / 2,
    correctionY: (leftCorrectionY + rightCorrectionY) / 2,
  };

  let confidence = clamp01(frame.confidenceScore);
  if (!leftOffsets.irisAvailable || !rightOffsets.irisAvailable) {
    warnings.push("iris_unavailable");
    confidence *= 0.25;
  }

  const yaw = frame.pose.yawDeg;
  const pitch = frame.pose.pitchDeg;
  const posePenalty = (value: number | null, thresholdDeg: number): number => {
    if (value == null) return 1;
    const abs = Math.abs(value);
    if (abs <= thresholdDeg) return 1;
    return clamp(1 - ((abs - thresholdDeg) / 35), 0, 1);
  };
  confidence *= posePenalty(yaw, 12);
  confidence *= posePenalty(pitch, 10);

  return {
    confidenceScore: clamp01(confidence),
    warnings,
    left: {
      offsetX: leftOffsets.offsetX,
      offsetY: leftOffsets.offsetY,
      correctionX: leftCorrectionX,
      correctionY: leftCorrectionY,
    },
    right: {
      offsetX: rightOffsets.offsetX,
      offsetY: rightOffsets.offsetY,
      correctionX: rightCorrectionX,
      correctionY: rightCorrectionY,
    },
    combined,
  };
}

