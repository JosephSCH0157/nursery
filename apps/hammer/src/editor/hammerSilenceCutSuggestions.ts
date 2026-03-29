import type { HammerAudioPolishAnalysisSegmentation } from "../persistence/hammerPersistenceContract";
import type { HammerEffectiveCutRegion } from "./hammerAudioEditPlayback";

const SUGGESTION_COVERAGE_EPSILON_SEC = 0.001;
export const DEFAULT_SILENCE_CUT_SUGGESTION_MIN_DURATION_SEC = 1.5;

export interface HammerSilenceCutSuggestion {
  id: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  reason: "long_silence";
  sourceRegionId: string;
}

function clampToDuration(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(0, Math.min(durationSec, timeSec));
}

function roundSuggestionMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isFullyCoveredByCut(
  startSec: number,
  endSec: number,
  effectiveCutRegions: HammerEffectiveCutRegion[],
): boolean {
  return effectiveCutRegions.some((cut) => (
    cut.startSec <= startSec + SUGGESTION_COVERAGE_EPSILON_SEC
    && cut.endSec >= endSec - SUGGESTION_COVERAGE_EPSILON_SEC
  ));
}

export function buildSilenceCutSuggestions(args: {
  segmentation: HammerAudioPolishAnalysisSegmentation | null | undefined;
  durationSec: number;
  effectiveCutRegions?: HammerEffectiveCutRegion[] | null;
  minDurationSec?: number;
}): HammerSilenceCutSuggestion[] {
  if (!args.segmentation || !Number.isFinite(args.durationSec) || args.durationSec <= 0) {
    return [];
  }

  const effectiveCutRegions = args.effectiveCutRegions ?? [];
  const minDurationSec = Number.isFinite(args.minDurationSec)
    ? Math.max(0, args.minDurationSec ?? 0)
    : DEFAULT_SILENCE_CUT_SUGGESTION_MIN_DURATION_SEC;

  return args.segmentation.regions
    .filter((region) => region.kind === "silence")
    .map((region) => {
      const startSec = clampToDuration(region.start_sec, args.durationSec);
      const endSec = clampToDuration(region.end_sec, args.durationSec);
      const durationSec = roundSuggestionMetric(Math.max(0, endSec - startSec));
      if (durationSec < minDurationSec) {
        return null;
      }
      if (isFullyCoveredByCut(startSec, endSec, effectiveCutRegions)) {
        return null;
      }
      return {
        id: `silence-cut:${region.id}`,
        startSec,
        endSec,
        durationSec,
        reason: "long_silence" as const,
        sourceRegionId: region.id,
      };
    })
    .filter((suggestion): suggestion is HammerSilenceCutSuggestion => suggestion != null)
    .sort((left, right) => (
      left.startSec - right.startSec
      || left.endSec - right.endSec
      || left.id.localeCompare(right.id)
    ));
}
