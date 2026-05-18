import { AsrAlignmentEpisodeTracker } from '../../src/features/asr/asr-alignment-episodes';

describe('ASR alignment episode diagnostics', () => {
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
});
