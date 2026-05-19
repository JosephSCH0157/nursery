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

export type AsrAdjacentRecoveryCatchupDecision =
  | { allow: true }
  | { allow: false; reason: string };

export function decideAsrAdjacentRecoveryCatchup(input: {
  finalPacketFresh: boolean;
  audioBackendFresh: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  requestedTargetLine: number;
  currentLineIdx: number;
  commitTargetLine: number;
  targetSpeakable: boolean;
  lowEnough: boolean;
  visualErrorPx: number;
  boundedVisualTolerancePx: number;
  bridgeTrapActive: boolean;
  terminalDeadScreenBlockActive: boolean;
  alreadyUsedInEpisode: boolean;
}): AsrAdjacentRecoveryCatchupDecision {
  if (input.alreadyUsedInEpisode) return { allow: false, reason: 'already_used_in_episode' };
  if (!input.finalPacketFresh) return { allow: false, reason: 'stale_final_packet' };
  if (!input.audioBackendFresh) return { allow: false, reason: 'stale_audio_or_backend' };
  if (input.noMatchOrOffscript || input.hardContradiction) {
    return { allow: false, reason: 'no_match_or_offscript' };
  }
  if (!(input.requestedTargetLine > input.currentLineIdx)) {
    return { allow: false, reason: 'non_adjacent_target' };
  }
  if (input.commitTargetLine !== input.currentLineIdx + 1) {
    return { allow: false, reason: 'non_adjacent_target' };
  }
  if (!input.targetSpeakable) return { allow: false, reason: 'non_adjacent_target' };
  if (input.bridgeTrapActive || input.terminalDeadScreenBlockActive) {
    return { allow: false, reason: 'bridge_trap_active' };
  }
  if (!Number.isFinite(input.visualErrorPx) || !Number.isFinite(input.boundedVisualTolerancePx)) {
    return { allow: false, reason: 'visual_error_out_of_bounds' };
  }
  if (Math.abs(input.visualErrorPx) > Math.max(1, input.boundedVisualTolerancePx)) {
    return { allow: false, reason: 'visual_error_out_of_bounds' };
  }
  if (!input.lowEnough) return { allow: false, reason: 'not_low_enough' };
  return { allow: true };
}

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
