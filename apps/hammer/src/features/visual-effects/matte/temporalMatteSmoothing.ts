import type { SegmentationConfidenceSummary } from "../types";

export type TemporalMatteHistory = {
  width: number;
  height: number;
  providerName: string;
  lastTimestampSec: number;
  lastConfidenceScore: number;
  lastForegroundRatio: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function shouldResetTemporalHistory(args: {
  previous: TemporalMatteHistory | null;
  next: {
    width: number;
    height: number;
    providerName: string;
    timestampSec: number;
    confidence: SegmentationConfidenceSummary;
  };
}): { reset: boolean; reasons: string[] } {
  const prev = args.previous;
  if (!prev) return { reset: false, reasons: [] };

  const reasons: string[] = [];
  if (prev.width !== args.next.width || prev.height !== args.next.height) reasons.push("dimension_change");
  if (prev.providerName !== args.next.providerName) reasons.push("provider_change");

  const dt = Math.abs(args.next.timestampSec - prev.lastTimestampSec);
  // Big seeks / discontinuities smear history forward; reset.
  if (dt >= 1.0) reasons.push("timestamp_jump");

  const confDrop = prev.lastConfidenceScore - args.next.confidence.score;
  if (confDrop >= 0.35) reasons.push("confidence_drop");

  const ratioDelta = Math.abs(args.next.confidence.foregroundRatio - prev.lastForegroundRatio);
  if (ratioDelta >= 0.35) reasons.push("foreground_ratio_shift");

  return { reset: reasons.length > 0, reasons };
}

export function computeEffectiveTemporalWeight(args: {
  requestedWeight: number; // 0..1
  previousConfidenceScore: number | null;
  nextConfidenceScore: number;
}): number {
  const base = clamp(args.requestedWeight, 0, 1);
  if (base <= 0) return 0;

  // Never lean heavily on history when confidence is poor.
  if (args.nextConfidenceScore < 0.35) return 0;

  // If there is no previous confidence, start modest to avoid "snap lag".
  if (args.previousConfidenceScore == null) {
    return clamp(base * 0.6, 0, 0.6);
  }

  const delta = Math.abs(args.nextConfidenceScore - args.previousConfidenceScore);
  // If confidence is unstable, back off to avoid dragging old edges forward.
  if (delta >= 0.25) return clamp(base * 0.25, 0, 0.25);
  if (delta >= 0.12) return clamp(base * 0.5, 0, 0.5);

  // Stable confidence: allow configured weight, but cap to keep motion responsive.
  return clamp(base, 0, 0.75);
}

export function blendAlphaEma(args: {
  previousAlpha: Uint8ClampedArray;
  nextAlpha: Uint8ClampedArray;
  previousWeight: number; // 0..1
}): Uint8ClampedArray {
  const wPrev = clamp(args.previousWeight, 0, 1);
  if (wPrev <= 0) return new Uint8ClampedArray(args.nextAlpha);
  const wNow = 1 - wPrev;
  const length = Math.min(args.previousAlpha.length, args.nextAlpha.length);
  const out = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.round((args.nextAlpha[i]! * wNow) + (args.previousAlpha[i]! * wPrev));
  }
  return out;
}

