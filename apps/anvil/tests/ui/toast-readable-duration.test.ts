import { showToast } from '../../src/ui/toasts';

describe('human-readable toast timing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test.each([
    ['info', 6_000],
    ['success', 8_000],
    ['warning', 15_000],
    ['error', 20_000],
  ] as const)('%s notices remain visible for %d ms', (type, duration) => {
    showToast(`${type} message`, { type });
    const toast = document.querySelector('.tp-toast');
    expect(toast).not.toBeNull();

    jest.advanceTimersByTime(duration - 1);
    expect(toast?.classList.contains('show')).toBe(true);

    jest.advanceTimersByTime(1);
    expect(toast?.classList.contains('show')).toBe(false);
  });

  test('warning and error notices use assertive accessible announcements', () => {
    showToast('Readable warning', { type: 'warning' });
    const toast = document.querySelector('.tp-toast');
    expect(toast?.getAttribute('role')).toBe('alert');
    expect(toast?.getAttribute('aria-live')).toBe('assertive');
  });
});
