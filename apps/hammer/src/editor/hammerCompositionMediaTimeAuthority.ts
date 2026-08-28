export type HammerRemovedMediaRange = Readonly<{ startSec: number; endSec: number }>;

/** Maps edited composition time back to the immutable source-media clock. */
export function resolveSourceMediaTimeForCompositionTime(args: {
  compositionTimeSec: number;
  removedSourceRanges: readonly HammerRemovedMediaRange[];
}): number {
  let sourceTimeSec = Math.max(0, args.compositionTimeSec);
  const ranges = args.removedSourceRanges
    .filter((range) => Number.isFinite(range.startSec) && Number.isFinite(range.endSec) && range.endSec > range.startSec)
    .sort((left, right) => left.startSec - right.startSec);
  for (const range of ranges) {
    if (sourceTimeSec < range.startSec) break;
    sourceTimeSec += range.endSec - range.startSec;
  }
  return sourceTimeSec;
}
