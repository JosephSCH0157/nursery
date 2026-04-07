/** @jest-environment jsdom */

describe('whisper bridge recorder segmentation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (window as any).__tpMic;
    delete (globalThis as any).MediaRecorder;
    delete (globalThis as any).MediaStream;
  });

  test('rolls recorder segments with full stop/start cycles instead of timeslice chunks', async () => {
    jest.doMock('../../src/forge/supabaseClient', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(),
        },
      },
    }));

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

    const recorderInstances: MockMediaRecorder[] = [];

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
});
