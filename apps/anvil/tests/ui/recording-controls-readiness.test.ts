import { readFileSync } from 'node:fs';
let cleanup: Array<() => void> = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function setup(engine: 'core' | 'obs' = 'obs', auto = false) {
  jest.resetModules(); localStorage.clear();
  const html = readFileSync('teleprompter_pro.html', 'utf8');
  document.body.innerHTML = '<div class="topbar">' + html.split('<div class="topbar">')[1].split('\n</div>')[0] + '</div><button id="settingsArmRecordingBtn" data-action="recording-arm-toggle"></button><span id="recordingArmStatus"></span><div data-recording-readiness></div>';
  const { appStore } = await import('../../src/state/app-store');
  (window as any).__tpStore = appStore; appStore.set('autoRecord', auto);
  const { setSettings } = await import('../../recorders-core');
  setSettings({ mode: 'single', selected: [engine], recordingMode: engine === 'core' ? 'audio' : 'av' });
  let armed = false; let connected = true;
  const connection = {
    armed: () => armed, isConnected: () => connected,
    setArmed: jest.fn(async (on: boolean) => { armed = on; return true; }),
    maybeConnect: jest.fn(async () => connected), on: jest.fn(() => () => {}),
  };
  (window as any).__tpObs = connection; (window as any).__obsBridge = connection;
  let micStream: MediaStream | null = null;
  (window as any).__tpMic = { get __lastStream() { return micStream; }, isOpen: () => !!micStream, requestMic: jest.fn(async () => { micStream = { getTracks: () => [] } as unknown as MediaStream; return micStream; }), releaseMic: jest.fn(() => { micStream = null; }) };
  (window as any).__tpCamera = { isActive: () => false, start: jest.fn(), stop: jest.fn() };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn(), enumerateDevices: jest.fn(async () => []) } });
  const registry = await import('../../src/recording/recorderRegistry');
  const capture = { id: engine, label: engine, isAvailable: jest.fn(async () => engine !== 'obs' || connected), start: jest.fn(async () => {}), stop: jest.fn(async () => {}) };
  registry.registerRecorder(capture);
  const arm = await import('../../src/features/recording-arm-control'); arm.initRecordingArmControl();
  cleanup.push(arm.__resetRecordingArmControlForTests);
  cleanup.push((await import('../../src/ui/recording-readiness')).initRecordingReadiness());
  cleanup.push((await import('../../src/ui/obs-status-bind')).bindObsStatusPills()!);
  (await import('../../src/ui/recordButtons')).wireRecordButtons(appStore);
  const play = (await import('../../src/recording/startOnPlay')).createStartOnPlay(appStore);
  const settings = await import('../../src/state/recorder-settings');
  return { registry, capture, play, appStore, connection, settings, setSettings, disconnect: () => { connected = false; settings.setObsStatus('disconnected'); } };
}
afterEach(() => { cleanup.splice(0).reverse().forEach((off) => off()); for (const key of ['__tpStore', '__tpObs', '__obsBridge', '__tpMic', '__tpCamera', '__tpRecordingArm']) delete (window as any)[key]; });

test.each([['core', false], ['core', true], ['obs', false], ['obs', true]] as const)('%s arming, script initiation and manual Start/Stop with Auto-record=%s', async (engine, auto) => {
  const h = await setup(engine, auto);
  const arm = document.getElementById('armRecordingBtn') as HTMLButtonElement;
  expect(arm.disabled).toBe(false); arm.click(); await settle();
  expect(arm.textContent).toBe('Disarm Recording'); expect(h.capture.start).not.toHaveBeenCalled();
  expect(document.getElementById('settingsArmRecordingBtn')!.textContent).toBe(arm.textContent);
  if (engine === 'obs') { expect((window as any).__tpMic.requestMic).not.toHaveBeenCalled(); expect((window as any).__tpCamera.start).not.toHaveBeenCalled(); expect(navigator.mediaDevices.enumerateDevices).not.toHaveBeenCalled(); }
  await h.play.onSessionStart();
  expect(h.capture.start).toHaveBeenCalledTimes(auto ? 1 : 0);
  if (!auto) {
    expect(document.querySelector('[data-recording-readiness]')!.textContent).toContain('starting script scrolling will not start recording');
    document.getElementById('toolbarStartRecBtn')!.click(); await settle();
  }
  expect(h.capture.start).toHaveBeenCalledTimes(1); expect(arm.disabled).toBe(true);
  document.getElementById('toolbarStopRecBtn')!.click(); await settle();
  expect(h.capture.stop).toHaveBeenCalledTimes(1); expect(arm.disabled).toBe(false);
  expect(h.registry.isSessionRecording()).toBe(false);
});

test('header pill is in the upper-right, visible in markup, and reflects authenticated connection states', async () => {
  const h = await setup(); const chip = document.getElementById('obsChip')!;
  expect(chip.closest('#topbarRight')).not.toBeNull(); expect(chip.classList.contains('topbar-secondary-status')).toBe(false);
  h.settings.setRecorderEnabled('obs', true);
  for (const [status, label] of [['disconnected', 'Disconnected'], ['connecting', 'Connecting…'], ['connected', 'Connected'], ['error', 'Error']] as const) {
    h.settings.setObsStatus(status); expect(chip.textContent).toContain(label);
    expect(chip.getAttribute('aria-label')).toBe(`OBS: ${label}`);
  }
});

test('legacy recording events cannot disable OBS Arm; selected OBS does not acquire browser devices', async () => {
  await setup();
  window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording', adapter: 'obs' } }));
  const arm = document.getElementById('armRecordingBtn') as HTMLButtonElement;
  expect(arm.disabled).toBe(false); expect(arm.textContent).toBe('Arm Recording');
  arm.click(); await settle();
  document.getElementById('settingsArmRecordingBtn')!.click(); await settle();
  expect(arm.textContent).toBe('Arm Recording');
  expect((window as any).__tpMic.requestMic).not.toHaveBeenCalled();
});

test('switching an armed Core configuration to OBS resets both arm controls without acquiring new media', async () => {
  const h = await setup('core');
  document.getElementById('armRecordingBtn')!.click(); await settle();
  expect((window as any).__tpMic.requestMic).toHaveBeenCalledTimes(1);
  h.setSettings({ mode: 'single', selected: ['obs'], recordingMode: 'av' }); await settle();
  expect((window as any).__tpMic.releaseMic).toHaveBeenCalledTimes(1);
  expect(document.getElementById('armRecordingBtn')!.textContent).toBe('Arm Recording');
  expect(document.getElementById('settingsArmRecordingBtn')!.textContent).toBe('Arm Recording');
  expect((window as any).__tpMic.requestMic).toHaveBeenCalledTimes(1);
  expect((window as any).__tpCamera.start).not.toHaveBeenCalled(); expect(h.connection.setArmed).not.toHaveBeenCalled();
});

test('Stop after microphone closure clears armed readiness on the toolbar and Settings', async () => {
  const h = await setup('core');
  document.getElementById('armRecordingBtn')!.click(); await settle();
  document.getElementById('toolbarStartRecBtn')!.click(); await settle();
  (window as any).__tpMic.releaseMic();
  document.getElementById('toolbarStopRecBtn')!.click(); await settle();
  expect(h.registry.isRecordingBusy()).toBe(false);
  expect(document.getElementById('armRecordingBtn')!.textContent).toBe('Arm Recording');
  expect(document.getElementById('settingsArmRecordingBtn')!.textContent).toBe('Arm Recording');
  expect(document.querySelector('[data-recording-readiness]')!.textContent).toContain('disarmed');
});

test('manual failure remains visible across settings remount; connection is distinct from capture readiness', async () => {
  const h = await setup(); h.disconnect();
  document.getElementById('toolbarStartRecBtn')!.click(); await settle();
  const text = document.querySelector('[data-recording-readiness]')!.textContent!;
  expect(text).toContain('Recording could not proceed'); expect(text).toContain('Connect OBS'); expect(h.registry.isSessionRecording()).toBe(false);
  const replacement = document.createElement('div'); replacement.dataset.recordingReadiness = '';
  document.body.appendChild(replacement); await settle(); expect(replacement.textContent).toBe(text);
  expect(document.getElementById('armRecordingBtn')!.textContent).toBe('Arm Recording');
});

test('script-session readiness refusal explains the missing resource without starting capture', async () => {
  const h = await setup('core', true);
  h.appStore.set('session.recordReason', 'no-mic'); h.appStore.set('session.recordOnLive', false); h.appStore.set('session.phase', 'live');
  expect(document.querySelector('[data-recording-readiness]')!.textContent).toContain('Microphone is not ready');
  expect(h.capture.start).not.toHaveBeenCalled();
});

test.each([['core', false], ['core', true], ['obs', false], ['obs', true]] as const)('%s live script session honors current Auto-record=%s', async (engine, auto) => {
  const h = await setup(engine, auto);
  (await import('../../src/features/recording-session')).initRecordingSession();
  // Even an earlier pre-roll request cannot override subsequently disabled Auto-record.
  h.appStore.set('session.recordOnLive', true); h.appStore.set('session.phase', 'live'); await settle();
  expect(h.capture.start).toHaveBeenCalledTimes(auto ? 1 : 0);
  h.appStore.set('session.phase', 'wrap'); await settle();
  expect(h.registry.isRecordingBusy()).toBe(false);
});
