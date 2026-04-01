import type { HammerAudioPolishAnalysisSegmentation } from "../persistence/hammerPersistenceContract";
import type { HammerEffectiveCutRegion } from "./hammerAudioEditPlayback";
import { doesTimeRangeOverlapCuts } from "./hammerAudioEditPlayback";

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

export function filterDismissedSilenceCutSuggestions(args: {
  suggestions: HammerSilenceCutSuggestion[] | null | undefined;
  dismissedSuggestionIds: ReadonlySet<string> | null | undefined;
}): HammerSilenceCutSuggestion[] {
  if (!args.suggestions?.length) {
    return [];
  }
  if (!args.dismissedSuggestionIds || args.dismissedSuggestionIds.size === 0) {
    return args.suggestions;
  }
  return args.suggestions.filter((suggestion) => !args.dismissedSuggestionIds?.has(suggestion.id));
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
      if (doesTimeRangeOverlapCuts({
        effectiveCutRegions,
        startSec,
        endSec,
      })) {
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
