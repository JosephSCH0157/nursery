import {
  RecordingTranscriptController,
  type RecordingTranscriptFinalizeResult,
} from '../../src/recording/recordingTranscriptController';
import { selectBestRecordingStrategy } from '../../src/recording/selectBestRecordingStrategy';

describe('RecordingTranscriptController', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('captures live transcript events, persists snapshots, and finalizes a structured transcript', async () => {
    const commits: Array<{ path: string; eventName: string; data: unknown }> = [];
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
        commits.push({ path: input.path, eventName: input.eventName, data: input.data });
        return {
          ok: true as const,
          status: 200,
          workpieceId: input.workpieceId,
          path: input.path,
        };
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
    });

    expect(startResult.status).toBe('live');
    expect(storage.setItem).toHaveBeenCalled();
    expect(commits.some((entry) => entry.eventName === 'take_transcript_snapshot')).toBe(true);

    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'hello there',
        final: false,
        isFinal: false,
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'hello there general kenobi',
        final: true,
        isFinal: true,
      },
    }));

    const finalResult = await controller.stopSession({
      mediaDurationMs: 2_500,
      mediaPath: 'recordings/example.webm',
      contentType: 'audio/webm',
    });

    expect(finalResult.status).toBe('ready');
    expect(finalResult.segmentCount).toBe(1);
    expect(finalResult.finalArtifact?.segments).toHaveLength(1);
    expect(finalResult.finalArtifact?.segments[0]?.text).toBe('hello there general kenobi');
    expect(commits.some((entry) => entry.eventName === 'take_transcript_finalized')).toBe(true);
  });

  test('reports degraded state when the speech backend cannot start', async () => {
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: false as const,
        reason: 'missing_workpiece_context',
        workspaceId: null,
        workpieceId: null,
      }),
      commitJsonArtifact: async () => ({
        ok: false as const,
        reason: 'unexpected',
      }),
      startSpeech: async () => false,
      stopSpeech: jest.fn(),
      localStorage: { setItem: jest.fn() },
    });

    const strategy = selectBestRecordingStrategy({
      mode: 'av',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    const startResult = await controller.startSession({
      captureSessionId: 'capture-2',
      recordingStartedAtMs: Date.now(),
      strategy,
    });
    const finalResult: RecordingTranscriptFinalizeResult = await controller.stopSession({
      mediaDurationMs: 400,
    });

    expect(startResult.status).toBe('degraded');
    expect(startResult.degradedReason).toBe('speech-backend-unavailable');
    expect(finalResult.status).toBe('degraded');
    expect(finalResult.degradedReason).toBe('no-transcript-captured');
    expect(finalResult.finalArtifact).toBeNull();
  });

  test('does not append growing interim hypotheses to canonical transcript and clears pending after finalize', async () => {
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-1',
        workpieceId: 'workpiece-1',
        createdCradle: false,
        plannerRecordingSessionId: 'planner-1',
        captureSessionId: 'capture-3',
      }),
      commitJsonArtifact: async () => ({
        ok: true as const,
        status: 200,
        workpieceId: 'workpiece-1',
        path: 'ok',
      }),
      startSpeech: async () => true,
      stopSpeech: jest.fn(),
      localStorage: { setItem: jest.fn() },
    });

    const states: Array<any> = [];
    const onState = (event: Event) => {
      states.push((event as CustomEvent).detail);
    };
    window.addEventListener('tp:recording:transcript-state', onState as EventListener);

    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    await controller.startSession({
      captureSessionId: 'capture-3',
      recordingStartedAtMs: Date.now() - 2_000,
      strategy,
    });

    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Driving through northern...',
        final: false,
        isFinal: false,
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Driving through northern Orlando...',
        final: false,
        isFinal: false,
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Driving through northern Orlando on Orange Blossom Trail...',
        final: false,
        isFinal: false,
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Driving through northern Orlando on Orange Blossom Trail used to smell amazing.',
        final: true,
        isFinal: true,
      },
    }));

    const finalResult = await controller.stopSession({
      mediaDurationMs: 5_000,
      mediaPath: 'recordings/example.webm',
      contentType: 'audio/webm',
    });

    window.removeEventListener('tp:recording:transcript-state', onState as EventListener);

    expect(finalResult.finalArtifact?.segments).toHaveLength(1);
    expect(finalResult.finalArtifact?.segments[0]?.text).toBe(
      'Driving through northern Orlando on Orange Blossom Trail used to smell amazing.',
    );
    expect(
      states.some((state) => state && state.status === 'ready' && state.partialText == null),
    ).toBe(true);
  });

  test('finalizes pending interim exactly once on stop and does not append again on repeated stop', async () => {
    const controller = new RecordingTranscriptController({
      ensureCaptureTarget: async () => ({
        ok: true as const,
        workspaceId: 'workspace-1',
        workpieceId: 'workpiece-1',
        createdCradle: false,
        plannerRecordingSessionId: 'planner-1',
        captureSessionId: 'capture-4',
      }),
      commitJsonArtifact: async () => ({
        ok: true as const,
        status: 200,
        workpieceId: 'workpiece-1',
        path: 'ok',
      }),
      startSpeech: async () => true,
      stopSpeech: jest.fn(),
      localStorage: { setItem: jest.fn() },
    });

    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: { isTypeSupported: () => true },
    });

    await controller.startSession({
      captureSessionId: 'capture-4',
      recordingStartedAtMs: Date.now() - 1_000,
      strategy,
    });

    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'pending interim phrase',
        final: false,
        isFinal: false,
      },
    }));

    const firstStop = await controller.stopSession({
      mediaDurationMs: 3_000,
      mediaPath: 'recordings/example.webm',
      contentType: 'audio/webm',
    });
    const secondStop = await controller.stopSession({
      mediaDurationMs: 3_100,
      mediaPath: 'recordings/example.webm',
      contentType: 'audio/webm',
    });

    expect(firstStop.finalArtifact?.segments).toHaveLength(1);
    expect(firstStop.finalArtifact?.segments[0]?.text).toBe('pending interim phrase');
    expect(secondStop.finalArtifact?.segments).toHaveLength(1);
    expect(secondStop.finalArtifact?.segments[0]?.text).toBe('pending interim phrase');
  });
});
