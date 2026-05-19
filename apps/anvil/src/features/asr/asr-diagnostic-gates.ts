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

export type AsrVisualGovernorDeadScreenEscapeDecision =
  | { allow: true }
  | { allow: false; reason: string };

export function decideAsrVisualGovernorDeadScreenEscape(input: {
  movedPx: number;
  currentLineIdx: number;
  acceptedCommitTargetIdx: number;
  targetSpeakable: boolean;
  hardContradiction: boolean;
  offscriptNoMatch: boolean;
  speechFresh: boolean;
  finalPacketFresh: boolean;
  liveSpeechFresh: boolean;
  freshAdjacentUnlockSeen: boolean;
  suppressedForwardProofCountInWindow: number;
  terminalCommitSuppressedByVisualGovernor: boolean;
  noCommitMs: number;
  governorHoldAgeMs: number;
  thresholdMs: number;
  globalHold: boolean;
}): AsrVisualGovernorDeadScreenEscapeDecision {
  if (Math.abs(Number(input.movedPx) || 0) > 1) return { allow: false, reason: 'scroll_moved' };
  if (!Number.isFinite(input.acceptedCommitTargetIdx) || input.acceptedCommitTargetIdx < 0) {
    return { allow: false, reason: 'no_accepted_commit_target' };
  }
  if (input.acceptedCommitTargetIdx !== input.currentLineIdx + 1) {
    return { allow: false, reason: 'target_not_adjacent' };
  }
  if (!input.targetSpeakable) return { allow: false, reason: 'target_not_speakable' };
  if (input.hardContradiction) return { allow: false, reason: 'hard_contradiction' };
  if (input.offscriptNoMatch) return { allow: false, reason: 'offscript_or_no_match' };
  if (!input.speechFresh) return { allow: false, reason: 'no_fresh_speech' };
  if (!input.finalPacketFresh) return { allow: false, reason: 'no_fresh_final_packet' };
  if (!input.liveSpeechFresh) return { allow: false, reason: 'no_fresh_live_speech' };
  if (!(input.freshAdjacentUnlockSeen || input.suppressedForwardProofCountInWindow > 0)) {
    return { allow: false, reason: 'no_fresh_adjacent_unlock' };
  }
  if (!input.terminalCommitSuppressedByVisualGovernor) {
    return { allow: false, reason: 'no_terminal_suppression' };
  }
  const thresholdMs = Math.max(0, input.thresholdMs);
  const matured =
    (Number.isFinite(input.noCommitMs) && input.noCommitMs >= thresholdMs) ||
    (Number.isFinite(input.governorHoldAgeMs) && input.governorHoldAgeMs >= thresholdMs) ||
    !!input.globalHold;
  if (!matured) return { allow: false, reason: 'hold_not_mature' };
  return { allow: true };
}
