import { shouldStageVisualOnlyBridge } from '../../src/features/asr/asr-bridge-policy';

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
});
