/** @jest-environment jsdom */

class MockTrack {
  stop = jest.fn();

  clone(): MockTrack {
    return new MockTrack();
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
  });

  test('rolls recorder segments with full stop/start cycles instead of timeslice chunks', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(),
        },
      },
    }));

    const recorderInstances = installMockRecorder();

    const inputStream = new MockMediaStream([new MockTrack()]);
    (window as any).__tpMic = {
      requestMic: jest.fn(async () => inputStream),
    };

    const { createWhisperBridgeRecognizer } = await import('../../src/speech/engines/whisper-bridge');
    const recognizer = createWhisperBridgeRecognizer({ endpointingMs: 100 });

    await recognizer.start();

    expect(recorderInstances).toHaveLength(1);
    expect(recorderInstances[0]?.start.mock.calls[0]).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(1300);

    expect(recorderInstances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(recorderInstances[0]?.requestData).not.toHaveBeenCalled();
    expect(recorderInstances).toHaveLength(2);
    expect(recorderInstances[1]?.start.mock.calls[0]).toHaveLength(0);

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
});
