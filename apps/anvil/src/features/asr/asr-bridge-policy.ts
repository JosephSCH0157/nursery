export type BridgeStageDecision = {
  shouldStage: boolean;
  reason?: string;
  targetIndex?: number;
  skippedRows?: number;
  shouldBypassPendingVisualCap?: boolean;
};

export type BridgeEquivalentBlockDecision = {
  shouldBlock: boolean;
  reason?: string;
  sourceBranch?: string;
  targetIndex?: number;
  equivalentTarget?: number;
  bridgeCompletionPath?: boolean;
  bridgeTrapEscapePath?: boolean;
};

export type PendingBridgeCompletionDecision = {
  shouldAllow: boolean;
  reason?: string;
  targetIndex?: number;
  sourceBranch?: string;
  bridgeFinalFresh?: boolean;
  bridgeDirectFreshProof?: boolean;
};

export type BridgeAdjacentReductionDecision = {
  shouldReduce: boolean;
  reason?: string;
  reducedTargetIndex?: number;
  originalTargetIndex?: number;
  currentIndex?: number;
  skippedRows?: string[];
  logicalStep?: number;
  renderedDelta?: number;
};

export function shouldStageVisualOnlyBridge(input: {
  liveStrictFollow: boolean;
  pendingSpeakableBridgeCompletion: boolean;
  currentIndex: number;
  targetIndex: number;
  visibleStepTarget: number;
  reducedLineSpeakable: boolean;
  asrRuntimeSpeechRunningActual: boolean;
  movementAuthority: string;
  liveUnleashedEnabled: boolean;
}): BridgeStageDecision {
  const multiJumpDelta = input.targetIndex - input.currentIndex;
  if (!input.liveStrictFollow || multiJumpDelta <= 1 || input.pendingSpeakableBridgeCompletion) {
    return { shouldStage: false };
  }
  if (!(input.visibleStepTarget > input.currentIndex && input.visibleStepTarget < input.targetIndex)) {
    return { shouldStage: false };
  }
  if (input.reducedLineSpeakable) {
    return { shouldStage: false };
  }
  const shouldBypassPendingVisualCap =
    input.asrRuntimeSpeechRunningActual &&
    (
      input.movementAuthority === 'proof' ||
      input.movementAuthority === 'reconcile' ||
      input.liveUnleashedEnabled
    ) &&
    input.targetIndex > input.currentIndex;
  if (shouldBypassPendingVisualCap) {
    return { shouldStage: false, shouldBypassPendingVisualCap: true };
  }
  return {
    shouldStage: true,
    reason: 'non_speakable_visual_cap',
    targetIndex: input.visibleStepTarget,
    skippedRows: Math.max(1, input.targetIndex - input.visibleStepTarget),
    shouldBypassPendingVisualCap: false,
  };
}

export function shouldBlockEquivalentBridgeCommit(input: {
  current: number;
  requestedTarget: number;
  semanticTarget: number;
  commitTs: number;
  bridgeBlockUntil: number;
  sourceBranch?: string;
  reason?: string;
}): BridgeEquivalentBlockDecision {
  const sourceBranch = String(input.sourceBranch || 'unknown');
  const reason = String(input.reason || 'unknown');
  const equivalentTarget = Math.max(input.requestedTarget, input.semanticTarget);
  const bridgeCompletionPath =
    sourceBranch.toLowerCase().includes('pending_speakable_bridge_complete') ||
    reason.toLowerCase().includes('bridge_completion_accepted');
  const bridgeTrapEscapePath =
    reason.toLowerCase().includes('bridge_trap_escape');
  const shouldBlock =
    input.bridgeBlockUntil > input.commitTs &&
    equivalentTarget > input.current + 1 &&
    !bridgeCompletionPath &&
    !bridgeTrapEscapePath;
  return {
    shouldBlock,
    reason: shouldBlock ? 'equivalent_bridge_target_blocked' : undefined,
    sourceBranch,
    targetIndex: input.requestedTarget,
    equivalentTarget,
    bridgeCompletionPath,
    bridgeTrapEscapePath,
  };
}

export function shouldAllowPendingBridgeCompletion(input: {
  currentLine: number;
  pendingSemanticFrom: number;
  pendingSemanticTarget: number;
  pendingBridgeAgeMs: number;
  speechRunningActual: boolean;
  runtimeSpeechFresh: boolean;
  lastFinalTranscriptFresh: boolean;
  bridgeLandingProofOk: boolean;
  bridgeLandingProofFromStaleTranscriptOnly: boolean;
  sourceBranch?: string;
}): PendingBridgeCompletionDecision {
  if (input.pendingSemanticFrom !== input.currentLine) {
    return { shouldAllow: false, reason: 'cursor_shifted', sourceBranch: input.sourceBranch };
  }
  if (input.pendingSemanticTarget <= input.currentLine) {
    return { shouldAllow: false, reason: 'target_already_reached', sourceBranch: input.sourceBranch };
  }
  if (!input.speechRunningActual || !input.runtimeSpeechFresh) {
    return { shouldAllow: false, reason: 'speech_not_active', sourceBranch: input.sourceBranch };
  }
  const bridgeFinalFresh =
    input.runtimeSpeechFresh ||
    input.lastFinalTranscriptFresh;
  const bridgeDirectFreshProof =
    !!input.bridgeLandingProofOk && !input.bridgeLandingProofFromStaleTranscriptOnly;
  const shouldAllow =
    bridgeFinalFresh &&
    (
      bridgeDirectFreshProof ||
      input.pendingBridgeAgeMs >= 900
    );
  return {
    shouldAllow,
    reason: shouldAllow ? 'pending_speakable_bridge_complete' : 'await_fresh_direct_landing_proof',
    targetIndex: input.pendingSemanticTarget,
    sourceBranch: input.sourceBranch,
    bridgeFinalFresh,
    bridgeDirectFreshProof,
  };
}

export function shouldReduceBridgeToAdjacentRenderedRow(input: {
  bridgeReducedTarget: number;
  currentIndex: number;
  originalTargetIndex: number;
  skippedRows?: string[];
}): BridgeAdjacentReductionDecision {
  const shouldReduce =
    input.bridgeReducedTarget > input.currentIndex &&
    input.bridgeReducedTarget <= input.currentIndex + 1;
  return {
    shouldReduce,
    reason: shouldReduce ? 'live_bridge_single_step_policy' : undefined,
    reducedTargetIndex: shouldReduce ? input.bridgeReducedTarget : undefined,
    originalTargetIndex: input.originalTargetIndex,
    currentIndex: input.currentIndex,
    skippedRows: input.skippedRows,
    logicalStep: input.bridgeReducedTarget - input.currentIndex,
    renderedDelta: input.originalTargetIndex - input.currentIndex,
  };
}
