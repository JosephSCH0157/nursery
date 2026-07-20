/** @jest-environment jsdom */

import { captureWindowListeners } from '../helpers/window-listener-scope';

describe('speech-store TS-primary matcher namespace', () => {
  let releaseWindowListeners: (() => void) | null = null;
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    releaseWindowListeners = captureWindowListeners();
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
    delete (window as any).__tpTsPrimaryMatcherProviderRuntime;
    delete (window as any).__TP_LAST_APPLIED_HASH;
    delete (window as any).__tpTsPrimaryMatcherBlocksReadyListenerInstalled;
  });

  afterEach(() => {
    releaseWindowListeners?.();
    releaseWindowListeners = null;
    jest.restoreAllMocks();
    delete (window as any).__tpTsPrimaryMatcherProviderRuntime;
    delete (window as any).__tpAsrBlocksReady;
    delete (window as any).__tpAsrBlockCount;
    delete (window as any).__tpTsPrimaryMatcherBlocksReadyListenerInstalled;
  });

  test('installs usable matchOne and matchBatch for TS-primary boot once blocks are ready', async () => {
    (window as any).__TP_TS_PRIMARY__ = true;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();

    const stubResult = (window as any).__tpSpeech.matchBatch('alpha beta', true);
    expect(stubResult).toEqual(expect.objectContaining({
      noMatch: true,
      reason: 'matcher_unavailable',
    }));
    expect((window as any).__tpSpeech.__tpMatcherProvider).toBe('matcher_unavailable_stub');

    await import('../../src/features/speech/speech-store');
    const { getTsPrimaryMatcherProviderStatus } = await import('../../src/speech/ts-primary-matcher-provider');

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
    expect(getTsPrimaryMatcherProviderStatus('speech_store_init')).toEqual(expect.objectContaining({
      hasWindowTpSpeech: true,
      hasMatchOne: true,
      hasMatchBatch: true,
      matcherProviderKind: 'ts_primary_runtime',
      isBackendGuardStub: false,
      blocksReady: false,
      blockCount: 0,
      installAttempted: true,
      installSucceeded: true,
      overwrittenAfterInstall: false,
      currentProviderSource: 'ts_primary_matcher_provider',
    }));

    (window as any).scriptWords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    (window as any).paraIndex = [
      { start: 0, end: 2, key: 'alpha beta gamma', line: 0 },
      { start: 3, end: 5, key: 'delta epsilon zeta', line: 1 },
    ];
    (window as any).__vParaIndex = ['alpha beta gamma', 'delta epsilon zeta'];
    (window as any).currentIndex = 0;
    const rogueMatch = jest.fn(() => ({ noMatch: true, reason: 'rogue_override' }));
    namespace.matchBatch = rogueMatch;
    namespace.matchOne = rogueMatch;
    namespace.__tpMatcherProvider = 'rogue_override';
    namespace.__tpMatcherProviderSource = 'rogue_test';

    const blockEl = document.createElement('div');
    const { setAsrBlocks } = await import('../../src/scroll/asr-block-store');
    setAsrBlocks([blockEl], {
      schemaVersion: 1,
      blockCount: 1,
      createdAt: Date.now(),
      source: 'render',
      units: [{ blockIdx: 0, unitStart: 0, unitEnd: 1, sentenceCount: 2, charCount: 32 }],
    });
    expect(namespace.matchBatch).not.toBe(rogueMatch);
    expect(namespace.matchOne).not.toBe(rogueMatch);
    expect(namespace.__tpMatcherProvider).toBe('ts_primary_runtime');
    expect(warnSpy.mock.calls.some((call) => String(call[0] || '').includes('TS_PRIMARY_MATCHER_PROVIDER_OVERWRITTEN'))).toBe(true);

    expect(getTsPrimaryMatcherProviderStatus('blocks_ready')).toEqual(expect.objectContaining({
      matcherProviderKind: 'ts_primary_runtime',
      blocksReady: true,
      blockCount: 1,
      installSucceeded: true,
      overwrittenAfterInstall: true,
      currentProviderSource: 'ts_primary_matcher_provider',
    }));

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
