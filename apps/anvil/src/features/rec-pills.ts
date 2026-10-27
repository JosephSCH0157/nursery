import { getAutoRecordEnabled } from '../state/auto-record-ssot';
import type { AppStore } from '../state/app-store';
import { isSessionRecording } from '../recording/recorderRegistry';
import { getRecordingMode } from '../recording/recording-settings';
import { pushDisplayRecordState } from './display-sync';

export type RecState = 'off' | 'armed' | 'recording';

export type TranscriptRecState = 'idle' | 'starting' | 'live' | 'partial' | 'finalizing' | 'ready' | 'degraded';

export function deriveRecState(opts: {
  recordingEnabled: boolean;
  isPrerollActive: boolean;
  isRecordingActive: boolean;
}): RecState {
  if (!opts.recordingEnabled) return 'off';
  if (opts.isRecordingActive) return 'recording';
  return 'armed';
}

type Variant = 'main' | 'display';

let mainState: RecState = 'off';
let displayState: RecState = 'off';
let mainTranscriptState: TranscriptRecState = 'idle';
let displayTranscriptState: TranscriptRecState = 'idle';
let mainWired = false;
let displayWired = false;
let bc: BroadcastChannel | null = null;
const DISPLAY_STYLE_ID = 'rec-pill-display-style';
const REC_PILL_BASE_CSS = `
.rec-pill{display:none;align-items:center;justify-content:center;height:calc(22px * var(--tp-ui-scale));padding:0 calc(12px * var(--tp-ui-scale));border-radius:calc(999px * var(--tp-ui-scale));font-size:var(--tp-ui-font-sm);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;line-height:1;opacity:0;transform:scale(.98);transition:opacity 500ms ease,transform 500ms ease,color 320ms ease,background-color 320ms ease;pointer-events:none;user-select:none}
.rec-pill.is-visible{opacity:1;transform:scale(1)}
.rec-pill.rec-pill--armed{background:#ffd54f;color:#1a1f27}
.rec-pill.rec-pill--recording{background:#ef5350;color:#fff;animation:recPulse 2.5s ease-in-out infinite}
.rec-pill.rec-pill--transcript-starting{background:#7c8aa5;color:#fff}
.rec-pill.rec-pill--transcript-live{background:#2e7d32;color:#fff}
.rec-pill.rec-pill--transcript-partial{background:#00838f;color:#fff}
.rec-pill.rec-pill--transcript-finalizing{background:#ef6c00;color:#fff}
.rec-pill.rec-pill--transcript-ready{background:#5e35b1;color:#fff}
.rec-pill.rec-pill--transcript-degraded{background:#546e7a;color:#fff}
.rec-pill--main{height:calc(24px * var(--tp-ui-scale));padding:0 calc(12px * var(--tp-ui-scale));font-size:var(--tp-ui-font-sm)}
.rec-pill--display{position:fixed;top:calc(10px * var(--tp-ui-scale));right:calc(14px * var(--tp-ui-scale));height:calc(18px * var(--tp-ui-scale));padding:0 calc(10px * var(--tp-ui-scale));font-size:var(--tp-ui-font-xs);z-index:1200;opacity:0.75}
.rec-pill--display.is-visible{opacity:0.75}
.rec-pill--display.rec-pill--recording.is-visible{opacity:0.85}
.rec-pill--display.rec-pill--recording{opacity:0.85}
.rec-pill-host{display:inline-flex;align-items:center;gap:calc(6px * var(--tp-ui-scale));margin-left:calc(10px * var(--tp-ui-scale));margin-right:calc(8px * var(--tp-ui-scale))}
.rec-pill-live{min-width:1px;min-height:1px}
@keyframes recPulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.03);opacity:.95}100%{transform:scale(1);opacity:1}}
`;

function isDisplayContext(): boolean {
  try {
    if (document.documentElement.classList.contains('tp-display')) return true;
  } catch {}
  try {
    const search = new URLSearchParams(location.search || '');
    if (search.get('display') === '1') return true;
  } catch {}
  try {
    const path = (location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
  } catch {}
  return false;
}

function injectDisplayStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DISPLAY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DISPLAY_STYLE_ID;
  style.textContent = REC_PILL_BASE_CSS;
  try {
    document.head.appendChild(style);
  } catch {}
}

function whenDomReady(fn: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function ensureLiveRegion(): HTMLElement | null {
  let live = document.getElementById('recPillLive') as HTMLElement | null;
  if (!live) {
    live = document.createElement('span');
    live.id = 'recPillLive';
    live.className = 'sr-only rec-pill-live';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
  }
  return live;
}

function ensureMainHost(): { pill: HTMLSpanElement; transcriptPill: HTMLSpanElement; live: HTMLElement } | null {
  if (typeof document === 'undefined') return null;
  const host =
    (document.getElementById('recPillHost') as HTMLElement | null) ||
    (() => {
      const el = document.createElement('span');
      el.id = 'recPillHost';
      el.className = 'rec-pill-host';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      return el;
    })();

  let pill = document.getElementById('recPill') as HTMLSpanElement | null;
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'recPill';
    pill.className = 'rec-pill rec-pill--main';
    pill.textContent = 'REC';
    pill.setAttribute('aria-hidden', 'true');
  }

  let transcriptPill = document.getElementById('recTranscriptPill') as HTMLSpanElement | null;
  if (!transcriptPill) {
    transcriptPill = document.createElement('span');
    transcriptPill.id = 'recTranscriptPill';
    transcriptPill.className = 'rec-pill rec-pill--main';
    transcriptPill.textContent = 'TX';
    transcriptPill.setAttribute('aria-hidden', 'true');
    transcriptPill.style.display = 'none';
  }

  const live = ensureLiveRegion();
  if (!live) return null;

  if (!pill.parentElement) host.appendChild(pill);
  if (!transcriptPill.parentElement) host.appendChild(transcriptPill);
  if (!live.parentElement) host.appendChild(live);

  if (!host.parentElement) {
    const right = document.getElementById('topbarRight');
    if (right) {
      right.insertBefore(host, right.firstChild || null);
    } else {
      const bar = document.querySelector('.topbar');
      (bar || document.body).appendChild(host);
    }
  }

  return { pill, transcriptPill, live };
}

function ensureDisplayPill(): HTMLSpanElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById('displayRecPill') as HTMLSpanElement | null;
  if (existing) return existing;

  const pill = document.createElement('span');
  pill.id = 'displayRecPill';
  pill.className = 'rec-pill rec-pill--display';
  pill.textContent = 'REC';
  pill.setAttribute('aria-hidden', 'true');
  pill.style.display = 'none';

  const inject = () => {
    try {
      document.body.appendChild(pill);
    } catch {}
  };

  whenDomReady(inject);
  return pill;
}

function ensureDisplayTranscriptPill(): HTMLSpanElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById('displayRecTranscriptPill') as HTMLSpanElement | null;
  if (existing) return existing;

  const pill = document.createElement('span');
  pill.id = 'displayRecTranscriptPill';
  pill.className = 'rec-pill rec-pill--display';
  pill.textContent = 'TX';
  pill.setAttribute('aria-hidden', 'true');
  pill.style.display = 'none';
  pill.style.right = 'calc(84px * var(--tp-ui-scale))';

  const inject = () => {
    try {
      document.body.appendChild(pill);
    } catch {}
  };

  whenDomReady(inject);
  return pill;
}

function renderPill(pill: HTMLElement, next: RecState, prev: RecState, variant: Variant): void {
  const showing = next !== 'off';
  const justAppeared = prev === 'off' && showing;
  const isRecording = next === 'recording';
  pill.classList.toggle('is-armed', next === 'armed');
  pill.classList.toggle('is-recording', isRecording);
  pill.classList.toggle('rec-pill--recording', isRecording);
  pill.classList.toggle('rec-pill--armed', next === 'armed');

  if (variant === 'display') {
    pill.classList.add('rec-pill--display');
  } else {
    pill.classList.add('rec-pill--main');
  }

  if (!showing) {
    pill.classList.remove('is-visible');
    pill.setAttribute('aria-hidden', 'true');
    pill.style.display = 'none';
    return;
  }

  if (isRecording) {
    pill.textContent = getRecordingMode() === 'audio' ? 'REC • AUDIO' : 'REC';
  } else {
    pill.textContent = 'REC ARMED';
  }
  pill.style.display = 'inline-flex';
  pill.setAttribute('aria-hidden', 'false');
  if (justAppeared) {
    pill.classList.remove('is-visible');
    requestAnimationFrame(() => pill.classList.add('is-visible'));
  } else {
    pill.classList.add('is-visible');
  }
}

function announceState(live: HTMLElement | null, prev: RecState, next: RecState): void {
  if (!live || prev === next) return;
  let msg = '';
  if (next === 'recording') {
    msg = 'Recording started';
  } else if (prev === 'recording') {
    msg = 'Recording stopped';
  } else if (next === 'armed') {
    msg = 'Recording armed';
  }
  if (msg) live.textContent = msg;
}

function transcriptLabel(state: TranscriptRecState): string {
  switch (state) {
    case 'starting':
      return 'TX STARTING';
    case 'live':
      return 'TX LIVE';
    case 'partial':
      return 'TX PARTIAL';
    case 'finalizing':
      return 'TX FINALIZING';
    case 'ready':
      return 'TX READY';
    case 'degraded':
      return 'TX DEGRADED';
    default:
      return 'TX';
  }
}

function renderTranscriptPill(pill: HTMLElement, next: TranscriptRecState, variant: Variant): void {
  const showing = next !== 'idle';
  pill.classList.remove(
    'rec-pill--transcript-starting',
    'rec-pill--transcript-live',
    'rec-pill--transcript-partial',
    'rec-pill--transcript-finalizing',
    'rec-pill--transcript-ready',
    'rec-pill--transcript-degraded',
  );

  if (variant === 'display') {
    pill.classList.add('rec-pill--display');
  } else {
    pill.classList.add('rec-pill--main');
  }

  if (!showing) {
    pill.classList.remove('is-visible');
    pill.setAttribute('aria-hidden', 'true');
    pill.style.display = 'none';
    return;
  }

  pill.textContent = transcriptLabel(next);
  pill.classList.add(`rec-pill--transcript-${next}`);
  pill.style.display = 'inline-flex';
  pill.setAttribute('aria-hidden', 'false');
  pill.classList.add('is-visible');
}

function broadcastState(state: RecState): void {
  if (isDisplayContext()) return;
  try {
    bc = bc || new BroadcastChannel('tp_rec_state');
    bc.postMessage({ type: 'rec-state', state });
  } catch {}
  try {
    const send = (window as any).sendToDisplay;
    if (typeof send === 'function') send({ type: 'rec-state', state });
  } catch {}
  try { pushDisplayRecordState(state === 'off' ? 'idle' : state === 'armed' ? 'armed' : 'recording'); } catch {}
}

function broadcastTranscriptState(state: TranscriptRecState): void {
  if (isDisplayContext()) return;
  try {
    bc = bc || new BroadcastChannel('tp_rec_state');
    bc.postMessage({ type: 'transcript-state', state });
  } catch {}
  try {
    const send = (window as any).sendToDisplay;
    if (typeof send === 'function') send({ type: 'transcript-state', state });
  } catch {}
}

function setMainState(next: RecState): void {
  if (mainState === next) return;
  const ctx = ensureMainHost();
  if (!ctx) return;
  renderPill(ctx.pill, next, mainState, 'main');
  announceState(ctx.live, mainState, next);
  mainState = next;
  broadcastState(next);
}

function setMainTranscriptState(next: TranscriptRecState): void {
  if (mainTranscriptState === next) return;
  const ctx = ensureMainHost();
  if (!ctx) return;
  renderTranscriptPill(ctx.transcriptPill, next, 'main');
  mainTranscriptState = next;
  broadcastTranscriptState(next);
}

function setDisplayState(next: RecState): void {
  const pill = ensureDisplayPill();
  if (!pill || displayState === next) {
    displayState = next;
    return;
  }
  renderPill(pill, next, displayState, 'display');
  displayState = next;
}

function setDisplayTranscriptState(next: TranscriptRecState): void {
  const pill = ensureDisplayTranscriptPill();
  if (!pill || displayTranscriptState === next) {
    displayTranscriptState = next;
    return;
  }
  renderTranscriptPill(pill, next, 'display');
  displayTranscriptState = next;
}

export function initRecPillsDisplay(): void {
  if (displayWired) return;
  if (!isDisplayContext()) return;
  displayWired = true;

  injectDisplayStyles();

  const attachListeners = () => {
    try {
      bc = bc || new BroadcastChannel('tp_rec_state');
      bc.addEventListener('message', (ev) => {
        const data = (ev && (ev as MessageEvent).data) || {};
        if (data && data.type === 'rec-state' && data.state) {
          setDisplayState(data.state as RecState);
        }
        if (data && data.type === 'transcript-state' && data.state) {
          setDisplayTranscriptState(data.state as TranscriptRecState);
        }
      });
    } catch {}

    try {
      window.addEventListener('message', (ev) => {
        const data = (ev && (ev as MessageEvent).data) || {};
        if (data && data.type === 'rec-state' && data.state) {
          setDisplayState(data.state as RecState);
        }
        if (data && data.type === 'transcript-state' && data.state) {
          setDisplayTranscriptState(data.state as TranscriptRecState);
        }
      });
    } catch {}
  };

  attachListeners();
}

export function initRecPillsMain(store?: AppStore | null): void {
  if (mainWired) return;
  if (isDisplayContext()) return;
  mainWired = true;

  let recordingEnabled = false;
  let isPrerollActive = false;
  let isRecordingActive = isSessionRecording();

  const recompute = () => {
    const next = deriveRecState({ recordingEnabled, isPrerollActive, isRecordingActive });
    setMainState(next);
  };

  try {
    recordingEnabled = !!getAutoRecordEnabled();
  } catch {}

  try {
    const initialPhase = store?.get?.('session.phase') as string | undefined;
    isPrerollActive = String(initialPhase || '').toLowerCase() === 'preroll';
  } catch {}

  try {
    store?.subscribe?.('autoRecord' as any, (val: unknown) => {
      recordingEnabled = typeof val === 'boolean' ? val : !!getAutoRecordEnabled();
      recompute();
    });
  } catch {}

  try {
    store?.subscribe?.('session.phase' as any, (phase: unknown) => {
      const p = String(phase || '').toLowerCase();
      isPrerollActive = p === 'preroll';
      if (p === 'idle' || p === 'wrap') {
        isRecordingActive = isSessionRecording();
      }
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:session:phase', (ev: Event) => {
      const phase = (ev as CustomEvent)?.detail?.phase || '';
      const p = String(phase || '').toLowerCase();
      isPrerollActive = p === 'preroll';
      if (p === 'idle' || p === 'wrap') {
        isRecordingActive = isSessionRecording();
      }
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:preroll:done', () => {
      isPrerollActive = false;
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:recording:state', (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      if (typeof detail.recording === 'boolean') {
        isRecordingActive = detail.recording;
        recompute();
      }
    });
  } catch {}

  try {
    window.addEventListener('tp:recording:arm-state', (ev: Event) => {
      const state = String((ev as CustomEvent)?.detail?.state || '').toLowerCase();
      recordingEnabled = state === 'armed' || state === 'recording';
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:recording:transcript-state', (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const status = String(detail.status || 'idle') as TranscriptRecState;
      setMainTranscriptState(status);
    });
  } catch {}

  try {
    window.addEventListener('tp:display:opened', () => {
      broadcastState(mainState);
      broadcastTranscriptState(mainTranscriptState);
    });
  } catch {}

  recompute();
}
