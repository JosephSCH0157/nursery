import {
  getRecorderSettings,
  setObsConfig,
  setRecorderEnabled,
  subscribeRecorderSettings,
} from '../state/recorder-settings';

const ENABLE_ID = 'settingsEnableObs';
const SIDEBAR_ENABLE_ID = 'enableObs';
const HOST_ID = 'settingsObsHost';
const PASS_ID = 'settingsObsPassword';
const PORT_ID = 'settingsObsPort'; // legacy hidden input support

function mirrorLegacyObsEnabled(on: boolean): void {
  // Preserve appStore flag for consumers still reading it
  try { (window as any).__tpStore?.set?.('obsEnabled', on); } catch {}
}

function syncEnabledCheckboxes(doc: Document, enabled: boolean): void {
  const checked = !!enabled;
  const settingsEl = doc.getElementById(ENABLE_ID) as HTMLInputElement | null;
  const sidebarEl = doc.getElementById(SIDEBAR_ENABLE_ID) as HTMLInputElement | null;

  if (settingsEl) settingsEl.checked = checked;
  if (sidebarEl) sidebarEl.checked = checked;
}

function handleToggle(on: boolean, sourceId?: string): void {
  const enabling = !!on;
  const fromSidebar = sourceId === SIDEBAR_ENABLE_ID;

  // Sidebar → ON: sanity-check for obviously half-configured remote setups.
  // "No URL" is allowed (local fallback). We only warn if it *looks* remote.
  if (enabling && fromSidebar) {
    try {
      const state = getRecorderSettings() as any;
      const cfg = state?.configs?.obs || {};
      const url = String(cfg.url ?? '');
      const host = String(cfg.host ?? '');

      const hasRemoteHost =
        !!host &&
        host !== 'localhost' &&
        host !== '127.0.0.1';

      const remoteButMissingUrl = !url && hasRemoteHost;

      if (remoteButMissingUrl) {
        const doc = window.document;
        syncEnabledCheckboxes(doc, false);

        try {
          const toast = (window as any).toast;
          if (typeof toast === 'function') {
            toast('Finish configuring OBS in Settings → Recording before enabling remote OBS.');
          }
        } catch {}

        try {
          console.info('[OBS-UI] blocked OBS enable from sidebar: remote config incomplete', { host, url });
        } catch {}

        return;
      }
    } catch {
      // If we can't read settings, don't block; let the core pipeline try its defaults.
    }
  }

  // Normal path: apply state and mirror everywhere.
  const doc = window.document;
  syncEnabledCheckboxes(doc, enabling);

  try {
    // Recorder store SSOT
    setRecorderEnabled('obs', enabling);
  } catch {}

  mirrorLegacyObsEnabled(enabling);

  try {
    console.info('[OBS-UI] toggled', { enabled: enabling, sourceId });
  } catch {}
}

function buildUrl(hostWithPort: string, explicitPort?: string): string {
  const rawHost = (hostWithPort || '').trim();
  const rawPort = (explicitPort || '').trim();

  // If the user pasted a full ws:// or wss:// URL, trust it.
  if (rawHost.startsWith('ws://') || rawHost.startsWith('wss://')) {
    return rawHost;
  }

  // Normalize host[:port]; default host/port when missing.
  let host = rawHost || '127.0.0.1';
  let port = rawPort || '';

  // Extract port from host if present (host:port), prefer explicitPort when provided.
  const m = host.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (m) {
    host = m[1];
    if (!port && m[2]) port = m[2];
  }

  if (!port) port = '4455';

  return `ws://${host}:${port}`;
}

const boundDocuments = new WeakSet<Document>();
export function bindObsSettingsUI(doc: Document = document): (() => void) | undefined {
  if (boundDocuments.has(doc)) return;
  boundDocuments.add(doc);
  const sync = () => {
    const state = getRecorderSettings();
    syncEnabledCheckboxes(doc, state.enabled.obs);
    doc.querySelectorAll<HTMLInputElement>('[data-tp-obs-toggle]').forEach((el) => { el.checked = state.enabled.obs; });
    const host = doc.getElementById(HOST_ID) as HTMLInputElement | null;
    const port = doc.getElementById(PORT_ID) as HTMLInputElement | null;
    const pass = doc.getElementById(PASS_ID) as HTMLInputElement | null;
    try {
      const url = new URL(state.configs.obs.url);
      if (host && host !== doc.activeElement) host.value = url.host;
      if (port && port !== doc.activeElement) port.value = url.port || '4455';
    } catch {}
    if (pass && pass !== doc.activeElement) pass.value = state.configs.obs.password || '';
  };
  const unsubscribe = subscribeRecorderSettings(sync);
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => change.addedNodes.length)) sync();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  const pushConfig = (ev: Event) => {
    const input = ev.target as HTMLInputElement | null;
    if (!input) return;
    if (input.id === PASS_ID) {
      if (input.value !== getRecorderSettings().configs.obs.password) setObsConfig({ password: input.value });
    } else if (input.id === HOST_ID || input.id === PORT_ID) {
      const host = doc.getElementById(HOST_ID) as HTMLInputElement | null;
      const port = doc.getElementById(PORT_ID) as HTMLInputElement | null;
      const url = buildUrl(host?.value || '', port?.value);
      if (url !== getRecorderSettings().configs.obs.url) setObsConfig({ url });
    }
  };
  const onChange = (ev: Event) => {
    const input = ev.target as HTMLInputElement | null;
    if (input?.matches(`[data-tp-obs-toggle], #${ENABLE_ID}, #${SIDEBAR_ENABLE_ID}`)) handleToggle(input.checked, input.id);
    else pushConfig(ev);
  };
  doc.addEventListener('change', onChange);
  doc.addEventListener('blur', pushConfig, true);
  return () => {
    observer.disconnect(); unsubscribe();
    doc.removeEventListener('change', onChange);
    doc.removeEventListener('blur', pushConfig, true);
    boundDocuments.delete(doc);
  };
}
