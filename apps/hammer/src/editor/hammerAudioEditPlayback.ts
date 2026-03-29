import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedAudioEdit } from "../persistence/hammerPersistenceContract";
import { resolveEffectivePlaybackTime } from "./hammerWorkspaceTimeline";

export interface HammerEffectiveCutRegion {
  startSec: number;
  endSec: number;
}

const CUT_REGION_MERGE_EPSILON_SEC = 0.001;
const PLAYABLE_TIME_EPSILON_SEC = 0.0001;

function clampToDuration(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(0, Math.min(durationSec, timeSec));
}

function findContainingCut(
  effectiveCutRegions: HammerEffectiveCutRegion[],
  timeSec: number,
): HammerEffectiveCutRegion | null {
  for (const region of effectiveCutRegions) {
    if (timeSec < region.startSec - CUT_REGION_MERGE_EPSILON_SEC) {
      return null;
    }
    if (timeSec >= region.startSec - CUT_REGION_MERGE_EPSILON_SEC && timeSec < region.endSec - CUT_REGION_MERGE_EPSILON_SEC) {
      return region;
    }
  }
  return null;
}

export function doesTimeRangeOverlapCuts(args: {
  effectiveCutRegions: HammerEffectiveCutRegion[];
  startSec: number;
  endSec: number;
}): boolean {
  if (!Number.isFinite(args.startSec) || !Number.isFinite(args.endSec)) {
    return false;
  }

  const startSec = Math.min(args.startSec, args.endSec);
  const endSec = Math.max(args.startSec, args.endSec);
  if (endSec - startSec <= PLAYABLE_TIME_EPSILON_SEC) {
    return false;
  }

  return args.effectiveCutRegions.some((region) => (
    region.startSec < endSec - CUT_REGION_MERGE_EPSILON_SEC
    && region.endSec > startSec + CUT_REGION_MERGE_EPSILON_SEC
  ));
}

export function isTimeRangeFullyCoveredByCuts(args: {
  effectiveCutRegions: HammerEffectiveCutRegion[];
  startSec: number;
  endSec: number;
}): boolean {
  if (!Number.isFinite(args.startSec) || !Number.isFinite(args.endSec)) {
    return false;
  }

  const startSec = Math.min(args.startSec, args.endSec);
  const endSec = Math.max(args.startSec, args.endSec);
  if (endSec - startSec <= PLAYABLE_TIME_EPSILON_SEC) {
    return false;
  }

  return args.effectiveCutRegions.some((region) => (
    region.startSec <= startSec + CUT_REGION_MERGE_EPSILON_SEC
    && region.endSec >= endSec - CUT_REGION_MERGE_EPSILON_SEC
  ));
}

export function normalizeCutOperations(
  operations: HammerPersistedAudioEdit["operations"] | null | undefined,
  durationSec: number,
): HammerEffectiveCutRegion[] {
  if (!Array.isArray(operations) || !Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }

  const normalized = operations
    .map((operation) => ({
      startSec: clampToDuration(operation.start_sec, durationSec),
      endSec: clampToDuration(operation.end_sec, durationSec),
    }))
    .filter((operation) => operation.endSec - operation.startSec > PLAYABLE_TIME_EPSILON_SEC)
    .sort((left, right) => (
      left.startSec - right.startSec
      || left.endSec - right.endSec
    ));

  const merged: HammerEffectiveCutRegion[] = [];
  for (const operation of normalized) {
    const current = merged[merged.length - 1] ?? null;
    if (!current || operation.startSec > current.endSec + CUT_REGION_MERGE_EPSILON_SEC) {
      merged.push({
        startSec: operation.startSec,
        endSec: operation.endSec,
      });
      continue;
    }
    current.endSec = Math.max(current.endSec, operation.endSec);
  }

  return merged;
}

export function getEffectiveCutRegions(
  audioEdit: HammerPersistedAudioEdit | null | undefined,
  durationSec: number,
): HammerEffectiveCutRegion[] {
  return normalizeCutOperations(audioEdit?.operations, durationSec);
}

export function isTimeInsideCut(
  effectiveCutRegions: HammerEffectiveCutRegion[],
  timeSec: number,
): boolean {
  if (!Number.isFinite(timeSec)) return false;
  return findContainingCut(effectiveCutRegions, timeSec) != null;
}

export function getNextPlayableTime(args: {
  effectiveCutRegions: HammerEffectiveCutRegion[];
  timeSec: number;
  durationSec: number;
}): number | null {
  const durationSec = Number.isFinite(args.durationSec) ? Math.max(0, args.durationSec) : 0;
  if (durationSec <= 0) return null;

  let candidate = clampToDuration(args.timeSec, durationSec);
  if (candidate >= durationSec - PLAYABLE_TIME_EPSILON_SEC) {
    return null;
  }

  for (const region of args.effectiveCutRegions) {
    if (candidate < region.startSec - CUT_REGION_MERGE_EPSILON_SEC) {
      return candidate;
    }
    if (candidate >= region.startSec - CUT_REGION_MERGE_EPSILON_SEC && candidate < region.endSec - CUT_REGION_MERGE_EPSILON_SEC) {
      candidate = region.endSec;
      if (candidate >= durationSec - PLAYABLE_TIME_EPSILON_SEC) {
        return null;
      }
    }
  }

  return candidate < durationSec - PLAYABLE_TIME_EPSILON_SEC ? candidate : null;
}

export function resolveNextAudiblePlaybackTime(args: {
  requestedTimeSec: number;
  durationSec: number;
  effectiveCutRegions?: HammerEffectiveCutRegion[] | null;
  audioEdit?: HammerPersistedAudioEdit | null;
  transcriptSegments?: HammerTranscriptSegment[] | null;
}): number | null {
  const durationSec = Number.isFinite(args.durationSec) ? Math.max(0, args.durationSec) : 0;
  if (durationSec <= 0) return null;

  const effectiveCutRegions = args.effectiveCutRegions
    ?? getEffectiveCutRegions(args.audioEdit ?? null, durationSec);
  let candidate = clampToDuration(args.requestedTimeSec, durationSec);
  const maxIterations = Math.max(2, effectiveCutRegions.length + 4);

  for (let index = 0; index < maxIterations; index += 1) {
    const before = candidate;
    const afterTranscript = args.transcriptSegments
      ? resolveEffectivePlaybackTime(args.transcriptSegments, candidate)
      : candidate;
    const nextPlayableTime = getNextPlayableTime({
      effectiveCutRegions,
      timeSec: afterTranscript,
      durationSec,
    });
    if (nextPlayableTime == null) {
      return null;
    }
    candidate = nextPlayableTime;
    if (Math.abs(candidate - before) <= PLAYABLE_TIME_EPSILON_SEC) {
      return candidate;
    }
  }

  return candidate >= durationSec - PLAYABLE_TIME_EPSILON_SEC ? null : candidate;
}
