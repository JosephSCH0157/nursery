import type { AsrActuatorGear } from './asr-diagnostics';

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

export type AsrPostAdjacentCommitVisualRecoveryDecision =
  | { allow: true; minStepPx: number; maxStepPx: number }
  | { allow: false; reason: string };

export type AsrActuatorRecoveryGearDecision = {
  selectedGear: AsrActuatorGear;
  minStepPx: number;
  maxStepPx: number;
  reason: string;
  hardSafetyClear: boolean;
  speechFresh: boolean;
  backendFresh: boolean;
  safeTarget: boolean;
  cappedTargetSafe: boolean;
  safetyClass: 'absolute_hold' | 'distance_restrict_only' | 'clear';
  distanceRestrictionReason: string;
  absoluteHoldReason: string;
  urgentRecoveryEligible: boolean;
  urgentRecoveryBlockedReason: string;
};

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

export function decideAsrPostAdjacentCommitVisualRecovery(input: {
  windowActive: boolean;
  speechFresh: boolean;
  finalPacketFresh: boolean;
  liveSpeechFresh: boolean;
  audioBackendFresh: boolean;
  noMatchOrOffscript: boolean;
  bridgeTrapActive: boolean;
  deadScreenActive: boolean;
  alreadyInBand: boolean;
  targetDebtPx: number;
}): AsrPostAdjacentCommitVisualRecoveryDecision {
  if (!input.windowActive) return { allow: false, reason: 'window_expired' };
  if (input.bridgeTrapActive) return { allow: false, reason: 'bridge_trap_active' };
  if (input.deadScreenActive) return { allow: false, reason: 'dead_screen_active' };
  if (input.noMatchOrOffscript) return { allow: false, reason: 'no_match_or_offscript' };
  if (
    !input.speechFresh ||
    !input.finalPacketFresh ||
    !input.liveSpeechFresh ||
    !input.audioBackendFresh
  ) {
    return { allow: false, reason: 'stale_speech' };
  }
  if (input.alreadyInBand) return { allow: false, reason: 'already_in_band' };
  if (!Number.isFinite(input.targetDebtPx) || input.targetDebtPx < 80) {
    return { allow: false, reason: 'debt_too_small' };
  }
  const stronger = input.targetDebtPx >= 250;
  return {
    allow: true,
    minStepPx: stronger ? 14 : 12,
    maxStepPx: stronger ? 18 : 16,
  };
}

export function decideAsrActuatorRecoveryGear(input: {
  liveAsrActive: boolean;
  currentLineIdx: number;
  acceptedCommitTargetIdx: number;
  cappedTargetIdx: number;
  authority: string;
  visualRecoveryState: string;
  reason: string;
  targetDebtPx: number;
  nextSpeakableLineY: number;
  preferredBandBottom: number;
  hardSafetyState: string;
  safetyCapState: string;
  speechFresh: boolean;
  backendFresh: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  terminalClampActive: boolean;
  recoveryActive: boolean;
  recoveryMinStepPx: number;
  recoveryMaxStepPx: number;
}): AsrActuatorRecoveryGearDecision {
  const cappedTargetSafe =
    Number.isFinite(input.cappedTargetIdx) &&
    input.cappedTargetIdx > input.currentLineIdx &&
    input.cappedTargetIdx <= input.acceptedCommitTargetIdx;
  const acceptedTargetSafe =
    Number.isFinite(input.acceptedCommitTargetIdx) &&
    input.acceptedCommitTargetIdx > input.currentLineIdx;
  const safeTarget = cappedTargetSafe || acceptedTargetSafe;
  const speechFresh = !!input.speechFresh;
  const backendFresh = !!input.backendFresh;
  const recoveryAuthorityEligible =
    input.authority === 'bottom_lock_release' ||
    input.authority === 'preferred_lower_rail_release' ||
    input.reason === 'bottom_lock_release' ||
    input.reason === 'preferred_lower_rail_release' ||
    input.reason === 'comfort_nudge_follow' ||
    input.visualRecoveryState === 'bottom_lock_release' ||
    input.visualRecoveryState === 'preferred_lower_rail_release' ||
    input.visualRecoveryState === 'comfort_nudge_large_debt' ||
    input.visualRecoveryState === 'post_adjacent_commit_visual_recovery';
  const nextLineBelowPreferredPocket =
    Number.isFinite(input.nextSpeakableLineY) &&
    Number.isFinite(input.preferredBandBottom) &&
    input.nextSpeakableLineY > input.preferredBandBottom;
  const urgentDebt =
    Number.isFinite(input.targetDebtPx) &&
    input.targetDebtPx >= 120;
  const geometryAvailable =
    Number.isFinite(input.nextSpeakableLineY) &&
    Number.isFinite(input.preferredBandBottom);
  const distanceRestrictionReason =
    input.safetyCapState && input.safetyCapState !== 'inactive' && input.safetyCapState !== 'none'
      ? input.safetyCapState
      : (input.hardSafetyState === 'distance_restrict_only' ? 'distance_restrict_only' : 'none');
  const absoluteHoldReason =
    input.terminalClampActive
      ? 'terminal_max_scroll_clamp'
      : (!geometryAvailable
        ? 'geometry_unavailable'
        : (!backendFresh
          ? 'backend_stale'
          : (input.noMatchOrOffscript
            ? 'no_match_or_offscript'
            : (input.hardContradiction
              ? 'hard_contradiction'
              : (input.hardSafetyState === 'absolute_hold' && distanceRestrictionReason === 'none'
                ? 'hard_safety_state_absolute_hold'
                : 'none')))));
  const safetyClass =
    absoluteHoldReason !== 'none'
      ? 'absolute_hold'
      : (distanceRestrictionReason !== 'none' ? 'distance_restrict_only' : 'clear');
  const hardSafetyClear = safetyClass !== 'absolute_hold';
  const urgentRecoveryBlockedReason =
    !input.liveAsrActive
      ? 'not_live_asr'
      : (!hardSafetyClear
        ? absoluteHoldReason
        : (!safeTarget
          ? 'no_safe_target'
          : (!speechFresh
            ? 'speech_not_fresh'
            : (!backendFresh
              ? 'backend_stale'
              : (input.noMatchOrOffscript
                ? 'no_match_or_offscript'
                : (input.hardContradiction
                  ? 'hard_contradiction'
                  : (!urgentDebt
                    ? 'target_debt_below_threshold'
                    : (!nextLineBelowPreferredPocket
                      ? 'not_below_preferred_reader_room'
                      : (!recoveryAuthorityEligible
                        ? 'authority_not_recovery_eligible'
                        : 'none')))))))));
  const urgentRecoveryEligible = urgentRecoveryBlockedReason === 'none';

  if (urgentRecoveryEligible) {
    const stronger =
      input.authority === 'preferred_lower_rail_release' ||
      input.visualRecoveryState === 'preferred_lower_rail_release' ||
      input.targetDebtPx >= 250;
    const urgentMinStepPx = stronger ? 16 : 12;
    const urgentMaxStepPx = stronger ? 18 : 16;
    return {
      selectedGear: 'urgent_recovery',
      minStepPx: Math.max(input.recoveryMinStepPx, urgentMinStepPx),
      maxStepPx: Math.max(input.recoveryMaxStepPx, urgentMaxStepPx),
      reason: input.reason || input.authority || input.visualRecoveryState || 'visual_recovery',
      hardSafetyClear,
      speechFresh,
      backendFresh,
      safeTarget,
      cappedTargetSafe,
      safetyClass,
      distanceRestrictionReason,
      absoluteHoldReason,
      urgentRecoveryEligible,
      urgentRecoveryBlockedReason,
    };
  }

  if (
    hardSafetyClear &&
    input.recoveryActive &&
    input.recoveryMinStepPx > 0 &&
    input.recoveryMaxStepPx > 0
  ) {
    return {
      selectedGear: 'recovery',
      minStepPx: input.recoveryMinStepPx,
      maxStepPx: input.recoveryMaxStepPx,
      reason: input.reason || input.authority || input.visualRecoveryState || 'visual_recovery',
      hardSafetyClear,
      speechFresh,
      backendFresh,
      safeTarget,
      cappedTargetSafe,
      safetyClass,
      distanceRestrictionReason,
      absoluteHoldReason,
      urgentRecoveryEligible,
      urgentRecoveryBlockedReason,
    };
  }

  return {
    selectedGear: 'normal_floor',
    minStepPx: 0,
    maxStepPx: 0,
    reason: input.reason || input.authority || input.visualRecoveryState || 'normal_floor',
    hardSafetyClear,
    speechFresh,
    backendFresh,
    safeTarget,
    cappedTargetSafe,
    safetyClass,
    distanceRestrictionReason,
    absoluteHoldReason,
    urgentRecoveryEligible,
    urgentRecoveryBlockedReason,
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
