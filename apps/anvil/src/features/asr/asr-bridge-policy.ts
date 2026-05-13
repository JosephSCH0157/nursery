export type BridgeStageDecision = {
  shouldStage: boolean;
  reason?: string;
  targetIndex?: number;
  skippedRows?: number;
  shouldBypassPendingVisualCap?: boolean;
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
