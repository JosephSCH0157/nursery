/** @jest-environment jsdom */

class MockTrack {
  id = `track-${Math.random().toString(36).slice(2, 8)}`;
  label = 'Mock Mic';
  readyState: MediaStreamTrackState = 'live';
  enabled = true;
  muted = false;
  stop = jest.fn();

  clone(): MockTrack {
    return new MockTrack();
  }

  getSettings() {
    return { sampleRate: 48000, channelCount: 1 };
  }

  getConstraints() {
    return { channelCount: 1 };
  }
}

class MockMediaStream {
  private readonly tracks: MockTrack[];

  constructor(tracks: MockTrack[] = []) {
    this.tracks = tracks;
  }

  getAudioTracks(): MockTrack[] {
    return this.tracks;
  }

  getTracks(): MockTrack[] {
    return this.tracks;
  }
}

type MockMediaRecorderInstance = {
  start: jest.Mock<void, unknown[]>;
  stop: jest.Mock<void, unknown[]>;
  requestData: jest.Mock<void, unknown[]>;
  mimeType: string;
  state: 'inactive' | 'recording';
  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onstop: ((event: Event) => void) | null;
};

function installMockRecorder(): MockMediaRecorderInstance[] {
  const recorderInstances: MockMediaRecorderInstance[] = [];

  class MockMediaRecorder {
    static isTypeSupported(candidate: string): boolean {
      return candidate === 'audio/webm;codecs=opus';
    }

    readonly start = jest.fn((..._args: unknown[]) => {
      this.state = 'recording';
    });

    readonly stop = jest.fn(() => {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.onstop?.(new Event('stop'));
      });
    });

    readonly requestData = jest.fn();
    readonly mimeType: string;
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    constructor(_stream: MockMediaStream, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType || '';
      recorderInstances.push(this);
    }
  }

  (globalThis as any).MediaStream = MockMediaStream;
  (globalThis as any).MediaRecorder = MockMediaRecorder;
  return recorderInstances;
}

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let idx = 0; idx < turns; idx += 1) {
    await Promise.resolve();
  }
}

function createMockJsonResponse(status: number, body: Record<string, unknown>): Response {
  const payload = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Bad Request',
    headers: {
      get(name: string): string | null {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null;
      },
    } as Headers,
    text: async () => payload,
  } as Response;
}

describe('whisper bridge recorder segmentation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    (window as any).__tpLogLevel = 2;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (window as any).__tpMic;
    delete (window as any).__tpLogLevel;
    delete (globalThis as any).MediaRecorder;
    delete (globalThis as any).MediaStream;
    delete (globalThis as any).fetch;
    delete (window as any).__tpAsrRunKey;
    delete (window as any).__tpAsrRunGeneration;
    delete (window as any).__tpAsrRunStartedAt;
  });

  test('starts MediaRecorder with a timeslice and still rolls recorder segments', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(),
        },
      },
    }));

    const recorderInstances = installMockRecorder();

    const inputStream = new MockMediaStream([new MockTrack()]);
    const requestMic = jest.fn(async () => inputStream);
    (window as any).__tpMic = { requestMic };

    const { upsertProfile, setActiveProfile } = await import('../../src/asr/store');
    upsertProfile({
      id: 'mic-1::Desk',
      label: 'Desk',
      capture: {
        deviceId: 'mic-1',
        sampleRateHz: 48000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
      },
      cal: { noiseRmsDbfs: -52, noisePeakDbfs: -44, speechRmsDbfs: -22, speechPeakDbfs: -10, snrDb: 30 },
      vad: { tonDb: -38, toffDb: -44, attackMs: 80, releaseMs: 300 },
      filters: {},
      version: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
    setActiveProfile('mic-1::Desk' as any);

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });

    await recognizer.start();
    expect(requestMic).toHaveBeenCalledWith(expect.objectContaining({
      source: 'whisper-bridge',
      asrPath: 'whisper-bridge',
      profileId: 'mic-1::Desk',
      capture: expect.objectContaining({
        deviceId: 'mic-1',
        noiseSuppression: true,
      }),
    }));

    expect(recorderInstances).toHaveLength(1);
    expect(recorderInstances[0]?.start.mock.calls[0]).toHaveLength(1);
    expect(Number(recorderInstances[0]?.start.mock.calls[0]?.[0])).toBeGreaterThanOrEqual(700);

    await jest.advanceTimersByTimeAsync(1300);

    expect(recorderInstances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(recorderInstances[0]?.requestData).not.toHaveBeenCalled();
    expect(recorderInstances).toHaveLength(2);
    expect(recorderInstances[1]?.start.mock.calls[0]).toHaveLength(1);
    expect(Number(recorderInstances[1]?.start.mock.calls[0]?.[0])).toBeGreaterThanOrEqual(700);

    recognizer.stop();
    await Promise.resolve();

    expect(recorderInstances[1]?.requestData).toHaveBeenCalledTimes(1);
    expect(recorderInstances[1]?.stop).toHaveBeenCalledTimes(1);
  });

  test('drops unsupported-audio chunks without latching the ASR session and continues with later segments', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: 'test-access-token',
              },
            },
            error: null,
          })),
        },
      },
    }));

    const recorderInstances = installMockRecorder();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createMockJsonResponse(400, {
        ok: false,
        error: 'Audio file might be corrupted or unsupported',
        detail: 'segment 1 could not be decoded',
        ffmpeg_fallback_attempted: true,
        ffmpeg_fallback_used: false,
        ffmpeg_fallback_error: 'Forge FFmpeg unavailable',
      }))
      .mockResolvedValueOnce(createMockJsonResponse(200, {
        ok: true,
        text: 'Recovered next segment',
        provider_request_id: 'req_after_recovery',
        ffmpeg_fallback_attempted: true,
        ffmpeg_fallback_used: true,
      }));
    (globalThis as any).fetch = fetchMock;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = {
      requestMic: jest.fn(async () => inputStream),
    };

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    const finalPayloads: Array<{ text?: string }> = [];

    recognizer.on('final', (payload) => {
      finalPayloads.push(payload as { text?: string });
    });

    await recognizer.start();
    expect(recorderInstances).toHaveLength(1);

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 1000,
    } as BlobEvent);
    await flushMicrotasks();

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 2000,
    } as BlobEvent);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(finalPayloads).toHaveLength(1);
    expect(finalPayloads[0]?.text).toBe('Recovered next segment');

    expect(warnSpy.mock.calls).toEqual(expect.arrayContaining([
      [
        '[whisper-bridge] chunk dropped: unsupported-audio',
        expect.objectContaining({
          seq: 1,
          consecutiveFailures: 1,
          ffmpegFallbackAttempted: true,
          ffmpegFallbackUsed: false,
        }),
      ],
    ]));
    expect(infoSpy.mock.calls).toEqual(expect.arrayContaining([
      [
        '[whisper-bridge] continuing ASR session',
        expect.objectContaining({
          seq: 1,
          consecutiveFailures: 1,
          remainingBeforeLatch: 2,
        }),
      ],
      [
        '[whisper-bridge] server ffmpeg fallback recovered chunk',
        expect.objectContaining({
          seq: 2,
          providerRequestId: 'req_after_recovery',
        }),
      ],
    ]));

    recognizer.stop();
    await flushMicrotasks();
  });

  test('emits lineage for multi-chunk assembled finals', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: 'test-access-token',
              },
            },
            error: null,
          })),
        },
      },
    }));

    const recorderInstances = installMockRecorder();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createMockJsonResponse(200, {
        ok: true,
        text: 'Florida citrus did not',
        provider_request_id: 'req-1',
      }))
      .mockResolvedValueOnce(createMockJsonResponse(200, {
        ok: true,
        text: 'did not start small',
        provider_request_id: 'req-2',
      }));
    (globalThis as any).fetch = fetchMock;

    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = {
      requestMic: jest.fn(async () => inputStream),
    };

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    const finalPayloads: any[] = [];
    recognizer.on('final', (payload) => finalPayloads.push(payload));

    await recognizer.start();

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 1000,
    } as BlobEvent);
    await flushMicrotasks();

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 2000,
    } as BlobEvent);
    await flushMicrotasks();

    const lastPayload = finalPayloads[finalPayloads.length - 1];
    expect(lastPayload).toBeTruthy();
    expect(lastPayload.rawText).toBe('did not start small');
    expect(lastPayload.assembledText).toContain('Florida citrus did not start small');
    expect(lastPayload.sourceRequestSeqs).toEqual([1, 2]);
    expect(lastPayload.supportingRawSeqs).toEqual([1, 2]);
    expect(lastPayload.appendedTokenRange).toEqual({ start: 4, end: 5 });
    expect(lastPayload.appendedBySeq).toEqual([2]);
    expect(lastPayload.requestGeneration).toBe(1);

    recognizer.stop();
    await flushMicrotasks();
  });

  test('drops upstream header-overflow chunks and continues with later segments', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: 'test-access-token',
              },
            },
            error: null,
          })),
        },
      },
    }));

    const recorderInstances = installMockRecorder();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createMockJsonResponse(431, {
        ok: false,
        error: 'Request headers are too large.',
        code: 'whisper_upstream_header_overflow',
        upstream_status: 431,
        upstream_message: 'Request headers are too large.',
      }))
      .mockResolvedValueOnce(createMockJsonResponse(200, {
        ok: true,
        text: 'Recovered after header overflow',
        provider_request_id: 'req_after_header_overflow',
      }));
    (globalThis as any).fetch = fetchMock;

    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = {
      requestMic: jest.fn(async () => inputStream),
    };

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    const finalPayloads: Array<{ text?: string }> = [];
    const errorPayloads: Array<{ code?: string | null }> = [];

    recognizer.on('final', (payload) => {
      finalPayloads.push(payload as { text?: string });
    });
    recognizer.on('error', (payload) => {
      errorPayloads.push(payload as { code?: string | null });
    });

    await recognizer.start();
    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 1000,
    } as BlobEvent);
    await flushMicrotasks();

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 2000,
    } as BlobEvent);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorPayloads.some((payload) => payload.code === 'whisper_upstream_header_overflow')).toBe(true);
    expect(finalPayloads).toHaveLength(1);
    expect(finalPayloads[0]?.text).toBe('Recovered after header overflow');

    recognizer.stop();
    await flushMicrotasks();
  });

  test('drops stale in-flight whisper responses after stop and logs stale-drop marker', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: 'test-access-token',
              },
            },
            error: null,
          })),
        },
      },
    }));

    const recorderInstances = installMockRecorder();
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = jest.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    (globalThis as any).fetch = fetchMock;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = {
      requestMic: jest.fn(async () => inputStream),
    };

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    const finalPayloads: Array<{ text?: string }> = [];
    recognizer.on('final', (payload) => {
      finalPayloads.push(payload as { text?: string });
    });

    await recognizer.start();
    expect(recorderInstances).toHaveLength(1);

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 1000,
    } as BlobEvent);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    recognizer.stop();
    await flushMicrotasks();

    expect(resolveFetch).toBeDefined();
    resolveFetch!(createMockJsonResponse(200, {
      ok: true,
      text: 'late transcript should be ignored',
      provider_request_id: 'req_stale_response',
    }));
    await flushMicrotasks(12);

    expect(finalPayloads).toHaveLength(0);
    expect(warnSpy.mock.calls).toEqual(expect.arrayContaining([
      [
        '[whisper-bridge] whisper_stale_response_dropped',
        expect.objectContaining({
          seq: 1,
        }),
      ],
    ]));
  });

  test('emits audio chunk event and first-chunk diagnostics for non-empty dataavailable payloads', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: { access_token: 'test-access-token' } },
            error: null,
          })),
        },
      },
    }));

    const recorderInstances = installMockRecorder();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(createMockJsonResponse(200, {
      ok: true,
      text: 'hello world',
      provider_request_id: 'req-1',
    }));

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const audioChunkHandler = jest.fn();
    window.addEventListener('tp:asr:audio-chunk', audioChunkHandler as EventListener);

    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = { requestMic: jest.fn(async () => inputStream) };
    (window as any).__tpAsrRunKey = 'run-test-1';
    (window as any).__tpAsrRunGeneration = 42;
    (window as any).__tpAsrRunStartedAt = Date.now() - 1000;

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    await recognizer.start();

    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: 'audio/webm' }),
      timecode: 1000,
    } as BlobEvent);
    await flushMicrotasks();

    expect(audioChunkHandler).toHaveBeenCalled();
    expect(infoSpy.mock.calls.some((call) => call[0] === '[ASR_FIRST_AUDIO_CHUNK]')).toBe(true);

    recognizer.stop();
    await flushMicrotasks();
    window.removeEventListener('tp:asr:audio-chunk', audioChunkHandler as EventListener);
  });

  test('zero-byte dataavailable emits ASR_WHISPER_ZERO_BYTE_CHUNK and does not enqueue', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: { access_token: 'test-access-token' } },
            error: null,
          })),
        },
      },
    }));
    const recorderInstances = installMockRecorder();
    const fetchMock = jest.fn().mockResolvedValue(createMockJsonResponse(200, {
      ok: true,
      text: 'should-not-send',
    }));
    (globalThis as any).fetch = fetchMock;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = { requestMic: jest.fn(async () => inputStream), __lastRawStream: inputStream };
    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    await recognizer.start();
    recorderInstances[0]?.ondataavailable?.({
      data: new Blob([], { type: 'audio/webm;codecs=opus' }),
      timecode: 1000,
    } as BlobEvent);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(warnSpy.mock.calls.some((c) => c[0] === '[ASR_WHISPER_ZERO_BYTE_CHUNK]')).toBe(true);
    recognizer.stop();
    await flushMicrotasks();
  });

  test('emits stream track diagnostics at capture start', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'x' } }, error: null })) },
      },
    }));
    installMockRecorder();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(createMockJsonResponse(200, { ok: true, text: 'ok' }));
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = { requestMic: jest.fn(async () => inputStream), __lastRawStream: inputStream };
    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    await recognizer.start();
    expect(infoSpy.mock.calls.some((c) => c[0] === '[ASR_WHISPER_STREAM_TRACK_STATE]')).toBe(true);
    recognizer.stop();
    await flushMicrotasks();
  });

  test('recording-active capture policy prefers raw mic for ASR start', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'x' } }, error: null })) } },
    }));
    jest.doMock('../../src/recording/recorderRegistry', () => ({
      isSessionRecording: jest.fn(() => true),
    }));
    installMockRecorder();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(createMockJsonResponse(200, { ok: true, text: 'ok' }));
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const rawStream = new MockMediaStream([new MockTrack()]);
    const requestMic = jest.fn(async (_opts?: any) => rawStream);
    (window as any).__tpMic = { requestMic, __lastRawStream: rawStream };
    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    await recognizer.start();
    expect(requestMic).toHaveBeenCalledWith(expect.objectContaining({ preferRawForAsr: true }));
    expect(infoSpy.mock.calls.some((c) => c[0] === '[ASR_WHISPER_CAPTURE_POLICY]')).toBe(true);
    recognizer.stop();
    await flushMicrotasks();
  });

  test('zero-byte streak triggers raw fallback and starts fallback recorder path', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'x' } }, error: null })) } },
    }));
    jest.doMock('../../src/recording/recorderRegistry', () => ({
      isSessionRecording: jest.fn(() => false),
    }));
    const recorderInstances = installMockRecorder();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(createMockJsonResponse(200, { ok: true, text: 'ok' }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const processedStream = new MockMediaStream([new MockTrack()]);
    const rawStream = new MockMediaStream([new MockTrack()]);
    const requestMic = jest.fn(async (opts?: any) => (opts?.preferRawForAsr ? rawStream : processedStream));
    (window as any).__tpMic = { requestMic, __lastRawStream: rawStream };
    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    await recognizer.start();
    recorderInstances[0]?.ondataavailable?.({ data: new Blob([], { type: 'audio/webm;codecs=opus' }), timecode: 1000 } as BlobEvent);
    recorderInstances[0]?.ondataavailable?.({ data: new Blob([], { type: 'audio/webm;codecs=opus' }), timecode: 2000 } as BlobEvent);
    recorderInstances[0]?.ondataavailable?.({ data: new Blob([], { type: 'audio/webm;codecs=opus' }), timecode: 3000 } as BlobEvent);
    await flushMicrotasks(20);
    expect(warnSpy.mock.calls.some((c) =>
      c[0] === '[ASR_WHISPER_CAPTURE_SOURCE_SELECTED]'
      && c[1]
      && (c[1] as any).selected === 'raw-mic',
    )).toBe(true);
    recognizer.stop();
    await flushMicrotasks();
  });

  test('logs raw fallback unavailable when zero-byte fallback cannot get live raw stream', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'x' } }, error: null })) } },
    }));
    jest.doMock('../../src/recording/recorderRegistry', () => ({
      isSessionRecording: jest.fn(() => false),
    }));
    const recorderInstances = installMockRecorder();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(createMockJsonResponse(200, { ok: true, text: 'ok' }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const processedStream = new MockMediaStream([new MockTrack()]);
    const deadRawTrack = new MockTrack();
    deadRawTrack.readyState = 'ended';
    const deadRawStream = new MockMediaStream([deadRawTrack]);
    const requestMic = jest.fn(async (opts?: any) => {
      if (opts?.preferRawForAsr) {
        throw new Error('raw stream unavailable');
      }
      return processedStream;
    });
    (window as any).__tpMic = { requestMic, __lastRawStream: deadRawStream };
    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });
    await recognizer.start();
    recorderInstances[0]?.ondataavailable?.({ data: new Blob([], { type: 'audio/webm;codecs=opus' }), timecode: 1000 } as BlobEvent);
    recorderInstances[0]?.ondataavailable?.({ data: new Blob([], { type: 'audio/webm;codecs=opus' }), timecode: 2000 } as BlobEvent);
    recorderInstances[0]?.ondataavailable?.({ data: new Blob([], { type: 'audio/webm;codecs=opus' }), timecode: 3000 } as BlobEvent);
    await flushMicrotasks(20);
    expect(warnSpy.mock.calls.some((c) => c[0] === '[ASR_WHISPER_RAW_FALLBACK_UNAVAILABLE]')).toBe(true);
    recognizer.stop();
    await flushMicrotasks();
  });
});
