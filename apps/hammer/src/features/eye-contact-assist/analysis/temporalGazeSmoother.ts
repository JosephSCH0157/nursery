import type { EyeContactAssistDisabledReason } from "../types";

export type TemporalGazeState = {
  providerName: string;
  lastTimestampSec: number;
  lastCorrectionX: number;
  lastCorrectionY: number;
  lastConfidence: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function shouldResetTemporalGaze(args: {
  previous: TemporalGazeState | null;
  next: {
    providerName: string;
    timestampSec: number;
    confidence: number;
    disabledReason: EyeContactAssistDisabledReason | null;
  };
}): { reset: boolean; reasons: string[] } {
  const prev = args.previous;
  const reasons: string[] = [];

  if (args.next.disabledReason) reasons.push(`disabled:${args.next.disabledReason}`);
  if (!prev) return { reset: reasons.length > 0, reasons };

  if (prev.providerName !== args.next.providerName) reasons.push("provider_change");

  const dt = Math.abs(args.next.timestampSec - prev.lastTimestampSec);
  if (dt >= 0.75) reasons.push("timestamp_jump");

  const confDrop = prev.lastConfidence - args.next.confidence;
  if (confDrop >= 0.2) reasons.push("confidence_drop");

  return { reset: reasons.length > 0, reasons };
}

export function smoothGazeCorrection(args: {
  previous: TemporalGazeState | null;
  next: {
    providerName: string;
    timestampSec: number;
    confidence: number; // 0..1
    correctionX: number;
    correctionY: number;
    disabledReason: EyeContactAssistDisabledReason | null;
  };
  requestedWeight: number; // 0..1, "how much previous to keep"
}): {
  correctionX: number;
  correctionY: number;
  appliedWeight: number;
  reset: boolean;
  resetReasons: string[];
  nextState: TemporalGazeState | null;
} {
  const resetDecision = shouldResetTemporalGaze({
    previous: args.previous,
    next: {
      providerName: args.next.providerName,
      timestampSec: args.next.timestampSec,
      confidence: args.next.confidence,
      disabledReason: args.next.disabledReason,
    },
  });

  if (resetDecision.reset) {
    return {
      correctionX: args.next.correctionX,
      correctionY: args.next.correctionY,
      appliedWeight: 0,
      reset: true,
      resetReasons: resetDecision.reasons,
      nextState: args.next.disabledReason
        ? null
        : {
          providerName: args.next.providerName,
          lastTimestampSec: args.next.timestampSec,
          lastCorrectionX: args.next.correctionX,
          lastCorrectionY: args.next.correctionY,
          lastConfidence: clamp01(args.next.confidence),
        },
    };
  }

  const prev = args.previous;
  if (!prev) {
    return {
      correctionX: args.next.correctionX,
      correctionY: args.next.correctionY,
      appliedWeight: 0,
      reset: false,
      resetReasons: [],
      nextState: {
        providerName: args.next.providerName,
        lastTimestampSec: args.next.timestampSec,
        lastCorrectionX: args.next.correctionX,
        lastCorrectionY: args.next.correctionY,
        lastConfidence: clamp01(args.next.confidence),
      },
    };
  }

  const baseWeight = clamp(args.requestedWeight, 0, 1);
  const confidence = clamp01(args.next.confidence);
  const confidenceScale = clamp((confidence - 0.55) / 0.45, 0, 1);
  const appliedWeight = clamp(baseWeight * confidenceScale, 0, 0.7);

  const wPrev = appliedWeight;
  const wNow = 1 - wPrev;
  let correctionX = (prev.lastCorrectionX * wPrev) + (args.next.correctionX * wNow);
  let correctionY = (prev.lastCorrectionY * wPrev) + (args.next.correctionY * wNow);

  // Clamp per-frame correction velocity to avoid sudden "eye snap" artifacts.
  const maxStep = 0.045;
  const dx = correctionX - prev.lastCorrectionX;
  const dy = correctionY - prev.lastCorrectionY;
  if (Math.abs(dx) > maxStep) correctionX = prev.lastCorrectionX + Math.sign(dx) * maxStep;
  if (Math.abs(dy) > maxStep) correctionY = prev.lastCorrectionY + Math.sign(dy) * maxStep;

  return {
    correctionX,
    correctionY,
    appliedWeight,
    reset: false,
    resetReasons: [],
    nextState: {
      providerName: args.next.providerName,
      lastTimestampSec: args.next.timestampSec,
      lastCorrectionX: correctionX,
      lastCorrectionY: correctionY,
      lastConfidence: confidence,
    },
  };
}

