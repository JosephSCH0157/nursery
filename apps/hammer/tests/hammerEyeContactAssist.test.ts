import assert from "node:assert/strict";
import { estimateGaze } from "../src/features/eye-contact-assist/analysis/gazeEstimator";
import { decideEyeContactAssistApplicability } from "../src/features/eye-contact-assist/analysis/applicability";
import { smoothGazeCorrection } from "../src/features/eye-contact-assist/analysis/temporalGazeSmoother";
import type { FaceLandmarksFrame } from "../src/features/eye-contact-assist/types";

function buildFrame(partial?: Partial<FaceLandmarksFrame>): FaceLandmarksFrame {
  const leftInner = { x: 0.45, y: 0.5 };
  const leftOuter = { x: 0.40, y: 0.5 };
  const rightInner = { x: 0.55, y: 0.5 };
  const rightOuter = { x: 0.60, y: 0.5 };

  const leftUpper = { x: 0.425, y: 0.49 };
  const leftLower = { x: 0.425, y: 0.51 };
  const rightUpper = { x: 0.575, y: 0.49 };
  const rightLower = { x: 0.575, y: 0.51 };

  const leftIris = [
    { x: 0.425, y: 0.50 },
    { x: 0.426, y: 0.50 },
    { x: 0.424, y: 0.50 },
    { x: 0.425, y: 0.499 },
    { x: 0.425, y: 0.501 },
  ];
  const rightIris = [
    { x: 0.575, y: 0.50 },
    { x: 0.576, y: 0.50 },
    { x: 0.574, y: 0.50 },
    { x: 0.575, y: 0.499 },
    { x: 0.575, y: 0.501 },
  ];

  return {
    providerName: "test",
    sourceTimestampSec: 1.0,
    processingMs: 4.2,
    confidenceScore: 0.95,
    warnings: [],
    pose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
    leftEye: {
      innerCorner: leftInner,
      outerCorner: leftOuter,
      upperLid: leftUpper,
      lowerLid: leftLower,
      iris: leftIris,
    },
    rightEye: {
      innerCorner: rightInner,
      outerCorner: rightOuter,
      upperLid: rightUpper,
      lowerLid: rightLower,
      iris: rightIris,
    },
    ...partial,
  };
}

async function main(): Promise<void> {
  {
    const frame = buildFrame();
    const gaze = estimateGaze(frame);
    assert.ok(gaze.confidenceScore > 0.7, "expected gaze confidence high");
    assert.ok(Math.abs(gaze.combined.correctionX) < 0.05, "expected near-zero correction for centered iris");
  }

  {
    const frame = buildFrame({
      leftEye: {
        ...buildFrame().leftEye,
        iris: buildFrame().leftEye.iris.map((p) => ({ ...p, x: p.x + 0.01 })),
      },
      rightEye: {
        ...buildFrame().rightEye,
        iris: buildFrame().rightEye.iris.map((p) => ({ ...p, x: p.x + 0.01 })),
      },
    });
    const gaze = estimateGaze(frame);
    assert.ok(gaze.combined.correctionX < 0, "iris right-of-center should yield negative correction (pull left)");
  }

  {
    const { applicability } = decideEyeContactAssistApplicability({ frame: null, gaze: null, history: null });
    assert.equal(applicability.active, false);
    if (!applicability.active) assert.equal(applicability.reason, "no_face");
  }

  {
    const frame = buildFrame({ confidenceScore: 0.2 });
    const gaze = estimateGaze(frame);
    const { applicability } = decideEyeContactAssistApplicability({ frame, gaze, history: null });
    assert.equal(applicability.active, false);
    if (!applicability.active) assert.equal(applicability.reason, "low_confidence");
  }

  {
    const frame = buildFrame({ pose: { yawDeg: 25, pitchDeg: 0, rollDeg: 0 } });
    const gaze = estimateGaze(frame);
    const { applicability } = decideEyeContactAssistApplicability({ frame, gaze, history: null });
    assert.equal(applicability.active, false);
    if (!applicability.active) assert.equal(applicability.reason, "extreme_pose");
  }

  {
    const frame = buildFrame({
      leftEye: {
        ...buildFrame().leftEye,
        upperLid: { ...buildFrame().leftEye.upperLid, y: 0.499 },
        lowerLid: { ...buildFrame().leftEye.lowerLid, y: 0.501 },
      },
      rightEye: {
        ...buildFrame().rightEye,
        upperLid: { ...buildFrame().rightEye.upperLid, y: 0.499 },
        lowerLid: { ...buildFrame().rightEye.lowerLid, y: 0.501 },
      },
    });
    const gaze = estimateGaze(frame);
    const { applicability } = decideEyeContactAssistApplicability({ frame, gaze, history: null });
    assert.equal(applicability.active, false);
    if (!applicability.active) assert.equal(applicability.reason, "blink_or_eyelid_occlusion");
  }

  {
    const frame = buildFrame({ sourceTimestampSec: 1.05 });
    const gaze = estimateGaze(frame);
    const history = {
      lastTimestampSec: 1.0,
      lastConfidence: 0.9,
      lastLeftOffsetX: -0.6,
      lastLeftOffsetY: 0,
      lastRightOffsetX: -0.6,
      lastRightOffsetY: 0,
    };
    const { applicability } = decideEyeContactAssistApplicability({ frame, gaze, history });
    assert.equal(applicability.active, false);
    if (!applicability.active) assert.equal(applicability.reason, "unstable_eye_region");
  }

  {
    const smoothing = smoothGazeCorrection({
      previous: null,
      next: {
        providerName: "test",
        timestampSec: 1,
        confidence: 0.9,
        correctionX: 0.1,
        correctionY: -0.05,
        disabledReason: null,
      },
      requestedWeight: 0.65,
    });
    assert.equal(smoothing.appliedWeight, 0);

    const smoothing2 = smoothGazeCorrection({
      previous: smoothing.nextState,
      next: {
        providerName: "test",
        timestampSec: 1.1,
        confidence: 0.9,
        correctionX: 0.2,
        correctionY: -0.05,
        disabledReason: null,
      },
      requestedWeight: 0.65,
    });
    assert.ok(smoothing2.appliedWeight > 0);
    assert.ok(smoothing2.correctionX < 0.2 && smoothing2.correctionX > 0.1);
  }

  console.log("Eye contact assist tests passed.");
}

main().catch((error) => {
  console.error("Eye contact assist tests failed:", error);
  process.exit(1);
});

