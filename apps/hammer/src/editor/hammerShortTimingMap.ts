export const HAMMER_SHORT_TIMING_MAP_VERSION = 1 as const;

export interface HammerShortTimingMapInterval {
  segment_id: string;
  source_start_sec: number;
  source_end_sec: number;
  output_start_sec: number;
  output_end_sec: number;
}

export interface HammerShortTimingMapV1 {
  version: typeof HAMMER_SHORT_TIMING_MAP_VERSION;
  intervals: HammerShortTimingMapInterval[];
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeHammerShortTimingMap(value: unknown): HammerShortTimingMapV1 | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { version?: unknown; intervals?: unknown };
  if (candidate.version !== HAMMER_SHORT_TIMING_MAP_VERSION || !Array.isArray(candidate.intervals) || candidate.intervals.length === 0) return null;
  const intervals: HammerShortTimingMapInterval[] = [];
  for (const raw of candidate.intervals) {
    if (!raw || typeof raw !== "object") return null;
    const interval = raw as Record<string, unknown>;
    if (typeof interval.segment_id !== "string" || !interval.segment_id.trim()
      || !finiteNonNegative(interval.source_start_sec) || !finiteNonNegative(interval.source_end_sec)
      || !finiteNonNegative(interval.output_start_sec) || !finiteNonNegative(interval.output_end_sec)
      || interval.source_end_sec <= interval.source_start_sec || interval.output_end_sec <= interval.output_start_sec) return null;
    intervals.push({
      segment_id: interval.segment_id,
      source_start_sec: interval.source_start_sec,
      source_end_sec: interval.source_end_sec,
      output_start_sec: interval.output_start_sec,
      output_end_sec: interval.output_end_sec,
    });
  }
  intervals.sort((left, right) => left.output_start_sec - right.output_start_sec || left.source_start_sec - right.source_start_sec);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index]!.output_start_sec < intervals[index - 1]!.output_end_sec) return null;
  }
  return { version: HAMMER_SHORT_TIMING_MAP_VERSION, intervals };
}

function interpolate(value: number, inputStart: number, inputEnd: number, outputStart: number, outputEnd: number): number {
  const ratio = Math.max(0, Math.min(1, (value - inputStart) / (inputEnd - inputStart)));
  return outputStart + ratio * (outputEnd - outputStart);
}

export function hammerShortOutputTimeToSourceTime(map: HammerShortTimingMapV1, outputTimeSec: number): number {
  const time = Math.max(0, Number.isFinite(outputTimeSec) ? outputTimeSec : 0);
  const first = map.intervals[0]!;
  if (time <= first.output_start_sec) return first.source_start_sec;
  for (const interval of map.intervals) {
    if (time <= interval.output_end_sec) {
      if (time < interval.output_start_sec) return interval.source_start_sec;
      return interpolate(time, interval.output_start_sec, interval.output_end_sec, interval.source_start_sec, interval.source_end_sec);
    }
  }
  return map.intervals[map.intervals.length - 1]!.source_end_sec;
}

export function hammerShortSourceTimeToOutputTime(map: HammerShortTimingMapV1, sourceTimeSec: number): number {
  const time = Math.max(0, Number.isFinite(sourceTimeSec) ? sourceTimeSec : 0);
  let nearest = map.intervals[0]!;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const interval of map.intervals) {
    if (time >= interval.source_start_sec && time <= interval.source_end_sec) {
      return interpolate(time, interval.source_start_sec, interval.source_end_sec, interval.output_start_sec, interval.output_end_sec);
    }
    const distance = Math.min(Math.abs(time - interval.source_start_sec), Math.abs(time - interval.source_end_sec));
    if (distance < nearestDistance) {
      nearest = interval;
      nearestDistance = distance;
    }
  }
  return time < nearest.source_start_sec ? nearest.output_start_sec : nearest.output_end_sec;
}
