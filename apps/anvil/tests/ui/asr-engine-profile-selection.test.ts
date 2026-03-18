/** @jest-environment jsdom */

describe('ASR engine profile selection', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('migrates legacy persisted webspeech settings to whisper when not explicit', () => {
    const {
      normalizePersistedAsrSelection,
    } = require('../../src/features/asr/engine-selection') as typeof import('../../src/features/asr/engine-selection');

    const settings = normalizePersistedAsrSelection({
      app: { 'asr.engine': 'webspeech' },
      asrSettings: { engine: 'webspeech' },
    });
    const asrSettings = settings.asrSettings as Record<string, unknown> | undefined;

    expect(settings.app?.['asr.engine']).toBe('whisper');
    expect(asrSettings?.engine).toBe('whisper');
    expect(asrSettings?.engineExplicit).toBeUndefined();
  });

  test('preserves browser speech when the persisted choice was explicit', () => {
    const {
      normalizePersistedAsrSelection,
    } = require('../../src/features/asr/engine-selection') as typeof import('../../src/features/asr/engine-selection');

    const settings = normalizePersistedAsrSelection({
      app: { 'asr.engine': 'webspeech' },
      asrSettings: { engine: 'webspeech', engineExplicit: true },
    });
    const asrSettings = settings.asrSettings as Record<string, unknown> | undefined;

    expect(settings.app?.['asr.engine']).toBe('webspeech');
    expect(asrSettings?.engine).toBe('webspeech');
    expect(asrSettings?.engineExplicit).toBe(true);
  });
});
