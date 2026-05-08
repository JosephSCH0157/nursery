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

  test('emits DSP diagnostics as unavailable when filters exist but AudioContext is missing', async () => {
    const stream = {
      getTracks: () => [],
      getAudioTracks: () => [{
        readyState: 'live',
        enabled: true,
        getSettings: () => ({
          deviceId: 'mic-99',
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

    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;

    jest.doMock('../../src/asr/active-profile', () => ({
      getActiveAsrProfile: () => ({
        id: 'mic-99::Desk',
        label: 'Desk',
        capture: {
          deviceId: 'mic-99',
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRateHz: 48000,
          channelCount: 1,
        },
        cal: { noiseRmsDbfs: -54, noisePeakDbfs: -41, speechRmsDbfs: -22, speechPeakDbfs: -5, snrDb: 32 },
        vad: { tonDb: -35, toffDb: -42, attackMs: 50, releaseMs: 180 },
        filters: { hpfHz: 90, mainsNotchHz: 60, bodyBoostDb: 1.5 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    }));

    await import('../../src/media/mic');
    const micApi = (window as any).__tpMic;
    await micApi.requestMic({
      asrPath: 'whisper-bridge',
      source: 'test-dsp-unavailable',
    });

    const runtime = (window as any).__tpCalibrationRuntime;
    expect(runtime?.dsp).toEqual(expect.objectContaining({
      state: 'unavailable',
      activeFilters: [],
    }));
  });
});
