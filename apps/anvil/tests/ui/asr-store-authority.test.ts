/** @jest-environment jsdom */

describe('ASR profile store authority', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    delete (window as any).__tpStore;
  });

  afterEach(() => {
    delete (window as any).__tpStore;
  });

  test('writes profiles through the app store without directly mirroring localStorage', async () => {
    const storeState: Record<string, unknown> = {
      asrProfiles: {},
      asrActiveProfileId: null,
    };
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const set = jest.fn((key: string, value: unknown) => {
      storeState[key] = value;
      const subs = listeners.get(key);
      subs?.forEach((listener) => listener(value));
    });
    const subscribe = jest.fn((key: string, listener: (value: unknown) => void) => {
      const subs = listeners.get(key) || new Set<(value: unknown) => void>();
      subs.add(listener);
      listeners.set(key, subs);
      return () => subs.delete(listener);
    });

    (window as any).__tpStore = {
      get: (key: string) => storeState[key],
      set,
      subscribe,
    };

    const { getAsrState, setActiveProfile, upsertProfile } = await import('../../src/asr/store');

    upsertProfile({
      id: 'device-1::desk',
      label: 'Desk',
      capture: {
        sampleRateHz: 48000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        deviceId: 'device-1',
      },
      cal: {
        noiseRmsDbfs: -48,
        noisePeakDbfs: -36,
        speechRmsDbfs: -18,
        speechPeakDbfs: -6,
        snrDb: 30,
      },
      vad: {
        tonDb: -24,
        toffDb: -30,
        attackMs: 80,
        releaseMs: 140,
      },
      filters: {
        hpfHz: 80,
        mainsNotchHz: 60,
        limiterDbfs: -3,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    setActiveProfile('device-1::desk');

    expect(set).toHaveBeenCalledWith(
      'asrProfiles',
      expect.objectContaining({
        'device-1::desk': expect.objectContaining({
          id: 'device-1::desk',
          label: 'Desk',
        }),
      }),
    );
    expect(set).toHaveBeenCalledWith('asrActiveProfileId', 'device-1::desk');
    expect(getAsrState().activeProfileId).toBe('device-1::desk');
    expect(localStorage.getItem('tp_asr_profiles_v1')).toBeNull();
    expect(localStorage.getItem('tp_asr_active_profile_v1')).toBeNull();
  });
});
