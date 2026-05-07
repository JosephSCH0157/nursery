// =============================================================
// File: src/ui/topbar-asr.ts
// =============================================================
import type { AsrMode } from '../features/asr-mode';

export class AsrTopbar {
  private chip!: HTMLSpanElement;
  private running = false;

  constructor(private _mode: AsrMode) {}

  mount(targetSelector = '#topbarRight, .topbar, header, body') {
    const host = document.querySelector(targetSelector) || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'asr-topbar flex items-center gap-2';

    this.chip = document.createElement('span');
    this.chip.className = 'rounded-full px-2 py-1 text-xs font-medium bg-gray-700 text-white';
    this.chip.textContent = 'ASR: off';

    wrap.appendChild(this.chip);
    host.appendChild(wrap);

    const renderState = (rawState: string) => {
      const st = String(rawState || '').toLowerCase();
      const map: Record<string, string> = {
        idle: 'off',
        ready: 'ready',
        listening: 'listening',
        running: 'listening',
        error: 'error',
      };
      this.chip.textContent = `ASR: ${map[st] ?? st}`;
      if (st === 'idle' || st === 'error') this.running = false;
      if (st === 'running' || st === 'listening' || st === 'ready') this.running = true;
    };

    const renderRuntime = (detail: any) => {
      const requested = String(detail?.requestedEngine || '').trim() || 'whisper';
      const actual = String(detail?.actualEngine || requested).trim() || requested;
      const lane = String(detail?.activeAsrLane || 'ASR1_CURRENT').trim();
      const fallbackReason = String(detail?.fallbackReason || '').trim();
      this.chip.title = fallbackReason
        ? `Lane: ${lane}  •  Requested: ${requested}  •  Active: ${actual}  •  Fallback: ${fallbackReason}`
        : `Lane: ${lane}  •  Engine: ${actual}`;
    };

    window.addEventListener('tp:asr:state', (e: any) => renderState(e?.detail?.state as string));
    window.addEventListener('asr:state', (e: any) => renderState(e?.detail?.state as string));
    window.addEventListener('tp:asr:runtime-status', (e: any) => renderRuntime(e?.detail));
    renderRuntime((window as any).__tpAsrRuntimeStatus || null);
  }

  // No toggle UI anymore; ASR start/stop is wired to Speech Sync + mode changes.
}
