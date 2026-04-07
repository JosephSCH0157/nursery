import {
  evaluateWeakForwardClampSupport,
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

  test('strict bridge scan still recognizes explicit bare cue words as cue-only bridges', () => {
    const scan = scanCueBridgeWindow([
      'pause',
      'Because Florida was announcing itself.',
    ], { strict: true });

    expect(scan.nextOffset).toBe(1);
    expect(scan.skippedReasons).toEqual(['cue']);
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

  test('cue-safe immediate promotion accepts bare cue words that normalize to an explicit cue', () => {
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
      allowBridgeEps: true,
      reason: 'cue-safe:cue',
    });
  });

  test('auto-stall rescue blocks ordinary content-step progression', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'auto-stall',
      skippedReasons: [],
      cursorLineSkippable: false,
    });

    expect(policy).toEqual({
      allow: false,
      directContentForwardRescue: false,
      blockedReason: 'content-line',
    });
  });

  test('auto-stall rescue still allows strict cue bridges once the cursor is on a cue line', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'auto-stall',
      skippedReasons: ['cue'],
      cursorLineSkippable: true,
    });

    expect(policy).toEqual({
      allow: true,
      directContentForwardRescue: false,
      blockedReason: '',
    });
  });

  test('auto-stall rescue allows a direct handoff from a cue line to the next spoken line', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'auto-stall',
      skippedReasons: [],
      cursorLineSkippable: true,
    });

    expect(policy).toEqual({
      allow: true,
      directContentForwardRescue: false,
      blockedReason: '',
    });
  });

  test('adjacent auto-stall content rescue helper currently unlocks after the first committed line', () => {
    expect(shouldAllowAutoStallContentRescue({
      commitCount: 1,
      deltaLines: 1,
      sinceLastForwardMs: 2500,
      lostForwardGateCountSinceCommit: 3,
    })).toBe(true);

    expect(shouldAllowAutoStallContentRescue({
      commitCount: 1,
      deltaLines: 1,
      sinceLastForwardMs: 3500,
      lostForwardGateCountSinceCommit: 1,
    })).toBe(true);
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

  test('second committed line unlocks adjacent auto-stall rescue after a severe stall even without lost-forward gates', () => {
    expect(shouldAllowAutoStallContentRescue({
      commitCount: 2,
      deltaLines: 1,
      sinceLastForwardMs: 6500,
      lostForwardGateCountSinceCommit: 0,
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
      cursorLineSkippable: true,
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
      cursorLineSkippable: false,
    });

    expect(policy).toEqual({
      allow: false,
      directContentForwardRescue: false,
      blockedReason: 'content-line',
    });
  });

  test('weak far-forward hold can still release the near candidate when the distant pick wins outright', () => {
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
    })).toBeNull();
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

  test('weak forward clamp blocks far promotion without local support near the clamped line', () => {
    expect(evaluateWeakForwardClampSupport({
      cursorLine: 2,
      requestedIdx: 26,
      clampedIdx: 3,
      selectedScore: 0.42,
      candidates: [
        { idx: 2, score: 0.41 },
        { idx: 9, score: 0.32 },
        { idx: 26, score: 0.42 },
      ],
    })).toEqual({
      allow: false,
      localBestIdx: null,
      localBestScore: null,
      minSupport: 0.3,
    });
  });

  test('weak forward clamp allows far promotion when the clamped line has local support', () => {
    expect(evaluateWeakForwardClampSupport({
      cursorLine: 2,
      requestedIdx: 26,
      clampedIdx: 3,
      selectedScore: 0.42,
      candidates: [
        { idx: 3, score: 0.35 },
        { idx: 9, score: 0.32 },
        { idx: 26, score: 0.42 },
      ],
    })).toEqual({
      allow: true,
      localBestIdx: 3,
      localBestScore: 0.35,
      minSupport: 0.3,
    });
  });
});
