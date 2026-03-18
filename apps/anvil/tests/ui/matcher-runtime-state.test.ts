/** @jest-environment jsdom */

describe('matcher runtime state', () => {
  beforeEach(() => {
    jest.resetModules();
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

  test('normalizes the shared runtime snapshot for both matcher paths', async () => {
    (window as any).scriptWords = ['alpha', 'beta'];
    (window as any).paraIndex = [{ start: 0, end: 1, key: 'line-0' }];
    (window as any).__vParaIndex = ['alpha beta'];
    (window as any).currentIndex = 7;
    (window as any).MATCH_WINDOW_AHEAD = 128;
    (window as any).MATCH_WINDOW_BACK = 12;
    (window as any).SIM_THRESHOLD = 0.62;
    (window as any).MAX_JUMP_AHEAD_WORDS = 9;
    (window as any).__viterbiIPred = { path: [1, '2', 'oops', 3], pred: '5' };

    const { getMatcherRuntimeState } = await import('../../src/speech/matcher-runtime-state');

    expect(getMatcherRuntimeState({ currentIndex: 4, windowBack: 8 })).toEqual({
      scriptWords: ['alpha', 'beta'],
      paraIndex: [{ start: 0, end: 1, key: 'line-0' }],
      vParaIndex: ['alpha beta'],
      cfg: {
        MATCH_WINDOW_AHEAD: 128,
        MATCH_WINDOW_BACK: 8,
        SIM_THRESHOLD: 0.62,
        MAX_JUMP_AHEAD_WORDS: 9,
      },
      currentIndex: 4,
      viterbiState: {
        path: [1, 2, 3],
        pred: 5,
      },
    });
  });
});
