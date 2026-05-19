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

export type AsrVisualRecoveryBoostDecision =
  | { allow: true; minStepPx: number; maxStepPx: number }
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

export function decideAsrVisualRecoveryBoost(input: {
  liveAsrActive: boolean;
  authority: string;
  reason: string;
  speechFresh: boolean;
  proofHealthy: boolean;
  bridgeBlocked: boolean;
  targetDebtPx: number;
  lowStateAgeMs: number;
  insidePreferredSettleBand: boolean;
  insideToleratedBand: boolean;
}): AsrVisualRecoveryBoostDecision {
  if (!input.liveAsrActive) return { allow: false, reason: 'not_live_asr' };
  const authorityEligible =
    input.authority === 'bottom_lock_release' ||
    input.authority === 'preferred_lower_rail_release' ||
    input.authority === 'comfort_nudge';
  if (!authorityEligible) return { allow: false, reason: 'authority_not_eligible' };
  const reasonEligible =
    input.reason === 'below_tolerated_bottom' ||
    input.reason === 'below_preferred_bottom' ||
    input.reason === 'preferred_lower_rail_not_settled';
  if (!reasonEligible) return { allow: false, reason: 'reason_not_eligible' };
  if (!input.speechFresh) return { allow: false, reason: 'speech_not_fresh' };
  if (!input.proofHealthy) return { allow: false, reason: 'proof_not_healthy' };
  if (input.bridgeBlocked) return { allow: false, reason: 'bridge_blocked' };
  if (!Number.isFinite(input.lowStateAgeMs) || input.lowStateAgeMs < 250) {
    return { allow: false, reason: 'low_state_not_mature' };
  }
  const requiredDebtPx =
    input.authority === 'preferred_lower_rail_release'
      ? 250
      : 120;
  if (!Number.isFinite(input.targetDebtPx) || input.targetDebtPx < requiredDebtPx) {
    return { allow: false, reason: 'target_debt_below_threshold' };
  }
  if (input.insidePreferredSettleBand) return { allow: false, reason: 'inside_preferred_settle_band' };
  if (input.insideToleratedBand && input.reason !== 'preferred_lower_rail_not_settled') {
    return { allow: false, reason: 'inside_tolerated_band' };
  }
  const stronger = input.targetDebtPx >= 250;
  return {
    allow: true,
    minStepPx: stronger ? 14 : 12,
    maxStepPx: stronger ? 16 : 14,
  };
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
  audioBackendFresh: boolean;
  bridgeTrapActive: boolean;
  proofSource: string;
  freshAdjacentUnlockSeen: boolean;
  suppressedForwardProofCountInWindow: number;
  terminalCommitSuppressedByVisualGovernor: boolean;
  alreadyUsedInHoldEpisode: boolean;
  noCommitMs: number;
  governorHoldAgeMs: number;
  thresholdMs: number;
  globalHold: boolean;
}): AsrVisualGovernorDeadScreenEscapeDecision {
  const proofSource = String(input.proofSource || '').toLowerCase();
  const unlockProofEligible =
    proofSource.includes('live_strict_local_proof_ok') ||
    proofSource.includes('strict_adjacent_tail_progression') ||
    proofSource.includes('future_tail_lexical');
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
  if (!input.audioBackendFresh) return { allow: false, reason: 'stale_audio_or_backend' };
  if (input.bridgeTrapActive) return { allow: false, reason: 'bridge_trap_active' };
  if (input.alreadyUsedInHoldEpisode) return { allow: false, reason: 'already_used_in_hold_episode' };
  if (!(input.freshAdjacentUnlockSeen || input.suppressedForwardProofCountInWindow > 0)) {
    return { allow: false, reason: 'no_fresh_adjacent_unlock' };
  }
  if (
    !input.terminalCommitSuppressedByVisualGovernor &&
    !(input.freshAdjacentUnlockSeen && unlockProofEligible)
  ) {
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
