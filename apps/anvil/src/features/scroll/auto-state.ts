const STORAGE_KEY = 'tp_auto_enabled_v1';

/**
 * Auto-scroll should be ON by default.
 * Previous behavior defaulted to false when no preference was stored, which
 * forced users to wait for ASR commits before the script advanced (causing the
 * “not keeping up” lag). We now treat the absence of a stored preference as
 * opt-in, and only disable when explicitly set to "0".
 */
export function readStoredAutoEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
    // default-on fallback when unset or unreadable
    return true;
  } catch {
    return true;
  }
}

export function persistStoredAutoEnabled(enabled: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}
