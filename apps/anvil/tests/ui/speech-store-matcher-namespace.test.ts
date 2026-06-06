/** @jest-environment jsdom */

describe('speech-store TS-primary matcher namespace', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete (window as any).__TP_TS_PRIMARY__;
    delete (window as any).__tpSpeech;
    delete (window as any).__tpMatcher;
    delete (window as any).__tpAsrBlocksReady;
    delete (window as any).__tpAsrBlockCount;
    delete (window as any).scriptWords;
    delete (window as any).paraIndex;
    delete (window as any).__vParaIndex;
    delete (window as any).currentIndex;
    delete (window as any).__viterbiIPred;
    delete (window as any).MATCH_WINDOW_AHEAD;
    delete (window as any).MATCH_WINDOW_BACK;
    delete (window as any).SIM_THRESHOLD;
    delete (window as any).MAX_JUMP_AHEAD_WORDS;
  });

  test('installs usable matchOne and matchBatch for TS-primary boot once blocks are ready', async () => {
    (window as any).__TP_TS_PRIMARY__ = true;

    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();

    const stubResult = (window as any).__tpSpeech.matchBatch('alpha beta', true);
    expect(stubResult).toEqual(expect.objectContaining({
      noMatch: true,
      reason: 'matcher_unavailable',
    }));

    await import('../../src/features/speech/speech-store');

    const namespace = (window as any).__tpSpeech;
    expect(typeof namespace.matchOne).toBe('function');
    expect(typeof namespace.matchBatch).toBe('function');
    expect(namespace.__tpMatcherProvider).toBe('ts_primary_runtime');

    const notReadyResult = namespace.matchBatch('alpha beta', true);
    expect(notReadyResult).toEqual(expect.objectContaining({
      noMatch: true,
      reason: 'matcher_unavailable',
      provider: 'ts_primary_runtime',
      diagnostic: 'ts_primary_matcher_not_ready:block_elements_empty',
    }));

    (window as any).scriptWords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    (window as any).paraIndex = [
      { start: 0, end: 2, key: 'alpha beta gamma', line: 0 },
      { start: 3, end: 5, key: 'delta epsilon zeta', line: 1 },
    ];
    (window as any).__vParaIndex = ['alpha beta gamma', 'delta epsilon zeta'];
    (window as any).currentIndex = 0;

    const blockEl = document.createElement('div');
    const { setAsrBlocks } = await import('../../src/scroll/asr-block-store');
    setAsrBlocks([blockEl], {
      schemaVersion: 1,
      blockCount: 1,
      createdAt: Date.now(),
      source: 'render',
      units: [{ blockIdx: 0, unitStart: 0, unitEnd: 1, sentenceCount: 2, charCount: 32 }],
    });

    const readyResult = namespace.matchOne('delta epsilon zeta', true);
    expect(readyResult).toEqual(expect.objectContaining({
      noMatch: false,
      bestIdx: 1,
      idx: 1,
      currentIdx: 0,
      reason: 'ts_primary_matcher',
      provider: 'ts_primary_runtime',
    }));
    expect(Number(readyResult.bestSim)).toBeGreaterThan(0.6);
  });

  test('keeps safe matcher_unavailable behavior with explicit diagnostics when no matcher can be installed', async () => {
    (window as any).__TP_TS_PRIMARY__ = true;

    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');

    const namespace = (window as any).__tpSpeech;
    const result = namespace.matchOne('delta epsilon zeta', true);

    expect(result).toEqual(expect.objectContaining({
      noMatch: true,
      bestIdx: -1,
      idx: -1,
      reason: 'matcher_unavailable',
      provider: 'ts_primary_runtime',
    }));
    expect(String(result.diagnostic || '')).toContain('ts_primary_matcher_not_ready:');
  });
});
