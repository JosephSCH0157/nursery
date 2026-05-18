import { AsrAlignmentEpisodeTracker } from '../../src/features/asr/asr-alignment-episodes';

describe('ASR alignment episode diagnostics', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    delete (window as any).__asrLogBufferInstalled;
    jest.restoreAllMocks();
  });

  test('emits bottom-lock geometry diag exactly once for bottom_locked episodes', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 8,
      requestedTarget: 8,
      acceptedCommitTarget: 8,
      proofSource: 'fresh_commit',
      authorityPath: 'strict_adjacent',
    });
    tracker.noteCommit({
      scrollTopBefore: 100,
      scrollTopAfter: 140,
      targetScrollTop: 155,
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 490,
      nextSpeakableLineY: 514,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      targetDeltaPx: 72,
      velocityPxps: 14,
      reason: 'next_line_within_preferred_pocket',
    });
    tracker.noteSnapSuppressed({ reason: 'live_target_follow_motor' });
    tracker.noteFollow({
      deltaLines: 1.5,
      reason: 'snap_suppressed',
      targetDeltaPx: 36,
      velocityPxps: 12,
    });
    const closed = tracker.close('completed');
    expect(closed?.visualOutcome).toBe('bottom_locked');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.filter((line) => line.includes('ASR_ALIGNMENT_EPISODE'))).toHaveLength(1);
    const diagLines = lines.filter((line) => line.includes('ASR_BOTTOM_LOCK_GEOMETRY_DIAG'));
    expect(diagLines).toHaveLength(1);
    expect(diagLines[0]).toContain('pocketZone=bottom');
    expect(diagLines[0]).toContain('lastAction=pursued');
    expect(diagLines[0]).toContain('lastComfortReason=next_line_within_preferred_pocket');
    expect(diagLines[0]).toContain('lastVisualTargetDeltaPx=36');
    expect(diagLines[0]).toContain('lastVisualVelocityPxps=12');
    expect(diagLines[0]).toContain('snapSuppressedInEpisode=1');

    infoSpy.mockRestore();
  });

  test.each([
    {
      name: 'in_pocket',
      comfort: { markerY: 390, currentLineY: 420, nextSpeakableLineY: 438 },
      reason: 'settled',
    },
    {
      name: 'top_pressure',
      comfort: { markerY: 390, currentLineY: 320, nextSpeakableLineY: 335 },
      reason: 'top_guard',
    },
    {
      name: 'delayed_until_starvation',
      comfort: { markerY: 390, currentLineY: 420, nextSpeakableLineY: 438 },
      reason: 'delayed',
      stallDelayMs: 1600,
    },
    {
      name: 'bridge_wait',
      comfort: { markerY: 390, currentLineY: 420, nextSpeakableLineY: 438 },
      reason: 'bridge_context',
      closeReason: 'bridge_wait',
    },
    {
      name: 'unknown',
      comfort: { markerY: Number.NaN, currentLineY: Number.NaN, nextSpeakableLineY: Number.NaN },
      reason: 'none',
    },
  ])('does not emit bottom-lock geometry diag for $name episodes', ({ comfort, reason, stallDelayMs, closeReason }) => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 4,
      requestedTarget: 4,
      acceptedCommitTarget: 4,
      proofSource: 'fresh_commit',
      authorityPath: 'strict_adjacent',
    });
    tracker.noteCommit({
      scrollTopBefore: 90,
      scrollTopAfter: 110,
      targetScrollTop: 115,
    });
    tracker.noteComfort({
      ...comfort,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason,
    });
    if (typeof stallDelayMs === 'number') {
      tracker.noteStallDelay(stallDelayMs, 'starvation');
    }
    const closed = tracker.close(closeReason || 'completed');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.filter((line) => line.includes('ASR_BOTTOM_LOCK_GEOMETRY_DIAG'))).toHaveLength(0);

    infoSpy.mockRestore();
  });

  test('emits delayed suppression autopsy for delayed snap-suppressed episodes', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 23,
      requestedTarget: 25,
      acceptedCommitTarget: 24,
      proofSource: 'strict_speakable_bridge_landing',
      authorityPath: 'movement_authority_forced_reconcile_single_step',
    });
    tracker.noteCommit({
      scrollTopBefore: 1702,
      scrollTopAfter: 1702,
      targetScrollTop: 1791,
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 412,
      nextSpeakableLineY: 480,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'marker_error_within_tolerance',
    });
    tracker.noteHeartbeat({
      transcriptAgeMs: 841,
      audioAgeMs: 634,
    });
    tracker.noteAutopsyState({
      runKey: 'run-1',
      runGeneration: 7,
      nextSpeakableLineIdx: 25,
      desiredLineY: 467,
      tolerancePx: 20,
      holdTolerancePx: 12,
      lastGuardReason: 'asr_recovery_chain_blocked',
      lastHudGuardText: 'Hold: waiting for direct adjacent ASR match',
      lastSelectedAuthority: 'comfort_nudge',
      lastVisualAction: 'snap_suppressed',
      lastVisualErrorPx: 17,
      speechActive: true,
      finalPacketFresh: true,
      transcriptGrowing: false,
    });
    tracker.noteSnapSuppressed({ reason: 'live_asr_marker_lock_suppressed' });
    tracker.noteStallDelay(2065, 'asr_recovery_chain_blocked');
    const closed = tracker.close('superseded_by_new_commit');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    const autopsyLines = lines.filter((line) => line.includes('ASR_DELAYED_SUPPRESSION_AUTOPSY'));
    expect(autopsyLines).toHaveLength(1);
    expect(autopsyLines[0]).toContain('blockerCategory=recovery_chain_blocked');
    expect(autopsyLines[0]).toContain('lastGuardReason=asr_recovery_chain_blocked');
    expect(autopsyLines[0]).toContain('snapSuppressedInEpisode=1');

    infoSpy.mockRestore();
  });

  test('emits delayed suppression autopsy from the superseded close path used by live runtime', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 14,
      requestedTarget: 16,
      acceptedCommitTarget: 15,
      proofSource: 'strict_speakable_bridge_landing',
      authorityPath: 'movement_authority_forced_reconcile_single_step',
      sourceHoldReason: 'movement_authority_reconcile',
      reason: 'movement_authority_commit',
    });
    tracker.noteCommit({
      scrollTopBefore: 1012,
      scrollTopAfter: 1012,
      targetScrollTop: 1101,
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 406,
      nextSpeakableLineY: 478,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'marker_error_within_tolerance',
    });
    tracker.noteAutopsyState({
      runKey: 'runtime-close-path',
      runGeneration: 3,
      nextSpeakableLineIdx: 16,
      desiredLineY: 467,
      tolerancePx: 20,
      holdTolerancePx: 12,
      lastGuardReason: 'asr_live_no_adjacent_match_hold',
      lastHudGuardText: 'Hold: waiting for direct adjacent ASR match',
      lastSelectedAuthority: 'comfort_nudge',
      lastVisualAction: 'snap_suppressed',
      lastVisualErrorPx: 17,
      speechActive: true,
      finalPacketFresh: true,
      transcriptGrowing: true,
    });
    tracker.noteSnapSuppressed({ reason: 'live_asr_marker_lock_suppressed' });
    tracker.noteStallDelay(1785, 'asr_live_no_adjacent_match_hold');

    tracker.begin({
      currentLine: 15,
      requestedTarget: 16,
      acceptedCommitTarget: 16,
      proofSource: 'live_strict_local_proof_ok',
      authorityPath: 'movement_authority_proof',
    });

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    const episodeLines = lines.filter((line) => line.includes('ASR_ALIGNMENT_EPISODE'));
    const autopsyLines = lines.filter((line) => line.includes('ASR_DELAYED_SUPPRESSION_AUTOPSY'));
    expect(episodeLines).toHaveLength(1);
    expect(autopsyLines).toHaveLength(1);
    expect(autopsyLines[0]).toContain('blockerCategory=no_adjacent_match_hold');
    expect(autopsyLines[0]).toContain('episodeId=ae-1');

    infoSpy.mockRestore();
  });

  test('emits delayed suppression autopsy with no_adjacent_match_hold blocker label', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 24,
      requestedTarget: 25,
      acceptedCommitTarget: 25,
      proofSource: 'live_strict_local_proof_ok',
      authorityPath: 'movement_authority_proof',
    });
    tracker.noteCommit({
      scrollTopBefore: 1723,
      scrollTopAfter: 1723,
      targetScrollTop: 1859,
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 459,
      nextSpeakableLineY: 459,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'marker_error_within_tolerance',
    });
    tracker.noteAutopsyState({
      lastGuardReason: 'asr_live_no_adjacent_match_hold',
      lastHudGuardText: 'Hold: waiting for direct adjacent ASR match',
      nextSpeakableLineIdx: 25,
    });
    tracker.noteSnapSuppressed({ reason: 'live_asr_marker_lock_suppressed' });
    tracker.noteStallDelay(1633, 'asr_live_no_adjacent_match_hold');
    const closed = tracker.close('superseded_by_new_commit');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    const autopsyLine = lines.find((line) => line.includes('ASR_DELAYED_SUPPRESSION_AUTOPSY')) || '';
    expect(autopsyLine).toContain('blockerCategory=no_adjacent_match_hold');

    infoSpy.mockRestore();
  });

  test('does not emit delayed suppression autopsy for normal in_pocket episode', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 8,
      requestedTarget: 9,
      acceptedCommitTarget: 9,
      proofSource: 'fresh_commit',
      authorityPath: 'strict_adjacent',
    });
    tracker.noteCommit({
      scrollTopBefore: 100,
      scrollTopAfter: 140,
      targetScrollTop: 155,
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 420,
      nextSpeakableLineY: 438,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'settled',
    });
    const closed = tracker.close('completed');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_DELAYED_SUPPRESSION_AUTOPSY'))).toBe(false);

    infoSpy.mockRestore();
  });

  test('emits dump-path proof directly alongside alignment episode in dev mode', () => {
    window.history.replaceState({}, '', '/?dev=1');
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 11,
      requestedTarget: 13,
      acceptedCommitTarget: 12,
      proofSource: 'strict_speakable_bridge_landing',
      authorityPath: 'movement_authority_reconcile',
      reason: 'movement_authority_commit',
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 420,
      nextSpeakableLineY: 478,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'marker_error_within_tolerance',
    });
    tracker.noteSnapSuppressed({ reason: 'live_asr_marker_lock_suppressed' });
    tracker.noteStallDelay(1800, 'asr_recovery_chain_blocked');
    const closed = tracker.close('superseded_by_new_commit');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_ALIGNMENT_EPISODE'))).toBe(true);
    const proofLine = lines.find((line) => line.includes('ASR_ALIGNMENT_EPISODE_DUMP_PATH_PROOF')) || '';
    expect(proofLine).toContain('wouldQualifyDelayedSuppressionAutopsy=1');
    expect(proofLine).toContain('delayedAutopsyGateReason=reason_chain_live_asr_marker_lock_suppressed');
    expect(proofLine).toContain('wouldQualifyDeadScreenAutopsy=0');
  });

  test('qualifies delayed suppression autopsy on superseded_by_new_commit even without snap-suppressed action', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 31,
      requestedTarget: 33,
      acceptedCommitTarget: 32,
      proofSource: 'strict_speakable_bridge_landing',
      authorityPath: 'movement_authority_reconcile',
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 421,
      nextSpeakableLineY: 474,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'marker_error_within_tolerance',
    });
    tracker.noteStallDelay(1810, 'asr_recovery_chain_blocked');
    const closed = tracker.close('superseded_by_new_commit');
    tracker.dumpForConsole(closed || undefined);

    const lines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    const autopsyLine = lines.find((line) => line.includes('ASR_DELAYED_SUPPRESSION_AUTOPSY')) || '';
    expect(autopsyLine).toContain('supersededByNewCommit=1');
  });

  test('optional diagnostic failure does not suppress ASR_ALIGNMENT_EPISODE or sibling error visibility', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation((line?: unknown) => {
      if (String(line || '').includes('ASR_DELAYED_SUPPRESSION_AUTOPSY')) {
        throw new Error('synthetic-autopsy-failure');
      }
    });
    const tracker = new AsrAlignmentEpisodeTracker();

    tracker.begin({
      currentLine: 18,
      requestedTarget: 20,
      acceptedCommitTarget: 19,
      proofSource: 'strict_speakable_bridge_landing',
      authorityPath: 'movement_authority_reconcile',
      reason: 'movement_authority_commit',
    });
    tracker.noteComfort({
      markerY: 390,
      currentLineY: 420,
      nextSpeakableLineY: 480,
      preferredBandTop: 300,
      preferredSettleBottom: 430,
      preferredBandBottom: 450,
      toleratedBandBottom: 491,
      reason: 'marker_error_within_tolerance',
    });
    tracker.noteSnapSuppressed({ reason: 'live_asr_marker_lock_suppressed' });
    tracker.noteStallDelay(1900, 'asr_recovery_chain_blocked');
    const closed = tracker.close('superseded_by_new_commit');
    tracker.dumpForConsole(closed || undefined);

    const infoLines = infoSpy.mock.calls.map((call) => String(call[0] || ''));
    const warnLines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(infoLines.some((line) => line.includes('ASR_ALIGNMENT_EPISODE'))).toBe(true);
    expect(warnLines.some((line) => line.includes('ASR_OPTIONAL_DIAGNOSTIC_ERROR') && line.includes('diagnosticTag=ASR_DELAYED_SUPPRESSION_AUTOPSY'))).toBe(true);
  });
});
