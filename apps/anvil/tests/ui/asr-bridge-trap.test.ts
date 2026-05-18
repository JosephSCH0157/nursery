import {
  clearOnlyMatchingBridgeBlockToken,
  shouldReleaseEarlyBridgeTrap,
} from '../../src/features/asr/asr-bridge-trap';

describe('ASR early bridge trap release', () => {
  test('current=3/4 requestedTarget=6 across blank/cue with repeated holds releases to next speakable target', () => {
    const decision = shouldReleaseEarlyBridgeTrap({
      liveAsrActive: true,
      current: 4,
      requestedTarget: 6,
      nextSpeakableTarget: 6,
      requestedTargetIsSpeakable: true,
      skippedIgnorableLines: ['blank'],
      repeatedHoldCount: 3,
      runAgeMs: 24024,
      pendingBridgeAgeMs: 1200,
      finalPacketFresh: true,
      transcriptGrowing: true,
      targetViewportState: 'bottom',
      hardContradiction: false,
      offscriptNoMatch: false,
    });
    expect(decision).toEqual({
      shouldRelease: true,
      reason: 'repeated_startup_bridge_holds',
      commitTarget: 6,
    });
  });

  test('does not release across spoken lines', () => {
    const decision = shouldReleaseEarlyBridgeTrap({
      liveAsrActive: true,
      current: 3,
      requestedTarget: 6,
      nextSpeakableTarget: 4,
      requestedTargetIsSpeakable: true,
      skippedIgnorableLines: [],
      repeatedHoldCount: 4,
      runAgeMs: 18000,
      pendingBridgeAgeMs: 2200,
      finalPacketFresh: true,
      transcriptGrowing: true,
      targetViewportState: 'middle',
      hardContradiction: false,
      offscriptNoMatch: false,
    });
    expect(decision.shouldRelease).toBe(false);
  });

  test('does not release on hard contradiction', () => {
    const decision = shouldReleaseEarlyBridgeTrap({
      liveAsrActive: true,
      current: 4,
      requestedTarget: 6,
      nextSpeakableTarget: 6,
      requestedTargetIsSpeakable: true,
      skippedIgnorableLines: ['cue', 'blank'],
      repeatedHoldCount: 4,
      runAgeMs: 15000,
      pendingBridgeAgeMs: 2200,
      finalPacketFresh: true,
      transcriptGrowing: true,
      targetViewportState: 'bottom',
      hardContradiction: true,
      offscriptNoMatch: false,
    });
    expect(decision.shouldRelease).toBe(false);
  });

  test('does not release offscript noMatch', () => {
    const decision = shouldReleaseEarlyBridgeTrap({
      liveAsrActive: true,
      current: 4,
      requestedTarget: 6,
      nextSpeakableTarget: 6,
      requestedTargetIsSpeakable: true,
      skippedIgnorableLines: ['blank'],
      repeatedHoldCount: 4,
      runAgeMs: 15000,
      pendingBridgeAgeMs: 2200,
      finalPacketFresh: true,
      transcriptGrowing: true,
      targetViewportState: 'bottom',
      hardContradiction: false,
      offscriptNoMatch: true,
    });
    expect(decision.shouldRelease).toBe(false);
  });

  test('clears only the matching bridge block token', () => {
    const bridgeBlockMap = new Map<string, { until: number }>([
      ['4->6:1', { until: 1000 }],
      ['4->9:1', { until: 1000 }],
    ]);
    clearOnlyMatchingBridgeBlockToken(bridgeBlockMap, '4->6:1');
    expect(bridgeBlockMap.has('4->6:1')).toBe(false);
    expect(bridgeBlockMap.has('4->9:1')).toBe(true);
  });
});
