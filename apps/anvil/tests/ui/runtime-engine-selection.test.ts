/** @jest-environment jsdom */

describe('runtime speech engine selection', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('prefers the live speech state engine when present', () => {
    const { resolveRuntimeSpeechEngine } = require('../../src/speech/runtime-engine-selection') as typeof import('../../src/speech/runtime-engine-selection');

    const engine = resolveRuntimeSpeechEngine({
      speechState: { engine: 'whisper' },
      appStore: { get: () => 'webspeech' },
    });

    expect(engine).toBe('whisper');
  });

  test('falls back to the app store engine when speech state is unavailable', () => {
    const { resolveRuntimeSpeechEngine } = require('../../src/speech/runtime-engine-selection') as typeof import('../../src/speech/runtime-engine-selection');

    const engine = resolveRuntimeSpeechEngine({
      appStore: { get: (key: string) => (key === 'asr.engine' ? 'webspeech' : undefined) },
    });

    expect(engine).toBe('webspeech');
  });

  test('defaults to whisper when no runtime source is available', () => {
    const { resolveRuntimeSpeechEngine } = require('../../src/speech/runtime-engine-selection') as typeof import('../../src/speech/runtime-engine-selection');

    expect(resolveRuntimeSpeechEngine()).toBe('whisper');
  });
});
