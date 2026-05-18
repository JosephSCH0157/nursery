export type EarlyBridgeTrapReleaseInput = {
  liveAsrActive: boolean;
  current: number;
  requestedTarget: number;
  nextSpeakableTarget: number;
  requestedTargetIsSpeakable: boolean;
  skippedIgnorableLines: string[];
  repeatedHoldCount: number;
  runAgeMs: number;
  pendingBridgeAgeMs: number;
  finalPacketFresh: boolean;
  transcriptGrowing: boolean;
  targetViewportState: 'top' | 'middle' | 'bottom' | 'above' | 'below' | 'unknown';
  hardContradiction: boolean;
  offscriptNoMatch: boolean;
  startupMaxCurrent?: number;
  startupMaxRunAgeMs?: number;
  pendingOverdueMs?: number;
  minRepeatedHolds?: number;
};

export type EarlyBridgeTrapReleaseDecision = {
  shouldRelease: boolean;
  reason: string;
  commitTarget: number;
};

const DEFAULT_STARTUP_MAX_CURRENT = 9;
const DEFAULT_STARTUP_MAX_RUN_AGE_MS = 30000;
const DEFAULT_PENDING_OVERDUE_MS = 1800;
const DEFAULT_MIN_REPEATED_HOLDS = 2;

export function isIgnorableOnlyBridgeSkipReasons(skippedIgnorableLines: string[]): boolean {
  return skippedIgnorableLines.every((reason) =>
    ['blank', 'cue', 'note', 'speaker', 'pause'].includes(String(reason || '').toLowerCase()),
  );
}

export function shouldReleaseEarlyBridgeTrap(
  input: EarlyBridgeTrapReleaseInput,
): EarlyBridgeTrapReleaseDecision {
  const startupMaxCurrent = input.startupMaxCurrent ?? DEFAULT_STARTUP_MAX_CURRENT;
  const startupMaxRunAgeMs = input.startupMaxRunAgeMs ?? DEFAULT_STARTUP_MAX_RUN_AGE_MS;
  const pendingOverdueMs = input.pendingOverdueMs ?? DEFAULT_PENDING_OVERDUE_MS;
  const minRepeatedHolds = input.minRepeatedHolds ?? DEFAULT_MIN_REPEATED_HOLDS;
  const insideEarlyStartup =
    input.current <= startupMaxCurrent ||
    input.runAgeMs < startupMaxRunAgeMs;
  const targetNearVisible =
    input.targetViewportState === 'top' ||
    input.targetViewportState === 'middle' ||
    input.targetViewportState === 'bottom' ||
    input.targetViewportState === 'above';
  const repeatedOrOverdue =
    input.repeatedHoldCount >= minRepeatedHolds ||
    input.pendingBridgeAgeMs >= pendingOverdueMs;

  if (
    !input.liveAsrActive ||
    input.hardContradiction ||
    input.offscriptNoMatch ||
    !insideEarlyStartup ||
    input.requestedTarget <= input.current ||
    !input.requestedTargetIsSpeakable ||
    input.nextSpeakableTarget !== input.requestedTarget ||
    !isIgnorableOnlyBridgeSkipReasons(input.skippedIgnorableLines) ||
    !targetNearVisible ||
    (!input.finalPacketFresh && !input.transcriptGrowing) ||
    !repeatedOrOverdue
  ) {
    return {
      shouldRelease: false,
      reason: 'conditions_not_met',
      commitTarget: input.nextSpeakableTarget,
    };
  }

  return {
    shouldRelease: true,
    reason:
      input.pendingBridgeAgeMs >= pendingOverdueMs
        ? 'pending_bridge_completion_overdue'
        : 'repeated_startup_bridge_holds',
    commitTarget: input.nextSpeakableTarget,
  };
}

export function clearOnlyMatchingBridgeBlockToken<T>(
  bridgeBlockMap: Map<string, T>,
  matchingKey: string,
): void {
  bridgeBlockMap.delete(matchingKey);
}
