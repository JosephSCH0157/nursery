import {
  classifyAsrStall,
  resolveAsrLiveScrollStall,
  shouldClassifyBackendTranscriptStall,
  shouldClassifyBridgeTrap,
  shouldClassifyScrollCommitStall,
} from '../../src/features/asr/asr-stall-classifier';

describe('ASR stall classifier', () => {
  test('fresh transcript plus repeated bridge holds classifies as bridge_trap', () => {
    const result = classifyAsrStall({
      liveAsr: true,
      asrArmed: true,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: false,
      firstTranscriptGraceActive: false,
      transcriptAgeMs: 200,
      transcriptStaleMs: 9000,
      lastCommitIndex: 5,
      currentCursorIndex: 5,
      noCommitMs: 3600,
      commitGapMs: 1500,
      explicitNoMatch: false,
      liveTranscriptFresh: true,
      repeatedHoldCount: 4,
      conf: 0.7,
      requestedTarget: 9,
      adjacentTarget: 6,
    });
    expect(result).toEqual({ active: true, kind: 'bridge_trap' });
  });

  test('backend transcript stale classifies as backend_transcript_stall', () => {
    expect(shouldClassifyBackendTranscriptStall({
      liveAsr: true,
      asrArmed: true,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: false,
      firstTranscriptGraceActive: false,
      transcriptAgeMs: 9500,
      transcriptStaleMs: 9000,
    })).toBe(true);
  });

  test('transcript fresh but no commit classifies as scroll_commit_stall per current semantics', () => {
    const result = classifyAsrStall({
      liveAsr: true,
      asrArmed: true,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: true,
      firstTranscriptGraceActive: false,
      transcriptAgeMs: 300,
      transcriptStaleMs: 9000,
      lastCommitIndex: 12,
      currentCursorIndex: 12,
      noCommitMs: 2600,
      commitGapMs: 1500,
      explicitNoMatch: false,
      liveTranscriptFresh: true,
      repeatedHoldCount: 1,
      conf: 0.2,
      requestedTarget: 12,
      adjacentTarget: 12,
    });
    expect(result).toEqual({ active: true, kind: 'scroll_commit_stall' });
  });

  test('startup first-transcript grace does not classify as backend stale', () => {
    expect(shouldClassifyBackendTranscriptStall({
      liveAsr: true,
      asrArmed: true,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: false,
      firstTranscriptGraceActive: true,
      transcriptAgeMs: null,
      transcriptStaleMs: 9000,
    })).toBe(false);
  });

  test('explicit off-script/noMatch blocks scroll stall classification', () => {
    expect(shouldClassifyScrollCommitStall({
      lastCommitIndex: 8,
      noCommitMs: 4000,
      commitGapMs: 1500,
      currentCursorIndex: 8,
      explicitNoMatch: true,
    })).toBe(false);
  });

  test('inactive/unarmed/detached input produces no active stall classification', () => {
    const inactive = classifyAsrStall({
      liveAsr: false,
      asrArmed: true,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: true,
      firstTranscriptGraceActive: false,
      transcriptAgeMs: 10000,
      transcriptStaleMs: 9000,
      lastCommitIndex: 1,
      currentCursorIndex: 1,
      noCommitMs: 5000,
      commitGapMs: 1500,
      explicitNoMatch: false,
      liveTranscriptFresh: false,
      repeatedHoldCount: 0,
      conf: 0,
      requestedTarget: 1,
      adjacentTarget: 1,
    });
    expect(inactive).toEqual({ active: false, kind: 'none' });
  });

  test('bridge trap helper predicate stays stable for normal evidence', () => {
    expect(shouldClassifyBridgeTrap({
      liveTranscriptFresh: true,
      conf: 0.65,
      speechActive: true,
      activeReadMode: false,
      requestedTarget: 10,
      currentLine: 8,
      adjacentTarget: 9,
      repeatedHoldCount: 3,
      stallMs: 3500,
    })).toBe(true);
  });

  test('late live visual stall picks safe capped recovery when movement is allowed', () => {
    const result = resolveAsrLiveScrollStall({
      liveAsr: true,
      movementAllowed: true,
      speechFresh: true,
      audioFresh: true,
      backendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: false,
      noVisualProgressMs: 2400,
      noVisualProgressThresholdMs: 1800,
      currentLineIdx: 82,
      allowedTargetIdx: 83,
      acceptedCommitTargetIdx: 84,
      lastAcceptedProofLine: 83,
      cappedTargetSafe: true,
      targetDebtPx: 188,
      transcriptAgeMs: 600,
      transcriptStaleMs: 9000,
      pocketState: 'bottom_locked',
    });
    expect(result.active).toBe(true);
    expect(result.backendTranscriptStale).toBe(false);
    expect(result.recoveryAction).toBe('safe_capped_recovery');
    expect(result.recoveryTargetIdx).toBe(83);
  });

  test('stale backend with no safe target becomes unrecoverable instead of silently inventing one', () => {
    const result = resolveAsrLiveScrollStall({
      liveAsr: true,
      movementAllowed: true,
      speechFresh: false,
      audioFresh: true,
      backendFresh: false,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: false,
      noVisualProgressMs: 2600,
      noVisualProgressThresholdMs: 1800,
      currentLineIdx: 82,
      allowedTargetIdx: null,
      acceptedCommitTargetIdx: 84,
      lastAcceptedProofLine: 82,
      cappedTargetSafe: false,
      targetDebtPx: 154,
      transcriptAgeMs: 9800,
      transcriptStaleMs: 9000,
      pocketState: 'near_lower_rail',
    });
    expect(result.active).toBe(true);
    expect(result.backendTranscriptStale).toBe(true);
    expect(result.recoveryAction).toBe('unrecoverable');
    expect(result.recoveryTargetIdx).toBeNull();
  });
});
