import type { HammerEffectiveCutRegion } from "./hammerAudioEditPlayback";

const MIN_OVERLAY_WIDTH_RATIO = 0.0001;

export interface HammerWaveformCutOverlaySpan {
  startSec: number;
  endSec: number;
  startRatio: number;
  endRatio: number;
  startPct: number;
  widthPct: number;
}

function clampToDuration(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(0, Math.min(durationSec, timeSec));
}

function roundOverlayMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function resolveWaveformCutOverlaySpans(args: {
  cutRegions: HammerEffectiveCutRegion[] | null | undefined;
  durationSec: number;
}): HammerWaveformCutOverlaySpan[] {
  if (!Array.isArray(args.cutRegions) || !Number.isFinite(args.durationSec) || args.durationSec <= 0) {
    return [];
  }

  return [...args.cutRegions]
    .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec)
    .map((region) => {
      const startSec = clampToDuration(region.startSec, args.durationSec);
      const endSec = clampToDuration(region.endSec, args.durationSec);
      const startRatio = startSec / args.durationSec;
      const endRatio = endSec / args.durationSec;
      const widthRatio = endRatio - startRatio;
      if (widthRatio <= MIN_OVERLAY_WIDTH_RATIO) {
        return null;
      }
      return {
        startSec,
        endSec,
        startRatio: roundOverlayMetric(startRatio),
        endRatio: roundOverlayMetric(endRatio),
        startPct: roundOverlayMetric(startRatio * 100),
        widthPct: roundOverlayMetric(widthRatio * 100),
      };
    })
    .filter((span): span is HammerWaveformCutOverlaySpan => span != null);
}
