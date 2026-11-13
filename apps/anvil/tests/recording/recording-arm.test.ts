import { createRecordingArmController, type RecordingArmDependencies } from '../../src/recording/recording-arm';

function device(kind: MediaDeviceKind, deviceId: string): MediaDeviceInfo {
  return { kind, deviceId, groupId: 'group', label: deviceId, toJSON: () => ({}) } as MediaDeviceInfo;
}

function harness(options: {
  mode?: 'av' | 'audio';
  config?: 'valid' | 'missing' | 'invalid';
  micOpen?: boolean;
  cameraOpen?: boolean;
  micError?: Error;
  cameraError?: Error;
  micId?: string | null;
  cameraId?: string | null;
  recording?: boolean;
} = {}) {
  const releaseMic = jest.fn();
  const stopCamera = jest.fn();
  const requestMic = options.micError
    ? jest.fn(async () => { throw options.micError; })
    : jest.fn(async () => ({ getTracks: () => [] } as unknown as MediaStream));
  const startCamera = options.cameraError
    ? jest.fn(async () => { throw options.cameraError; })
    : jest.fn(async () => true);
  const setDevice = jest.fn(async () => true);
  const dispatch = jest.fn();
  const config = options.config ?? 'valid';
  const deps: RecordingArmDependencies = {
    readConfiguration: () => config === 'missing'
      ? { ok: false, reason: 'missing' }
      : config === 'invalid'
        ? { ok: false, reason: 'invalid' }
        : { ok: true, configuration: { engine: 'core', mode: options.mode ?? 'av' } },
    enumerateDevices: async () => [device('audioinput', 'mic-1'), device('videoinput', 'cam-1')],
    getMicApi: () => ({ isOpen: () => !!options.micOpen, requestMic, releaseMic }),
    getCameraApi: () => ({ isActive: () => !!options.cameraOpen, setDevice, start: startCamera, stop: stopCamera }),
    readSavedMicDeviceId: () => options.micId === undefined ? 'mic-1' : options.micId,
    readSavedCameraDeviceId: () => options.cameraId === undefined ? 'cam-1' : options.cameraId,
    isRecording: () => !!options.recording,
    dispatch,
  };
  return { controller: createRecordingArmController(deps), requestMic, releaseMic, startCamera, stopCamera, setDevice, dispatch };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn(), enumerateDevices: jest.fn() },
  });
});

describe('recording device arming', () => {
  test.each([
    ['missing', 'configuration_missing'],
    ['invalid', 'configuration_invalid'],
  ] as const)('routes %s first-time configuration to recovery without opening devices', async (config, failure) => {
    const h = harness({ config });
    await expect(h.controller.arm()).resolves.toEqual({ ok: false, failure });
    expect(h.requestMic).not.toHaveBeenCalled();
    expect(h.startCamera).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().state).toBe('error');
  });

  test('arms a returning video configuration only after microphone and camera initialize', async () => {
    const h = harness();
    await expect(h.controller.arm()).resolves.toEqual({ ok: true });
    expect(h.requestMic).toHaveBeenCalledWith('mic-1');
    expect(h.setDevice).toHaveBeenCalledWith('cam-1');
    expect(h.startCamera).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot()).toMatchObject({ state: 'armed', failure: null });
  });

  test('microphone-only arming never initializes the camera', async () => {
    const h = harness({ mode: 'audio' });
    await h.controller.arm();
    expect(h.requestMic).toHaveBeenCalledTimes(1);
    expect(h.startCamera).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().state).toBe('armed');
  });

  test('invalid remembered devices fail before requesting media', async () => {
    const h = harness({ micId: 'unplugged-mic' });
    await expect(h.controller.arm()).resolves.toEqual({ ok: false, failure: 'microphone_missing' });
    expect(h.requestMic).not.toHaveBeenCalled();
  });

  test('denied microphone permission is explicit and never initializes camera', async () => {
    const error = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const h = harness({ micError: error });
    await expect(h.controller.arm()).resolves.toEqual({ ok: false, failure: 'microphone_denied' });
    expect(h.startCamera).not.toHaveBeenCalled();
  });

  test('camera failure rolls back only the microphone acquired by arming', async () => {
    const error = Object.assign(new Error('camera denied'), { name: 'NotAllowedError' });
    const h = harness({ cameraError: error });
    await expect(h.controller.arm()).resolves.toEqual({ ok: false, failure: 'camera_denied' });
    expect(h.releaseMic).toHaveBeenCalledTimes(1);
    expect(h.stopCamera).not.toHaveBeenCalled();
  });

  test('disarm releases tracks acquired by arming', async () => {
    const h = harness();
    await h.controller.arm();
    await expect(h.controller.disarm()).resolves.toBe(true);
    expect(h.releaseMic).toHaveBeenCalledTimes(1);
    expect(h.stopCamera).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().state).toBe('idle');
  });

  test('disarm preserves media owned by another subsystem', async () => {
    const h = harness({ micOpen: true, cameraOpen: true });
    await h.controller.arm();
    await h.controller.disarm();
    expect(h.requestMic).not.toHaveBeenCalled();
    expect(h.startCamera).not.toHaveBeenCalled();
    expect(h.releaseMic).not.toHaveBeenCalled();
    expect(h.stopCamera).not.toHaveBeenCalled();
  });

  test('active recording disables disarm and retains armed readiness after stop', async () => {
    const h = harness();
    await h.controller.arm();
    h.controller.setRecordingActive(true);
    expect(h.controller.getSnapshot().state).toBe('recording');
    await expect(h.controller.disarm()).resolves.toBe(false);
    expect(h.releaseMic).not.toHaveBeenCalled();
    h.controller.setRecordingActive(false);
    expect(h.controller.getSnapshot().state).toBe('armed');
  });

  test('arming never starts the recorder or emits recording state', async () => {
    const h = harness();
    await h.controller.arm();
    expect(h.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'armed' }));
    expect(h.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'recording' }));
  });
});
