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
