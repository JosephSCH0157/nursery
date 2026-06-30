import { evaluateBackendLiveness, type BackendLivenessInput } from '../../src/features/asr/asr-backend-liveness';

const baseThresholds = {
  heartbeatMs: 5000,
  transcriptStaleMs: 9000,
  audioChunkStaleMs: 7000,
  restartWindowMs: 30000,
  firstTranscriptGraceMs: 4000,
};

function buildInput(overrides: Partial<BackendLivenessInput> = {}): BackendLivenessInput {
  return {
    now: 10_000,
    liveAsr: true,
    asrArmed: true,
    recognizerAttached: true,
    recognizerAttachedAt: 9_000,
    speechActive: true,
    activeReadMode: false,
    lastTranscriptPacketAt: 9_500,
    lastTransportVoiceFinalAt: null,
    lastSemanticProgressAt: 9_500,
    lastAudioChunkAt: 9_500,
    lastBackendHeartbeatAt: null,
    lastBackendTranscriptStaleAt: null,
    lastBackendAudioStaleAt: null,
    backendRestartWindowStartedAt: null,
    backendRestartedInWindow: false,
    thresholds: baseThresholds,
    ...overrides,
  };
}

describe('ASR backend liveness decision helper', () => {
  test('recognizer attached but first transcript grace active does not emit transcript stale or restart', () => {
    const decision = evaluateBackendLiveness(buildInput({
      recognizerAttachedAt: 8_000,
      lastTranscriptPacketAt: null,
      speechActive: true,
      activeReadMode: false,
    }));

    expect(decision.firstTranscriptGraceActive).toBe(true);
    expect(decision.shouldEmitTranscriptStale).toBe(false);
    expect(decision.shouldRequestRestart).toBe(false);
  });

  test('grace expired with speech active and no transcript emits transcript stale and requests restart', () => {
    const decision = evaluateBackendLiveness(buildInput({
      recognizerAttachedAt: 0,
      lastTranscriptPacketAt: null,
      speechActive: true,
      activeReadMode: false,
    }));

    expect(decision.firstTranscriptGraceActive).toBe(false);
    expect(decision.shouldEmitTranscriptStale).toBe(true);
    expect(decision.shouldRequestRestart).toBe(true);
  });

  test('grace expired with activeReadMode true and no transcript emits transcript stale', () => {
    const decision = evaluateBackendLiveness(buildInput({
      recognizerAttachedAt: 0,
      lastTranscriptPacketAt: null,
      speechActive: false,
      activeReadMode: true,
    }));

    expect(decision.shouldEmitTranscriptStale).toBe(true);
  });

  test('fresh transcript does not emit transcript stale or request restart', () => {
    const decision = evaluateBackendLiveness(buildInput({
      lastTransportVoiceFinalAt: 9_900,
      speechActive: true,
    }));

    expect(decision.shouldEmitTranscriptStale).toBe(false);
    expect(decision.shouldRequestRestart).toBe(false);
  });

  test('fresh voice-backed transport prevents transcript stale even when semantic progress is old', () => {
    const decision = evaluateBackendLiveness(buildInput({
      lastTranscriptPacketAt: 500,
      lastTransportVoiceFinalAt: 9_700,
      lastSemanticProgressAt: 500,
      speechActive: true,
      activeReadMode: true,
    }));

    expect(decision.transcriptAgeMs).toBe(300);
    expect(decision.semanticProgressAgeMs).toBe(9500);
    expect(decision.shouldEmitTranscriptStale).toBe(false);
    expect(decision.shouldRequestRestart).toBe(false);
  });

  test('transport stale still triggers restart even if semantic progress is fresh', () => {
    const decision = evaluateBackendLiveness(buildInput({
      lastTranscriptPacketAt: 9_700,
      lastTransportVoiceFinalAt: 200,
      lastSemanticProgressAt: 9_900,
      speechActive: true,
      activeReadMode: true,
    }));

    expect(decision.transcriptAgeMs).toBe(9800);
    expect(decision.semanticProgressAgeMs).toBe(100);
    expect(decision.shouldEmitTranscriptStale).toBe(true);
    expect(decision.shouldRequestRestart).toBe(true);
  });

  test('audio chunk stale emits audio stale', () => {
    const decision = evaluateBackendLiveness(buildInput({
      lastAudioChunkAt: 2_000,
    }));

    expect(decision.shouldEmitAudioStale).toBe(true);
  });

  test('when already restarted in window, transcript stale can emit but restart request is skipped with reason', () => {
    const decision = evaluateBackendLiveness(buildInput({
      recognizerAttachedAt: 0,
      lastTranscriptPacketAt: null,
      backendRestartedInWindow: true,
      speechActive: true,
    }));

    expect(decision.shouldEmitTranscriptStale).toBe(true);
    expect(decision.shouldRequestRestart).toBe(false);
    expect(decision.restartSkipReason).toBe('already_restarted_in_window');
  });

  test('inactive, unarmed, or detached sessions do not check or emit stale signals', () => {
    const inactive = evaluateBackendLiveness(buildInput({ liveAsr: false }));
    expect(inactive.shouldCheck).toBe(false);
    expect(inactive.shouldEmitAudioStale).toBe(false);
    expect(inactive.shouldEmitTranscriptStale).toBe(false);
    expect(inactive.shouldRequestRestart).toBe(false);

    const unarmed = evaluateBackendLiveness(buildInput({ asrArmed: false }));
    expect(unarmed.shouldCheck).toBe(false);
    expect(unarmed.shouldEmitAudioStale).toBe(false);
    expect(unarmed.shouldEmitTranscriptStale).toBe(false);
    expect(unarmed.shouldRequestRestart).toBe(false);

    const detached = evaluateBackendLiveness(buildInput({ recognizerAttached: false }));
    expect(detached.shouldCheck).toBe(false);
    expect(detached.shouldEmitAudioStale).toBe(false);
    expect(detached.shouldEmitTranscriptStale).toBe(false);
    expect(detached.shouldRequestRestart).toBe(false);
  });
});
