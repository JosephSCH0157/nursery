/** @jest-environment jsdom */

describe('speech start arming', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.body.innerHTML = '<button id="recBtn" type="button">Start speech sync</button>';
  });

  test('clicking Start speech sync in ASR mode arms session ASR', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');
    const addSpy = jest.spyOn(window, 'addEventListener');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);

    installSpeech();
    const recBtn = document.getElementById('recBtn') as HTMLButtonElement | null;
    expect(recBtn).toBeTruthy();
    recBtn?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appStore.get('session.asrDesired')).toBe(true);
    expect(appStore.get('session.asrArmed')).toBe(true);
    expect(appStore.get('session.asrReady')).toBe(true);
    expect(
      addSpy.mock.calls.some((call) => String(call[0]) === 'tp:speech:transcript'),
    ).toBe(true);

    addSpy.mockRestore();
  });

  test('idle ASR mode selection does not attach transcript runtime before session start', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');
    const addSpy = jest.spyOn(window, 'addEventListener');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);

    installSpeech();

    expect(
      addSpy.mock.calls.some((call) => String(call[0]) === 'tp:speech:transcript'),
    ).toBe(false);

    addSpy.mockRestore();
  });

  test('stop click in live ASR always emits session stop intent', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    installSpeech();

    setSessionPhase('live');
    const recBtn = document.getElementById('recBtn') as HTMLButtonElement | null;
    expect(recBtn).toBeTruthy();
    recBtn?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appStore.get('session.phase')).toBe('wrap');
    expect(
      dispatchSpy.mock.calls.some((call) => {
        const evt = call[0] as Event;
        return evt?.type === 'tp:session:stop';
      }),
    ).toBe(true);

    dispatchSpy.mockRestore();
  });
});
