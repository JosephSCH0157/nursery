/** @jest-environment jsdom */

jest.mock('../../src/ui/toasts', () => {
  const actual = jest.requireActual('../../src/ui/toasts');
  return { ...actual, showToast: jest.fn() };
});
jest.mock('../../recorders.js', () => ({}), { virtual: true });
jest.mock('../../src/forge/authProfile', () => ({
  ensureUserAndProfile: () => Promise.resolve({ user: null, profile: null }),
}));

function press(key: 'ArrowUp' | 'ArrowDown', shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.getElementById('surface')!.dispatchEvent(event);
  return event;
}

describe('speed shortcut authoritative paths', () => {
  beforeAll(async () => {
    document.documentElement.style.setProperty('--tp-font-size', '40px');
    document.documentElement.style.setProperty('--tp-line-height', '1.4');
    document.body.innerHTML = `
      <main id="viewer" class="viewer"></main>
      <div id="surface" tabindex="0"></div>
      <select id="scrollMode">
        <option value="timed">Timed</option>
        <option value="wpm">WPM</option>
        <option value="hybrid">Hybrid</option>
      </select>
      <input id="autoSpeed" type="number" min="1" max="60" step="1" value="21" />
      <button id="autoDec">-</button>
      <button id="autoInc">+</button>
      <button id="autoToggle">Auto-scroll: Off</button>
      <input id="wpmTarget" type="number" min="60" max="260" step="5" value="150" />
      <div id="scrollModeInlineHint"></div>
      <div id="scrollModeHelp"></div>
      <div id="scrollModeStatus"></div>
    `;
    localStorage.clear();
    localStorage.setItem('tp_wpl_hint', '8');
    (window as any).__TP_TEST_SKIP_BOOT__ = true;
    (window as any).__TP_DEV = true;
    (window as any)._document = document;
    (global as any).BroadcastChannel = class {
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {}
    };

    const { appStore } = await import('../../src/state/app-store');
    appStore.set('scrollMode', 'timed' as any);
    (window as any).__tpStore = appStore;

    await import('../../src/features/autoscroll-ui');
    const router = await import('../../src/features/scroll/scroll-router/router-impl');
    const motor = router.createAutoMotor();
    (window as any).__shortcutTestAutoMotor = motor;
    router.installScrollRouter({ auto: motor, hostEl: document.getElementById('viewer') });
  });

  afterAll(() => {
    try { (window as any).__shortcutTestAutoMotor?.stop?.(); } catch {}
    delete (window as any).__shortcutTestAutoMotor;
  });

  test.each([
    [60, 'ArrowUp', 60],
    [1, 'ArrowDown', 1],
  ] as const)('Timed Shift boundary %i via %s keeps display and runtime at %i', (start, key, expected) => {
    const input = document.getElementById('autoSpeed') as HTMLInputElement;
    input.value = String(start);
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const event = press(key, true);
    const runtime = (window as any).__shortcutTestAutoMotor.getState().speed;
    expect(event.defaultPrevented).toBe(true);
    expect(Number(input.value)).toBe(expected);
    expect(runtime).toBe(expected);
  });

  test.each([
    ['wpm', 260, 'ArrowUp', 260],
    ['wpm', 60, 'ArrowDown', 60],
    ['hybrid', 260, 'ArrowUp', 260],
    ['hybrid', 60, 'ArrowDown', 60],
  ] as const)('%s Shift boundary %i via %s keeps canonical WPM synchronized at %i', async (mode, start, key, expected) => {
    const { appStore } = await import('../../src/state/app-store');
    appStore.set('scrollMode', mode as any);
    appStore.set('wpmTarget', start);
    const input = document.getElementById('wpmTarget') as HTMLInputElement;
    input.value = String(start);
    localStorage.setItem('tp_baseline_wpm', String(start));
    const intentSpy = jest.fn();
    window.addEventListener('tp:wpm:intent', intentSpy, { once: true });
    const hybridMotor = (window as any).__tpHybridMotor;
    const velocitySpy = mode === 'hybrid' ? jest.spyOn(hybridMotor, 'setVelocityPxPerSec') : null;
    const infoSpy = mode === 'hybrid' ? jest.spyOn(console, 'info') : null;

    const event = press(key, true);
    expect(event.defaultPrevented).toBe(true);
    expect(intentSpy).toHaveBeenCalledTimes(1);
    expect(Number(input.value)).toBe(expected);
    expect(appStore.get('wpmTarget')).toBe(expected);
    expect(Number(localStorage.getItem('tp_baseline_wpm'))).toBe(expected);

    if (mode === 'wpm') {
      const expectedPxPerSec = (expected / 60 / 8) * 56;
      expect((window as any).__shortcutTestAutoMotor.getState().speed).toBeCloseTo(expectedPxPerSec, 5);
    } else {
      const expectedPxPerSec = (expected / 60 / 8) * 56 * 2;
      expect(velocitySpy).toHaveBeenCalled();
      const velocityCalls = velocitySpy?.mock.calls || [];
      expect(velocityCalls[velocityCalls.length - 1]?.[0]).toBeCloseTo(expectedPxPerSec, 5);
      expect(infoSpy).toHaveBeenCalledWith('[HYBRID_BASE] set', expect.objectContaining({
        wpm: expected,
        hybridBase: expect.closeTo(expectedPxPerSec, 5),
      }));
      velocitySpy?.mockRestore();
      infoSpy?.mockRestore();
    }
  });
});
