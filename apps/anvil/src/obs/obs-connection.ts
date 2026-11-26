import { getRecorderSettings, subscribeRecorderSettings, setObsStatus } from '../state/recorder-settings';

type ObsBridge = {
  configure(cfg: { url: string; password: string }): void;
  setArmed(on: boolean): void;
  connect(): Promise<boolean>;
  isConnected(): boolean;
  on(event: string, cb: (...args: any[]) => void): () => void;
};

let initialized = false;
let bridge: ObsBridge | null = null;
let unsubscribers: Array<() => void> = [];
let revision = 0;
let lastIntent = '';
let retry: ReturnType<typeof setTimeout> | null = null;

function resolveBridge(): ObsBridge | null {
  return (window as any).__obsBridge ?? null;
}

export async function connectObs(): Promise<boolean> {
  const state = getRecorderSettings();
  const current = resolveBridge();
  if (current !== bridge) {
    unsubscribers.forEach((off) => off());
    unsubscribers = [];
    bridge = current;
    if (bridge) {
      const source = bridge;
      unsubscribers = [
        source.on('connect', () => {
          if (source === bridge && getRecorderSettings().enabled.obs && source.isConnected()) setObsStatus('connected');
        }),
        source.on('disconnect', () => { if (source === bridge) setObsStatus('disconnected'); }),
        source.on('error', (error) => { if (source === bridge) setObsStatus('error', error?.message || String(error)); }),
      ];
    }
  }
  if (!state.enabled.obs) {
    current?.setArmed(false);
    setObsStatus('disconnected');
    return false;
  }
  if (!current) {
    setObsStatus('error', 'OBS bridge unavailable. Reload Anvil and check Recording Settings.');
    if (!retry) retry = setTimeout(() => { retry = null; void connectObs(); }, 1200);
    return false;
  }
  const attempt = revision;
  try {
    current.configure(state.configs.obs);
    current.setArmed(true);
    if (!current.isConnected()) setObsStatus('connecting');
    const ok = await current.connect();
    if (attempt !== revision || !getRecorderSettings().enabled.obs) return false;
    const connected = ok === true && current.isConnected();
    setObsStatus(connected ? 'connected' : 'error', connected ? null : 'OBS connection failed. Check OBS WebSocket authentication and address.');
    return connected;
  } catch (error) {
    if (attempt === revision) setObsStatus('error', (error as Error).message);
    return false;
  }
}

export function initObsConnection(): void {
  if (initialized) return;
  initialized = true;
  subscribeRecorderSettings((state) => {
    const intent = JSON.stringify([state.enabled.obs, state.configs.obs]);
    if (intent === lastIntent) return;
    lastIntent = intent;
    revision += 1;
    if (retry) { clearTimeout(retry); retry = null; }
    resolveBridge()?.setArmed(false);
    void connectObs();
  });
}
