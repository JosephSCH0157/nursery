import { evaluateAsrTerminalScriptHold } from '../../src/features/asr/asr-terminal-script-hold';

describe('evaluateAsrTerminalScriptHold', () => {
  test('activates at max scroll near the last speakable line and marks unsatisfied marker debt as physical', () => {
    const result = evaluateAsrTerminalScriptHold({
      terminalClampActive: true,
      currentLineIdx: 134,
      committedLineIdx: 134,
      acceptedCommitTargetIdx: 134,
      requestedTargetIdx: 134,
      lastSpeakableLineIdx: 134,
      currentScrollTop: 8736,
      maxScrollTop: 8736,
      distanceToMaxScrollTop: 0,
      targetDebtPx: 188,
      scrollerClientHeight: 600,
      markerPct: 0.4,
      terminalLineOffsetTop: 9020,
      terminalLineHeightPx: 120,
    });

    expect(result.active).toBe(true);
    expect(result.reason).toBe('terminal_script_hold');
    expect(result.paddingAdequate).toBe(false);
    expect(result.physicallySatisfiable).toBe(false);
    expect(result.physicallyUnsatisfiableDebtPx).toBeGreaterThan(0);
  });

  test('stays inactive when clamp is present but ASR is not near script end', () => {
    const result = evaluateAsrTerminalScriptHold({
      terminalClampActive: true,
      currentLineIdx: 98,
      committedLineIdx: 98,
      acceptedCommitTargetIdx: 98,
      requestedTargetIdx: 99,
      lastSpeakableLineIdx: 134,
      currentScrollTop: 6000,
      maxScrollTop: 6000,
      distanceToMaxScrollTop: 0,
      targetDebtPx: 144,
      scrollerClientHeight: 600,
      markerPct: 0.4,
      terminalLineOffsetTop: 6200,
      terminalLineHeightPx: 120,
    });

    expect(result.active).toBe(false);
    expect(result.reason).toBe('not_near_script_end');
  });

  test('still holds at terminal clamp when bottom padding lets the final line reach the marker', () => {
    const result = evaluateAsrTerminalScriptHold({
      terminalClampActive: true,
      currentLineIdx: 134,
      committedLineIdx: 134,
      acceptedCommitTargetIdx: 134,
      requestedTargetIdx: 134,
      lastSpeakableLineIdx: 134,
      currentScrollTop: 8736,
      maxScrollTop: 8736,
      distanceToMaxScrollTop: 0,
      targetDebtPx: 0,
      scrollerClientHeight: 600,
      markerPct: 0.4,
      terminalLineOffsetTop: 8916,
      terminalLineHeightPx: 120,
    });

    expect(result.active).toBe(true);
    expect(result.paddingAdequate).toBe(true);
    expect(result.physicallySatisfiable).toBe(true);
  });
});
