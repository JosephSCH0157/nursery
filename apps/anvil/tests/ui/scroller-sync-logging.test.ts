/** @jest-environment jsdom */

import { applyCanonicalScrollTop } from '../../src/scroll/scroller';

describe('SCROLL_SYNC logging', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.body.innerHTML = '<main id="viewer" class="viewer"><div id="script"></div></main>';
    const viewer = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: 3000 });
    viewer.scrollTop = 0;
    window.history.replaceState({}, '', '/?dev=1');
  });

  test('does not emit SCROLL_SYNC in plain dev mode without explicit sync debug flag', () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    for (let i = 0; i < 200; i += 1) {
      applyCanonicalScrollTop(1200, { reason: 'asr-tick' });
    }
    expect(debugSpy.mock.calls.some((call) => String(call[0] || '').includes('[SCROLL_SYNC]'))).toBe(false);
  });

  test('coalesces repeated SCROLL_SYNC logs when explicit sync debug is enabled', () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    window.history.replaceState({}, '', '/?scrollSyncDebug=1');
    for (let i = 0; i < 400; i += 1) {
      applyCanonicalScrollTop(1200, { reason: 'asr-low-pocket-deadband-reconcile' });
    }
    const syncLogs = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[SCROLL_SYNC]'));
    expect(syncLogs.length).toBeLessThan(30);
  });
});
