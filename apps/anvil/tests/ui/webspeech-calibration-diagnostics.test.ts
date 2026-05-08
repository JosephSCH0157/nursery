/** @jest-environment jsdom */

describe('webspeech calibration diagnostics', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('emits browser-managed partial calibration diagnostics', async () => {
    class MockSR {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start = jest.fn(() => { this.onstart?.(); });
      stop = jest.fn();
    }

    (window as any).SpeechRecognition = MockSR;
    (window as any).__tpMic = {
      requestMic: jest.fn(async () => ({
        getAudioTracks: () => [{ getSettings: () => ({}) }],
      })),
    };

    const events: any[] = [];
    window.addEventListener('tp:asr:calibration-status', (event: Event) => {
      events.push((event as CustomEvent).detail);
    });

    const { WebSpeechEngine } = await import('../../src/speech/engines/webspeech');
    const engine = new WebSpeechEngine();
    await engine.start({ interim: true, lang: 'en-US' } as any);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toEqual(expect.objectContaining({
      path: 'webspeech',
      browserManaged: true,
      state: expect.any(String),
    }));
  });
});

