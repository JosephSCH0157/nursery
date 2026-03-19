/** @jest-environment jsdom */

describe('ASR legacy settings migration', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  test('migrates legacy ASR blob fields into canonical cache keys', () => {
    localStorage.setItem('tp_asr_settings_v1', JSON.stringify({
      engine: 'webspeech',
      lang: 'fr-FR',
      interim: false,
      threshold: 0.72,
      endpointingMs: 1234,
      fillerFilter: false,
      manualAnchorAdoptEnabled: false,
      calmModeEnabled: true,
    }));

    const { appStore } = require('../../src/state/app-store') as { appStore: any };

    expect(appStore.get('asr.engine')).toBe('whisper');
    expect(appStore.get('asr.language')).toBe('fr-FR');
    expect(appStore.get('asr.useInterimResults')).toBe(false);
    expect(appStore.get('asr.threshold')).toBe(0.72);
    expect(appStore.get('asr.endpointMs')).toBe(1234);
    expect(appStore.get('asr.filterFillers')).toBe(false);
    expect(appStore.get('asr.manualAnchorAdoptEnabled')).toBe(false);
    expect(appStore.get('asrCalmModeEnabled')).toBe(true);

    expect(localStorage.getItem('tp_asr_settings_v1')).toBeNull();
    expect(localStorage.getItem('tp_asr_engine_v1')).toBe('whisper');
    expect(localStorage.getItem('tp_asr_language_v1')).toBe('fr-FR');
    expect(localStorage.getItem('tp_asr_interim_v1')).toBe('0');
    expect(localStorage.getItem('tp_asr_threshold_v1')).toBe('0.72');
    expect(localStorage.getItem('tp_asr_endpoint_v1')).toBe('1234');
    expect(localStorage.getItem('tp_asr_filter_v1')).toBe('0');
    expect(localStorage.getItem('tp_asr_manual_anchor_v1')).toBe('0');
    expect(localStorage.getItem('tp_asr_calm_mode_v1')).toBe('1');
  });
});
