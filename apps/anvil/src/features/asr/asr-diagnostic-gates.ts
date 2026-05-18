export function shouldEmitAsrVisualGovernorDeadScreenAutopsy(input: {
  alreadyEmittedInWindow: boolean;
  liveAsrActive: boolean;
  visualGovernorHardHoldActive: boolean;
  currentScrollTop: number;
  targetScrollTop: number;
  movedPx: number;
  noCommitMs: number;
  thresholdMs: number;
  freshAdjacentProofContinues: boolean;
  hardContradiction: boolean;
  offscriptNoMatch: boolean;
}): boolean {
  if (input.alreadyEmittedInWindow) return false;
  if (!input.liveAsrActive) return false;
  if (!input.visualGovernorHardHoldActive) return false;
  if (!Number.isFinite(input.currentScrollTop) || !Number.isFinite(input.targetScrollTop)) return false;
  if (Math.abs(Number(input.movedPx) || 0) > 1) return false;
  if (input.targetScrollTop <= input.currentScrollTop + 1) return false;
  if (!input.freshAdjacentProofContinues) return false;
  if (!Number.isFinite(input.noCommitMs) || input.noCommitMs < Math.max(0, input.thresholdMs)) return false;
  if (input.hardContradiction) return false;
  if (input.offscriptNoMatch) return false;
  return true;
}
