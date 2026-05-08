/** @jest-environment jsdom */

describe('mic calibration-aware constraints', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  test('applies active capture constraints when requestMic is called with capture profile', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
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
    const dspLines = infoSpy.mock.calls
      .map((call) => String(call[0] || ''))
      .filter((line) => line.includes('[ASR_DSP_STATUS]'));
    const dspLine = dspLines[dspLines.length - 1] || '';
    expect(dspLine).toContain('state=inactive');
    expect(dspLine).toContain('reason=no_calibration_filters');
    expect(dspLine).toContain('activeFilters=none');
  });

  test('emits DSP diagnostics as unavailable when filters exist but AudioContext is missing', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
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
    const dspLines = infoSpy.mock.calls
      .map((call) => String(call[0] || ''))
      .filter((line) => line.includes('[ASR_DSP_STATUS]'));
    const dspLine = dspLines[dspLines.length - 1] || '';
    expect(dspLine).toContain('state=unavailable');
    expect(dspLine).toContain('reason=no_audio_context');
    expect(dspLine).toContain('activeFilters=none');
  });

  test('emits active DSP diagnostics in deterministic order and cleans up DSP/raw tracks', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const rawTrackStop = jest.fn();
    const processedTrackStop = jest.fn();
    const rawTrack = {
      readyState: 'live',
      enabled: true,
      stop: rawTrackStop,
      getSettings: () => ({
        deviceId: 'mic-dsp',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 1,
      }),
    };
    const processedTrack = {
      readyState: 'live',
      enabled: true,
      stop: processedTrackStop,
      getSettings: () => ({}),
    };
    const rawStream = {
      getTracks: () => [rawTrack],
      getAudioTracks: () => [rawTrack],
      active: true,
    } as unknown as MediaStream;
    const processedStream = {
      getTracks: () => [processedTrack],
      getAudioTracks: () => [processedTrack],
      active: true,
    } as unknown as MediaStream;

    const getUserMedia = jest.fn(async () => rawStream);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: jest.fn(async () => []),
      },
    });

    const closeSpy = jest.fn(async () => {});

    class MockAudioNode {
      connect = jest.fn((dest: any) => dest);
      disconnect = jest.fn();
    }
    class MockFilterNode extends MockAudioNode {
      type = '';
      frequency = { value: 0 };
      Q = { value: 0 };
      gain = { value: 0 };
    }
    class MockCompressorNode extends MockAudioNode {
      threshold = { value: 0 };
      knee = { value: 0 };
      ratio = { value: 0 };
      attack = { value: 0 };
      release = { value: 0 };
    }
    class MockAudioContext {
      createMediaStreamSource = jest.fn(() => new MockAudioNode());
      createBiquadFilter = jest.fn(() => new MockFilterNode());
      createDynamicsCompressor = jest.fn(() => new MockCompressorNode());
      createAnalyser = jest.fn(() => ({
        fftSize: 1024,
        getByteTimeDomainData: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i += 1) arr[i] = 128;
        },
      }));
      createMediaStreamDestination = jest.fn(() => ({
        stream: processedStream,
        disconnect: jest.fn(),
      }));
      close = closeSpy;
    }
    (window as any).AudioContext = MockAudioContext;
    delete (window as any).webkitAudioContext;

    jest.doMock('../../src/asr/active-profile', () => ({
      getActiveAsrProfile: () => ({
        id: 'mic-dsp::Desk',
        label: 'Desk DSP',
        capture: {
          deviceId: 'mic-dsp',
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRateHz: 48000,
          channelCount: 1,
        },
        cal: { noiseRmsDbfs: -54, noisePeakDbfs: -41, speechRmsDbfs: -22, speechPeakDbfs: -5, snrDb: 32 },
        vad: { tonDb: -35, toffDb: -42, attackMs: 50, releaseMs: 180 },
        filters: {
          hpfHz: 90,
          mainsNotchHz: 60,
          deEssBandHz: [5000, 8500],
          presenceCutDb: 1.5,
          bodyBoostDb: 1.5,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    }));

    await import('../../src/media/mic');
    const micApi = (window as any).__tpMic;
    await micApi.requestMic({
      asrPath: 'whisper-bridge',
      source: 'test-dsp-active',
    });

    const runtime = (window as any).__tpCalibrationRuntime;
    expect(runtime?.dsp?.state).toBe('active');
    expect(runtime?.dsp?.activeFilters).toEqual([
      'highpass',
      'notch',
      'de-ess',
      'presence-cut',
      'body-boost',
      'limiter',
    ]);
    expect(runtime?.dsp?.details).toEqual(expect.objectContaining({
      highPassHz: 90,
      notchHz: 60,
      deEssBandHz: [5000, 8500],
      presenceCutDb: -1.5,
      bodyBoostDb: 1.5,
      limiterDbfs: -3,
    }));
    const dspLines = infoSpy.mock.calls
      .map((call) => String(call[0] || ''))
      .filter((line) => line.includes('[ASR_DSP_STATUS]'));
    const dspLine = dspLines[dspLines.length - 1] || '';
    expect(dspLine).toContain('state=active');
    expect(dspLine).toContain('activeFilters=highpass,notch,de-ess,presence-cut,body-boost,limiter');

    micApi.releaseMic();
    expect(closeSpy).toHaveBeenCalled();
    expect(rawTrackStop).toHaveBeenCalled();
    expect(processedTrackStop).toHaveBeenCalled();
  });
});
