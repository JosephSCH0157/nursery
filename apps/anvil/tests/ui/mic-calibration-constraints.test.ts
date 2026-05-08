/** @jest-environment jsdom */

describe('mic calibration-aware constraints', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  test('applies active capture constraints when requestMic is called with capture profile', async () => {
    const stream = {
      getTracks: () => [],
      getAudioTracks: () => [{
        readyState: 'live',
        enabled: true,
        getSettings: () => ({
          deviceId: 'mic-42',
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 1,
        }),
      }],
      active: true,
    } as unknown as MediaStream;

    const getUserMedia = jest.fn(async () => stream);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: jest.fn(async () => []),
      },
    });

    await import('../../src/media/mic');
    const micApi = (window as any).__tpMic;

    await micApi.requestMic({
      asrPath: 'whisper-bridge',
      source: 'test',
      profileId: 'mic-42::Desk',
      capture: {
        deviceId: 'mic-42',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRateHz: 48000,
        channelCount: 1,
      },
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        deviceId: { exact: 'mic-42' },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 1,
      }),
    });

    const runtime = (window as any).__tpCalibrationRuntime;
    expect(runtime).toEqual(expect.objectContaining({
      asrPath: 'whisper-bridge',
      profileId: 'mic-42::Desk',
    }));
  });
});

