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
});