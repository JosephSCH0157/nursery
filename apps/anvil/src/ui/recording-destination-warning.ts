import { getRecordingEngine } from '../recording/recording-settings';
import { readLocalDestinationReadiness, type LocalDestinationReadiness } from '../recording/local-destination';
import { getNurseryStorageSettingsUrl } from '../forge/nursery-mounts';
import { isRecordingBusy } from '../recording/recorderRegistry';

let current: { refresh: () => Promise<void>; dispose: () => void } | null = null;
export function initRecordingDestinationWarning() {
  if (current) return current;
  let revision = 0;
  let disposed = false;
  let state: LocalDestinationReadiness = { ready: false, message: 'Checking the Core recording destination…' };
  const render = () => {
    document.querySelectorAll<HTMLElement>('[data-recording-destination-warning]').forEach((warning) => {
      warning.hidden = state.ready;
      if (warning.dataset.message !== state.message) {
        warning.dataset.message = state.message;
        warning.replaceChildren(document.createTextNode(state.message + ' '));
        if (!state.ready) {
          const link = document.createElement('a');
          link.href = getNurseryStorageSettingsUrl();
          link.target = '_blank'; link.rel = 'noopener';
          link.textContent = 'Open recording storage settings';
          warning.appendChild(link);
        }
      }
    });
    document.querySelectorAll<HTMLButtonElement>('#startRecBtn, [data-action="record-start"]').forEach((button) => {
      if (!state.ready) {
        button.dataset.destinationBlocked = 'true';
        button.setAttribute('aria-describedby', 'recordingDestinationWarning');
      } else if (button.dataset.destinationBlocked === 'true') {
        delete button.dataset.destinationBlocked;
        button.removeAttribute('aria-describedby');
      }
      button.disabled = !state.ready || isRecordingBusy() || button.dataset.recStarting === 'true';
    });
  };
  const refresh = async () => {
    const ticket = ++revision;
    let next: LocalDestinationReadiness;
    try { next = getRecordingEngine() === 'obs' ? { ready: true, message: '' } : await readLocalDestinationReadiness(); }
    catch { next = { ready: false, message: 'Choose a recording engine in Recording Settings before recording.' }; }
    if (!disposed && ticket === revision) { state = next; render(); }
  };
  const onRefresh = () => { void refresh(); };
  const onStorage = (event: StorageEvent) => {
    if (!event.key || ['forge_mount_registry_v2', 'forge_workspace_id_v1', 'barstock_workspace_id'].includes(event.key)) onRefresh();
  };
  const events = ['focus', 'pageshow', 'tp:recording-directory:changed', 'tp:recording-settings:changed', 'tp:settings:rendered'];
  events.forEach((name) => window.addEventListener(name, onRefresh));
  window.addEventListener('storage', onStorage);
  window.addEventListener('tp:recording:state', render);
  document.addEventListener('tp:settings:rendered', onRefresh);
  const visibility = () => { if (!document.hidden) onRefresh(); };
  document.addEventListener('visibilitychange', visibility);
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  current = { refresh, dispose: () => {
    disposed = true; revision++; observer.disconnect();
    events.forEach((name) => window.removeEventListener(name, onRefresh));
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('tp:recording:state', render);
    document.removeEventListener('tp:settings:rendered', onRefresh);
    document.removeEventListener('visibilitychange', visibility);
    current = null;
  } };
  render(); void refresh();
  return current;
}
