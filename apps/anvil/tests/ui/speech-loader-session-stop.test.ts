/** @jest-environment jsdom */

import { captureConsoleMethods } from '../helpers/window-listener-scope';

jest.mock('../../src/speech/backend-guard', () => ({
  ...jest.requireActual('../../src/speech/backend-guard'),
  isSpeechBackendAllowed: () => false,
}));

test('session stop disarms ASR create attempts and prevents blocked create spam', async () => {
  const restoreConsoleMethods = captureConsoleMethods();
  localStorage.clear();
  localStorage.setItem('tp_dev_mode', '1');
  window.history.replaceState({}, '', '/?dev=1');
  delete (window as any).__tpSpeech;
  delete (window as any).__tpSpeechOrchestrator;
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  (window as any).__tpAsrBlocksReady = true;
  (window as any).__tpAsrBlockCount = 24;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { appStore } = await import('../../src/state/app-store');
  const { initSession } = await import('../../src/state/session');
  initSession();
  (window as any).__tpStore = appStore;
  appStore.set('scrollMode', 'asr' as any);
  appStore.set('session.phase', 'live' as any);
  appStore.set('session.asrDesired', true as any);
  appStore.set('session.asrArmed', true as any);
  const { installSpeech } = await import('../../src/features/speech-loader');
  installSpeech();
  const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  window.dispatchEvent(new CustomEvent('tp:session:intent', { detail: { active: true, mode: 'asr' } }));

  for (let i = 0; i < 10; i += 1) {
    window.dispatchEvent(new CustomEvent('tp:scroll:mode', { detail: { mode: 'asr', reason: 'store-change' } }));
  }
  expect(debugSpy.mock.calls.some((call) => String(call[0] || '').includes('[ASR] driver create blocked'))).toBe(true);

  debugSpy.mockClear();
  appStore.set('session.phase', 'wrap' as any);
  window.dispatchEvent(new CustomEvent('tp:session:phase', { detail: { phase: 'wrap' } }));
  window.dispatchEvent(new CustomEvent('tp:session:stop', { detail: { source: 'recBtn', reason: 'user' } }));
  for (let i = 0; i < 15; i += 1) {
    appStore.set('session.phase', 'wrap' as any);
    window.dispatchEvent(new CustomEvent('tp:scroll:mode', { detail: { mode: 'asr', reason: 'store-change' } }));
  }

  const blockedAfterStop = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[ASR] driver create blocked'));
  const blockedSuppressedAfterStop = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[ASR] driver create blocked (suppressed)'));
  expect(blockedAfterStop.length).toBeLessThanOrEqual(2);
  expect(blockedSuppressedAfterStop).toHaveLength(0);
  expect(appStore.get('session.asrArmed')).toBe(false);
  expect(appStore.get('session.asrDesired')).toBe(false);
  jest.restoreAllMocks();
  restoreConsoleMethods();
});
