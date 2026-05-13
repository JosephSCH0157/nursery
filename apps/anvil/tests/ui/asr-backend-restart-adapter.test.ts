import { buildBackendRestartRequestedPayloadInput } from '../../src/features/asr/asr-backend-restart-adapter';

describe('ASR backend restart adapter payload shaping', () => {
  test('restart skipped when already restarted in window', () => {
    const payload = buildBackendRestartRequestedPayloadInput({
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: Number.POSITIVE_INFINITY,
      audioAgeMs: 123.4,
      current: 10,
      backendRestartedInWindow: true,
      hasRecognizerControls: true,
      restartWindowMs: 30000,
    });
    expect(payload).toEqual({
      skipped: 1,
      reason: 'backend_transcript_starvation',
      skipReason: 'already_restarted_in_window',
      windowMs: 30000,
      transcriptAgeMs: Number.POSITIVE_INFINITY,
      audioAgeMs: 123.4,
    });
  });

  test('restart skipped when recognizer controls unavailable', () => {
    const payload = buildBackendRestartRequestedPayloadInput({
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: 9000.4,
      audioAgeMs: Number.POSITIVE_INFINITY,
      current: 12,
      backendRestartedInWindow: false,
      hasRecognizerControls: false,
      restartWindowMs: 30000,
    });
    expect(payload).toEqual({
      skipped: 1,
      reason: 'backend_transcript_starvation',
      skipReason: 'recognizer_controls_unavailable',
      transcriptAgeMs: 9000.4,
      audioAgeMs: Number.POSITIVE_INFINITY,
    });
  });

  test('restart requested normally', () => {
    const payload = buildBackendRestartRequestedPayloadInput({
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: 9000.4,
      audioAgeMs: 1000.5,
      current: 12,
      backendRestartedInWindow: false,
      hasRecognizerControls: true,
      restartWindowMs: 30000,
    });
    expect(payload).toEqual({
      skipped: 0,
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: 9000.4,
      audioAgeMs: 1000.5,
      current: 12,
    });
  });

  test('builder is pure and does not mutate input', () => {
    const input = {
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: 1,
      audioAgeMs: 2,
      current: 3,
      backendRestartedInWindow: false,
      hasRecognizerControls: true,
      restartWindowMs: 30000,
    };
    const before = { ...input };
    buildBackendRestartRequestedPayloadInput(input);
    expect(input).toEqual(before);
  });
});
