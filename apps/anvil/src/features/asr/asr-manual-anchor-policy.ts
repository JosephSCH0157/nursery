export type ManualAnchorPendingFreshnessInput = {
  pendingTs: number | null;
  now: number;
  timeoutMs: number;
};

export function isManualAnchorPendingFresh(input: ManualAnchorPendingFreshnessInput): boolean {
  if (input.pendingTs == null) return false;
  return input.now - input.pendingTs < input.timeoutMs;
}

export type ManualAnchorLineWindowInput = {
  targetIndex: number;
  candidateIndex: number;
  windowLines: number;
};

export function isManualAnchorWithinLineWindow(input: ManualAnchorLineWindowInput): boolean {
  return Math.abs(input.targetIndex - input.candidateIndex) <= input.windowLines;
}
