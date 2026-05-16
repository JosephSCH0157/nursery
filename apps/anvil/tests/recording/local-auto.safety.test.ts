const mockCommitRecordingBytesToTongs = jest.fn();
const mockShowRecordingDecisionDialog = jest.fn(async (..._args: unknown[]) => {});

jest.mock('../../src/forge/workpiece-commit', () => ({
  beginRecordingCaptureSession: jest.fn(() => 'cap-test-1'),
  ensureRecordingCaptureTarget: jest.fn(async () => ({ ok: true, workpieceId: 'w-test-1' })),
  commitRecordingBytesToTongs: (...args: unknown[]) => mockCommitRecordingBytesToTongs(...args),
  commitRecordingJsonArtifactToTongs: jest.fn(async () => ({ ok: true })),
  appendRecordingDecisionToTongs: jest.fn(async () => ({ ok: true })),
  promoteRecordingTranscriptForHammer: jest.fn(async () => ({ ok: true })),
  HAMMER_STRUCTURED_TRANSCRIPT_PATH: 'hammer/transcript.json',
}));

jest.mock('../../src/features/speech-loader', () => ({
  startSpeechBackendForSession: jest.fn(async () => {}),
  stopSpeechBackendForSession: jest.fn(async () => {}),
}));

jest.mock('../../src/forge/workpiece-context', () => ({ resolveActiveWorkpieceId: jest.fn(() => null) }));
jest.mock('../../src/features/scripts-store', () => ({ ScriptStore: { getAll: jest.fn(() => []) } }));
jest.mock('../../src/recording/recording-decision-dialog', () => ({
  hideRecordingFinalizeIndicator: jest.fn(),
  showRecordingDecisionDialog: (arg: unknown) => mockShowRecordingDecisionDialog(arg),
  showRecordingFinalizeIndicator: jest.fn(),
}));

describe('local-auto recorder safety guards', () => {
  class FakeTrack {
    kind: 'audio' | 'video';
    enabled = true;
    muted = false;
    readyState: MediaStreamTrackState = 'live';
    label: string;
    constructor(kind: 'audio' | 'video', label: string) {
      this.kind = kind;
      this.label = label;
    }
    getSettings() {
      return { deviceId: this.kind === 'audio' ? 'mic-1' : 'cam-1' };
    }
    stop() {}
  }

  class FakeMediaStream {
    private tracks: FakeTrack[] = [];
    constructor(initialTracks: FakeTrack[] = []) {
      this.tracks = [...initialTracks];
    }
    addTrack(track: FakeTrack) { this.tracks.push(track); }
    getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio') as unknown as MediaStreamTrack[]; }
    getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video') as unknown as MediaStreamTrack[]; }
    getTracks() { return [...this.tracks] as unknown as MediaStreamTrack[]; }
  }

  class FakeMediaRecorder {
    static created = 0;
    state: RecordingState = 'inactive';
    mimeType = 'video/webm';
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;
    constructor(_stream: MediaStream, _opts?: MediaRecorderOptions) { FakeMediaRecorder.created += 1; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([], { type: 'video/webm' }) } as BlobEvent);
      this.onstop?.(new Event('stop'));
    }
  }

  function setupWindow() {
    (globalThis as any).MediaStream = FakeMediaStream as any;
    (globalThis as any).MediaRecorder = FakeMediaRecorder as any;
    (window as any).__tpStore = { get: jest.fn(() => null) };
    (window as any).__tpCamera = { getCameraStream: jest.fn(async () => {
      const stream = new FakeMediaStream();
      stream.addTrack(new FakeTrack('video', 'Cam'));
      return stream as unknown as MediaStream;
    }) };
    (window as any).__tpMic = { requestMic: jest.fn(async () => {
      const stream = new FakeMediaStream();
      stream.addTrack(new FakeTrack('audio', 'Mic'));
      return stream as unknown as MediaStream;
    }) };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn(async (constraints: MediaStreamConstraints) => {
          const stream = new FakeMediaStream();
          if (constraints?.audio) stream.addTrack(new FakeTrack('audio', 'Mic'));
          if (constraints?.video) stream.addTrack(new FakeTrack('video', 'Cam'));
          return stream as unknown as MediaStream;
        }),
      },
    });
    (window as any).__tpRecDir = {
      init: jest.fn(async () => {}),
      get: jest.fn(() => null),
      isManaged: jest.fn(() => false),
      managedHint: jest.fn(() => null),
    };
    (window as any).toast = jest.fn();
    class FakeAudioNode {
      connect() {}
      disconnect() {}
    }
    class FakeScriptProcessorNode extends FakeAudioNode {
      onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;
    }
    class FakeGainNode extends FakeAudioNode {
      gain = { value: 0 };
    }
    class FakeAudioContext {
      state: AudioContextState = 'running';
      sampleRate = 48000;
      async resume() {}
      async close() {}
      createMediaStreamSource() { return new FakeAudioNode(); }
      createScriptProcessor() { return new FakeScriptProcessorNode(); }
      createGain() { return new FakeGainNode(); }
      get destination() { return {}; }
    }
    (window as any).AudioContext = FakeAudioContext;
    (window as any).webkitAudioContext = FakeAudioContext;
    if (!(Blob.prototype as any).arrayBuffer) {
      (Blob.prototype as any).arrayBuffer = async function arrayBufferPolyfill() {
        return new ArrayBuffer(0);
      };
    }
    document.body.innerHTML = '<div id="scriptTitle"></div>';
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    FakeMediaRecorder.created = 0;
    setupWindow();
    mockShowRecordingDecisionDialog.mockClear();
    mockCommitRecordingBytesToTongs.mockResolvedValue({
      ok: true,
      workpieceId: 'w-test-1',
      path: 'recordings/a.webm',
      createdCradle: false,
      plannerRecordingSessionId: null,
      captureSessionId: 'cap-test-1',
      status: 200,
    });
    jest.resetModules();
    jest.doMock('../../src/fs/recording-dir', () => ({}));
    await import('../../src/recording/local-auto');
  });

  test('blocks start when recorder stream has no audio track even if ASR mic works', async () => {
    (window as any).__tpMic.requestMic = jest.fn(async () => new FakeMediaStream() as unknown as MediaStream);
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockImplementation(async (constraints: MediaStreamConstraints) => {
      const stream = new FakeMediaStream();
      if (constraints?.video) stream.addTrack(new FakeTrack('video', 'Cam'));
      return stream as unknown as MediaStream;
    });

    await (window as any).__tpAutoRecord.start();
    expect(FakeMediaRecorder.created).toBe(0);
    expect((window as any).toast).toHaveBeenCalledWith(
      'Recording cannot start because the recorder has no active audio track. ASR may still hear the mic, but the recording would be silent.',
      { type: 'error' },
    );
  });

  test('emits unsafe status when configured local safety copy write fails', async () => {
    const localSafetyEvents: Array<Record<string, unknown>> = [];
    const fallbackEvents: Array<Record<string, unknown>> = [];
    window.addEventListener('tp:recording:local-safety-copy', (ev: Event) => {
      localSafetyEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });
    window.addEventListener('tp:recording:upload-fallback', (ev: Event) => {
      fallbackEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });

    mockCommitRecordingBytesToTongs.mockResolvedValueOnce({
      ok: false,
      reason: 'commit_failed',
      errorMessage: 'canonical upload failed',
    });

    const failingWritable = {
      write: jest.fn(async () => { throw new Error('permission denied'); }),
      close: jest.fn(async () => {}),
    };
    const failingHandle = {
      createWritable: jest.fn(async () => failingWritable),
    };
    const failingDir = {
      name: 'ConfiguredRecordings',
      queryPermission: jest.fn(async () => 'granted'),
      requestPermission: jest.fn(async () => 'granted'),
      getFileHandle: jest.fn(async () => failingHandle),
    };
    (window as any).__tpRecDir = {
      init: jest.fn(async () => {}),
      get: jest.fn(() => failingDir),
      isManaged: jest.fn(() => false),
      managedHint: jest.fn(() => 'ConfiguredRecordings'),
    };

    await (window as any).__tpAutoRecord.start();
    await (window as any).__tpAutoRecord.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const attemptedFailure = localSafetyEvents.find((row) => row.attempted === true && row.success === false);
    expect(attemptedFailure).toBeTruthy();
    expect(attemptedFailure).toEqual(expect.objectContaining({
      attempted: true,
      success: false,
      safeToLeave: false,
    }));
    expect(String((attemptedFailure as any)?.errorMessage || '').length).toBeGreaterThan(0);

    const warningMessage =
      'Recording finished, but the local safety copy was not saved. Do not leave this screen until the recording is verified or downloaded.';
    expect((window as any).toast).toHaveBeenCalledWith(warningMessage, { type: 'error' });

    expect(fallbackEvents.length).toBeGreaterThan(0);
    const lastFallback = fallbackEvents[fallbackEvents.length - 1] || {};
    expect(lastFallback.safeToLeave).toBe(false);
    expect(mockShowRecordingDecisionDialog).not.toHaveBeenCalled();
  });

  test('reports local mirror failure when canonical succeeds but recording folder handle is unavailable', async () => {
    const localSafetyEvents: Array<Record<string, unknown>> = [];
    const fallbackEvents: Array<Record<string, unknown>> = [];
    window.addEventListener('tp:recording:local-safety-copy', (ev: Event) => {
      localSafetyEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });
    window.addEventListener('tp:recording:upload-fallback', (ev: Event) => {
      fallbackEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });

    mockCommitRecordingBytesToTongs.mockResolvedValueOnce({
      ok: true,
      workpieceId: 'w-test-1',
      path: 'recordings/canonical-ok.webm',
      createdCradle: false,
      plannerRecordingSessionId: null,
      captureSessionId: 'cap-test-1',
      status: 200,
    });

    (window as any).__tpRecDir = {
      init: jest.fn(async () => {}),
      get: jest.fn(() => null),
      isManaged: jest.fn(() => true),
      managedHint: jest.fn(() => 'Forge Recordings'),
    };

    await (window as any).__tpAutoRecord.start();
    await (window as any).__tpAutoRecord.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const missingHandleFailure = localSafetyEvents.find(
      (row) => row.attempted === true && row.success === false && row.errorCode === 'missing_directory_handle',
    );
    expect(missingHandleFailure).toBeTruthy();
    expect(missingHandleFailure).toEqual(expect.objectContaining({
      attempted: true,
      success: false,
      safeToLeave: false,
      localMirrorExpected: true,
      localMirrorSucceeded: false,
      canonicalCommitSucceeded: true,
    }));
    expect(String((missingHandleFailure as any)?.errorMessage || '').length).toBeGreaterThan(0);

    expect((window as any).toast).toHaveBeenCalledWith(
      'Recording was saved to Forge, but the local mirror copy was not saved because the recording folder is unavailable.',
      { type: 'warning' },
    );

    expect(fallbackEvents.length).toBeGreaterThan(0);
    const lastFallback = fallbackEvents[fallbackEvents.length - 1] || {};
    expect(lastFallback).toEqual(expect.objectContaining({
      canonicalSucceeded: true,
      localMirrorExpected: true,
      localMirrorSucceeded: false,
      localCopySecured: false,
      downloadFallbackAttempted: false,
      downloadFallbackSkippedReason: 'canonical_commit_succeeded',
      safeToLeave: true,
    }));
  });

  test('keeps stronger unsafe warning when canonical fails and recording folder handle is unavailable', async () => {
    const localSafetyEvents: Array<Record<string, unknown>> = [];
    const fallbackEvents: Array<Record<string, unknown>> = [];
    window.addEventListener('tp:recording:local-safety-copy', (ev: Event) => {
      localSafetyEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });
    window.addEventListener('tp:recording:upload-fallback', (ev: Event) => {
      fallbackEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });

    mockCommitRecordingBytesToTongs.mockResolvedValueOnce({
      ok: false,
      reason: 'commit_failed',
      errorMessage: 'canonical upload failed',
    });

    (window as any).__tpRecDir = {
      init: jest.fn(async () => {}),
      get: jest.fn(() => null),
      isManaged: jest.fn(() => true),
      managedHint: jest.fn(() => 'Forge Recordings'),
    };

    await (window as any).__tpAutoRecord.start();
    await (window as any).__tpAutoRecord.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const missingHandleFailure = localSafetyEvents.find(
      (row) => row.attempted === true && row.success === false && row.errorCode === 'missing_directory_handle',
    );
    expect(missingHandleFailure).toBeTruthy();
    expect(missingHandleFailure).toEqual(expect.objectContaining({
      attempted: true,
      success: false,
      safeToLeave: false,
      canonicalCommitSucceeded: false,
    }));

    expect((window as any).toast).toHaveBeenCalledWith(
      'Recording finished, but the local safety copy was not saved. Do not leave this screen until the recording is verified or downloaded.',
      { type: 'error' },
    );

    expect(fallbackEvents.length).toBeGreaterThan(0);
    const lastFallback = fallbackEvents[fallbackEvents.length - 1] || {};
    expect(lastFallback.safeToLeave).toBe(false);
    expect(lastFallback.canonicalSucceeded).toBe(false);
  });

  test('blocks keep flow when finalized artifact verifies as no-audio stream', async () => {
    const invalidEvents: Array<Record<string, unknown>> = [];
    window.addEventListener('tp:recording:podcast-audio-invalid', (ev: Event) => {
      invalidEvents.push(((ev as CustomEvent).detail || {}) as Record<string, unknown>);
    });
    (window as any).__tpVerifyRecordedArtifact = jest.fn(async () => ({
      hasAudioStream: false,
      hasVideoStream: true,
      channels: 0,
      sampleRate: null,
      audioDurationSec: 0,
      nearSilent: null,
      rmsDbfs: null,
    }));
    mockCommitRecordingBytesToTongs.mockResolvedValueOnce({
      ok: true,
      workpieceId: 'w-should-not-commit',
      path: 'recordings/should-not.webm',
      createdCradle: false,
      plannerRecordingSessionId: null,
      captureSessionId: 'cap-should-not-commit',
      status: 200,
    });
    await (window as any).__tpAutoRecord.start();
    await (window as any).__tpAutoRecord.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCommitRecordingBytesToTongs).not.toHaveBeenCalledWith(expect.objectContaining({ originalName: expect.any(String) }));
    expect(mockShowRecordingDecisionDialog).not.toHaveBeenCalled();
    expect(invalidEvents.length).toBeGreaterThan(0);
    expect((window as any).toast).toHaveBeenCalledWith(
      'The finalized recording has no audio track. This cannot be saved as a podcast take.',
      { type: 'error' },
    );
  });

  test('allows valid audio-only finalized artifact', async () => {
    localStorage.setItem('tp_rec_settings_v1', JSON.stringify({ mode: 'single', selected: ['core'], recordingMode: 'audio' }));
    (window as any).__tpVerifyRecordedArtifact = jest.fn(async () => ({
      hasAudioStream: true,
      hasVideoStream: false,
      channels: 1,
      sampleRate: 16000,
      audioDurationSec: 2.1,
      nearSilent: false,
      rmsDbfs: -24,
    }));
    await (window as any).__tpAutoRecord.start();
    await (window as any).__tpAutoRecord.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCommitRecordingBytesToTongs).toHaveBeenCalled();
  });

  test('allows valid audio+video finalized artifact', async () => {
    localStorage.setItem('tp_rec_settings_v1', JSON.stringify({ mode: 'single', selected: ['core'], recordingMode: 'av' }));
    (window as any).__tpVerifyRecordedArtifact = jest.fn(async () => ({
      hasAudioStream: true,
      hasVideoStream: true,
      channels: 1,
      sampleRate: 48000,
      audioDurationSec: 2.4,
      nearSilent: false,
      rmsDbfs: -18,
    }));
    await (window as any).__tpAutoRecord.start();
    await (window as any).__tpAutoRecord.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCommitRecordingBytesToTongs).toHaveBeenCalled();
  });
});
