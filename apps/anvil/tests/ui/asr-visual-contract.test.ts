import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';
import { evaluateAsrTerminalScriptHold } from '../../src/features/asr/asr-terminal-script-hold';
import * as canonicalScroller from '../../src/scroll/scroller';

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

function installSyntheticScriptLayout(root: HTMLElement, viewer: HTMLElement, lineHeightPx: number): void {
  const lines = Array.from(root.querySelectorAll<HTMLElement>('.line'));
  Object.defineProperty(viewer, 'scrollHeight', {
    configurable: true,
    get: () => {
      const paddingTop = Number.parseFloat(root.style.paddingTop || '0') || 0;
      const paddingBottom = Number.parseFloat(root.style.paddingBottom || '0') || 0;
      return Math.round(paddingTop + paddingBottom + (lines.length * lineHeightPx));
    },
  });
  Object.defineProperty(root, 'scrollHeight', {
    configurable: true,
    get: () => Number((viewer as any).scrollHeight || 0),
  });
  lines.forEach((lineEl, idx) => {
    Object.defineProperty(lineEl, 'offsetTop', {
      configurable: true,
      get: () => {
        const paddingTop = Number.parseFloat(root.style.paddingTop || '0') || 0;
        return Math.round(paddingTop + (idx * lineHeightPx));
      },
    });
    Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, get: () => lineHeightPx });
    Object.defineProperty(lineEl, 'clientHeight', { configurable: true, get: () => lineHeightPx });
  });
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
    readerMarkerCorrectionLeaseActive?: boolean;
    readerMarkerCorrectionLeaseAgeMs?: number | null;
    readerMarkerCorrectionLeaseReason?: string | null;
    readerMarkerCorrectionLeaseMarkerErrorPxAtStart?: number | null;
    localRescueMinMovePx?: number;
  }): {
    afterTop: number;
    appliedDeltaPx: number;
    clampReason: string;
    blockedPullback: boolean;
  };
  __debugEvaluateEffectiveTargetSafety(args: {
    baseTargetSafe: boolean;
    currentLineIdx: number;
    committedLineIdx: number;
    allowedTargetIdx?: number | null;
    nextSpeakableLineIdx?: number | null;
    targetSafetyReferenceLineIdx?: number | null;
    targetSafetyReferenceSource?: string | null;
    semanticCommitHeldButVisualCatchupAllowed?: boolean;
    retainedVisualCleanupAllowed?: boolean;
    readerMarkerCorrectionLeaseActive?: boolean;
    readerMarkerCorrectionLeaseAgeMs?: number | null;
    readerMarkerCorrectionLeaseReason?: string | null;
    readerMarkerCorrectionLeaseReleasedReason?: string | null;
    unsafeTargetReason?: string | null;
    boundedVisualCatchupEligible?: boolean;
    currentFrameSafeHoldReason?: string | null;
    noMatchOrOffscript?: boolean;
    hardContradiction?: boolean;
    terminalClampActive?: boolean;
  }): {
    effectiveTargetSafe: boolean;
    boundedLeaseTargetSafe: boolean;
    localWindowCoherent: boolean;
    effectiveTargetSafeSource: string;
    effectiveTargetSafeBlockedReason: string;
    effectiveTargetSafeHoldReason: string;
  };
  __debugApplyScrollWithHybridGuard(args: {
    beforeScrollTop: number;
    proposedTop: number;
    targetScrollTop?: number | null;
    currentLineIdx?: number;
    committedLineIdx?: number;
    nextSpeakableLineIdx?: number;
    allowedTargetIdx?: number | null;
    selectedAuthority?: string;
    authorityReason?: string;
    proofSource?: string;
    sourceBranch?: string;
    forceReason?: string;
    lastVerifiedCommitLineIdx?: number;
    lastVerifiedCommitAgeMs?: number;
    terminalClampActive?: boolean;
    matchBestIdx?: number | null;
    matchBestSim?: number | null;
    matchVia?: string | null;
    matchReason?: string | null;
    primaryBypassReason?: string | null;
    visualAnchorLineIdx?: number | null;
    visualAnchorSource?: string | null;
    matchedLineViewportY?: number | null;
    matchedMarkerErrorPx?: number | null;
    readerMarkerCorrectionLeaseActive?: boolean;
    readerMarkerCorrectionLeaseAgeMs?: number | null;
    readerMarkerCorrectionLeaseReason?: string | null;
    readerMarkerCorrectionLeaseReleasedReason?: string | null;
    readerMarkerCorrectionLeaseMarkerErrorPxAtStart?: number | null;
  }): {
    beforeScrollTop: number;
    effectiveTop: number;
    appliedTop: number;
    reason: string;
    tolerancePx: number;
    hasFreshVerifiedForwardCommit: boolean;
    targetSafetyReferenceSource: string;
    unsafeTargetReason: string;
    readerMarkerCorrectionLeaseActive: boolean;
    readerMarkerCorrectionLeaseReleasedReason: string;
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
    readerMarkerCorrectionLeaseActive?: boolean;
    readerMarkerCorrectionLeaseAgeMs?: number;
    readerMarkerCorrectionLeaseReason?: string | null;
    preservedTargetClosingError?: boolean;
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
    localRescueMinMovePx?: number;
  }): {
    finalTargetDebtPx: number;
    staleDebtSource: boolean;
    afterTop: number;
    appliedDeltaPx: number;
    movementBlocked: string;
    ownershipFinalizationRejectedReason: string;
    semanticCommitHeldButVisualCorrectionAllowed: boolean;
  };
  __debugObserveAsr4VisualRecoveryCommit(args: {
    currentLine: number;
    committedLine: number;
    targetLine?: number | null;
    beforeScrollTop: number;
    afterScrollTop?: number;
    movedPx?: number;
    directWriteBlocked?: boolean;
    targetPreservedForEasing?: boolean;
    visualSnapSuppressed?: boolean;
    liveScrollStalled?: boolean;
    lastAllowedLocalRescueContext?: {
      allowedReason: string;
      currentLine: number;
      committedLine: number;
      targetLine?: number | null;
      currentScrollTop: number;
      targetScrollTop: number;
      intendedMovePx: number;
      targetDebtPx: number;
      hardBlocker?: string | null;
      cooldownState?: string | null;
    } | null;
  }): {
    applied: boolean;
    afterScrollTop: number;
    movedPx: number;
    consecutiveNoMoveCommits: number;
  };
  __debugApplyAsr4VisualRecoveryAuthority(args: {
    currentLine: number;
    committedLine: number;
    targetLine?: number | null;
    beforeScrollTop: number;
    afterScrollTop?: number;
    movedPx?: number;
    consecutiveNoMoveCommits?: number;
    directWriteBlocked?: boolean;
    targetPreservedForEasing?: boolean;
    visualSnapSuppressed?: boolean;
    liveScrollStalled?: boolean;
    preservedLocalRescueTargetScrollTop?: number | null;
    preservedLocalRescueAllowedReason?: string | null;
    preservedLocalRescueTargetDebtPx?: number | null;
  }): {
    applied: boolean;
    afterScrollTop: number;
    movedPx: number;
    authorityAction: 'force_marker_lock_correction' | 'force_safe_direct_write' | 'freeze_far_visual_target' | 'lead_pressure_capped_forward_step';
    movementAllowed: boolean;
  };
  __debugEvaluateStaleVisualDebtCoordination(args: {
    currentLineIdx: number;
    committedLineIdx: number;
    visualAnchorLineIdx: number;
    currentScrollTop: number;
    proposedTargetScrollTop: number;
    targetDebtPx: number;
    tolerancePx: number;
    activeRecoveryKind?: 'semantic_ahead' | 'visual_debt' | 'none';
    hasNewerForwardTargetProof?: boolean;
    readerMarkerCorrectionLeaseActive?: boolean;
  }): {
    clearStaleVisualDebt: boolean;
    clearLease: boolean;
    allowLocalStabilization: boolean;
    suppressForwardPush: boolean;
    suppressedTargetScrollTop: number;
    clearReason: string;
    suppressReason: string;
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

  describe('post-commit measured completion', () => {
    let driver: any;
    let api: any;
    let viewer: HTMLElement;
    let writes: jest.SpyInstance;
    let info: jest.SpyInstance;
    let target: number;
    beforeEach(() => {
      info = jest.spyOn(console, 'info').mockImplementation(() => {});
      driver = createAsrScrollDriver();
      driver.setLastLineIndex(2);
      bootstrapLiveAsrRuntime();
      window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
      viewer = document.getElementById('viewer') as HTMLElement;
      document.querySelectorAll<HTMLElement>('.line').forEach((line) => {
        Object.defineProperty(line, 'getBoundingClientRect', { configurable: true, value: () => ({
          top: line.offsetTop - viewer.scrollTop, bottom: line.offsetTop - viewer.scrollTop + 236,
          height: 236, left: 0, right: 800, width: 800,
        }) });
      });
      api = driver.__debugPostCommitCompletion;
      target = api.prepare(2);
      viewer.scrollTop = target - 100;
      writes = jest.spyOn(canonicalScroller, 'applyCanonicalScrollTop');
    });
    afterEach(() => { driver.dispose(); writes.mockRestore(); info.mockRestore(); });
    const completedEvents = (spy: jest.SpyInstance) => spy.mock.calls.filter(([line]) =>
      String(line).includes('[ASR_POST_COMMIT_COMPLETION]') && /outcome=(finalized|already_satisfied|document_bound_complete)/.test(String(line)));

    test('accepted commit finishes once; replay neither writes nor repeats completion/protection', () => {
      api.step({ target });
      expect(viewer.scrollTop).toBeCloseTo(target);
      expect(api.state()).toMatchObject({ outcome: 'complete', pending: false, protected: true });
      const count = writes.mock.calls.length;
      api.step({ target }); api.step({ target });
      expect(writes).toHaveBeenCalledTimes(count);
      expect(completedEvents(info)).toHaveLength(1);
      expect(driver.getLastLineIndex()).toBe(2);
    });
    test('bounded steps retain residual obligation until geometry is satisfied', () => {
      viewer.scrollTop = target - 400;
      api.step({ target, move: 20 });
      expect(api.state().outcome).toBe('pending');
      expect(api.state().pending).toBe(true);
      for (let i = 0; i < 8 && api.state().outcome === 'pending'; i++) api.step({ target });
      expect(api.state().outcome).toBe('complete');
      expect(completedEvents(info)).toHaveLength(1);
    });
    test('repeated accepted evidence cannot re-arm a finalized completion', () => {
      api.step({ target });
      const count = writes.mock.calls.length;
      api.prepare(2); api.step({ target });
      expect(api.state().outcome).toBe('complete');
      expect(writes).toHaveBeenCalledTimes(count);
      expect(completedEvents(info)).toHaveLength(1);
    });
    test('canonical document limit is a one-shot terminal no-op', () => {
      Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: viewer.clientHeight + 100 });
      api.invalidate('visual');
      target = api.prepare(2);
      viewer.scrollTop = 100;
      api.step({ target }); api.step({ target });
      expect(api.state().outcome).toBe('complete');
      expect(writes).not.toHaveBeenCalled();
      expect(completedEvents(info)).toHaveLength(1);
    });
    test('fresh same-line evidence closes via the existing actuator without a new semantic commit', () => {
      driver.dispose();
      driver = createAsrScrollDriver(); driver.setLastLineIndex(2);
      bootstrapLiveAsrRuntime();
      window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
      api = driver.__debugPostCommitCompletion;
      target = api.prepare(2, false); viewer.scrollTop = target - 100;
      api.step({ target });
      expect(viewer.scrollTop).toBeGreaterThan(target - 100);
      expect(driver.getLastLineIndex()).toBe(2);
      expect(driver.getStats().commitCount).toBe(0);
    });
    test('negative completion still enters the existing backward writer guard', () => {
      viewer.scrollTop = target + 200;
      const result = api.step({ target });
      expect(result.usedPullback || result.blockedPullback).toBe(true);
      expect(driver.getLastLineIndex()).toBe(2);
    });
    test('run replacement rejects old completion without writes', () => {
      window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
        detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true, runKey: 'replacement', runGeneration: 99 },
      }));
      api.step({ target });
      expect(writes).not.toHaveBeenCalled();
      expect(completedEvents(info)).toHaveLength(0);
    });
    test.each([0, 200])('a lying writer return does not consume authority when actual pixels stay at %s', (top) => {
      viewer.scrollTop = top;
      writes.mockImplementation((requested: number) => requested);
      const before = api.state().lastMoveAt;
      const result = api.step({ target });
      expect(result.afterTop).toBe(top);
      expect(result.appliedDeltaPx).toBe(0);
      expect(api.state()).toMatchObject({ outcome: 'pending', pending: true, protected: false, lastMoveAt: before });
      expect(writes).toHaveBeenCalledTimes(1);
      expect(completedEvents(info)).toHaveLength(0);
      writes.mockRestore(); writes = jest.spyOn(canonicalScroller, 'applyCanonicalScrollTop');
      api.step({ target });
      expect(viewer.scrollTop).toBeGreaterThan(top);
    });
    test('already satisfied is verified without another write', () => {
      viewer.scrollTop = target;
      api.step({ target }); api.step({ target });
      expect(writes).not.toHaveBeenCalled();
      expect(api.state().outcome).toBe('complete');
      expect(completedEvents(info)).toHaveLength(1);
    });
    test('writer rejection releases only the in-flight claim, not completion authority', () => {
      writes.mockImplementation(() => { throw new Error('fixture writer rejected'); });
      expect(api.step({ target }).zeroingReason).toBe('writer_rejected');
      expect(api.state()).toMatchObject({ outcome: 'pending', pending: true, inFlight: false, protected: false });
      expect(writes).toHaveBeenCalledTimes(1);
      expect(completedEvents(info)).toHaveLength(0);
    });
    test('an unscheduled correction cannot become a fallback write', () => {
      expect(api.step({ target, move: 0 }).zeroingReason).toBe('completion_not_scheduled');
      expect(api.state().outcome).toBe('pending');
      expect(writes).not.toHaveBeenCalled();
    });
    test('changed canonical geometry invalidates the bound target before a later step', () => {
      writes.mockImplementation((requested: number) => requested);
      api.step({ target });
      Object.defineProperty(document.querySelector('[data-line="2"]'), 'offsetTop', { configurable: true, value: 2000 });
      writes.mockClear();
      api.step({ target });
      expect(writes).not.toHaveBeenCalled();
      expect(completedEvents(info)).toHaveLength(0);
    });
    test('unsafe already-satisfied geometry is not completion', () => {
      viewer.scrollTop = target;
      api.step({ target, unsafe: true });
      expect(api.state().outcome).toBe('pending');
      expect(writes).not.toHaveBeenCalled();
    });
    test('ordinary tick no-progress completion does not retry through same-pass helpers', () => {
      writes.mockImplementation((requested: number) => requested);
      api.tick(target);
      expect(api.state().attempts).toBe(1);
      expect(writes.mock.calls.length).toBeLessThanOrEqual(1);
      expect(viewer.scrollTop).toBe(target - 100);
      expect(api.state().outcome).not.toBe('complete');
      expect(completedEvents(info)).toHaveLength(0);
    });
    test('not-final ownership blocks; qualified same-line ownership then closes without a commit', () => {
      viewer.scrollTop = target - 100;
      api.step({ target, pending: true, authority: 'preserved_forward_follow_target' });
      expect(writes).not.toHaveBeenCalled();
      expect(api.state().outcome).toBe('pending');
      const resumed = api.step({ target, pending: true });
      expect(api.state().qualified).toBe(true);
      expect(resumed.zeroingReason).toBe('none');
      expect(viewer.scrollTop).toBeGreaterThan(target - 100);
      expect(driver.getLastLineIndex()).toBe(2);
    });
    test.each(['response', 'focus', 'semantic', 'visual'])('%s invalidation cannot consume or apply old work', (kind) => {
      api.invalidate(kind);
      api.step({ target });
      expect(writes).not.toHaveBeenCalled();
      expect(completedEvents(info)).toHaveLength(0);
    });
    test('expiry retires execution authority, never claims completion', () => {
      jest.advanceTimersByTime(4000);
      api.step({ target });
      expect(writes).not.toHaveBeenCalled();
      expect(api.state().outcome).toBe('stale');
      expect(completedEvents(info)).toHaveLength(0);
    });
    test.each(['target_behind_current', 'duplicate_write_guard'])('%s requires proven target supersession', (reason) => {
      api.rememberBlocker(reason, target);
      expect(api.resolveBlocker(reason, target)).toBe(reason);
      api.rememberBlocker(reason, target - 400);
      expect(api.resolveBlocker(reason, target)).toBe('none');
      expect(api.state().outcome).toBe('pending');
    });
    test('unproven replacement geometry cannot discard a blocker', () => {
      api.rememberBlocker('target_behind_current', target - 400);
      expect(api.resolveBlocker('target_behind_current', target + 1000)).toBe('target_behind_current');
    });
    test('synchronous replacement cannot finalize newer completion', () => {
      writes.mockImplementation((requested: number) => {
        viewer.scrollTop = requested;
        api.invalidate('semantic'); api.prepare(2);
        return requested;
      });
      api.step({ target });
      expect(api.state()).toMatchObject({ outcome: 'pending', target: null, protected: false });
      expect(completedEvents(info)).toHaveLength(0);
    });
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

  test('marker padding adds trailing runway so the final line can still reach the marker after reflow', () => {
    let renderScriptFn: ((text: string, container?: HTMLElement | null) => void) | null = null;
    jest.isolateModules(() => {
      jest.doMock('../../src/script/normalize', () => ({
        normalizeToStandardText: (input: string) => String(input ?? ''),
        fallbackNormalizeText: (input: string) => String(input ?? ''),
      }));
      jest.doMock('../../src/features/scroll/scroll-router', () => ({
        ROUTER_STAMP: 1,
        createAutoMotor: () => ({}),
        installScrollRouter: () => {},
      }));
      ({ renderScript: renderScriptFn } = require('../../src/render-script'));
    });
    if (!renderScriptFn) {
      throw new Error('renderScript unavailable in isolated module test');
    }
    const renderScript = renderScriptFn as unknown as (text: string, container?: HTMLElement | null) => void;
    const viewer = document.getElementById('viewer') as HTMLElement;
    const root = document.getElementById('script') as HTMLElement;
    Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    });
    renderScript('Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nLine 5', root);
    installSyntheticScriptLayout(root, viewer, 48);
    window.dispatchEvent(new Event('resize'));

    const lastLine = root.querySelector<HTMLElement>('.line:last-of-type') as HTMLElement;
    const markerPct = 0.4;
    const desiredTargetScrollTop =
      lastLine.offsetTop + (lastLine.offsetHeight * 0.5) - (viewer.clientHeight * markerPct);
    const maxScrollTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    expect(desiredTargetScrollTop).toBeLessThanOrEqual(maxScrollTop);

    const firstResult = evaluateAsrTerminalScriptHold({
      terminalClampActive: true,
      currentLineIdx: 5,
      committedLineIdx: 5,
      acceptedCommitTargetIdx: 5,
      requestedTargetIdx: 5,
      lastSpeakableLineIdx: 5,
      currentScrollTop: maxScrollTop,
      maxScrollTop,
      distanceToMaxScrollTop: 0,
      targetDebtPx: 0,
      scrollerClientHeight: viewer.clientHeight,
      markerPct,
      terminalLineOffsetTop: lastLine.offsetTop,
      terminalLineHeightPx: lastLine.offsetHeight,
    });
    expect(firstResult.physicallyUnsatisfiableDebtPx).toBe(0);

    (window as any).__TP_MARKER_PCT = 0.55;
    Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 720 });
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 720, width: 800, height: 720 }),
    });
    window.dispatchEvent(new Event('resize'));

    const reflowDesiredTargetScrollTop =
      lastLine.offsetTop + (lastLine.offsetHeight * 0.5) - (viewer.clientHeight * 0.55);
    const reflowMaxScrollTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    expect(reflowDesiredTargetScrollTop).toBeLessThanOrEqual(reflowMaxScrollTop);

    const secondResult = evaluateAsrTerminalScriptHold({
      terminalClampActive: true,
      currentLineIdx: 5,
      committedLineIdx: 5,
      acceptedCommitTargetIdx: 5,
      requestedTargetIdx: 5,
      lastSpeakableLineIdx: 5,
      currentScrollTop: reflowMaxScrollTop,
      maxScrollTop: reflowMaxScrollTop,
      distanceToMaxScrollTop: 0,
      targetDebtPx: 0,
      scrollerClientHeight: viewer.clientHeight,
      markerPct: 0.55,
      terminalLineOffsetTop: lastLine.offsetTop,
      terminalLineHeightPx: lastLine.offsetHeight,
    });
    expect(secondResult.physicallyUnsatisfiableDebtPx).toBe(0);
    jest.resetModules();
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
    if (forwardMotionTrace) {
      expect(forwardMotionTrace).toContain('selectedAuthority=');
      expect(extractTraceFieldNumber(forwardMotionTrace, 'appliedDeltaPx')).toBeGreaterThan(0);
      expect(extractTraceField(forwardMotionTrace, 'blockedByRecoveryPath')).not.toContain('blocked');
      expect(extractTraceField(forwardMotionTrace, 'blockedByBackwardRecenter')).toBe('none');
    }

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

  describe('exact backward visual ownership', () => {
    let driver: any;
    let scroller: HTMLElement;
    let writeSpy: jest.SpyInstance;
    let infoSpy: jest.SpyInstance;
    const evidence = () => JSON.stringify((window as any).__tpCanonicalAsrAuthority ?? null);
    beforeEach(() => {
      driver = createAsrScrollDriver();
      bootstrapLiveAsrRuntime();
      driver.setLastLineIndex(5);
      window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
      scroller = document.getElementById('viewer') as HTMLElement;
      scroller.scrollTop = 2400;
      const line = document.querySelector<HTMLElement>('[data-line="5"]')!;
      const marker = 669 * 0.4;
      Object.defineProperty(line, 'offsetTop', { configurable: true, value: 2400 + marker });
      Object.defineProperty(line, 'getBoundingClientRect', { configurable: true,
        value: () => ({ top: marker, bottom: marker + 236, height: 236, left: 0, right: 800, width: 800 }) });
      writeSpy = jest.spyOn(canonicalScroller, 'applyCanonicalScrollTop');
      infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    });
    afterEach(() => {
      driver.dispose(); writeSpy.mockRestore(); infoSpy.mockRestore();
      delete (window as any).__tpAsrRunKey;
    });
    const select = (line = 5, top = 2200, label: 'hold' | 'backward' = 'backward') =>
      driver.__debugBackwardVisual.select(line, top, label);
    const apply = (decision: any, top?: number, line?: number) => driver.__debugBackwardVisual.apply(decision, top, line);
    const reason = (value: string) => expect(infoSpy.mock.calls.some((call) => String(call[0]).includes(`outcome=${value}`))).toBe(true);

    test('below-one-line geometry: a stale spoken target loses to qualified current-local evidence, even labeled hold', () => {
      expect(driver.__debugBackwardVisual.seedAccepted(5, 0.91)).toBe(5);
      const before = evidence();
      expect((window as any).__tpCanonicalAsrAuthority).toBeDefined();
      const decision = select(4, 2200, 'hold');
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.context)).toBe(true);
      expect(apply(decision).blockedPullback).toBe(true);
      reason('qualified_local_authority_superseded');
      expect(writeSpy).not.toHaveBeenCalled();
      expect(scroller.scrollTop).toBe(2400);
      expect(driver.getLastLineIndex()).toBe(5);
      expect(evidence()).toBe(before);
      expect(driver.__debugGetAuthoritySnapshot().overshootSettleLockActive).toBe(false);
    });

    test.each(['target', 'line', 'evidence', 'run', 'response', 'expiry'])(
      '%s changes after selection reject the old decision without a write', (change) => {
        const decision = select();
        const before = evidence();
        if (change === 'evidence') driver.__debugBackwardVisual.seedAccepted(5, 0.91);
        if (change === 'evidence') expect(driver.__debugGetAuthoritySnapshot().semanticEpoch).toBe(decision.semanticEpoch);
        if (change === 'run') (window as any).__tpAsrRunKey = 'replacement-run';
        if (change === 'response') driver.__debugBackwardVisual.invalidateResponse();
        if (change === 'expiry') jest.setSystemTime(Date.now() + 1801);
        const result = apply(decision, change === 'target' ? 2100 : undefined, change === 'line' ? 4 : undefined);
        expect(result.blockedPullback).toBe(true);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(driver.getLastLineIndex()).toBe(5);
        expect(evidence()).toBe(before);
        expect(driver.__debugGetAuthoritySnapshot().overshootSettleLockActive).toBe(false);
      });

    test('same-epoch replacement is not consumed by stale replay; the replacement writes exactly once', () => {
      const old = select();
      const replacement = select(5, 2180);
      expect(replacement.semanticEpoch).toBe(old.semanticEpoch);
      expect(apply(old).blockedPullback).toBe(true);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(apply(replacement).appliedDeltaPx).toBeLessThan(0);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const after = scroller.scrollTop;
      apply(replacement);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(scroller.scrollTop).toBe(after);
    });

    test('a consumed decision cannot replay after its target is reached or retarget forward', () => {
      const decision = select(5, 2300);
      expect(apply(decision).appliedDeltaPx).toBeLessThan(0);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const after = scroller.scrollTop;
      apply(decision);
      apply(decision, after + 100);
      expect(scroller.scrollTop).toBe(after);
      expect(writeSpy).toHaveBeenCalledTimes(1);
    });

    test('a pixel target without an exact anchor cannot borrow current semantic identity', () => {
      const decision = select(-1, 2200);
      expect(apply(decision).blockedPullback).toBe(true);
      expect(writeSpy).not.toHaveBeenCalled();
      reason('target_identity_changed');
    });

    test('geometry-time evidence replacement is rejected by the final guarded writer', () => {
      const decision = select();
      let changed = false;
      const line = document.querySelector<HTMLElement>('[data-line="5"]')!;
      Object.defineProperty(line, 'offsetTop', { configurable: true, get: () => {
        if (!changed) { changed = true; driver.__debugBackwardVisual.seedAccepted(5, 0.91); }
        return 2667.6;
      } });
      expect(apply(decision).blockedPullback).toBe(true);
      expect(changed).toBe(true);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(driver.__debugGetAuthoritySnapshot().overshootSettleLockActive).toBe(false);
    });

    test.each([false, true])('negative pocket-drift final writer revalidation (replace=%s)', (replace) => {
      const line = document.querySelector<HTMLElement>('[data-line="5"]')!;
      const marker = 669 * 0.4;
      Object.defineProperty(line, 'offsetTop', { configurable: true, value: 2400 + marker - 200 });
      Object.defineProperty(line, 'getBoundingClientRect', { configurable: true,
        value: () => ({ top: marker - 200, bottom: marker + 36, height: 236, left: 0, right: 800, width: 800 }) });
      const debugSpy = jest.spyOn(console, 'info').mockImplementation((message) => {
        if (replace && String(message).includes('ASR_POCKET_WALL_EVALUATED')) {
          driver.__debugBackwardVisual.seedAccepted(5, 0.91);
        }
      });
      const result = driver.__debugBackwardVisual.pocket();
      debugSpy.mockRestore();
      if (replace) {
        expect(result.movementAllowed).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(scroller.scrollTop).toBe(2400);
      } else {
        expect(result.movementAllowed).toBe(true);
        expect(scroller.scrollTop).toBeLessThan(2400);
        expect(writeSpy).toHaveBeenCalledTimes(1);
      }
    });

    test.each([[6, 0.2, 0], [6, 0.91, 1801], [10, 0.91, 0]])(
      'unqualified local evidence (%s/%s/%s) cannot become superseding authority', (line, confidence, age) => {
        driver.__debugBackwardVisual.seedAccepted(line, confidence, age);
        const decision = select();
        expect(apply(decision).appliedDeltaPx).toBeLessThan(0);
        expect(writeSpy).toHaveBeenCalledTimes(1);
      });
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

  test('local rescue floor realizes a bounded nonzero move when the selected target stays safely ahead', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyFinalSelectedActuatorStep({
      beforeScrollTop: 172,
      selectedTargetScrollTop: 308,
      staleActuatorDebtPx: 136,
      requestedMovePx: 0,
      effectiveMinStepPx: 0,
      currentLineIdx: 4,
      committedLineIdx: 4,
      nextSpeakableLineIdx: 4,
      authority: 'reader_marker_correction',
      authorityReason: 'persistent_local_rescue_override',
      allowedTargetIdx: 4,
      localRescueMinMovePx: 18,
      lineHeightPx: 56,
      matchBestIdx: 4,
      matchBestSim: 0.92,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
    });

    expect(result.appliedDeltaPx).toBeGreaterThanOrEqual(18);
    expect(result.appliedDeltaPx).toBeLessThanOrEqual(136);
    expect(result.movementBlocked).toBe('none');

    driver.dispose();
  });

  test('post-commit recovery late pocket does not misclassify bounded rescue as a far-target freeze', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;
    const currentLineEl = document.querySelector<HTMLElement>('[data-line="4"]');
    const targetLineEl = document.querySelector<HTMLElement>('[data-line="5"]');
    const latePocketHeight = 236;
    Object.defineProperty(currentLineEl!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 399,
        left: 0,
        right: 800,
        bottom: 399 + latePocketHeight,
        width: 800,
        height: latePocketHeight,
      }),
    });
    Object.defineProperty(targetLineEl!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 281,
        left: 0,
        right: 800,
        bottom: 281 + latePocketHeight,
        width: 800,
        height: latePocketHeight,
      }),
    });

    const result = driver.__debugApplyAsr4VisualRecoveryAuthority({
      currentLine: 4,
      committedLine: 5,
      targetLine: 5,
      beforeScrollTop: 6976,
      afterScrollTop: 6976,
      movedPx: 0,
      consecutiveNoMoveCommits: 2,
      visualSnapSuppressed: true,
      liveScrollStalled: false,
      preservedLocalRescueTargetScrollTop: 7107,
      preservedLocalRescueAllowedReason: 'persistent_local_rescue_override',
      preservedLocalRescueTargetDebtPx: 131,
    });

    expect(result.authorityAction).not.toBe('freeze_far_visual_target');
    expect(result.afterScrollTop).toBeGreaterThanOrEqual(6976);

    driver.dispose();
  });

  test('stale semantic-ahead state clears and suppresses larger forward push once the local target is satisfied', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateStaleVisualDebtCoordination({
      currentLineIdx: 43,
      committedLineIdx: 43,
      visualAnchorLineIdx: 41,
      currentScrollTop: 2834,
      proposedTargetScrollTop: 2959,
      targetDebtPx: -12,
      tolerancePx: 20,
      activeRecoveryKind: 'semantic_ahead',
      hasNewerForwardTargetProof: false,
      readerMarkerCorrectionLeaseActive: true,
    });

    expect(result.clearStaleVisualDebt).toBe(true);
    expect(result.clearLease).toBe(true);
    expect(result.allowLocalStabilization).toBe(true);
    expect(result.suppressForwardPush).toBe(true);
    expect(result.suppressedTargetScrollTop).toBe(2834);
    expect(result.suppressReason).toBe('local_target_already_satisfied_without_newer_forward_proof');

    driver.dispose();
  });

  test('newer forward proof can keep a bounded forward push candidate alive even near the semantic-ahead handoff', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateStaleVisualDebtCoordination({
      currentLineIdx: 60,
      committedLineIdx: 60,
      visualAnchorLineIdx: 59,
      currentScrollTop: 4044,
      proposedTargetScrollTop: 4183,
      targetDebtPx: 3,
      tolerancePx: 20,
      activeRecoveryKind: 'semantic_ahead',
      hasNewerForwardTargetProof: true,
      readerMarkerCorrectionLeaseActive: false,
    });

    expect(result.clearStaleVisualDebt).toBe(true);
    expect(result.allowLocalStabilization).toBe(false);
    expect(result.suppressForwardPush).toBe(false);
    expect(result.suppressedTargetScrollTop).toBe(4183);

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

  test('reader-marker correction safe target is not suppressed early when canonical backend evidence is bounded and forward', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 0,
      proposedTop: 104,
      targetScrollTop: 104,
      currentLineIdx: 0,
      committedLineIdx: 0,
      nextSpeakableLineIdx: 0,
      allowedTargetIdx: -1,
      selectedAuthority: 'reader_marker_correction',
      authorityReason: 'marker_error_line_too_low',
      matchBestIdx: 1,
      matchBestSim: 0.693,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
      visualAnchorLineIdx: 1,
      visualAnchorSource: 'accepted_match',
      matchedLineViewportY: 494,
      matchedMarkerErrorPx: 104,
    });

    expect(result.reason).not.toBe('no_safe_target_forward_suppressed');
    expect(result.effectiveTop).toBeGreaterThan(0);

    driver.dispose();
  });

  test('late bounded spoken-match catch-up stays target-safe instead of collapsing to no-safe-target suppression', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 2075,
      proposedTop: 2280,
      targetScrollTop: 2280,
      currentLineIdx: 30,
      committedLineIdx: 30,
      nextSpeakableLineIdx: 30,
      allowedTargetIdx: -1,
      selectedAuthority: 'reader_marker_correction',
      authorityReason: 'marker_error_line_too_low',
      matchBestIdx: 37,
      matchBestSim: 0.675,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
      visualAnchorLineIdx: 30,
      visualAnchorSource: 'confirmed_spoken',
      matchedLineViewportY: 867,
      matchedMarkerErrorPx: 477,
    });

    expect(result.reason).not.toBe('no_safe_target_forward_suppressed');
    expect(result.effectiveTop).toBeGreaterThan(2075);

    driver.dispose();
  });

  test('reader-marker correction still suppresses unsafe low-confidence visual catch-up', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 150,
      proposedTop: 172,
      targetScrollTop: 172,
      currentLineIdx: 2,
      committedLineIdx: 2,
      nextSpeakableLineIdx: 2,
      allowedTargetIdx: -1,
      selectedAuthority: 'reader_marker_correction',
      authorityReason: 'marker_error_line_too_low',
      matchBestIdx: 8,
      matchBestSim: 0.3,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
      visualAnchorLineIdx: 2,
      visualAnchorSource: 'accepted_match',
      matchedLineViewportY: 820,
      matchedMarkerErrorPx: 430,
    });

    expect(result.reason).toBe('no_safe_target_forward_suppressed');
    expect(result.effectiveTop).toBe(150);

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

  test('reader-marker correction lease retains authority over preserved follow while marker error stays positive', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const decision = driver.__debugSelectVisualOwnershipCandidate({
      currentScrollTop: 6,
      correctionRequested: true,
      markerErrorPx: 98,
      lineHeightPx: 56,
      protectedForwardIntent: true,
      suppressedReason: 'target_preserved_but_not_closing',
      preservedStallFrames: 1,
      preservedStallMs: 60,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 120,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      preservedTargetClosingError: false,
      candidates: [
        {
          authority: 'preserved_forward_follow_target',
          targetScrollTop: 104,
          reason: 'marker_error_line_too_low',
          direction: 'forward',
          priority: 92,
        },
        {
          authority: 'reader_marker_correction',
          targetScrollTop: 104,
          reason: 'marker_error_line_too_low',
          direction: 'forward',
          priority: 70,
        },
      ],
    });

    expect(decision.selectedAuthority).toBe('reader_marker_correction');
    expect(decision.rejectedAuthorities).toContain('preserved_forward_follow_target');
    expect(decision.rejectionReasons).toContain(
      'preserved_forward_follow_target:preserved_forward_target_yielded_to_reader_marker_correction',
    );

    driver.dispose();
  });

  test('active reader-marker correction lease reacquires reader authority from preserved follow when debt remains', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const decision = driver.__debugSelectVisualOwnershipCandidate({
      currentScrollTop: 142,
      correctionRequested: false,
      markerErrorPx: 136,
      lineHeightPx: 56,
      protectedForwardIntent: true,
      suppressedReason: 'leased_reader_correction_active',
      preservedStallFrames: 2,
      preservedStallMs: 120,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 180,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_retained_over_preserved',
      preservedTargetClosingError: false,
      candidates: [
        {
          authority: 'preserved_forward_follow_target',
          targetScrollTop: 172,
          reason: 'marker_error_line_too_low',
          direction: 'forward',
          priority: 92,
        },
      ],
    });

    expect(decision.selectedAuthority).toBe('reader_marker_correction');
    expect(decision.selectedTargetScrollTop).toBe(172);
    expect(decision.proposedCandidates).toContain('preserved_forward_follow_target:172:marker_error_line_too_low');

    driver.dispose();
  });

  test('active reader-marker correction lease keeps bounded spoken-match as the safety reference across preserved follow ticks', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 6,
      proposedTop: 104,
      targetScrollTop: 104,
      currentLineIdx: 0,
      committedLineIdx: 0,
      nextSpeakableLineIdx: 0,
      allowedTargetIdx: -1,
      selectedAuthority: 'preserved_forward_follow_target',
      authorityReason: 'marker_error_line_too_low',
      matchBestIdx: 1,
      matchBestSim: 0.693,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
      visualAnchorLineIdx: 1,
      visualAnchorSource: 'accepted_match',
      matchedLineViewportY: 494,
      matchedMarkerErrorPx: 98,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 120,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      readerMarkerCorrectionLeaseMarkerErrorPxAtStart: 104,
    });

    expect(result.reason).not.toBe('no_safe_target_forward_suppressed');
    expect(result.targetSafetyReferenceSource).toBe('bounded_visual_spoken_match');
    expect(result.unsafeTargetReason).not.toBe('reader_marker_correction_inactive');
    expect(result.readerMarkerCorrectionLeaseActive).toBe(true);

    driver.dispose();
  });

  test('bounded reader-marker correction lease stays canonically safe from pocket-wall proof even without allowedTargetIdx', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 30,
      committedLineIdx: 30,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 35,
      targetSafetyReferenceLineIdx: 31,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 24,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
    });

    expect(result.localWindowCoherent).toBe(true);
    expect(result.boundedLeaseTargetSafe).toBe(true);
    expect(result.effectiveTargetSafe).toBe(true);
    expect(result.effectiveTargetSafeSource).toBe('pocket_wall_bounded_spoken_match');
    expect(result.effectiveTargetSafeBlockedReason).toBe('none');

    driver.dispose();
  });

  test('retained preserved-follow cleanup stays canonically safe while bounded visual debt is still being closed', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 1,
      committedLineIdx: 1,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 1,
      targetSafetyReferenceLineIdx: 1,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: false,
      retainedVisualCleanupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 36,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_retained_over_preserved',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
    });

    expect(result.localWindowCoherent).toBe(true);
    expect(result.boundedLeaseTargetSafe).toBe(true);
    expect(result.effectiveTargetSafe).toBe(true);
    expect(result.effectiveTargetSafeSource).toBe('pocket_wall_bounded_spoken_match');

    driver.dispose();
  });

  test('retained preserved-follow cleanup does not downgrade to lease_inactive while the retained cleanup lease is still active', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 1,
      committedLineIdx: 1,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 1,
      targetSafetyReferenceLineIdx: 1,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: false,
      retainedVisualCleanupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 1811,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_retained_over_preserved',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
    });

    expect(result.effectiveTargetSafe).toBe(true);
    expect(result.effectiveTargetSafeSource).toBe('pocket_wall_bounded_spoken_match');
    expect(result.effectiveTargetSafeBlockedReason).toBe('none');

    driver.dispose();
  });

  test('top-pressure bounded hold stays canonically safe instead of downgrading to lease_inactive', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 0,
      committedLineIdx: 0,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 0,
      targetSafetyReferenceLineIdx: 1,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 75,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
      currentFrameSafeHoldReason: 'top_pressure_guard',
    });

    expect(result.effectiveTargetSafe).toBe(true);
    expect(result.boundedLeaseTargetSafe).toBe(true);
    expect(result.effectiveTargetSafeSource).toBe('pocket_wall_bounded_spoken_match');
    expect(result.effectiveTargetSafeBlockedReason).toBe('none');
    expect(result.effectiveTargetSafeHoldReason).toBe('top_pressure_guard');

    driver.dispose();
  });

  test('bounded reader-marker correction override does not apply after lease release, unsafe proof, missing semantic hold, hard blockers, or far targets', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const releasedLease = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 30,
      committedLineIdx: 30,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 35,
      targetSafetyReferenceLineIdx: 31,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: true,
      readerMarkerCorrectionLeaseActive: false,
      readerMarkerCorrectionLeaseReleasedReason: 'visual_debt_closed',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
    });
    expect(releasedLease.effectiveTargetSafe).toBe(false);
    expect(releasedLease.effectiveTargetSafeBlockedReason).toBe('lease_inactive');

    const unsafeReason = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 30,
      committedLineIdx: 30,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 35,
      targetSafetyReferenceLineIdx: 31,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 24,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      unsafeTargetReason: 'reader_marker_correction_inactive',
      boundedVisualCatchupEligible: true,
    });
    expect(unsafeReason.effectiveTargetSafe).toBe(false);
    expect(unsafeReason.effectiveTargetSafeBlockedReason).toBe('unsafe_reason_not_none');

    const missingSemanticHold = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 30,
      committedLineIdx: 30,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 35,
      targetSafetyReferenceLineIdx: 31,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: false,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 24,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
    });
    expect(missingSemanticHold.effectiveTargetSafe).toBe(false);
    expect(missingSemanticHold.effectiveTargetSafeBlockedReason).toBe('missing_semantic_hold');

    const hardBlocked = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 30,
      committedLineIdx: 30,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 35,
      targetSafetyReferenceLineIdx: 31,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 24,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
      hardContradiction: true,
    });
    expect(hardBlocked.effectiveTargetSafe).toBe(false);
    expect(hardBlocked.effectiveTargetSafeBlockedReason).toBe('hard_blocker');

    const farTarget = driver.__debugEvaluateEffectiveTargetSafety({
      baseTargetSafe: false,
      currentLineIdx: 30,
      committedLineIdx: 30,
      allowedTargetIdx: -1,
      nextSpeakableLineIdx: 35,
      targetSafetyReferenceLineIdx: 34,
      targetSafetyReferenceSource: 'bounded_visual_spoken_match',
      semanticCommitHeldButVisualCatchupAllowed: true,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 24,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      unsafeTargetReason: 'none',
      boundedVisualCatchupEligible: true,
    });
    expect(farTarget.localWindowCoherent).toBe(false);
    expect(farTarget.effectiveTargetSafe).toBe(false);
    expect(farTarget.effectiveTargetSafeBlockedReason).toBe('outside_local_window');

    driver.dispose();
  });

  test('active lease releases on visual debt closure instead of semantic catch-up', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 94,
      proposedTop: 104,
      targetScrollTop: 104,
      currentLineIdx: 1,
      committedLineIdx: 1,
      nextSpeakableLineIdx: 1,
      allowedTargetIdx: -1,
      selectedAuthority: 'preserved_forward_follow_target',
      authorityReason: 'marker_error_line_too_low',
      matchBestIdx: 1,
      matchBestSim: 0.693,
      matchVia: 'backend',
      matchReason: 'ts_primary_matcher',
      primaryBypassReason: null,
      visualAnchorLineIdx: 1,
      visualAnchorSource: 'accepted_match',
      matchedLineViewportY: 398,
      matchedMarkerErrorPx: 8,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 180,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_safe_bounded',
      readerMarkerCorrectionLeaseMarkerErrorPxAtStart: 104,
    });

    expect(result.reason).toBe('no_safe_target_forward_suppressed');
    expect(result.targetSafetyReferenceSource).toBe('authoritative_line');
    expect(result.readerMarkerCorrectionLeaseActive).toBe(false);
    expect(result.readerMarkerCorrectionLeaseReleasedReason).toBe('visual_debt_closed');

    driver.dispose();
  });

  test('leased reader-marker correction actuator applies a bounded forward step instead of a starvation nudge', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 186,
      targetScrollTop: 240,
      requestedMovePx: 0,
      effectiveMinStepPx: 6,
      currentLineIdx: 2,
      committedLineIdx: 2,
      nextSpeakableLineIdx: 2,
      authority: 'preserved_forward_follow_target',
      authorityReason: 'marker_error_line_too_low',
      allowedTargetIdx: 2,
      lastAuthorityMatchBestIdx: 3,
      lastAuthorityMatchBestSim: 0.64,
      readerMarkerCorrectionLeaseActive: true,
      readerMarkerCorrectionLeaseAgeMs: 34,
      readerMarkerCorrectionLeaseReason: 'reader_marker_correction_retained_over_preserved',
      readerMarkerCorrectionLeaseMarkerErrorPxAtStart: 72,
    });

    expect(result.appliedDeltaPx).toBeGreaterThan(6);
    expect(result.afterTop).toBeGreaterThan(186);
    expect(result.clampReason).toBe('leased_reader_correction_floor');

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
