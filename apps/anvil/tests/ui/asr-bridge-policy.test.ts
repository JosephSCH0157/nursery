import {
  shouldBlockEquivalentBridgeCommit,
  shouldStageVisualOnlyBridge,
} from '../../src/features/asr/asr-bridge-policy';

describe('ASR bridge policy (read-only staging decision)', () => {
  test('multi-line bridge over non-speakable reduced row stages visual-only', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 10,
      targetIndex: 14,
      visibleStepTarget: 11,
      reducedLineSpeakable: false,
      asrRuntimeSpeechRunningActual: false,
      movementAuthority: 'match',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(true);
    expect(decision.reason).toBe('non_speakable_visual_cap');
    expect(decision.targetIndex).toBe(11);
    expect(decision.skippedRows).toBe(3);
  });

  test('direct adjacent speakable line does not stage as multi-line bridge', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 10,
      targetIndex: 11,
      visibleStepTarget: 11,
      reducedLineSpeakable: true,
      asrRuntimeSpeechRunningActual: false,
      movementAuthority: 'match',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(false);
  });

  test('non-speakable skipped rows are preserved in decision payload', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 3,
      targetIndex: 9,
      visibleStepTarget: 5,
      reducedLineSpeakable: false,
      asrRuntimeSpeechRunningActual: false,
      movementAuthority: 'match',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(true);
    expect(decision.skippedRows).toBe(4);
  });

  test('no stage when live/direct proof bypass condition is present', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 2,
      targetIndex: 6,
      visibleStepTarget: 3,
      reducedLineSpeakable: false,
      asrRuntimeSpeechRunningActual: true,
      movementAuthority: 'proof',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(false);
    expect(decision.shouldBypassPendingVisualCap).toBe(true);
  });

  test('equivalent bridge commit is blocked according to current semantics', () => {
    const decision = shouldBlockEquivalentBridgeCommit({
      current: 5,
      requestedTarget: 8,
      semanticTarget: 7,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'movement_authority_forced_reconcile_single_step',
      reason: 'final_live_safe_step',
    });
    expect(decision.shouldBlock).toBe(true);
    expect(decision.reason).toBe('equivalent_bridge_target_blocked');
    expect(decision.equivalentTarget).toBe(8);
  });

  test('downstream bridge commit is blocked according to current semantics', () => {
    const decision = shouldBlockEquivalentBridgeCommit({
      current: 3,
      requestedTarget: 4,
      semanticTarget: 9,
      commitTs: 1200,
      bridgeBlockUntil: 2000,
      sourceBranch: 'reader_leash',
      reason: 'final_live_safe_step',
    });
    expect(decision.shouldBlock).toBe(true);
    expect(decision.equivalentTarget).toBe(9);
  });

  test('non-equivalent or adjacent candidate is not blocked', () => {
    const decision = shouldBlockEquivalentBridgeCommit({
      current: 10,
      requestedTarget: 11,
      semanticTarget: 11,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'normal',
      reason: 'final_live_safe_step',
    });
    expect(decision.shouldBlock).toBe(false);
  });

  test('existing bypass/allowed path remains allowed when completion or trap-escape semantics apply', () => {
    const completion = shouldBlockEquivalentBridgeCommit({
      current: 1,
      requestedTarget: 5,
      semanticTarget: 5,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'pending_speakable_bridge_complete',
      reason: 'final_live_safe_step',
    });
    expect(completion.shouldBlock).toBe(false);
    expect(completion.bridgeCompletionPath).toBe(true);

    const trapEscape = shouldBlockEquivalentBridgeCommit({
      current: 1,
      requestedTarget: 5,
      semanticTarget: 5,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'normal',
      reason: 'bridge_trap_escape',
    });
    expect(trapEscape.shouldBlock).toBe(false);
    expect(trapEscape.bridgeTrapEscapePath).toBe(true);
  });
});
