import {
  RecordingTranscriptController,
} from '../../src/recording/recordingTranscriptController';
import { selectBestRecordingStrategy } from '../../src/recording/selectBestRecordingStrategy';

describe('RecordingTranscriptController', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('default recording mode keeps ASR transcript flow ephemeral and does not persist transcript artifacts', async () => {
    const commits: Array<{ path: string; eventName: string }> = [];
    const storage = { setItem: jest.fn() };
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-1',
        workpieceId: 'workpiece-1',
        createdCradle: false,
        plannerRecordingSessionId: 'planner-1',
        captureSessionId: 'capture-1',
      }),
      commitJsonArtifact: async (input) => {
        commits.push({ path: input.path, eventName: input.eventName });
        return { ok: true as const };
      },
      startSpeech: async () => true,
      stopSpeech: jest.fn(),
      localStorage: storage,
    });
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    const startResult = await controller.startSession({
      captureSessionId: 'capture-1',
      recordingStartedAtMs: Date.now() - 1_250,
      strategy,
      speechMode: 'asr',
    });
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: { text: 'hello there general kenobi', final: true, isFinal: true },
    }));
    const finalResult = await controller.stopSession({ mediaDurationMs: 2_500 });

    expect(startResult.status).toBe('live');
    expect(startResult.livePath).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(commits).toHaveLength(0);
    expect(finalResult.finalArtifact).toBeNull();
    expect(finalResult.finalPath).toBeNull();
    expect(finalResult.degradedReason).toBe('transcript-persistence-disabled');
    expect(finalResult.segmentCount).toBeGreaterThan(0);
  });

  test('ephemeral mode still tracks live ASR state updates for scroll/matching consumers', async () => {
    const states: Array<any> = [];
    const onState = (event: Event) => {
      states.push((event as CustomEvent).detail);
    };
    window.addEventListener('tp:recording:transcript-state', onState as EventListener);
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-2',
        workpieceId: 'workpiece-2',
        createdCradle: false,
        plannerRecordingSessionId: 'planner-2',
        captureSessionId: 'capture-2',
      }),
      commitJsonArtifact: async () => ({ ok: true as const }),
      startSpeech: async () => true,
      stopSpeech: jest.fn(),
      localStorage: { setItem: jest.fn() },
    });
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    await controller.startSession({
      captureSessionId: 'capture-2',
      recordingStartedAtMs: Date.now() - 1_500,
      strategy,
      speechMode: 'asr',
    });
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: { text: 'partial fragment', final: false, isFinal: false },
    }));
    await controller.stopSession({ mediaDurationMs: 2_000 });
    window.removeEventListener('tp:recording:transcript-state', onState as EventListener);

    expect(states.some((row) => row?.status === 'partial' && row?.partialText === 'partial fragment')).toBe(true);
    expect(states.every((row) => row?.livePath == null && row?.finalPath == null)).toBe(true);
  });

  test('dev-only live_noncanonical_asr_debug mode persists only debug-labeled artifacts', async () => {
    const commits: Array<{ eventName: string; payload: Record<string, unknown> | undefined; path: string }> = [];
    const storage = { setItem: jest.fn() };
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-debug',
        workpieceId: 'workpiece-debug',
        createdCradle: false,
        plannerRecordingSessionId: 'planner-debug',
        captureSessionId: 'capture-debug',
      }),
      commitJsonArtifact: async (input) => {
        commits.push({ eventName: input.eventName, payload: input.eventPayload, path: input.path });
        return { ok: true as const };
      },
      startSpeech: async () => true,
      stopSpeech: jest.fn(),
      localStorage: storage,
      persistenceMode: 'live_noncanonical_asr_debug',
    });
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    await controller.startSession({
      captureSessionId: 'capture-debug',
      recordingStartedAtMs: Date.now() - 1_250,
      strategy,
      speechMode: 'asr',
    });
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: { text: 'debug transcript', final: true, isFinal: true },
    }));
    const result = await controller.stopSession({ mediaDurationMs: 2_000 });

    expect(result.status).toBe('ready');
    expect(result.finalArtifact).not.toBeNull();
    expect(result.finalPath).toContain('live_noncanonical_asr_debug');
    expect(storage.setItem).toHaveBeenCalled();
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every((row) => row.eventName === 'live_noncanonical_asr_debug')).toBe(true);
    expect(commits.every((row) => String(row.payload?.source || '') === 'live_noncanonical_asr_debug')).toBe(true);
    expect(commits.every((row) => row.path.includes('live_noncanonical_asr_debug'))).toBe(true);
  });

  test('ASR2 experimental lane remains blocked from transcript assembly', async () => {
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-asr2',
        workpieceId: 'workpiece-asr2',
        createdCradle: false,
        plannerRecordingSessionId: 'planner-asr2',
        captureSessionId: 'capture-asr2',
      }),
      commitJsonArtifact: async () => ({ ok: true as const }),
      startSpeech: async () => true,
      stopSpeech: jest.fn(),
      localStorage: { setItem: jest.fn() } as any,
      persistenceMode: 'live_noncanonical_asr_debug',
    });
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    await controller.startSession({
      captureSessionId: 'capture-asr2',
      recordingStartedAtMs: Date.now() - 1_200,
      strategy,
      speechMode: 'asr',
    });
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'experimental transcript',
        final: true,
        isFinal: true,
        activeAsrLane: 'ASR2_WHISPER_LARGE_V3_EXPERIMENTAL',
      },
    }));
    const finalResult = await controller.stopSession({ mediaDurationMs: 2_000 });
    expect(finalResult.finalArtifact).toBeNull();
  });

  test.each(['timed', 'wpm', 'step', 'off', null])(
    'mode %s does not start or stop any speech backend and finishes without an ASR warning',
    async (speechMode) => {
      const startSpeech = jest.fn(async () => {
        throw new Error('paid-capable speech startup must not run');
      });
      const stopSpeech = jest.fn();
      const controller = new RecordingTranscriptController({
        ensureCaptureTarget: async () => ({
          ok: true as const,
          workspaceId: 'workspace-isolation',
          workpieceId: 'workpiece-isolation',
          createdCradle: false,
          plannerRecordingSessionId: null,
          captureSessionId: 'capture-isolation',
        }),
        commitJsonArtifact: async () => {
          throw new Error('non-ASR mode must not persist transcript artifacts');
        },
        startSpeech,
        stopSpeech,
        localStorage: { setItem: jest.fn() },
      });
      const strategy = selectBestRecordingStrategy({
        mode: 'audio',
        mediaRecorderCtor: { isTypeSupported: () => true },
      });

      const started = await controller.startSession({
        captureSessionId: 'capture-isolation',
        recordingStartedAtMs: Date.now() - 500,
        strategy,
        speechMode,
      });
      const finalized = await controller.stopSession({ mediaDurationMs: 1_000 });

      expect(startSpeech).not.toHaveBeenCalled();
      expect(stopSpeech).not.toHaveBeenCalled();
      expect(started.status).toBe('ready');
      expect(started.degradedReason).toBeNull();
      expect(finalized.status).toBe('ready');
      expect(finalized.degradedReason).toBeNull();
      expect(finalized.segmentCount).toBe(0);
    },
  );

  test.each(['asr', 'hybrid'])('mode %s starts only its explicitly selected speech behavior', async (speechMode) => {
    const startSpeech = jest.fn(async () => true);
    const stopSpeech = jest.fn();
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-selected',
        workpieceId: 'workpiece-selected',
        createdCradle: false,
        plannerRecordingSessionId: null,
        captureSessionId: 'capture-selected',
      }),
      commitJsonArtifact: async () => ({ ok: true as const }),
      startSpeech,
      stopSpeech,
      localStorage: { setItem: jest.fn() },
    });
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    await controller.startSession({
      captureSessionId: 'capture-selected',
      recordingStartedAtMs: Date.now() - 500,
      strategy,
      speechMode,
    });
    await controller.stopSession({ mediaDurationMs: 1_000 });

    expect(startSpeech).toHaveBeenCalledTimes(1);
    expect(startSpeech).toHaveBeenCalledWith({ reason: 'recording-transcript', mode: speechMode });
    expect(stopSpeech).toHaveBeenCalledWith('recording-stop');
  });
});
