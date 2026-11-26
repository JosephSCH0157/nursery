import { bindObsSettingsUI } from '../../src/ui/obs-settings-bind';
import { bindObsStatusPills } from '../../src/ui/obs-status-bind';
import { getRecorderSettings, setObsConfig, setObsStatus, setRecorderEnabled } from '../../src/state/recorder-settings';
import { getRecordingEngine } from '../../src/recording/recording-settings';
import { setSettings } from '../../recorders-core';

const cleanups: Array<(() => void) | undefined> = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup?.()); });

const mount = () => {
  document.body.innerHTML = `<div id="obsChip"><span class="obs-chip-label"></span></div>
    <input id="settingsEnableObs" type="checkbox" data-tp-obs-toggle>
    <input id="settingsObsHost"><input id="settingsObsPassword"><span id="obsStatusText"></span>`;
};

test('live status, configuration and engine survive Settings replacement without stale controls', async () => {
  mount();
  cleanups.push(bindObsSettingsUI(), bindObsStatusPills());
  setSettings({ selected: ['obs'], mode: 'single', recordingMode: 'av' });
  setRecorderEnabled('obs', true);
  setObsConfig({ url: 'ws://127.0.0.1:4455', password: 'synthetic' });
  setObsStatus('connected');
  expect(getRecordingEngine()).toBe('obs');
  expect(JSON.parse(localStorage.getItem('tp_rec_settings_v1')!).selected).toEqual(['obs']);
  expect(JSON.parse(localStorage.getItem('tp_rec_settings_v1')!).configs.obs.password).toBe('');
  mount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect((document.getElementById('settingsEnableObs') as HTMLInputElement).checked).toBe(true);
  expect((document.getElementById('settingsObsPassword') as HTMLInputElement).value).toBe('synthetic');
  expect(document.querySelector('.obs-chip-label')!.textContent).toBe('Connected');
  expect(document.getElementById('obsStatusText')!.textContent).toBe('Connected');
  const host = document.getElementById('settingsObsHost') as HTMLInputElement;
  host.value = 'localhost:4466'; host.dispatchEvent(new Event('change', { bubbles: true }));
  expect(getRecorderSettings().configs.obs.url).toBe('ws://localhost:4466');
  setSettings({ selected: ['core'], recordingMode: 'av' });
  const cached = JSON.parse(localStorage.getItem('tp_rec_settings_v1')!);
  expect(cached.enabled.obs).toBe(true);
  expect(cached.configs.obs.url).toBe('ws://localhost:4466');
  expect(cached.configs.obs.password).toBe('');
  setObsStatus('disconnected');
  expect(document.querySelector('.obs-chip-label')!.textContent).toBe('Disconnected');
  const toggle = document.getElementById('settingsEnableObs') as HTMLInputElement;
  toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true }));
  expect(getRecorderSettings().enabled.obs).toBe(false);
  expect(document.querySelector('.obs-chip-label')!.textContent).toBe('Disabled');
});
