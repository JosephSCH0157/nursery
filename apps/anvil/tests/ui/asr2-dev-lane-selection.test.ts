/** @jest-environment jsdom */

describe('ASR2 dev lane selection isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  test('defaults to ASR1 lane and does not alter persisted asr.engine', async () => {
    localStorage.setItem('tp_asr_engine_v1', 'whisper');
    const state = await import('../../src/dev/dev-state');
    const { appStore } = await import('../../src/state/app-store');

    expect(state.getAsrExperimentalLane()).toBe(state.ASR_LANE_ASR1);
    expect(appStore.get('asr.engine')).toBe('whisper');
  });

  test('selecting ASR2 lane does not mutate asr.engine and does not become production default after reload', async () => {
    localStorage.setItem('tp_asr_engine_v1', 'whisper');
    let state = await import('../../src/dev/dev-state');
    let storeModule = await import('../../src/state/app-store');

    state.setAsrExperimentalLane(state.ASR_LANE_ASR2);
    expect(state.getAsrExperimentalLane()).toBe(state.ASR_LANE_ASR2);
    expect(storeModule.appStore.get('asr.engine')).toBe('whisper');

    jest.resetModules();
    state = await import('../../src/dev/dev-state');
    storeModule = await import('../../src/state/app-store');

    expect(state.getAsrExperimentalLane()).toBe(state.ASR_LANE_ASR2);
    expect(storeModule.appStore.get('asr.engine')).toBe('whisper');
  });
});

