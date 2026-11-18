import {
  __resetRecordingArmControlForTests,
  initRecordingArmControl,
} from '../../src/features/recording-arm-control';

function setConfiguration(value: unknown): void {
  localStorage.setItem('tp_rec_settings_v1', JSON.stringify(value));
}

beforeEach(() => {
  __resetRecordingArmControlForTests();
  localStorage.clear();
  document.body.innerHTML = `
    <button id="armRecordingBtn" data-action="recording-arm-toggle"></button>
    <button id="settingsBtn"></button>
    <button data-settings-tab="recording"></button>
    <span id="recordingArmStatus"></span>
  `;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: jest.fn(),
      enumerateDevices: jest.fn(async () => []),
    },
  });
  (window as any).__tpMic = {
    isOpen: () => false,
    requestMic: jest.fn(async () => ({ getTracks: () => [] } as unknown as MediaStream)),
    releaseMic: jest.fn(),
  };
  (window as any).__tpCamera = {
    isActive: () => false,
    start: jest.fn(async () => true),
    stop: jest.fn(),
  };
  (window as any).toast = jest.fn();
});

afterEach(() => {
  delete (window as any).__tpRecordingArm;
  delete (window as any).__tpMic;
  delete (window as any).__tpCamera;
  delete (window as any).toast;
});

test('first-time Arm Recording opens the existing Recording Settings tab', async () => {
  const settingsClick = jest.fn();
  const tabClick = jest.fn();
  document.getElementById('settingsBtn')?.addEventListener('click', settingsClick);
  document.querySelector('[data-settings-tab="recording"]')?.addEventListener('click', tabClick);
  initRecordingArmControl();

  document.getElementById('armRecordingBtn')?.click();
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(settingsClick).toHaveBeenCalledTimes(1);
  expect(tabClick).toHaveBeenCalled();
  expect((window as any).__tpMic.requestMic).not.toHaveBeenCalled();
});

test('successful returning audio configuration arms devices but never starts recording', async () => {
  setConfiguration({ mode: 'single', selected: ['core'], recordingMode: 'audio' });
  initRecordingArmControl();

  document.getElementById('armRecordingBtn')?.click();
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect((window as any).__tpMic.requestMic).toHaveBeenCalledTimes(1);
  expect((window as any).__tpCamera.start).not.toHaveBeenCalled();
  expect((window as any).__tpRecordingArm.getSnapshot().state).toBe('armed');
  expect(document.getElementById('armRecordingBtn')?.textContent).toBe('Disarm Recording');
});

test('a remounted Settings surface reflects the current armed state and is wired', async () => {
  setConfiguration({ mode: 'single', selected: ['core'], recordingMode: 'audio' });
  initRecordingArmControl();
  document.getElementById('armRecordingBtn')?.click();
  await new Promise((resolve) => setTimeout(resolve, 10));

  const replacement = document.createElement('button');
  replacement.id = 'settingsArmRecordingBtn';
  replacement.dataset.action = 'recording-arm-toggle';
  document.body.appendChild(replacement);
  document.dispatchEvent(new CustomEvent('tp:settings:rendered'));

  expect(replacement.textContent).toBe('Disarm Recording');
  expect(replacement.dataset.recordingArmWired).toBe('1');
  expect(replacement.getAttribute('aria-pressed')).toBe('true');
});
