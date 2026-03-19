/** @jest-environment jsdom */

describe('ASR engine default selection', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  test('migrates untouched webspeech installs to whisper', () => {
    localStorage.setItem('tp_asr_engine_v1', 'webspeech');

    const { appStore } = require('../../src/state/app-store') as { appStore: any };

    expect(appStore.get('asr.engine')).toBe('whisper');
  });

  test('preserves an explicit browser engine choice', () => {
    localStorage.setItem('tp_asr_engine_v1', 'webspeech');
    localStorage.setItem('tp_asr_engine_explicit_v1', '1');

    const { appStore } = require('../../src/state/app-store') as { appStore: any };

    expect(appStore.get('asr.engine')).toBe('webspeech');
  });
});
