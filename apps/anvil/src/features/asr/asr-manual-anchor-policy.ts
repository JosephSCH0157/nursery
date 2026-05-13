export type ManualAnchorPendingFreshnessInput = {
  pendingTs: number | null;
  now: number;
  timeoutMs: number;
};

export function isManualAnchorPendingFresh(input: ManualAnchorPendingFreshnessInput): boolean {
  if (input.pendingTs == null) return false;
  return input.now - input.pendingTs < input.timeoutMs;
}
