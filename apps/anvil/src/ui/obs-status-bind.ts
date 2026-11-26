import type { RecorderStatus } from '../state/recorder-settings';
import { getRecorderSettings, subscribeRecorderSettings } from '../state/recorder-settings';

type PillState = 'obs-pill--off' | 'obs-pill--pending' | 'obs-pill--on' | 'obs-pill--error';

function computeLabel(enabled: boolean, status: RecorderStatus): { text: string; css: PillState } {
  if (!enabled) {
    return { text: 'Disabled', css: 'obs-pill--off' };
  }

  if (status === 'connecting') return { text: 'Connecting…', css: 'obs-pill--pending' };
  if (status === 'connected') return { text: 'Connected', css: 'obs-pill--on' };
  if (status === 'error') return { text: 'Error', css: 'obs-pill--error' };
  return { text: 'Disconnected', css: 'obs-pill--pending' };
}

let bound = false;
export function bindObsStatusPills(): (() => void) | undefined {
  if (bound) return;
  bound = true;
  const render = () => {
    const s = getRecorderSettings();
    const { text, css } = computeLabel(s.enabled.obs, s.obsStatus);
    document.querySelectorAll<HTMLElement>('#obsStatus, #obsStatusText, #obsConnStatus, .obs-status, [data-obs-status], .obs-chip-label').forEach((el) => {
      const label = el.id === 'obsStatus' || el.id === 'obsConnStatus' || el.classList.contains('chip') ? `OBS: ${text}` : text;
      if (el.textContent !== label) el.textContent = label;
      el.classList.add('obs-pill');
      ['obs-pill--off', 'obs-pill--pending', 'obs-pill--on', 'obs-pill--error'].forEach((name) => el.classList.toggle(name, name === css));
      if (el.classList.contains('obs-chip-label')) {
        const chip = el.closest<HTMLElement>('#obsChip');
        if (chip) {
          chip.title = `OBS: ${text}`;
          chip.setAttribute('aria-label', chip.title);
          chip.classList.toggle('obs-connected', s.enabled.obs && s.obsStatus === 'connected');
          chip.classList.toggle('obs-error', s.enabled.obs && s.obsStatus === 'error');
        }
      }
    });
  };
  const unsubscribe = subscribeRecorderSettings(render);
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => { observer.disconnect(); unsubscribe(); bound = false; };
}
