import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

function extractTraceField(line: string, key: string): string {
  const match = line.match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`));
  return match ? String(match[1] || '') : '';
}

function extractTraceFieldNumber(line: string, key: string): number {
  const raw = extractTraceField(line, key);
  const num = Number(raw);
  return Number.isFinite(num) ? num : Number.NaN;
}

function bootstrapLiveAsrRuntime(): void {
  (window as any).__tpAsrRuntimeStatus = {
    recognizerAttached: true,
    activeReadMode: true,
    speechRunningActual: true,
  };
  window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
    detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
  }));
  window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));
}

type DebugAsrDriver = ReturnType<typeof createAsrScrollDriver> & {
  __debugApplyVisualActuatorTargetStep(args: {
    beforeScrollTop: number;
    targetScrollTop: number;
    requestedMovePx: number;
    effectiveMinStepPx: number;
    currentLineIdx: number;
    committedLineIdx: number;
    nextSpeakableLineIdx: number;
    authority?: string;
    authorityReason?: string;
    allowedTargetIdx?: number | null;
    lastVerifiedCommitLineIdx?: number;
    lastVerifiedCommitAgeMs?: number;
    terminalClampActive?: boolean;
    noMatchOrOffscript?: boolean;
    hardContradiction?: boolean;
    lastAuthorityMatchBestIdx?: number | null;
    lastAuthorityMatchBestSim?: number | null;
    preservedTargetScrollTop?: number | null;
  }): {
    afterTop: number;
    blockedPullback: boolean;
  };
  __debugSeedPreservedFollowTarget(args: {
    targetScrollTop: number | null;
    reason?: string;
    sourcePath?: string;
  }): void;
  __debugSelectVisualOwnershipCandidate(args: {
    candidates: Array<{
      authority: string;
      targetScrollTop: number | null;
      reason: string;
      direction: 'forward' | 'backward' | 'hold';
      priority: number;
    }>;
    currentScrollTop: number;
    correctionRequested: boolean;
    markerErrorPx: number;
    lineHeightPx: number;
    protectedForwardIntent: boolean;
    suppressedReason?: string | null;
    preservedStallFrames?: number;
    preservedStallMs?: number;
  }): {
    selectedAuthority: string;
    selectedTargetScrollTop: number | null;
    selectedReason: string;
    proposedCandidates: string;
    rejectedAuthorities: string;
    rejectionReasons: string;
    movementBlockedReason: string;
    expiredPreservedTarget: boolean;
    preservedTargetYieldReason: string;
  };
  __debugApplyFinalSelectedActuatorStep(args: {
    beforeScrollTop: number;
    selectedTargetScrollTop: number;
    staleActuatorDebtPx: number;
    requestedMovePx: number;
    effectiveMinStepPx: number;
    currentLineIdx: number;
    committedLineIdx: number;
    nextSpeakableLineIdx: number;
    authority?: string;
    authorityReason?: string;
    allowedTargetIdx?: number | null;
    terminalClampActive?: boolean;
    noMatchOrOffscript?: boolean;
    hardContradiction?: boolean;
    directWriteBlocked?: boolean;
    directWriteBlockedReason?: 'none' | 'cooldown' | 'min_delta' | 'no_writer' | 'stale_debt' | 'safety_blocker' | 'target_changed' | 'scroll_limit' | 'ownership_not_final' | 'duplicate_write_guard' | null;
    ownershipNotFinalCandidatePresent?: boolean;
    markerErrorPx?: number | null;
    lineHeightPx?: number | null;
    matchBestIdx?: number | null;
    matchBestSim?: number | null;
    matchVia?: string | null;
    matchReason?: string | null;
    primaryBypassReason?: string | null;
  }): {
    finalTargetDebtPx: number;
    staleDebtSource: boolean;
    afterTop: number;
    appliedDeltaPx: number;
    movementBlocked: string;
    ownershipFinalizationRejectedReason: string;
    semanticCommitHeldButVisualCorrectionAllowed: boolean;
  };
};

describe('ASR visual contract', () => {
  let rafSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cafSpy: jest.SpyInstance<void, [number]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;
  let consoleDebugSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });
    window.history.replaceState({}, '', '/?dev=1');
    const lines = Array.from({ length: 12 }, (_, idx) =>
      `<div class="line" data-line="${idx}" style="line-height:24px;">Line ${idx}.</div>`,
    ).join('');
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">${lines}</div>
      </main>
    `;
    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 10000 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
    });
    scroller.scrollTop = 0;
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = { top: idx * 567, height: 236 };
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: metric.top });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: metric.height });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: metric.height });
      Object.defineProperty(lineEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: metric.top,
          left: 0,
          right: 800,
          bottom: metric.top + metric.height,
          width: 800,
          height: metric.height,
        }),
      });
    });
    (window as any).__tpStore = {
      get(key: string) {
        if (key === 'scrollMode') return 'asr';
        if (key === 'session.phase') return 'live';
        if (key === 'session.asrArmed') return true;
        return undefined;
      },
    };
    (window as any).__TP_MARKER_PCT = 0.4;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).__tpHud;
    window.history.replaceState({}, '', '/');
  });

  test('accepted local forward proof produces durable forward visual motion instead of stale-target settle', async () => {
    const hudEntries: Array<{ tag: string; payload: Record<string, unknown> }> = [];
    (window as any).__tpHud = {
      log(tag: string, payload: Record<string, unknown>) {
        hudEntries.push({ tag, payload });
      },
    };
    const driver = createAsrScrollDriver() as DebugAsrDriver;
    const scroller = document.getElementById('viewer') as HTMLElement;
    const stalePreservedTarget = 150;
    const startScrollTop = 180;
    const sampledScrollTops: number[] = [];

    bootstrapLiveAsrRuntime();
    scroller.scrollTop = startScrollTop;
    driver.setLastLineIndex(1);
    driver.__debugSeedPreservedFollowTarget({
      targetScrollTop: stalePreservedTarget,
      reason: 'stale_visual_contract_target',
      sourcePath: 'stale_visual_contract_target',
    });

    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'visual-contract-forward-motion',
      match: { bestIdx: 2, bestSim: 0.95, topScores: [{ idx: 2, score: 0.95 }] },
      speechRunningActual: true,
    });

    let forwardSelectionTrace = '';
    let forwardMotionTrace = '';
    for (let tick = 0; tick < 12; tick += 1) {
      await jest.advanceTimersByTimeAsync(40);
      sampledScrollTops.push(scroller.scrollTop);
      const ownershipLines = consoleWarnSpy.mock.calls
        .map((call) => String(call[0] || ''))
        .filter((line) => line.includes('ASR_VISUAL_TARGET_OWNERSHIP_TRACE'));
      forwardSelectionTrace = ownershipLines.find((line) =>
        extractTraceFieldNumber(line, 'selectedTargetScrollTop') > startScrollTop &&
        extractTraceFieldNumber(line, 'selectedTargetScrollTop') > stalePreservedTarget
      ) || forwardSelectionTrace;
      forwardMotionTrace = ownershipLines.find((line) =>
        extractTraceFieldNumber(line, 'selectedTargetScrollTop') > startScrollTop &&
        extractTraceFieldNumber(line, 'selectedTargetScrollTop') > stalePreservedTarget &&
        extractTraceFieldNumber(line, 'appliedDeltaPx') > 0
      ) || forwardMotionTrace;
      if (forwardSelectionTrace && forwardMotionTrace) {
        break;
      }
    }

    const warnLines = consoleWarnSpy.mock.calls.map((call) => String(call[0] || ''));
    const markerErrorLine = warnLines.find((line) =>
      line.includes('ASR_READER_LINE_MARKER_ERROR') &&
      line.includes('correctionRequested=1') &&
      extractTraceFieldNumber(line, 'markerErrorPx') > 236
    ) || '';
    expect(markerErrorLine).toContain('correctionRequested=1');

    expect(forwardSelectionTrace).toContain('selectedAuthority=');
    const selectedTargetScrollTop = extractTraceFieldNumber(forwardSelectionTrace, 'selectedTargetScrollTop');
    expect(selectedTargetScrollTop).toBeGreaterThan(startScrollTop);
    expect(selectedTargetScrollTop).toBeGreaterThan(stalePreservedTarget);
    expect(forwardMotionTrace).toContain('selectedAuthority=');
    expect(extractTraceFieldNumber(forwardMotionTrace, 'appliedDeltaPx')).toBeGreaterThan(0);
    expect(extractTraceField(forwardMotionTrace, 'blockedByRecoveryPath')).not.toContain('blocked');
    expect(extractTraceField(forwardMotionTrace, 'blockedByBackwardRecenter')).toBe('none');

    const firstMotionIndex = sampledScrollTops.findIndex((top) => top > startScrollTop);
    expect(firstMotionIndex).toBeGreaterThanOrEqual(0);
    const postMotionScrollTops = sampledScrollTops.slice(firstMotionIndex);
    expect(postMotionScrollTops.length).toBeGreaterThan(0);
    expect(Math.min(...postMotionScrollTops)).toBeGreaterThan(stalePreservedTarget);
    expect(scroller.scrollTop).toBeGreaterThan(stalePreservedTarget);

    const pursueEntriesBeforeMotion = hudEntries
      .filter((entry) => entry.tag === 'ASR_PURSUE')
      .slice(0, Math.max(1, firstMotionIndex + 1));
    expect(pursueEntriesBeforeMotion.some((entry) => Number(entry.payload.err) === 0)).toBe(false);

    driver.dispose();
  });

  test('protected forward target suppresses backward recenter while local proof remains strong below marker', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    driver.__debugSeedPreservedFollowTarget({
      targetScrollTop: 2600,
      reason: 'protected_forward_target',
      sourcePath: 'protected_forward_target',
    });

    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 2400,
      targetScrollTop: 2200,
      requestedMovePx: 20,
      effectiveMinStepPx: 34,
      currentLineIdx: 5,
      committedLineIdx: 5,
      nextSpeakableLineIdx: 5,
      authority: 'preferred_lower_rail_release',
      authorityReason: 'preferred_lower_rail_not_settled',
      allowedTargetIdx: 5,
      lastVerifiedCommitLineIdx: 5,
      lastVerifiedCommitAgeMs: 0,
      lastAuthorityMatchBestIdx: 5,
      lastAuthorityMatchBestSim: 0.91,
      preservedTargetScrollTop: 2600,
    });

    expect(result.blockedPullback).toBe(true);
    expect(result.afterTop).toBe(2400);

    const traceLine = consoleWarnSpy.mock.calls
      .map((call) => String(call[0] || ''))
      .find((line) => line.includes('ASR_VISUAL_TARGET_OWNERSHIP_TRACE')) || '';
    expect(traceLine).toContain('blockedByBackwardRecenter=preserved_forward_target_ahead');
    expect(traceLine).toContain('selectedAuthority=preferred_lower_rail_release');
    expect(traceLine).toContain('previousPreservedTarget=2600');

    driver.dispose();
  });

  test('final actuator debt comes from the selected forward target and reports a real block reason on no-move frames', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const forwardResult = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 1226,
      selectedTargetScrollTop: 1327,
      staleActuatorDebtPx: -35,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 24,
      committedLineIdx: 24,
      nextSpeakableLineIdx: 24,
      authority: 'bottom_lock_release',
      authorityReason: 'below_preferred_bottom',
      allowedTargetIdx: 24,
    });

    expect(forwardResult.finalTargetDebtPx).toBe(101);
    expect(forwardResult.staleDebtSource).toBe(true);
    expect(forwardResult.appliedDeltaPx).toBeGreaterThan(0);
    expect(forwardResult.afterTop).toBeGreaterThan(1226);

    const blockedResult = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 1226,
      selectedTargetScrollTop: 1327,
      staleActuatorDebtPx: -35,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 24,
      committedLineIdx: 24,
      nextSpeakableLineIdx: 24,
      authority: 'bottom_lock_release',
      authorityReason: 'below_preferred_bottom',
      allowedTargetIdx: 24,
      terminalClampActive: true,
    });

    expect(blockedResult.finalTargetDebtPx).toBe(101);
    expect(blockedResult.appliedDeltaPx).toBe(0);
    expect(blockedResult.movementBlocked).not.toBe('none');
    expect(blockedResult.movementBlocked).toBe('scroll_limit');

    driver.dispose();
  });

  test('direct-write-blocked no-move frames report a specific blocker instead of none', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const blockedResult = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 6473,
      selectedTargetScrollTop: 6562,
      staleActuatorDebtPx: 89,
      requestedMovePx: 34,
      effectiveMinStepPx: 34,
      currentLineIdx: 102,
      committedLineIdx: 102,
      nextSpeakableLineIdx: 102,
      authority: 'preserved_forward_follow_target',
      authorityReason: 'lead_pressure_capped',
      allowedTargetIdx: 102,
      directWriteBlocked: true,
      directWriteBlockedReason: 'ownership_not_final',
    });

    expect(blockedResult.finalTargetDebtPx).toBe(89);
    expect(blockedResult.appliedDeltaPx).toBe(0);
    expect(blockedResult.movementBlocked).toBe('ownership_not_final');
    expect(blockedResult.ownershipFinalizationRejectedReason).toBe('selected_authority_not_reader_marker_correction');
    expect(blockedResult.semanticCommitHeldButVisualCorrectionAllowed).toBe(false);

    driver.dispose();
  });

  test('safe reader-marker correction finalizes visual ownership instead of stalling on ownership_not_final', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 0,
      selectedTargetScrollTop: 104,
      staleActuatorDebtPx: -40,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 9,
      authority: 'reader_marker_correction',
      authorityReason: 'reader_marker_correction',
      allowedTargetIdx: 9,
      directWriteBlocked: true,
      directWriteBlockedReason: 'ownership_not_final',
      ownershipNotFinalCandidatePresent: true,
      markerErrorPx: 56,
      lineHeightPx: 24,
      matchBestIdx: 12,
      matchBestSim: 0.91,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
    });

    expect(result.finalTargetDebtPx).toBe(104);
    expect(result.appliedDeltaPx).toBeGreaterThan(0);
    expect(result.movementBlocked).toBe('none');
    expect(result.ownershipFinalizationRejectedReason).toBe('none');
    expect(result.semanticCommitHeldButVisualCorrectionAllowed).toBe(true);

    driver.dispose();
  });

  test('reader-marker correction still stays blocked when canonical backend spoken proof is unsafe', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const blockedResult = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 0,
      selectedTargetScrollTop: 104,
      staleActuatorDebtPx: -40,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 9,
      authority: 'reader_marker_correction',
      authorityReason: 'reader_marker_correction',
      allowedTargetIdx: 9,
      directWriteBlocked: true,
      directWriteBlockedReason: 'ownership_not_final',
      ownershipNotFinalCandidatePresent: true,
      markerErrorPx: 56,
      lineHeightPx: 24,
      matchBestIdx: 8,
      matchBestSim: 0.91,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
    });

    expect(blockedResult.appliedDeltaPx).toBe(0);
    expect(blockedResult.movementBlocked).toBe('ownership_not_final');
    expect(blockedResult.ownershipFinalizationRejectedReason).toBe('best_idx_not_forward');
    expect(blockedResult.semanticCommitHeldButVisualCorrectionAllowed).toBe(false);

    driver.dispose();
  });

  test('stale preserved low target yields to reader-marker correction instead of starving the bottom pocket', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const decision = driver.__debugSelectVisualOwnershipCandidate({
      currentScrollTop: 0,
      correctionRequested: true,
      markerErrorPx: 498,
      lineHeightPx: 236,
      protectedForwardIntent: true,
      suppressedReason: 'target_preserved_but_not_closing',
      preservedStallFrames: 4,
      preservedStallMs: 320,
      candidates: [
        {
          authority: 'preserved_forward_follow_target',
          targetScrollTop: 36,
          reason: 'stale_low_preserved_target',
          direction: 'forward',
          priority: 92,
        },
        {
          authority: 'reader_marker_correction',
          targetScrollTop: 104,
          reason: 'reader_marker_correction',
          direction: 'forward',
          priority: 70,
        },
      ],
    });

    expect(decision.selectedAuthority).toBe('reader_marker_correction');
    expect(decision.selectedTargetScrollTop).toBe(104);
    expect(decision.selectedTargetScrollTop).not.toBe(36);
    expect(decision.expiredPreservedTarget).toBe(true);
    expect(decision.preservedTargetYieldReason).toBe('preserved_forward_target_yielded_to_reader_marker_correction');
    expect(decision.rejectedAuthorities).toContain('preserved_forward_follow_target');
    expect(decision.rejectionReasons).toContain(
      'preserved_forward_follow_target:preserved_forward_target_yielded_to_reader_marker_correction',
    );

    const result = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 0,
      selectedTargetScrollTop: 104,
      staleActuatorDebtPx: -40,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 1,
      committedLineIdx: 1,
      nextSpeakableLineIdx: 1,
      authority: decision.selectedAuthority,
      authorityReason: decision.selectedReason,
      allowedTargetIdx: 1,
    });

    expect(result.finalTargetDebtPx).toBe(104);
    expect(result.appliedDeltaPx).toBeGreaterThan(0);
    expect(result.movementBlocked).toBe('none');

    driver.dispose();
  });

  test('stale alternate debt cannot flip final debt negative for the selected forward target', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 6802,
      selectedTargetScrollTop: 7039,
      staleActuatorDebtPx: -443,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 104,
      committedLineIdx: 104,
      nextSpeakableLineIdx: 104,
      authority: 'reader_marker_correction',
      authorityReason: 'below_preferred_bottom',
      allowedTargetIdx: 104,
    });

    expect(result.finalTargetDebtPx).toBe(237);
    expect(result.staleDebtSource).toBe(true);
    expect(result.appliedDeltaPx).toBeGreaterThan(0);
    expect(result.movementBlocked).not.toBe('target_debt_cap');

    driver.dispose();
  });

  test('final debt cap after preserved-target yield uses the selected forward target instead of stale alternate debt', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 520,
      selectedTargetScrollTop: 647,
      staleActuatorDebtPx: -280,
      requestedMovePx: 400,
      effectiveMinStepPx: 34,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 8,
      authority: 'reader_marker_correction',
      authorityReason: 'preserved_forward_target_yielded_to_reader_marker_correction',
      allowedTargetIdx: 8,
    });

    expect(result.finalTargetDebtPx).toBe(127);
    expect(result.staleDebtSource).toBe(true);
    expect(result.appliedDeltaPx).toBeGreaterThan(0);
    expect(result.movementBlocked).not.toBe('target_debt_cap');

    driver.dispose();
  });
});
