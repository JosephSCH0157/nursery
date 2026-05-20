const DIAG_VERBOSE_QUERY_KEY = 'diag_verbose';
const DIAG_VERBOSE_STORAGE_KEY = 'tp_diag_verbose';

function readBoolFlag(value: unknown): boolean {
  return String(value || '').trim() === '1';
}

export function isVerboseDiagnosticMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const runtimeFlag = (window as any).__TP_DIAG_VERBOSE;
    if (runtimeFlag === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (readBoolFlag(params.get(DIAG_VERBOSE_QUERY_KEY))) return true;
  } catch {
    // ignore
  }
  try {
    if (readBoolFlag(window.localStorage?.getItem(DIAG_VERBOSE_STORAGE_KEY))) return true;
  } catch {
    // ignore
  }
  return false;
}

export function shouldLogVerboseDiagnostic(): boolean {
  return isVerboseDiagnosticMode();
}
