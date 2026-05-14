export type ReaderLeashBypassDecision = {
  shouldCheck: boolean;
  shouldAllow: boolean;
};

export type FreshAdjacentCommitDecision = {
  eligible: boolean;
};

export type VisualGovernorSemanticHoldDecision = {
  shouldHold: boolean;
  shouldUnlock: boolean;
};

export type BridgeTrapEscapeDecision = {
  shouldAllow: boolean;
  reason?: string;
};

export type RecoveryReaderLeashDecision = {
  shouldConstrain: boolean;
  isRecoveryAuthority: boolean;
  isBridgeLike: boolean;
};

export type StartupShortMemoryAdjacentDecision = {
  considered: boolean;
  allow: boolean;
  reason: string;
};

export type FarAheadAdjacentEscapeDecision = {
  allow: boolean;
  reason: string;
};

export type BridgeAuthorityReaderLeashDecision = {
  shouldConstrain: boolean;
  shouldReduceToAdjacent: boolean;
  reason: string;
};

export type VisualEnvelopeLeashDecision = {
  shouldConstrain: boolean;
  shouldReduceToAdjacent: boolean;
  reason: string;
};

export type VisualProjectionLeashDecision = {
  shouldConstrain: boolean;
  shouldReduceToAdjacent: boolean;
  reason: string;
};

export function isRescueBudgetExhausted(input: {
  gatePassCore: boolean;
  rescueBypassLike: boolean;
  directAdjacentLocalProof: boolean;
  recentBypassCount: number;
  bypassBudgetMax: number;
}): boolean {
  return (
    input.gatePassCore &&
    input.rescueBypassLike &&
    !input.directAdjacentLocalProof &&
    input.recentBypassCount >= input.bypassBudgetMax
  );
}

export function shouldAllowReaderLeashBypass(input: {
  gatePassCore: boolean;
  rescueBypassLike: boolean;
  bypassedBlockersLower: string;
  directAdjacentLocalProof: boolean;
  freshLandingLexicalNoStale: boolean;
  lastBypassAgeMs: number;
  minBypassDelayMs: number;
}): ReaderLeashBypassDecision {
  const shouldCheck =
    input.gatePassCore &&
    input.rescueBypassLike &&
    input.bypassedBlockersLower.includes('asr_reader_leash_hold');
  const shouldAllow =
    input.directAdjacentLocalProof ||
    input.freshLandingLexicalNoStale ||
    input.lastBypassAgeMs >= input.minBypassDelayMs;
  return { shouldCheck, shouldAllow };
}

export function shouldAllowFreshAdjacentFastCommit(input: {
  reducedTarget: number;
  current: number;
  speechFreshNow: boolean;
  finalPacketFresh: boolean;
  speechRunningActual: boolean;
  directAdjacentLocalProof: boolean;
  proofSourceLower: string;
}): FreshAdjacentCommitDecision {
  const eligible =
    input.reducedTarget === input.current + 1 &&
    (input.speechFreshNow || input.finalPacketFresh || input.speechRunningActual) &&
    (
      input.directAdjacentLocalProof ||
      input.proofSourceLower.includes('strict_adjacent_tail_progression') ||
      input.proofSourceLower.includes('strict_speakable_bridge_landing')
    );
  return { eligible };
}

export function shouldHoldForVisualGovernor(input: {
  accepted: boolean;
  liveAsrVisualGovernorHardHold: boolean;
  reducedTarget: number;
  current: number;
  hardContradiction: boolean;
  requestedTarget: number;
  liveSpeechFresh: boolean;
  finalPacketFresh: boolean;
  noCommitMs: number;
  freshAdjUnlockNoCommitMs: number;
  msSinceLastCommit: number;
}): VisualGovernorSemanticHoldDecision {
  if (!(input.accepted && input.liveAsrVisualGovernorHardHold)) {
    return { shouldHold: false, shouldUnlock: false };
  }
  const adjacentTarget = input.reducedTarget === input.current + 1;
  const noHardContradiction = !input.hardContradiction;
  const noRecentLargeBridge =
    input.msSinceLastCommit > 700 || input.requestedTarget <= input.current + 1;
  const freshAdjacentUnlockAllowed =
    adjacentTarget &&
    noHardContradiction &&
    noRecentLargeBridge &&
    (input.liveSpeechFresh || input.finalPacketFresh);
  const shouldUnlock =
    freshAdjacentUnlockAllowed &&
    input.noCommitMs >= input.freshAdjUnlockNoCommitMs;
  return {
    shouldHold: !shouldUnlock,
    shouldUnlock,
  };
}

export function shouldAllowBridgeTrapEscape(input: {
  bridgeTrapDetected: boolean;
  transcriptGrowing: boolean;
  contradictionActiveEffective: boolean;
  safeAdjacent: boolean;
}): BridgeTrapEscapeDecision {
  const shouldAllow =
    input.bridgeTrapDetected &&
    input.transcriptGrowing &&
    !input.contradictionActiveEffective &&
    input.safeAdjacent;
  return {
    shouldAllow,
    reason: shouldAllow ? 'bridge_trap_escape' : undefined,
  };
}

export function shouldConstrainRecoveryForReaderLeash(input: {
  sourceBranch?: string;
  proofSource?: string;
  reason?: string;
  bypassedBlockers?: string;
  readerLeashActive: boolean;
  current: number;
  requestedTarget: number;
  semanticTarget: number;
  skippedIgnorableLinesCount: number;
}): RecoveryReaderLeashDecision {
  const sourceBranch = String(input.sourceBranch || '').toLowerCase();
  const proofSource = String(input.proofSource || '').toLowerCase();
  const reason = String(input.reason || '').toLowerCase();
  const bypassedBlockers = String(input.bypassedBlockers || '').toLowerCase();
  const isRecoveryAuthority =
    sourceBranch.includes('stall_recovery') ||
    sourceBranch.includes('sustained_read') ||
    sourceBranch.includes('starvation') ||
    sourceBranch.includes('movement_authority_reconcile') ||
    sourceBranch.includes('movement_authority_forced_reconcile_single_step') ||
    sourceBranch.includes('movement_authority_starvation_reconcile_single_step') ||
    reason.includes('stall_recovery') ||
    reason.includes('starvation') ||
    proofSource.includes('starvation') ||
    bypassedBlockers.includes('reader_leash');
  const isBridgeLike =
    input.requestedTarget > input.current + 1 ||
    input.semanticTarget > input.current + 1 ||
    input.skippedIgnorableLinesCount > 0;
  return {
    shouldConstrain: input.readerLeashActive && isRecoveryAuthority && isBridgeLike,
    isRecoveryAuthority,
    isBridgeLike,
  };
}

export function shouldAllowStartupShortMemoryAdjacentCommit(input: {
  startupSettlingActive: boolean;
  current: number;
  requestedTarget: number;
  semanticTarget: number;
  skippedIgnorableLinesCount: number;
  adjacentSim: number;
  minAdjacentSim: number;
  shortTailWordCount: number;
  minShortTailWords: number;
  readerLeashActive: boolean;
  leadAhead: boolean;
  speakableLead: number;
  renderedLead: number;
  offscriptOrNoMatch: boolean;
  backwardContradiction: boolean;
  starvationFutureTargetPath: boolean;
}): StartupShortMemoryAdjacentDecision {
  const considered = input.startupSettlingActive;
  if (!considered) return { considered, allow: false, reason: 'startup_window_inactive' };
  if (input.requestedTarget <= input.current) return { considered, allow: false, reason: 'no_forward_target' };
  if (input.requestedTarget !== input.current + 1 || input.semanticTarget !== input.current + 1) {
    return { considered, allow: false, reason: 'non_adjacent_target' };
  }
  if (input.skippedIgnorableLinesCount > 0) return { considered, allow: false, reason: 'bridge_like_target' };
  if (input.readerLeashActive) return { considered, allow: false, reason: 'reader_leash_active' };
  if (input.leadAhead || input.speakableLead >= 1 || input.renderedLead >= 1) {
    return { considered, allow: false, reason: 'reader_crowded' };
  }
  if (input.offscriptOrNoMatch) return { considered, allow: false, reason: 'offscript_or_nomatch' };
  if (input.backwardContradiction) return { considered, allow: false, reason: 'backward_contradiction' };
  if (input.starvationFutureTargetPath) return { considered, allow: false, reason: 'future_reconcile_path' };
  if (!(Number.isFinite(input.adjacentSim) && input.adjacentSim >= input.minAdjacentSim)) {
    return { considered, allow: false, reason: 'adjacent_sim_too_low' };
  }
  if (input.shortTailWordCount < input.minShortTailWords) {
    return { considered, allow: false, reason: 'short_tail_insufficient' };
  }
  return { considered, allow: true, reason: 'startup_settling_adjacent_only' };
}

export function shouldAllowFarAheadHardHoldAdjacentEscape(input: {
  liveAsrVisualGovernorHardHold: boolean;
  leadState: 'far_ahead' | 'ahead' | 'aligned_or_behind';
  holdAgeMs: number;
  minHoldAgeMs: number;
  current: number;
  target: number;
  semanticTarget: number;
  skippedIgnorableLinesCount: number;
  speechFresh: boolean;
  finalFresh: boolean;
  transcriptGrowing: boolean;
  localAdjacentProof: boolean;
  offscriptOrNoMatch: boolean;
  hardContradiction: boolean;
  bridgeLeashActive: boolean;
}): FarAheadAdjacentEscapeDecision {
  if (!input.liveAsrVisualGovernorHardHold) return { allow: false, reason: 'governor_not_holding' };
  if (input.leadState !== 'far_ahead') return { allow: false, reason: 'not_far_ahead' };
  if (input.holdAgeMs < input.minHoldAgeMs) return { allow: false, reason: 'hold_age_below_timeout' };
  if (input.target !== input.current + 1 || input.semanticTarget !== input.current + 1) {
    return { allow: false, reason: 'non_adjacent_target' };
  }
  if (input.skippedIgnorableLinesCount > 0) return { allow: false, reason: 'bridge_like_target' };
  if (input.bridgeLeashActive) return { allow: false, reason: 'bridge_recovery_window_active' };
  if (input.offscriptOrNoMatch) return { allow: false, reason: 'offscript_or_nomatch' };
  if (input.hardContradiction) return { allow: false, reason: 'hard_contradiction' };
  if (!(input.speechFresh || input.finalFresh || input.transcriptGrowing)) {
    return { allow: false, reason: 'freshness_missing' };
  }
  if (!input.localAdjacentProof) return { allow: false, reason: 'no_local_adjacent_proof' };
  return { allow: true, reason: 'far_ahead_timeout_adjacent_escape' };
}

export function shouldConstrainBridgeAuthorityForReaderLeash(input: {
  readerLeashActive: boolean;
  current: number;
  requestedTarget: number;
  semanticTarget: number;
  skippedIgnorableLinesCount: number;
  carry: number;
  sourceBranch?: string;
  proofSource?: string;
  authority?: string;
  safeAdjacentProofAvailable: boolean;
}): BridgeAuthorityReaderLeashDecision {
  if (!input.readerLeashActive) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'reader_leash_inactive' };
  }
  const sourceBranch = String(input.sourceBranch || '').toLowerCase();
  const proofSource = String(input.proofSource || '').toLowerCase();
  const authority = String(input.authority || '').toLowerCase();
  const bridgeAuthorityLike =
    sourceBranch.includes('bridge') ||
    sourceBranch.includes('cue_exit') ||
    sourceBranch.includes('movement_authority_forced_reconcile_single_step') ||
    sourceBranch.includes('movement_authority_starvation_reconcile_single_step') ||
    sourceBranch.includes('movement_authority_reconcile') ||
    proofSource.includes('bridge') ||
    proofSource.includes('cue_exit') ||
    authority.includes('reconcile');
  const visuallyNonAdjacent =
    input.requestedTarget > input.current + 1 ||
    input.semanticTarget > input.current + 1 ||
    input.skippedIgnorableLinesCount > 0 ||
    input.carry > 1;
  if (!(bridgeAuthorityLike && visuallyNonAdjacent)) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'not_bridge_like_or_not_visual_lunge' };
  }
  if (input.safeAdjacentProofAvailable) {
    return { shouldConstrain: true, shouldReduceToAdjacent: true, reason: 'visual_adjacent_only_while_leashed' };
  }
  return { shouldConstrain: true, shouldReduceToAdjacent: false, reason: 'bridge_authority_must_respect_reader_leash' };
}

export function shouldConstrainForVisualEnvelopeLeash(input: {
  visualEnvelopeLeashActive: boolean;
  current: number;
  requestedTarget: number;
  semanticTarget: number;
  skippedIgnorableLinesCount: number;
  carry: number;
  sourceBranch?: string;
  proofSource?: string;
  authority?: string;
  safeAdjacentProofAvailable: boolean;
  offscriptOrNoMatch: boolean;
}): VisualEnvelopeLeashDecision {
  if (!input.visualEnvelopeLeashActive) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'visual_envelope_leash_inactive' };
  }
  if (input.offscriptOrNoMatch) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'offscript_or_nomatch' };
  }
  const sourceBranch = String(input.sourceBranch || '').toLowerCase();
  const proofSource = String(input.proofSource || '').toLowerCase();
  const authority = String(input.authority || '').toLowerCase();
  const bridgeOrRecoveryLike =
    sourceBranch.includes('bridge') ||
    sourceBranch.includes('reconcile') ||
    sourceBranch.includes('pending_speakable_bridge_complete') ||
    proofSource.includes('bridge') ||
    proofSource.includes('cue_exit') ||
    proofSource.includes('strict_speakable_bridge_landing') ||
    authority.includes('reconcile');
  const visuallyNonAdjacent =
    input.requestedTarget > input.current + 1 ||
    input.semanticTarget > input.current + 1 ||
    input.skippedIgnorableLinesCount > 0 ||
    input.carry > 1;
  if (!(bridgeOrRecoveryLike && visuallyNonAdjacent)) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'not_bridge_like_or_not_visual_lunge' };
  }
  if (input.safeAdjacentProofAvailable) {
    return { shouldConstrain: true, shouldReduceToAdjacent: true, reason: 'visual_envelope_adjacent_only' };
  }
  return { shouldConstrain: true, shouldReduceToAdjacent: false, reason: 'visual_envelope_requires_adjacent_only' };
}

export function shouldConstrainForVisualProjectionLeash(input: {
  current: number;
  requestedTarget: number;
  semanticTarget: number;
  skippedIgnorableLinesCount: number;
  carry: number;
  sourceBranch?: string;
  proofSource?: string;
  authority?: string;
  safeAdjacentProofAvailable: boolean;
  offscriptOrNoMatch: boolean;
  projectedDeltaLines: number;
  maxSafeProjectedDeltaLines: number;
}): VisualProjectionLeashDecision {
  if (input.offscriptOrNoMatch) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'offscript_or_nomatch' };
  }
  if (!(Number.isFinite(input.projectedDeltaLines) && input.projectedDeltaLines > input.maxSafeProjectedDeltaLines)) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'projection_within_safe_envelope' };
  }
  const sourceBranch = String(input.sourceBranch || '').toLowerCase();
  const bridgeOrRecoveryLike =
    sourceBranch.includes('movement_authority_forced_reconcile_single_step') ||
    sourceBranch.includes('movement_authority_starvation_reconcile_single_step') ||
    sourceBranch.includes('movement_authority_reconcile') ||
    sourceBranch.includes('movement_authority_pending_bridge_pressure') ||
    sourceBranch.includes('movement_authority_pending_bridge_maintenance') ||
    sourceBranch.includes('movement_authority_commit') ||
    sourceBranch.includes('pending_bridge_pressure_commit') ||
    sourceBranch.includes('pending_bridge_marker_maintenance');
  const visuallyNonAdjacent =
    input.requestedTarget > input.current + 1 ||
    input.semanticTarget > input.current + 1 ||
    input.skippedIgnorableLinesCount > 0 ||
    input.carry > 1;
  if (!(bridgeOrRecoveryLike && visuallyNonAdjacent)) {
    return { shouldConstrain: false, shouldReduceToAdjacent: false, reason: 'not_bridge_recovery_non_adjacent' };
  }
  if (input.safeAdjacentProofAvailable) {
    return { shouldConstrain: true, shouldReduceToAdjacent: true, reason: 'visual_projection_adjacent_only' };
  }
  return { shouldConstrain: true, shouldReduceToAdjacent: false, reason: 'visual_projection_requires_adjacent_only' };
}
