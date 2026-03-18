import {
  evaluateCueBoundaryMultiJumpRelaxation,
  evaluateStallCueRescuePolicy,
  resolveWeakFarForwardHoldCandidate,
  scanCueBridgeWindow,
  shouldAllowAutoStallContentRescue,
} from '../../src/features/asr/asr-scroll-driver';

describe('ASR cue-bridge promotion', () => {
  test('strict bridge scan does not skip spoken content during same-line promotion', () => {
    const scan = scanCueBridgeWindow([
      'It landed right on the tip of your tongue.',
      'Because Florida was announcing itself.',
      'Sweet in a way that did not stay politely in your nose.',
    ], { strict: true });

    expect(scan.nextOffset).toBe(0);
    expect(scan.skippedReasons).toEqual([]);
  });

  test('strict bridge scan allows multi-line promotion across explicit cue-only lines', () => {
    const scan = scanCueBridgeWindow([
      '[pause]',
      '[beat]',
      'Because Florida was announcing itself.',
    ], { strict: true });

    expect(scan.nextOffset).toBe(2);
    expect(scan.skippedReasons).toEqual(['cue', 'cue']);
  });

  test('strict bridge scan does not treat bare cue words as multi-line bridge proof', () => {
    const scan = scanCueBridgeWindow([
      'pause',
      'Because Florida was announcing itself.',
    ], { strict: true });

    expect(scan.nextOffset).toBe(0);
    expect(scan.skippedReasons).toEqual([]);
  });

  test('cue-safe immediate promotion relaxes multi-jump only for strict cue or blank skips', () => {
    const policy = evaluateCueBoundaryMultiJumpRelaxation({
      cursorLine: 3,
      requestedLine: 4,
      promotedLine: 5,
      skippedText: '',
      isFinal: false,
      forceTag: '',
      cueBridgePathValid: false,
      cueBridgeSkipCountOk: false,
      cueBridgeDelta: 0,
    });

    expect(policy).toEqual({
      allowBridgeEps: true,
      reason: 'cue-safe:blank',
    });
  });

  test('cue-safe immediate promotion still rejects bare cue words as proof', () => {
    const policy = evaluateCueBoundaryMultiJumpRelaxation({
      cursorLine: 3,
      requestedLine: 4,
      promotedLine: 5,
      skippedText: 'pause',
      isFinal: false,
      forceTag: '',
      cueBridgePathValid: false,
      cueBridgeSkipCountOk: false,
      cueBridgeDelta: 0,
    });

    expect(policy).toEqual({
      allowBridgeEps: false,
      reason: '',
    });
  });

  test('auto-stall rescue allows a direct adjacent content step', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'auto-stall',
      skippedReasons: [],
    });

    expect(policy).toEqual({
      allow: true,
      directContentForwardRescue: true,
      blockedReason: '',
    });
  });

  test('auto-stall rescue still allows strict cue bridges', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'auto-stall',
      skippedReasons: ['cue'],
    });

    expect(policy).toEqual({
      allow: true,
      directContentForwardRescue: false,
      blockedReason: '',
    });
  });

  test('opening auto-stall content rescue stays blocked without repeated lost-forward evidence', () => {
    expect(shouldAllowAutoStallContentRescue({
      commitCount: 1,
      deltaLines: 1,
      sinceLastForwardMs: 2500,
      lostForwardGateCountSinceCommit: 3,
    })).toBe(false);

    expect(shouldAllowAutoStallContentRescue({
      commitCount: 1,
      deltaLines: 1,
      sinceLastForwardMs: 3500,
      lostForwardGateCountSinceCommit: 1,
    })).toBe(false);
  });

  test('opening auto-stall content rescue unlocks after starvation and repeated lost-forward gates', () => {
    expect(shouldAllowAutoStallContentRescue({
      commitCount: 1,
      deltaLines: 1,
      sinceLastForwardMs: 3500,
      lostForwardGateCountSinceCommit: 2,
    })).toBe(true);
  });

  test('second committed line unlocks adjacent auto-stall rescue after the first lost-forward gate', () => {
    expect(shouldAllowAutoStallContentRescue({
      commitCount: 2,
      deltaLines: 1,
      sinceLastForwardMs: 3500,
      lostForwardGateCountSinceCommit: 1,
    })).toBe(true);
  });

  test('opening auto-stall content rescue still rejects multi-line skips', () => {
    expect(shouldAllowAutoStallContentRescue({
      commitCount: 1,
      deltaLines: 2,
      sinceLastForwardMs: 5000,
      lostForwardGateCountSinceCommit: 4,
    })).toBe(false);
  });

  test('explicit rescue still allows strict cue bridges', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'stall:speech_stall',
      skippedReasons: ['cue', 'note'],
    });

    expect(policy).toEqual({
      allow: true,
      directContentForwardRescue: false,
      blockedReason: '',
    });
  });

  test('explicit rescue still rejects ordinary content-step progression', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'stall:speech_stall',
      skippedReasons: [],
    });

    expect(policy).toEqual({
      allow: false,
      directContentForwardRescue: false,
      blockedReason: 'content-line',
    });
  });

  test('weak far-forward hold keeps a near candidate when the distant pick is only marginally better', () => {
    expect(resolveWeakFarForwardHoldCandidate({
      cursorLine: 9,
      selectedIdx: 26,
      selectedScore: 0.39,
      currentLineScore: 0.31,
      candidates: [
        { idx: 9, score: 0.31 },
        { idx: 10, score: 0.3 },
        { idx: 26, score: 0.39 },
      ],
    })).toEqual({
      idx: 9,
      score: 0.31,
    });
  });

  test('weak far-forward hold does not suppress strong distant picks', () => {
    expect(resolveWeakFarForwardHoldCandidate({
      cursorLine: 9,
      selectedIdx: 26,
      selectedScore: 0.84,
      currentLineScore: 0.31,
      candidates: [
        { idx: 9, score: 0.31 },
        { idx: 10, score: 0.3 },
        { idx: 26, score: 0.84 },
      ],
    })).toBeNull();
  });
});
