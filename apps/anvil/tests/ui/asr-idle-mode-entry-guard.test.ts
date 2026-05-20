/** @jest-environment jsdom */

jest.mock('../../src/ui/toasts', () => {
  const actual = jest.requireActual('../../src/ui/toasts');
  return { ...actual, showToast: jest.fn() };
});
jest.mock('../../recorders.js', () => ({}), { virtual: true });
jest.mock('../../src/forge/authProfile', () => ({
  ensureUserAndProfile: () => Promise.resolve({ user: null, profile: null }),
}));

function installMinimalScrollModeDom(): void {
  document.body.innerHTML = `
    <main id="viewer" class="viewer"></main>
    <select id="scrollMode">
      <option value="hybrid">Hybrid</option>
      <option value="asr">ASR</option>
    </select>
    <div id="scrollModeInlineHint"></div>
    <div id="scrollModeHelp">Scroll mode controls</div>
    <div id="scrollModeStatus"></div>
  `;
}

describe('ASR idle mode-entry guard', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    installMinimalScrollModeDom();
    (window as any).__TP_TEST_SKIP_BOOT__ = true;
    (window as any).__TP_DEV = true;
    (window as any)._document = document;
    (global as any).BroadcastChannel = class {
      constructor() {}
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {}
    };
  });

  test('mode-enter-asr during idle emits ASR_MODE_ENTRY_GUARD runtime_arm_blocked_idle', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installScrollRouter } = await import('../../src/features/scroll/scroll-router/router-impl');

    initSession();
    setSessionPhase('idle');
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'hybrid' as any);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const viewer = document.getElementById('viewer') as HTMLElement;

    installScrollRouter({ hostEl: viewer });
    appStore.set('scrollMode', 'asr' as any);

    expect(
      warnSpy.mock.calls.some((call) =>
        call[0] === '[ASR_MODE_ENTRY_GUARD]' && call[1]?.action === 'runtime_arm_blocked_idle'),
    ).toBe(true);

    warnSpy.mockRestore();
  });
});
