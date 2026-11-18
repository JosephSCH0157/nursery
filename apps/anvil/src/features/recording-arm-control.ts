import { createRecordingArmController, type RecordingArmFailure, type RecordingArmState } from '../recording/recording-arm';

let initialized = false;

function openRecordingSettings(): void {
  try { document.getElementById('settingsBtn')?.click(); } catch {}
  const activate = () => {
    try {
      document.querySelector<HTMLButtonElement>('[data-settings-tab="recording"]')?.click();
    } catch {}
  };
  activate();
  setTimeout(activate, 0);
}

function failureMessage(failure: RecordingArmFailure): string {
  switch (failure) {
    case 'configuration_missing': return 'Choose recording settings before arming.';
    case 'configuration_invalid': return 'Your saved recording settings need attention before arming.';
    case 'microphone_missing': return 'The saved microphone is unavailable. Choose a microphone in Recording Settings.';
    case 'camera_missing': return 'The saved camera is unavailable. Choose a camera in Recording Settings.';
    case 'microphone_denied': return 'Microphone permission was denied. Allow access, then arm again.';
    case 'camera_denied': return 'Camera permission was denied. Allow access, then arm again.';
    case 'media_unsupported': return 'This browser cannot initialize recording devices.';
    case 'camera_failed': return 'The camera could not be initialized. Check Recording Settings and device access.';
    case 'obs_unavailable': return 'OBS control is unavailable. Check OBS in Recording Settings.';
    case 'obs_disconnected': return 'OBS disconnected. Check OBS, then arm again.';
    case 'obs_failed': return 'OBS could not be armed. Check its connection in Recording Settings.';
    default: return 'The microphone could not be initialized. Check Recording Settings and device access.';
  }
}

function buttonLabel(state: RecordingArmState): string {
  if (state === 'arming') return 'Arming…';
  if (state === 'armed') return 'Disarm Recording';
  if (state === 'recording') return 'Recording Active';
  return 'Arm Recording';
}

export function initRecordingArmControl(): void {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  const controller = createRecordingArmController();

  const render = (state: RecordingArmState, failure: RecordingArmFailure | null) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-action="recording-arm-toggle"]'));
    buttons.forEach((button) => {
      button.textContent = buttonLabel(state);
      button.disabled = state === 'arming' || state === 'recording';
      button.setAttribute('aria-pressed', state === 'armed' || state === 'recording' ? 'true' : 'false');
      button.dataset.state = state;
    });
    const status = document.getElementById('recordingArmStatus');
    if (status) {
      status.textContent = failure ? failureMessage(failure) : `Recording devices: ${state}`;
      status.dataset.state = state;
    }
  };

  controller.subscribe((next) => render(next.state, next.failure));
  const wireButtons = () => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-action="recording-arm-toggle"]'));
    buttons.forEach((button) => {
      if (button.dataset.recordingArmWired) return;
      button.dataset.recordingArmWired = '1';
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const current = controller.getSnapshot();
        if (current.state === 'armed') {
          await controller.disarm();
          return;
        }
        const result = await controller.arm();
        if (!result.ok) {
          const message = failureMessage(result.failure);
          try { (window as any).toast?.(message, { type: 'warn' }); } catch {}
          openRecordingSettings();
        }
      });
    });
  };
  wireButtons();
  document.addEventListener('tp:settings:rendered', () => {
    wireButtons();
    const next = controller.getSnapshot();
    render(next.state, next.failure);
  });

  const syncRecordingState = (event: Event) => {
    const state = String((event as CustomEvent)?.detail?.state || '').toLowerCase();
    if (state === 'recording') controller.setRecordingActive(true);
    if (state === 'idle') controller.setRecordingActive(false);
  };
  window.addEventListener('rec:state', syncRecordingState);
  window.addEventListener('tp:recording:state', (event: Event) => {
    const recording = (event as CustomEvent)?.detail?.recording;
    if (typeof recording === 'boolean') controller.setRecordingActive(recording);
  });
  (window as any).__tpRecordingArm = controller;
}

export function __resetRecordingArmControlForTests(): void {
  initialized = false;
}
