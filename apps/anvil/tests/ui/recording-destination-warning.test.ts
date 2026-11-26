let mockEngine = 'core';
let mockBusy = false;
jest.mock('../../src/recording/recording-settings', () => ({ getRecordingEngine: () => mockEngine }));
jest.mock('../../src/recording/recorderRegistry', () => ({ isRecordingBusy: () => mockBusy }));
import { initRecordingDestinationWarning } from '../../src/ui/recording-destination-warning';

let controller: ReturnType<typeof initRecordingDestinationWarning>;
let directory: any;
let permission: string;
let api: any;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  mockEngine = 'core'; mockBusy = false; permission = 'granted'; directory = null;
  api = { init: jest.fn(async () => {}), get: () => directory, isManaged: () => true, localPersistenceExpected: () => true };
  (window as any).__tpRecDir = api;
  document.body.innerHTML = '<div id="recordingDestinationWarning" data-recording-destination-warning role="alert" hidden></div><button id="startRecBtn">Start recording</button>';
  controller = initRecordingDestinationWarning();
});
afterEach(() => { controller.dispose(); delete (window as any).__tpRecDir; });
function mapped() { directory = { name: 'Hearth folder', queryPermission: jest.fn(async () => permission), requestPermission: jest.fn() }; }

test('unmapped Core destination stays prominent and blocks Start with authoritative settings guidance', async () => {
  await controller.refresh();
  const warning = document.getElementById('recordingDestinationWarning')!;
  expect(warning.hidden).toBe(false); expect(warning.textContent).toContain('Core recording is blocked');
  expect(warning.textContent).toContain('Hearth');
  expect(warning.querySelector('a')!.getAttribute('href')).toContain('/app/settings/storage');
  expect((document.getElementById('startRecBtn') as HTMLButtonElement).disabled).toBe(true);
  await flush(); expect(warning.hidden).toBe(false);
});

test('successful mapping enables Start immediately without reload; revoked permission blocks it again', async () => {
  await controller.refresh(); mapped();
  window.dispatchEvent(new Event('tp:recording-directory:changed')); await flush();
  const button = document.getElementById('startRecBtn') as HTMLButtonElement;
  expect(button.disabled).toBe(false); expect(document.getElementById('recordingDestinationWarning')!.hidden).toBe(true);
  permission = 'denied'; window.dispatchEvent(new Event('focus')); await flush();
  expect(button.disabled).toBe(true); expect(document.getElementById('recordingDestinationWarning')!.textContent).toContain('write permission');
  expect(directory.requestPermission).not.toHaveBeenCalled();
});

test('OBS bypasses the Core destination projection entirely', async () => {
  await controller.refresh(); api.init.mockClear(); mockEngine = 'obs';
  window.dispatchEvent(new Event('tp:recording-settings:changed')); await flush();
  expect(api.init).not.toHaveBeenCalled();
  expect(document.getElementById('recordingDestinationWarning')!.hidden).toBe(true);
  expect((document.getElementById('startRecBtn') as HTMLButtonElement).disabled).toBe(false);
});

test('cross-tab mount updates and remounted settings reflect current readiness', async () => {
  await controller.refresh(); mapped();
  window.dispatchEvent(new StorageEvent('storage', { key: 'forge_mount_registry_v2' })); await flush();
  document.body.insertAdjacentHTML('beforeend', '<div data-recording-destination-warning role="alert"></div>');
  await flush();
  expect(Array.from(document.querySelectorAll<HTMLElement>('[data-recording-destination-warning]')).every((element) => element.hidden)).toBe(true);
});

test('stale folder lookup cannot reapply Core blocking after switching to OBS', async () => {
  let release!: () => void;
  api.init.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const pending = controller.refresh(); mockEngine = 'obs'; await controller.refresh();
  release(); await pending;
  expect(document.getElementById('recordingDestinationWarning')!.hidden).toBe(true);
});

test('normal Start/Stop state never leaves Start permanently disabled after a take', async () => {
  mapped(); await controller.refresh(); mockBusy = true;
  window.dispatchEvent(new CustomEvent('tp:recording:state', { detail: { recording: true } }));
  expect((document.getElementById('startRecBtn') as HTMLButtonElement).disabled).toBe(true);
  mockBusy = false; window.dispatchEvent(new CustomEvent('tp:recording:state', { detail: { recording: false } }));
  expect((document.getElementById('startRecBtn') as HTMLButtonElement).disabled).toBe(false);
});
