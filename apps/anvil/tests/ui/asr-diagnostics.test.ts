import {
  buildAsrAudioChunkStaleDiagnostic,
  buildAsrBridgeTrapDetectedDiagnostic,
  buildAsrBackendHeartbeatDiagnostic,
  buildAsrBackendRestartCompletedDiagnostic,
  buildAsrBackendRestartRequestedDiagnostic,
  buildAsrBackendTranscriptStaleDiagnostic,
  buildProofOwnedPrimaryCommitGuardBaseParts,
  buildRecoverySkipNonAdjacentTargetGuardBaseParts,
} from '../../src/features/asr/asr-diagnostics';

describe('ASR backend liveness diagnostics builders', () => {
  test('builds backend heartbeat diagnostic with expected tag and fields', () => {
    const line = buildAsrBackendHeartbeatDiagnostic({
      recognizerAttached: true,
      speechActive: false,
      activeReadMode: true,
      transcriptAgeMs: Number.NaN,
      audioAgeMs: 1234.7,
      backendRestartedInWindow: false,
    });
    expect(line).toContain('[ASR_BACKEND_HEARTBEAT]');
    expect(line).toContain('live=1');
    expect(line).toContain('asrArmed=1');
    expect(line).toContain('recognizerAttached=1');
    expect(line).toContain('speechActive=0');
    expect(line).toContain('activeReadMode=1');
    expect(line).toContain('transcriptAgeMs=-1');
    expect(line).toContain('audioAgeMs=1235');
    expect(line).toContain('restartedInWindow=0');
  });

  test('builds backend transcript stale diagnostic with expected tag and field order pattern', () => {
    const line = buildAsrBackendTranscriptStaleDiagnostic({
      ageMs: Number.POSITIVE_INFINITY,
      thresholdMs: 9000,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: true,
    });
    expect(line).toBe(
      '[ASR_BACKEND_TRANSCRIPT_STALE] ageMs=Infinity thresholdMs=9000 recognizerAttached=1 speechActive=1 activeReadMode=1',
    );
  });

  test('builds audio chunk stale diagnostic with expected tag and fields', () => {
    const line = buildAsrAudioChunkStaleDiagnostic({
      ageMs: 9001.2,
      thresholdMs: 7000,
      recognizerAttached: false,
      speechActive: true,
    });
    expect(line).toBe(
      '[ASR_AUDIO_CHUNK_STALE] ageMs=9001 thresholdMs=7000 recognizerAttached=0 speechActive=1',
    );
  });

  test('builds restart requested diagnostics for all current variants', () => {
    const alreadyRestarted = buildAsrBackendRestartRequestedDiagnostic({
      skipped: 1,
      reason: 'backend_transcript_starvation',
      skipReason: 'already_restarted_in_window',
      windowMs: 30000,
      transcriptAgeMs: Number.POSITIVE_INFINITY,
      audioAgeMs: 123.4,
    });
    expect(alreadyRestarted).toBe(
      '[ASR_BACKEND_RESTART_REQUESTED] skipped=1 reason=backend_transcript_starvation skipReason=already_restarted_in_window windowMs=30000 transcriptAgeMs=Infinity audioAgeMs=123',
    );

    const controlsUnavailable = buildAsrBackendRestartRequestedDiagnostic({
      skipped: 1,
      reason: 'backend_transcript_starvation',
      skipReason: 'recognizer_controls_unavailable',
      transcriptAgeMs: 9000.4,
      audioAgeMs: Number.POSITIVE_INFINITY,
    });
    expect(controlsUnavailable).toBe(
      '[ASR_BACKEND_RESTART_REQUESTED] skipped=1 reason=backend_transcript_starvation skipReason=recognizer_controls_unavailable transcriptAgeMs=9000 audioAgeMs=Infinity',
    );

    const requested = buildAsrBackendRestartRequestedDiagnostic({
      skipped: 0,
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: 9000.4,
      audioAgeMs: 1000.5,
      current: 12,
    });
    expect(requested).toBe(
      '[ASR_BACKEND_RESTART_REQUESTED] skipped=0 reason=backend_transcript_starvation transcriptAgeMs=9000 audioAgeMs=1001 current=12',
    );
  });

  test('builds restart completed diagnostic with expected tag and fields', () => {
    const line = buildAsrBackendRestartCompletedDiagnostic({
      reason: 'backend_transcript_starvation',
      current: 7,
      commitIndex: 6,
      scrollTop: 432.8,
    });
    expect(line).toBe(
      '[ASR_BACKEND_RESTART_COMPLETED] reason=backend_transcript_starvation current=7 commitIndex=6 scrollTop=433',
    );
  });

  test('builds bridge trap detected diagnostic with expected tag and field pattern', () => {
    const line = buildAsrBridgeTrapDetectedDiagnostic({
      current: 11,
      bestIdx: 14,
      requestedTarget: 15,
      adjacentTarget: 12,
      skipped: '[cue,meta]',
      repeatedHoldCount: 4,
      noCommitMs: 3550.2,
      proofSource: 'strict_bridge_landing_lexical_tail',
      textPreview: 'preview text',
    });
    expect(line).toBe(
      '[ASR_BRIDGE_TRAP_DETECTED] current=11 bestIdx=14 requestedTarget=15 adjacentTarget=12 skipped=[cue,meta] repeatedHoldCount=4 noCommitMs=3550 blockerReason=bridge_or_non_adjacent_guard proofSource=strict_bridge_landing_lexical_tail textPreview="preview text"',
    );
  });

  test('builds proof-owned primary commit guard base parts with expected fields/order', () => {
    const parts = buildProofOwnedPrimaryCommitGuardBaseParts({
      current: 3,
      target: 5,
      bestIdx: 6,
      proofSource: 'live_strict_local_proof_ok',
      skippedIgnorableLines: ['cue', 'blank'],
    });
    expect(parts).toEqual([
      'current=3',
      'target=5',
      'bestIdx=6',
      'proofSource=live_strict_local_proof_ok',
      'skippedIgnorableLines=[cue,blank]',
    ]);
  });

  test('proof-owned primary guard base parts preserves empty skipped list behavior', () => {
    const parts = buildProofOwnedPrimaryCommitGuardBaseParts({
      current: 1,
      target: 2,
      bestIdx: 2,
      proofSource: 'short_fragment_adjacent_progression',
      skippedIgnorableLines: [],
    });
    expect(parts[4]).toBe('skippedIgnorableLines=[]');
  });

  test('proof-owned primary guard base parts builder is pure and does not mutate input', () => {
    const input = {
      current: 9,
      target: 10,
      bestIdx: 10,
      proofSource: 'strict_speakable_bridge_landing',
      skippedIgnorableLines: ['cue'],
    };
    const before = [...input.skippedIgnorableLines];
    const parts = buildProofOwnedPrimaryCommitGuardBaseParts(input);
    expect(input.skippedIgnorableLines).toEqual(before);
    expect(parts).not.toBe(input.skippedIgnorableLines);
  });

  test('builds recovery skip non-adjacent target guard base parts with expected fields/order', () => {
    const parts = buildRecoverySkipNonAdjacentTargetGuardBaseParts({
      current: 4,
      requested: 10,
      adjacentTarget: 5,
      sourceBranch: 'soft_runtime_rebase',
    });
    expect(parts).toEqual([
      'current=4',
      'requested=10',
      'adjacentTarget=5',
      'sourceBranch=soft_runtime_rebase',
    ]);
  });

  test('recovery skip non-adjacent target guard base parts preserves optional-like source values', () => {
    const parts = buildRecoverySkipNonAdjacentTargetGuardBaseParts({
      current: 7,
      requested: 9,
      adjacentTarget: 8,
      sourceBranch: 'unknown',
    });
    expect(parts[3]).toBe('sourceBranch=unknown');
  });

  test('recovery skip non-adjacent target builder is pure and does not mutate input', () => {
    const input = {
      current: 3,
      requested: 11,
      adjacentTarget: 4,
      sourceBranch: 'pending-cap-bypass-precap',
    };
    const before = { ...input };
    const parts = buildRecoverySkipNonAdjacentTargetGuardBaseParts(input);
    expect(input).toEqual(before);
    expect(parts).toEqual([
      'current=3',
      'requested=11',
      'adjacentTarget=4',
      'sourceBranch=pending-cap-bypass-precap',
    ]);
  });
});
