import { evaluateStallCueRescuePolicy, scanCueBridgeWindow } from '../../src/features/asr/asr-scroll-driver';

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

  test('auto-stall rescue does not authorize forward motion on its own', () => {
    const policy = evaluateStallCueRescuePolicy({
      reasonTag: 'auto-stall',
      skippedReasons: ['cue'],
    });

    expect(policy).toEqual({
      allow: false,
      directContentForwardRescue: false,
      blockedReason: 'auto-stall-disabled',
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
