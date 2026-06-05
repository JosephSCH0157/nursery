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
});
