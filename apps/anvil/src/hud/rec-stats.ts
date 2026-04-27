import type { AppStore } from '../state/app-store';
import type { HudBus } from './speech-notes-hud';

export interface RecStatsHudOptions {
  root?: HTMLElement | null;
  bus?: HudBus | null;
  store?: AppStore | null;
}

export interface RecStatsHudApi {
  destroy(): void;
}

const HUD_ID = 'recStatsHud';
const TEXT_ID = 'recStatsText';
const UPLOAD_TEXT_ID = 'recUploadText';

function isDev(): boolean {
  try {
    if ((window as any).__TP_DEV) return true;
    if (/([?#]).*dev=1/.test(location.href)) return true;
    return localStorage.getItem('tp_dev_mode') === '1';
  } catch {
    return false;
  }
}

function ensureHudRoot(root?: HTMLElement | null): HTMLElement | null {
  if (root) return root;
  try {
    return document.getElementById('hud-root');
  } catch {
    return null;
  }
}

export function initRecStatsHud(opts: RecStatsHudOptions = {}): RecStatsHudApi | null {
  const { bus = null } = opts;
  if (!isDev()) return null;
  const root = ensureHudRoot(opts.root);
  if (!root) return null;

  let panel = document.getElementById(HUD_ID) as HTMLElement | null;
  if (!panel) {
    panel = document.createElement('div');
    panel.id = HUD_ID;
    panel.style.cssText =
      'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#9fb4c9;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin:4px 0;max-width:420px;';
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const strong = document.createElement('strong');
    strong.textContent = 'REC';
    const span = document.createElement('span');
    span.id = TEXT_ID;
    span.textContent = '…';
    topRow.appendChild(strong);
    topRow.appendChild(span);
    panel.appendChild(topRow);

    const upload = document.createElement('div');
    upload.id = UPLOAD_TEXT_ID;
    upload.textContent = 'upload idle';
    upload.style.cssText = 'margin-top:4px;color:#b8cbe0;opacity:.92;';
    panel.appendChild(upload);

    root.appendChild(panel);
  }

  const textEl = document.getElementById(TEXT_ID) as HTMLElement | null;
  const uploadEl = document.getElementById(UPLOAD_TEXT_ID) as HTMLElement | null;
  const fmt = (x: unknown) => {
    try {
      return x == null || !isFinite(Number(x)) ? '…' : String(Math.round(Number(x)));
    } catch {
      return '…';
    }
  };

  const handleStats = (payload: any) => {
    try {
      const d = (payload && payload.detail) || payload || {};
      const msg = `starts ${d.starts | 0} · retry ${d.retries | 0} · fallback ${d.fallbacks | 0} · dc ${d.disconnects | 0} · p95 start ${fmt(
        d.startP95Ms,
      )}ms · p95 stop ${fmt(d.stopP95Ms)}ms`;
      if (textEl) textEl.textContent = msg;
    } catch {
      /* ignore */
    }
  };

  const setUploadText = (value: string) => {
    try {
      if (uploadEl) uploadEl.textContent = value;
    } catch {
      /* ignore */
    }
  };

  const handleUploadStatus = (payload: any) => {
    try {
      const detail = (payload?.detail ?? payload ?? {}) as {
        phase?: string;
        strategy?: string;
        chunkIndex?: number | null;
        totalChunks?: number | null;
        progressPct?: number | null;
        safeToLeave?: boolean;
      };
      const phase = String(detail.phase || '').toLowerCase();
      const strategy = String(detail.strategy || '').toLowerCase();
      const chunkIndex = Number(detail.chunkIndex);
      const totalChunks = Number(detail.totalChunks);
      const pctRaw = Number(detail.progressPct);
      const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.round(pctRaw))) : null;

      if (phase === 'preflight') {
        setUploadText(`upload preflight • ${strategy || 'single'}`);
        return;
      }
      if (phase === 'uploading') {
        if (strategy === 'chunked' && Number.isFinite(chunkIndex) && Number.isFinite(totalChunks) && totalChunks > 0) {
          const pctText = pct == null ? '' : ` • ${pct}%`;
          setUploadText(`upload chunk ${chunkIndex}/${totalChunks}${pctText}`);
        } else {
          setUploadText('uploading single commit');
        }
        return;
      }
      if (phase === 'finalizing') {
        setUploadText('upload finalizing canonical commit');
        return;
      }
      if (phase === 'done') {
        setUploadText(detail.safeToLeave ? 'upload complete • safe to leave' : 'upload complete');
        return;
      }
      if (phase === 'failed') {
        setUploadText('upload failed • fallback path engaged');
      }
    } catch {
      /* ignore */
    }
  };

  const onWindowStats = (e: Event) => handleStats((e as CustomEvent<any>)?.detail ?? {});
  const onWindowUpload = (e: Event) => handleUploadStatus((e as CustomEvent<any>)?.detail ?? {});
  window.addEventListener('rec:stats', onWindowStats, { passive: true });
  window.addEventListener('tp:recording:upload-status', onWindowUpload, { passive: true });
  try {
    bus?.on('rec:stats', handleStats);
    bus?.on('recording:upload:status', handleUploadStatus);
  } catch {
    /* ignore */
  }

  const destroy = () => {
    window.removeEventListener('rec:stats', onWindowStats);
    window.removeEventListener('tp:recording:upload-status', onWindowUpload);
    try {
      bus?.off?.('rec:stats', handleStats);
      bus?.off?.('recording:upload:status', handleUploadStatus);
    } catch {
      /* ignore */
    }
    try {
      const line = document.getElementById(HUD_ID);
      if (line) line.remove();
    } catch {
      /* ignore */
    }
  };

  try {
    (window as any).__tpRecStatsHud = { panel, destroy };
  } catch {
    /* ignore */
  }

  return { destroy };
}
