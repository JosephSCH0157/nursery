import {
  enableNetworkDisplayRelay,
  getNetworkDisplayStatus,
  onNetworkDisplayStatus,
  setNetworkDisplayPairToken,
} from '../net/display-ws-client';
import { resolveDisplayWsBase } from '../net/display-ws-endpoint';
import type { PairQrPayload } from '../pairing/pairing-api';
import { pairingApiUrl, requestPairQr, resolvePairBaseUrl } from '../pairing/pairing-api';

type PairingState = PairQrPayload & { expiresMs: number };

type Elements = {
  mask: HTMLElement;
  input: HTMLInputElement;
  qr: HTMLElement;
  status: HTMLElement;
  wsLabel: HTMLElement;
  baseLabel: HTMLElement;
  qrLabel: HTMLElement;
  wsDebugLabel: HTMLElement;
  warning: HTMLElement;
  close: HTMLButtonElement;
  refresh: HTMLButtonElement;
  copy: HTMLButtonElement;
  expiry: HTMLElement;
};

let modalElements: Elements | null = null;
let _currentPairing: PairingState | null = null;
let isRefreshing = false;
let expiryTimer: number | null = null;

function isDisplayContext(): boolean {
  try {
    const params = new URLSearchParams(location.search || '');
    if (params.get('display') === '1') return true;
    const path = (location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
    if ((window as any).__TP_FORCE_DISPLAY) return true;
  } catch {
    // ignore
  }
  return false;
}

function ensureStyles() {
  if (document.getElementById('displayPairingStyles')) return;
  const css = `
    .display-pairing-mask {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 3900;
      padding: 12px;
    }
    .display-pairing-mask.is-visible {
      display: flex;
    }
    .display-pairing-panel {
      background: #0b1220;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 20px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.45);
      color: #e7ebf0;
      font-family: system-ui, 'Segoe UI', sans-serif;
    }
    .display-pairing-panel header {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .display-pairing-field {
      margin-bottom: 14px;
    }
    .display-pairing-field label {
      display: block;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #93a0b4;
      margin-bottom: 4px;
    }
    .display-pairing-input {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }
    .display-pairing-input input {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: inherit;
      padding: 10px 12px;
      font-size: 0.95rem;
    }
    .display-pairing-status {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 0.85rem;
      color: #afc0d9;
    }
    .display-pairing-qr {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .display-pairing-qr-image {
      width: 176px;
      height: 176px;
      border-radius: 12px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .display-pairing-qr-image svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .display-pairing-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .display-pairing-panel .chip,
    .display-pairing-panel .btn {
      cursor: pointer;
    }
    .display-pairing-tip {
      font-size: 0.75rem;
      color: #9fb4c9;
      margin-top: 4px;
      line-height: 1.25;
    }
    .display-pairing-warning {
      display: none;
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 201, 132, 0.42);
      background: rgba(107, 70, 3, 0.35);
      color: #ffdca9;
      font-size: 0.78rem;
      line-height: 1.25;
    }
    .display-pairing-warning.is-visible {
      display: block;
    }
    .display-pairing-debug {
      margin-top: 8px;
      display: grid;
      gap: 4px;
    }
    .display-pairing-debug-line {
      display: grid;
      grid-template-columns: 132px 1fr;
      gap: 8px;
      align-items: baseline;
      font-size: 0.74rem;
      color: #a9b8d0;
    }
    .display-pairing-debug-key {
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: #90a4c4;
    }
    .display-pairing-debug-value {
      overflow-wrap: anywhere;
      color: #d8e5ff;
    }
  `;
  const style = document.createElement('style');
  style.id = 'displayPairingStyles';
  style.textContent = css;
  document.head.appendChild(style);
}

function buildModal(): Elements | null {
  if (modalElements) return modalElements;
  const mask = document.createElement('div');
  mask.className = 'display-pairing-mask';
  mask.setAttribute('role', 'dialog');
  mask.setAttribute('aria-modal', 'true');

  const panel = document.createElement('section');
  panel.className = 'display-pairing-panel';
  panel.innerHTML = `
    <header>Pair Tablet Display</header>
    <div class="display-pairing-body">
      <div class="display-pairing-field">
        <label>Pair URL</label>
        <div class="display-pairing-input">
          <input readonly placeholder="Click refresh to generate" />
          <button type="button" class="chip display-pairing-btn-copy">Copy</button>
        </div>
      </div>
      <div class="display-pairing-field display-pairing-status">
        <span class="display-pairing-status-text">Connected: 0</span>
        <span class="display-pairing-status-ws">wss://.../display-ws</span>
      </div>
      <div class="display-pairing-field">
    <div class="display-pairing-qr">
          <div class="display-pairing-qr-image" aria-label="Display pairing QR code"></div>
          <div>
            <div class="display-pairing-actions">
              <button type="button" class="chip display-pairing-btn-refresh">Refresh token</button>
            </div>
            <div class="display-pairing-status" style="margin-top:8px;">
              <span class="display-pairing-status-expiry">Waiting for token...</span>
            </div>
          </div>
        </div>
        <div class="display-pairing-tip">
          Share this URL or QR with the tablet. Pairing tokens expire automatically, so refresh if the code is stale.
        </div>
        <div class="display-pairing-warning" role="status" aria-live="polite"></div>
        <div class="display-pairing-debug" aria-label="Pairing diagnostics">
          <div class="display-pairing-debug-line">
            <span class="display-pairing-debug-key">Resolved Base URL:</span>
            <span class="display-pairing-debug-value display-pairing-debug-base">-</span>
          </div>
          <div class="display-pairing-debug-line">
            <span class="display-pairing-debug-key">QR Endpoint:</span>
            <span class="display-pairing-debug-value display-pairing-debug-qr">-</span>
          </div>
          <div class="display-pairing-debug-line">
            <span class="display-pairing-debug-key">WS Endpoint:</span>
            <span class="display-pairing-debug-value display-pairing-debug-ws">-</span>
          </div>
        </div>
      </div>
    </div>
    <div class="display-pairing-actions">
      <button type="button" class="btn btn-primary display-pairing-btn-close">Close</button>
    </div>
  `;

  mask.appendChild(panel);
  document.body.appendChild(mask);

  const input = panel.querySelector<HTMLInputElement>('input');
  const qr = panel.querySelector<HTMLElement>('.display-pairing-qr-image');
  const status = panel.querySelector<HTMLElement>('.display-pairing-status-text');
  const expiry = panel.querySelector<HTMLElement>('.display-pairing-status-expiry');
  const wsLabel = panel.querySelector<HTMLElement>('.display-pairing-status-ws');
  const baseLabel = panel.querySelector<HTMLElement>('.display-pairing-debug-base');
  const qrLabel = panel.querySelector<HTMLElement>('.display-pairing-debug-qr');
  const wsDebugLabel = panel.querySelector<HTMLElement>('.display-pairing-debug-ws');
  const warning = panel.querySelector<HTMLElement>('.display-pairing-warning');
  const close = panel.querySelector<HTMLButtonElement>('.display-pairing-btn-close');
  const refresh = panel.querySelector<HTMLButtonElement>('.display-pairing-btn-refresh');
  const copy = panel.querySelector<HTMLButtonElement>('.display-pairing-btn-copy');

  if (!input || !qr || !status || !wsLabel || !baseLabel || !qrLabel || !wsDebugLabel || !warning || !close || !refresh || !copy) {
    mask.remove();
    return null;
  }

  if (!expiry) {
    mask.remove();
    return null;
  }

  modalElements = { mask, input, qr, status, wsLabel, baseLabel, qrLabel, wsDebugLabel, warning, close, refresh, copy, expiry };
  return modalElements;
}

function clearExpiryTimer() {
  if (expiryTimer) {
    window.clearInterval(expiryTimer);
    expiryTimer = null;
  }
}

function toggleModal(on: boolean) {
  const elements = modalElements;
  if (!elements) return;
  elements.mask.classList.toggle('is-visible', on);
  if (on) {
    refreshStatus();
    ensurePairingToken();
  } else {
    clearExpiryTimer();
  }
}

function updateStatusText(text: string) {
  if (modalElements?.expiry) {
    modalElements.expiry.textContent = text;
  }
}

function updateWsLabel(url: string) {
  if (modalElements?.wsLabel) {
    modalElements.wsLabel.textContent = url;
  }
  if (modalElements?.wsDebugLabel) {
    modalElements.wsDebugLabel.textContent = url;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost') return true;
  if (normalized === '::1' || normalized === '[::1]') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname.trim());
  if (!match) return false;
  const octets = match.slice(1).map((chunk) => Number(chunk));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  if (octets[0] === 10) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  return false;
}

function resolveReachableBaseHint(): string {
  try {
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || '';
    const port = window.location.port || '';
    if (hostname && isPrivateIpv4(hostname) && !isLoopbackHost(hostname)) {
      return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    }
  } catch {
    // ignore
  }
  return 'http://192.168.x.x:5173';
}

function updateLocalhostWarning(baseUrl: string) {
  const warningEl = modalElements?.warning;
  if (!warningEl) return;
  let warningText = '';
  try {
    const parsed = new URL(baseUrl);
    if (isLoopbackHost(parsed.hostname)) {
      const hint = resolveReachableBaseHint();
      warningText = `This QR points to localhost. A tablet can't reach your computer at localhost. Use your LAN IP (${hint}) or a tunnel/Netlify.`;
    }
  } catch {
    const hint = resolveReachableBaseHint();
    warningText = `This QR base URL is invalid. Use your LAN IP (${hint}) or a tunnel/Netlify.`;
  }

  warningEl.textContent = warningText;
  warningEl.classList.toggle('is-visible', Boolean(warningText));
}

function updatePairingDiagnostics(baseUrl: string) {
  if (modalElements?.baseLabel) {
    modalElements.baseLabel.textContent = baseUrl;
  }
  if (modalElements?.qrLabel) {
    modalElements.qrLabel.textContent = pairingApiUrl() || '(not configured)';
  }
  updateWsLabel(resolveDisplayWsBase());
  updateLocalhostWarning(baseUrl);
}

function resolveDisplayPairPath(): string {
  try {
    const pathname = window.location.pathname || '/';
    if (pathname.endsWith('/display.html')) return pathname;
    if (pathname.endsWith('/')) return `${pathname}display.html`;
    const slash = pathname.lastIndexOf('/');
    if (slash >= 0) {
      return `${pathname.slice(0, slash + 1)}display.html`;
    }
  } catch {
    // ignore
  }
  return '/display.html';
}

function updateInput(url: string) {
  if (modalElements?.input) {
    modalElements.input.value = url;
  }
}

const MAX_QR_SVG_LENGTH = 200_000;

function renderQrSvg(svg: string) {
  if (!modalElements?.qr) return;
  let trimmed = (svg || '').trim();
  if (trimmed.length > MAX_QR_SVG_LENGTH) {
    trimmed = trimmed.slice(0, MAX_QR_SVG_LENGTH);
  }
  if (trimmed.toLowerCase().startsWith('<svg')) {
    modalElements.qr.innerHTML = trimmed;
  } else {
    modalElements.qr.innerHTML = '<span>QR unavailable</span>';
  }
}

function formatRemaining(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startExpirySchedule(expiresMs: number) {
  clearExpiryTimer();
  const scheduleRefresh = () => {
    updateStatusText('Token expired. Refreshing…');
    setTimeout(() => {
      ensurePairingToken();
    }, 1200);
  };
  const update = () => {
    const remaining = Math.max(0, expiresMs - Date.now());
    if (remaining <= 0) {
      clearExpiryTimer();
      scheduleRefresh();
      return;
    }
    updateStatusText(`Expires in ${formatRemaining(remaining)}`);
  };
  update();
  expiryTimer = window.setInterval(update, 1000);
}

async function ensurePairingToken() {
  if (isRefreshing) return;
  if (!modalElements) return;
  isRefreshing = true;
  updateStatusText('Generating token...');
  setNetworkDisplayPairToken(null);
  _currentPairing = null;
  clearExpiryTimer();
  const baseUrl = resolvePairBaseUrl(window.location.origin);
  const pairPath = resolveDisplayPairPath();
  updatePairingDiagnostics(baseUrl);
  try {
    const pairing = await requestPairQr({
      baseUrl,
      pairPath,
      ttlMinutes: 10,
      metadata: { role: 'display', app: 'anvil' },
    });

    const expiresMs = Number.isFinite(Date.parse(pairing.expiresAt))
      ? Date.parse(pairing.expiresAt)
      : Date.now() + 10 * 60 * 1000;

    _currentPairing = { ...pairing, expiresMs };
    updateInput(pairing.pairUrl);
    updateWsLabel(resolveDisplayWsBase());
    renderQrSvg(pairing.qrSvg);
    updateStatusText(`Expires at ${new Date(expiresMs).toLocaleTimeString()}`);
    setNetworkDisplayPairToken(pairing.token);
    enableNetworkDisplayRelay();
    refreshStatus();
    if (typeof window !== 'undefined') {
      const devFlag = Boolean((window as any).__TP_DEV || (window as any).__TP_DEV1);
      if (devFlag) {
        const expiresInSec = Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
        const tokenPrefix = pairing.token?.slice?.(0, 6) ?? '';
        const fnUrl = pairingApiUrl();
        console.info(
          '[pairing] TP_PAIR_QR',
          {
            tokenPrefix,
            expiresInSec,
            pairPath,
            baseUrl,
            fnUrl,
          },
        );
      }
    }
    startExpirySchedule(expiresMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to generate pairing token.';
    setNetworkDisplayPairToken(null);
    updateStatusText(message);
  } finally {
    isRefreshing = false;
  }
}

function refreshStatus() {
  const current = getNetworkDisplayStatus();
  if (!modalElements?.status) return;
  if (current.state === 'error' && current.lastError) {
    modalElements.status.textContent = `Connected: ${current.connectedDisplays} (${current.lastError})`;
    return;
  }
  modalElements.status.textContent = `Connected: ${current.connectedDisplays}`;
}

function bindModalEvents() {
  if (!modalElements) return;
  modalElements.close.addEventListener('click', () => toggleModal(false));
  modalElements.copy.addEventListener('click', () => {
    const url = modalElements?.input.value;
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
  });
  modalElements.refresh.addEventListener('click', () => ensurePairingToken());
  modalElements.mask.addEventListener('click', (event) => {
    if (event.target === modalElements?.mask) {
      toggleModal(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleModal(false);
    }
  });
}

function initDisplayPairingPanel() {
  if (typeof document === 'undefined' || isDisplayContext()) return;
  ensureStyles();
  const toggleBtn =
    document.getElementById('displayToggleBtnSidebar') ??
    document.getElementById('displayToggleBtn');
  const parent = toggleBtn?.parentElement || document.getElementById('topbarRight');
  if (!parent) return;
  if (document.getElementById('displayPairBtn')) return;
  const pairBtn = document.createElement('button');
  pairBtn.id = 'displayPairBtn';
  pairBtn.type = 'button';
  pairBtn.className = 'chip display-pair-btn';
  pairBtn.textContent = 'Pair Tablet';
  parent.insertBefore(pairBtn, toggleBtn?.nextSibling || null);

  const elements = buildModal();
  if (!elements) return;
  bindModalEvents();
  updatePairingDiagnostics(resolvePairBaseUrl(window.location.origin));
  onNetworkDisplayStatus(({ connectedDisplays, state, lastError }) => {
    if (state === 'error' && lastError) {
      elements.status.textContent = `Connected: ${connectedDisplays} (${lastError})`;
      return;
    }
    elements.status.textContent = `Connected: ${connectedDisplays}`;
  });

  pairBtn.addEventListener('click', () => toggleModal(true));
}

export { initDisplayPairingPanel };
