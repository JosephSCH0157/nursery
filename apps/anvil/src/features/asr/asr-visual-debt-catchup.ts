export interface DecideAsrVisualDebtCatchupInput {
  significantVisualDebtActive: boolean;
  consecutiveDebtObservations: number;
  targetLine: number | null;
  currentLine: number;
  committedLine: number;
  movementAllowed: boolean;
  targetSafe: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  terminalClampActive: boolean;
  cooldownActive: boolean;
  markerLockActive: boolean;
  directWriteBlocked: boolean;
  targetPreservedForEasing: boolean;
  errPx: number;
  existingMoveSufficient: boolean;
  commitCount: number;
  postCommitGapMs: number;
  standardGapMs: number;
  reducedGapMs: number;
}

export interface DecideAsrVisualDebtCatchupResult {
  allowed: boolean;
  blockedReason: string;
  decisionReason: string;
  requiredGapMs: number;
  reducedGapEligible: boolean;
  recentSafeCommitAgeMs: number;
  targetNonBackward: boolean;
  farTarget: boolean;
  currentCommittedCoherent: boolean;
}

export function decideAsrVisualDebtCatchup(
  input: DecideAsrVisualDebtCatchupInput,
): DecideAsrVisualDebtCatchupResult {
  const targetNonBackward =
    input.targetLine != null &&
    input.targetLine >= input.currentLine;
  const farTarget =
    input.targetLine == null ||
    input.targetLine > input.currentLine + 1;
  const currentCommittedCoherent =
    input.committedLine >= input.currentLine &&
    input.committedLine <= input.currentLine + 1;
  const reducedGapEligible =
    targetNonBackward &&
    !farTarget &&
    currentCommittedCoherent &&
    input.movementAllowed &&
    input.targetSafe &&
    !input.noMatchOrOffscript &&
    !input.hardContradiction &&
    !input.terminalClampActive &&
    !input.cooldownActive &&
    !input.markerLockActive &&
    !input.directWriteBlocked &&
    !input.targetPreservedForEasing &&
    Number.isFinite(input.errPx) &&
    input.errPx > 0 &&
    !input.existingMoveSufficient;
  const requiredGapMs = reducedGapEligible ? input.reducedGapMs : input.standardGapMs;
  const gapSatisfied =
    input.commitCount >= 2 &&
    Number.isFinite(input.postCommitGapMs) &&
    input.postCommitGapMs >= requiredGapMs;

  if (!input.significantVisualDebtActive) {
    return {
      allowed: false,
      blockedReason: 'debt_below_line_height',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.consecutiveDebtObservations < 2) {
    return {
      allowed: false,
      blockedReason: 'insufficient_consecutive_observations',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.terminalClampActive) {
    return {
      allowed: false,
      blockedReason: 'terminal_clamp',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (!input.movementAllowed) {
    return {
      allowed: false,
      blockedReason: 'movement_not_allowed',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (!input.targetSafe) {
    return {
      allowed: false,
      blockedReason: 'unsafe_target',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (!targetNonBackward) {
    return {
      allowed: false,
      blockedReason: 'non_forward_target',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (farTarget) {
    return {
      allowed: false,
      blockedReason: 'far_target',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (!currentCommittedCoherent) {
    return {
      allowed: false,
      blockedReason: 'incoherent_current_commit_lines',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.noMatchOrOffscript || input.hardContradiction) {
    return {
      allowed: false,
      blockedReason: 'no_match_or_offscript',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.cooldownActive) {
    return {
      allowed: false,
      blockedReason: 'cooldown',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.markerLockActive) {
    return {
      allowed: false,
      blockedReason: 'marker_lock_active',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.directWriteBlocked) {
    return {
      allowed: false,
      blockedReason: 'direct_write_blocked',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.targetPreservedForEasing) {
    return {
      allowed: false,
      blockedReason: 'target_preserved_for_easing',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (!(Number.isFinite(input.errPx) && input.errPx > 0)) {
    return {
      allowed: false,
      blockedReason: 'no_error',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (input.existingMoveSufficient) {
    return {
      allowed: false,
      blockedReason: 'existing_move_sufficient',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  if (!gapSatisfied) {
    return {
      allowed: false,
      blockedReason: 'awaiting_commit_gap_window',
      decisionReason: '',
      requiredGapMs,
      reducedGapEligible,
      recentSafeCommitAgeMs: input.postCommitGapMs,
      targetNonBackward,
      farTarget,
      currentCommittedCoherent,
    };
  }
  return {
    allowed: true,
    blockedReason: '',
    decisionReason: reducedGapEligible
      ? 'visual_only_recent_safe_commit_allowed'
      : 'standard_visual_debt_catchup_allowed',
    requiredGapMs,
    reducedGapEligible,
    recentSafeCommitAgeMs: input.postCommitGapMs,
    targetNonBackward,
    farTarget,
    currentCommittedCoherent,
  };
}
