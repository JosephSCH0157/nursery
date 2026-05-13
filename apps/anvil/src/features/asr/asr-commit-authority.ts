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
