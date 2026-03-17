import {
  evaluateCueBoundaryMultiJumpRelaxation,
  evaluateStallCueRescuePolicy,
  scanCueBridgeWindow,
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
});
