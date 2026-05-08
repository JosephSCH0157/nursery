/** @jest-environment jsdom */

import type { resolveRuntimeSpeechEngine as _resolveRuntimeSpeechEngine } from '../../src/speech/runtime-engine-selection';

describe('runtime speech engine selection', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('uses the app store engine as the only requested-engine authority', () => {
    const { resolveRuntimeSpeechEngine } = require('../../src/speech/runtime-engine-selection');

    const engine = resolveRuntimeSpeechEngine({
      speechState: { engine: 'whisper' },
      appStore: { get: () => 'webspeech' },
    });

    expect(engine).toBe('webspeech');
  });

  test('falls back to the app store engine when speech state is unavailable', () => {
    const { resolveRuntimeSpeechEngine } = require('../../src/speech/runtime-engine-selection');

    const engine = resolveRuntimeSpeechEngine({
      appStore: { get: (key: string) => (key === 'asr.engine' ? 'webspeech' : undefined) },
    });

    expect(engine).toBe('webspeech');
  });

  test('defaults to whisper when no runtime source is available', () => {
    const { resolveRuntimeSpeechEngine } = require('../../src/speech/runtime-engine-selection');

    expect(resolveRuntimeSpeechEngine()).toBe('whisper');
  });
});
