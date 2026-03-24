export interface HammerAudioTimelineSegmentInput {
  segment_id: string;
  start_sec: number;
  end_sec: number;
  is_disabled?: boolean;
  gain_db?: number;
}

export interface HammerAudioTimelineActiveSegment {
  segment_id: string;
  start_sec: number;
  end_sec: number;
  gain_db: number;
  gain_linear: number;
}

export interface HammerAudioTimelineRenderPlan {
  activeSegments: HammerAudioTimelineActiveSegment[];
  filterComplex: string;
  outputLabel: string;
  summary: Record<string, string | number | boolean | null>;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toLinearFromDb(dbValue: number): number {
  return Math.pow(10, dbValue / 20);
}

function fmt(value: number): string {
  return value.toFixed(3);
}

export function resolveHammerActiveTimelineAudioSegments(
  segments: HammerAudioTimelineSegmentInput[],
): HammerAudioTimelineActiveSegment[] {
  const active: HammerAudioTimelineActiveSegment[] = [];
  for (const segment of segments) {
    if (segment.is_disabled === true) continue;
    const startSec = Number(segment.start_sec);
    const endSec = Number(segment.end_sec);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    if (endSec <= startSec) continue;
    const gainDb = clamp(Number(segment.gain_db ?? 0), -24, 24);
    active.push({
      segment_id: segment.segment_id,
      start_sec: startSec,
      end_sec: endSec,
      gain_db: gainDb,
      gain_linear: toLinearFromDb(gainDb),
    });
  }
  return active;
}

export function buildHammerTimelineAudioRenderPlan(args: {
  segments: HammerAudioTimelineSegmentInput[];
  postFilterChain?: string | null;
}): HammerAudioTimelineRenderPlan | null {
  const activeSegments = resolveHammerActiveTimelineAudioSegments(args.segments);
  if (activeSegments.length === 0) return null;

  const filterParts: string[] = [];
  for (let index = 0; index < activeSegments.length; index += 1) {
    const segment = activeSegments[index];
    filterParts.push(
      `[0:a]atrim=start=${fmt(segment.start_sec)}:end=${fmt(segment.end_sec)},`
      + `asetpts=PTS-STARTPTS,volume=${segment.gain_linear.toFixed(6)}[seg${index}]`,
    );
  }

  const concatInputs = activeSegments.map((_, index) => `[seg${index}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${activeSegments.length}:v=0:a=1[timeline]`);

  const postChain = (args.postFilterChain ?? "").trim();
  if (postChain.length > 0) {
    filterParts.push(`[timeline]${postChain}[outa]`);
  } else {
    filterParts.push("[timeline]anull[outa]");
  }

  return {
    activeSegments,
    filterComplex: filterParts.join(";"),
    outputLabel: "outa",
    summary: {
      total_segments: args.segments.length,
      active_segments: activeSegments.length,
      disabled_segments_excluded: args.segments.filter((segment) => segment.is_disabled === true).length,
      post_filter_chain_applied: postChain.length > 0,
    },
  };
}
