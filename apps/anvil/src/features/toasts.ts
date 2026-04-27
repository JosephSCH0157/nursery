import { showToast, type ToastKind } from '../ui/toasts';

type UploadStatusDetail = {
  phase?: string;
  strategy?: string;
  mb?: number;
  chunkIndex?: number | null;
  totalChunks?: number | null;
  progressPct?: number | null;
  safeToLeave?: boolean;
  errorMessage?: string | null;
};

type UploadWarningDetail = {
  mb?: number;
  thresholdMb?: number;
  strategy?: string;
};

let installed = false;
let chunkedNoticeShown = false;
let safeToLeaveShown = false;
let failedShown = false;
let lastProgressToastAt = 0;

function isDevMode(): boolean {
  try {
    if ((window as any).__TP_DEV || (window as any).__TP_DEV1) return true;
    const qs = new URLSearchParams(String(window.location.search || ''));
    if (qs.has('dev') || qs.has('debug') || qs.has('hud') || qs.has('scrollDebug')) return true;
    return localStorage.getItem('tp_dev_mode') === '1';
  } catch {
    return false;
  }
}

function toast(message: string, type: ToastKind = 'info', timeoutMs = 2600): void {
  try {
    showToast(message, { type, timeoutMs });
  } catch {
    // ignore
  }
}

function normalizePct(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function shouldEmitProgressToast(now: number): boolean {
  const MIN_INTERVAL_MS = 1500;
  if (now - lastProgressToastAt < MIN_INTERVAL_MS) return false;
  lastProgressToastAt = now;
  return true;
}

function onUploadWarning(ev: Event): void {
  const detail = ((ev as CustomEvent<UploadWarningDetail>).detail ?? {}) as UploadWarningDetail;
  const mb = Number.isFinite(Number(detail.mb)) ? Number(detail.mb).toFixed(1) : 'unknown';
  const threshold = Number.isFinite(Number(detail.thresholdMb)) ? Number(detail.thresholdMb).toFixed(0) : 'unknown';
  toast(`Large upload (${mb} MB) exceeds ${threshold} MB warning threshold`, 'warning', 3200);
}

function onUploadStatus(ev: Event): void {
  const detail = ((ev as CustomEvent<UploadStatusDetail>).detail ?? {}) as UploadStatusDetail;
  const phase = String(detail.phase || '').toLowerCase();
  const strategy = String(detail.strategy || '').toLowerCase();
  const chunkIndex = Number(detail.chunkIndex);
  const totalChunks = Number(detail.totalChunks);
  const pct = normalizePct(detail.progressPct);

  if (phase === 'preflight') {
    chunkedNoticeShown = false;
    safeToLeaveShown = false;
    failedShown = false;
    lastProgressToastAt = 0;
    return;
  }

  if (phase === 'uploading' && strategy === 'chunked' && isDevMode() && !chunkedNoticeShown) {
    const mb = Number.isFinite(Number(detail.mb)) ? Number(detail.mb).toFixed(1) : '?';
    const chunkLabel = Number.isFinite(totalChunks) && totalChunks > 0 ? ` in ${totalChunks} chunks` : '';
    toast(`Chunked upload active (${mb} MB${chunkLabel})`, 'info', 2800);
    chunkedNoticeShown = true;
    return;
  }

  if (
    phase === 'uploading' &&
    strategy === 'chunked' &&
    isDevMode() &&
    Number.isFinite(chunkIndex) &&
    Number.isFinite(totalChunks) &&
    totalChunks > 1 &&
    shouldEmitProgressToast(Date.now())
  ) {
    const progressText = pct == null ? '' : ` (${pct}%)`;
    toast(`Uploading chunk ${chunkIndex}/${totalChunks}${progressText}`, 'info', 1800);
    return;
  }

  if (phase === 'done' && detail.safeToLeave && !safeToLeaveShown) {
    toast('Recording upload complete. Safe to leave.', 'success', 3200);
    safeToLeaveShown = true;
    return;
  }

  if (phase === 'failed' && !failedShown) {
    const msg = detail.errorMessage ? ` (${detail.errorMessage})` : '';
    toast(`Canonical upload failed${msg}. Falling back to local save.`, 'warning', 4200);
    failedShown = true;
  }
}

export function initToasts() {
  if (installed) return;
  installed = true;
  try {
    window.addEventListener('tp:recording:upload-warning', onUploadWarning as EventListener);
    window.addEventListener('tp:recording:upload-status', onUploadStatus as EventListener);
    console.log('[src/features/toasts] initToasts');
  } catch {
    // ignore
  }
}

export const initToastsFeature = initToasts;
