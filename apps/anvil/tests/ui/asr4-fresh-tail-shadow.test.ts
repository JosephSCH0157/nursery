/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR4 fresh-tail shadow wiring', () => {
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  const configureRecoveryBridgeScript = () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Driving through northern Orlando.</div>
      <div class="line" data-line="1" style="line-height:24px;">Not perfume amazing.</div>
      <div class="line" data-line="2" style="line-height:24px;">It was thick.</div>
      <div class="line" data-line="3" style="line-height:24px;">You felt it at stoplights.</div>
      <div class="line" data-line="4" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="5" style="line-height:24px;"></div>
      <div class="line" data-line="6" style="line-height:24px;">Then the rain broke.</div>
    `;
    const metrics = Array.from({ length: 7 }, (_, idx) => ({ top: idx * 360, height: 236 }));
    Array.from(script.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = metrics[idx];
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 4600 });
    scroller.scrollTop = 0;
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/?dev=1');
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0" style="line-height:24px;">Doors sigh.</div>
          <div class="line" data-line="1" style="line-height:24px;">Farebox chirps, coffee lids do that little click.</div>
          <div class="line" data-line="2" style="line-height:24px;">The seats remember every early shift.</div>
          <div class="line" data-line="3" style="line-height:24px;">Neon ads hum above the aisle.</div>
        </div>
      </main>
    `;
    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 3644 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
    });
    scroller.scrollTop = 0;

    const metrics = [
      { top: 0, height: 236 },
      { top: 567, height: 236 },
      { top: 1134, height: 236 },
      { top: 1701, height: 236 },
    ];
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = metrics[idx];
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
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__tpAsr4ShadowLast;
    delete (window as any).__tpAsr4RecoveryLast;
    window.history.replaceState({}, '', '/');
  });

  test('off-script fresh tail updates snapshot with wouldFreeze true without changing legacy hold behavior', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('COMPLETELY unrelated toaster monologue', true, {
      currentIdx: 1,
      noMatch: true,
      source: 'openai-whisper-bridge',
      runKey: 'shadow-offscript',
      runGeneration: 4,
      speechRunningActual: true,
      match: {
        bestIdx: -1,
        bestSim: Number.NaN,
        topScores: [],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect(driver.getLastLineIndex()).toBe(1);
    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        runKey: 'shadow-offscript',
        runGeneration: 4,
        currentLine: 1,
        wouldFreeze: true,
        mismatch: false,
        legacyMoved: false,
      }),
    );
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_FRESH_TAIL_VETO'))).toBe(true);

    driver.dispose();
  });

  test('on-script transcript emits fresh-tail shadow output without mismatch', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 1,
      matchId: 'shadow-onscript',
      source: 'openai-whisper-bridge',
      runKey: 'shadow-onscript',
      runGeneration: 5,
      speechRunningActual: true,
      match: {
        bestIdx: 1,
        bestSim: 0.99,
        topScores: [{ idx: 1, score: 0.99 }],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        currentLine: 1,
        wouldFreeze: false,
        mismatch: false,
        currentLineMatched: true,
        selectedNearbyWindow: 'current',
        selectedAnchorSource: 'packet_match_local',
        packetMatchAnchorLine: 1,
        packetMatchAnchorMatched: true,
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_SHADOW_MISMATCH'))).toBe(false);

    driver.dispose();
  });

  test('emits ASR_VISUAL_CONTROL_DECISION during live ASR ticks when shadow mode is enabled', async () => {
    window.localStorage.setItem('asr_visual_chairperson_shadow', '1');
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 1,
      matchId: 'chairperson-live-tick',
      source: 'openai-whisper-bridge',
      runKey: 'chairperson-live-tick',
      runGeneration: 6,
      speechRunningActual: true,
      match: {
        bestIdx: 1,
        bestSim: 0.99,
        topScores: [{ idx: 1, score: 0.99 }],
      },
    });

    await jest.advanceTimersByTimeAsync(80);

    const lines = [
      ...consoleInfoSpy.mock.calls.map((call) => String(call[0] || '')),
      ...consoleWarnSpy.mock.calls.map((call) => String(call[0] || '')),
    ];
    const decisionLine = lines.find((line) => line.includes('ASR_VISUAL_CONTROL_DECISION')) || '';
    expect(decisionLine).toContain('mode=');
    expect(decisionLine).toContain('controlIntent=');
    expect(decisionLine).toContain('recoveryKind=');
    expect(decisionLine).toContain('legacySelectedAuthority=');
    expect(decisionLine).toContain('ownershipActive=0');

    driver.dispose();
    window.localStorage.removeItem('asr_visual_chairperson_shadow');
  });

  test('emits ASR_VISUAL_CONTROL_DECISION with ownershipActive=1 only when chairperson ownership is enabled', async () => {
    window.localStorage.setItem('asr_visual_chairperson_owner', '1');
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 1,
      matchId: 'chairperson-owner-live-tick',
      source: 'openai-whisper-bridge',
      runKey: 'chairperson-owner-live-tick',
      runGeneration: 7,
      speechRunningActual: true,
      match: {
        bestIdx: 1,
        bestSim: 0.99,
        topScores: [{ idx: 1, score: 0.99 }],
      },
    });

    await jest.advanceTimersByTimeAsync(80);

    const lines = [
      ...consoleInfoSpy.mock.calls.map((call) => String(call[0] || '')),
      ...consoleWarnSpy.mock.calls.map((call) => String(call[0] || '')),
    ];
    const proofLine = lines.find((line) => line.includes('ASR_VISUAL_CONTROL_RUNTIME_PROOF')) || '';
    const decisionLine = lines.find((line) => line.includes('ASR_VISUAL_CONTROL_DECISION')) || '';
    expect(proofLine).toContain('liveTargetOwnership=1');
    expect(decisionLine).toContain('ownershipActive=1');

    driver.dispose();
    window.localStorage.removeItem('asr_visual_chairperson_owner');
  });

  test('previous-line rolling tail stays valid after legacy current line has advanced', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(2);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 2,
      matchId: 'shadow-previous-tail',
      source: 'openai-whisper-bridge',
      runKey: 'shadow-previous-tail',
      runGeneration: 9,
      speechRunningActual: true,
      match: {
        bestIdx: 2,
        bestSim: 0.98,
        topScores: [{ idx: 2, score: 0.98 }],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        currentLine: 2,
        wouldFreeze: false,
        previousLineMatched: true,
        currentLineMatched: false,
        mismatch: false,
        selectedNearbyWindow: 'previous',
        selectedAnchorSource: 'packet_match_local',
        packetMatchAnchorLine: 2,
        packetMatchAnchorMatched: true,
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_SHADOW_MISMATCH'))).toBe(false);

    driver.dispose();
  });

  test('candidate evaluation alone does not produce mismatch', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('temporary weird tangent words', false, {
      currentIdx: 1,
      matchId: 'shadow-interim-candidate',
      source: 'openai-whisper-bridge',
      runKey: 'shadow-interim',
      runGeneration: 6,
      speechRunningActual: true,
      match: {
        bestIdx: 2,
        bestSim: 0.98,
        topScores: [{ idx: 2, score: 0.98 }],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        wouldFreeze: true,
        legacyMoved: false,
        mismatch: false,
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_SHADOW_MISMATCH'))).toBe(false);

    driver.dispose();
  });

  test('current-line rolling whisper tail stays valid when forward candidate exists', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('Farebox chirps, coffee lids do that little click. Farebox chirps.', false, {
      currentIdx: 1,
      matchId: 'shadow-current-tail-repeat',
      source: 'openai-whisper-bridge',
      runKey: 'shadow-current-tail-repeat',
      runGeneration: 10,
      speechRunningActual: true,
      match: {
        bestIdx: 2,
        bestSim: 0.96,
        topScores: [{ idx: 2, score: 0.96 }],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        currentLine: 1,
        wouldFreeze: false,
        currentLineMatched: true,
        mismatch: false,
        selectedAnchorSource: 'packet_match_local',
        packetMatchAnchorLine: 2,
        packetMatchAnchorMatched: true,
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_SHADOW_MISMATCH'))).toBe(false);

    driver.dispose();
  });

  test('packet match anchor rescues valid transcript text when legacy current has drifted ahead', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(3);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 3,
      matchId: 'shadow-packet-anchor-rescue',
      source: 'openai-whisper-bridge',
      runKey: 'shadow-packet-anchor-rescue',
      runGeneration: 11,
      speechRunningActual: true,
      match: {
        bestIdx: 1,
        bestSim: 0.94,
        topScores: [{ idx: 1, score: 0.94 }],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        currentLine: 3,
        wouldFreeze: false,
        packetMatchAnchorLine: 1,
        packetMatchAnchorMatched: true,
        packetMatchAnchorSim: 0.94,
        selectedAnchorSource: 'packet_match_local',
        mismatch: false,
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_SHADOW_MISMATCH'))).toBe(false);

    driver.dispose();
  });

  test('emits mismatch only when legacy forward movement is accepted while ASR4 would freeze', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    driver.ingest('wildly off script but matcher says go forward', true, {
      currentIdx: 0,
      matchId: 'shadow-mismatch-forward',
      source: 'openai-whisper-bridge',
      runKey: 'shadow-mismatch',
      runGeneration: 7,
      speechRunningActual: true,
      match: {
        bestIdx: 1,
        bestSim: 0.995,
        topScores: [{ idx: 1, score: 0.995 }],
      },
    });

    await jest.advanceTimersByTimeAsync(400);

    const shadow = (window as any).__tpAsr4ShadowLast;
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(0);
    expect(shadow).toEqual(
      expect.objectContaining({
        currentLine: 0,
        legacyMoved: expect.any(Boolean),
      }),
    );
    if (shadow.legacyMoved) {
      expect(shadow.wouldFreeze).toBe(true);
      expect(shadow.mismatch).toBe(true);
      expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_SHADOW_MISMATCH'))).toBe(true);
    }

    driver.dispose();
  });

  test('shadow diagnostic failure does not suppress snapshot updates or legacy control flow', async () => {
    consoleInfoSpy.mockImplementation((line: unknown) => {
      if (String(line || '').includes('ASR4_FRESH_TAIL_VETO')) {
        throw new Error('shadow diag exploded');
      }
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('COMPLETELY unrelated toaster monologue', true, {
      currentIdx: 1,
      noMatch: true,
      source: 'openai-whisper-bridge',
      runKey: 'shadow-diagnostic-failure',
      runGeneration: 8,
      speechRunningActual: true,
      match: {
        bestIdx: -1,
        bestSim: Number.NaN,
        topScores: [],
      },
    });

    await jest.advanceTimersByTimeAsync(64);

    expect(driver.getLastLineIndex()).toBe(1);
    expect((window as any).__tpAsr4ShadowLast).toEqual(
      expect.objectContaining({
        wouldFreeze: true,
        mismatch: false,
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_OPTIONAL_DIAGNOSTIC_ERROR') && String(call[0] || '').includes('ASR4_FRESH_TAIL_VETO'))).toBe(true);

    driver.dispose();
  });

  test('accepted forward commit with visible movement does not trigger visual recovery authority', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 0,
      afterScrollTop: 120,
      movedPx: 120,
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        consecutiveNoMoveCommits: 0,
      }),
    );
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_STATE'))).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('one moved=0 accepted commit emits visual recovery state but no authority', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        consecutiveNoMoveCommits: 1,
      }),
    );
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_STATE'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('two consecutive moved=0 accepted forward commits triggers visual recovery authority', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });

    expect(result.applied).toBe(true);
    expect(result.afterScrollTop).toBeGreaterThan(0);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED'))).toBe(true);

    driver.dispose();
  });

  test('live scroll stalled after accepted forward commit triggers visual recovery', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
      liveScrollStalled: true,
    });

    expect(result.applied).toBe(true);
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('liveScrollStalled=1'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED'))).toBe(true);

    driver.dispose();
  });

  test('visual recovery corrects only to accepted/current local line, not far target', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });

    expect(result.applied).toBe(false);
    expect(result.afterScrollTop).toBe(0);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('authorityAction=freeze_far_visual_target'))).toBe(true);

    driver.dispose();
  });

  test('same-line no-op does not trigger visual recovery', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 1,
      targetLine: 1,
      beforeScrollTop: 0,
      afterScrollTop: 0,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        consecutiveNoMoveCommits: 0,
      }),
    );
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_STATE'))).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('ASR4 visual recovery does not fire when line is already in pocket', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
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
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveNoMoveCommits: number;
      };
    };

    driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 930,
      afterScrollTop: 930,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 930,
      afterScrollTop: 930,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });

    expect(result.applied).toBe(false);
    expect(
      consoleInfoSpy.mock.calls.some((call) => {
        const line = String(call[0] || '');
        return line.includes('suppressedReason=not_needed_in_pocket') || line.includes('suppressedReason=suppressed_already_ahead');
      }),
    ).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('pocket drift state emits in-pocket observation without authority', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift(args: {
        currentLine: number;
        committedLine: number;
        targetLine?: number | null;
        nextSpeakableLineIdx?: number | null;
        currentScrollTop?: number;
        targetScrollTop?: number | null;
        movedPx?: number;
        directWriteBlocked?: boolean;
        targetPreservedForEasing?: boolean;
        visualSnapSuppressed?: boolean;
        terminalClampActive?: boolean;
        liveScrollStalled?: boolean;
        followMode?: string;
        scrollReason?: string;
        reason?: string;
        previousHoldReason?: string | null;
      }): {
        applied: boolean;
        afterScrollTop: number;
        movedPx: number;
        consecutiveBelowPocketCount: number;
        state: {
          pocketHealth: string;
          belowPocketPx: number;
        };
      };
    };

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 930,
      targetScrollTop: 930,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_in_pocket',
    });

    expect(result.applied).toBe(false);
    expect(result.consecutiveBelowPocketCount).toBe(0);
    expect(['inPocket', 'abovePocket']).toContain(result.state.pocketHealth);
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_POCKET_DRIFT_STATE'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_POCKET_DRIFT_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('slight pocket drift under one line height does not trigger authority', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 860,
      targetScrollTop: 900,
      movedPx: 10,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_under_threshold',
    });

    expect(result.applied).toBe(false);
    expect(result.consecutiveBelowPocketCount).toBe(0);
    expect(result.state.belowPocketPx).toBeLessThan(result.state.lineHeightPx);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_POCKET_DRIFT_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('deadband hold stays valid when below-pocket drift remains within tolerance', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 893,
      targetScrollTop: 893,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_small_drift',
      previousHoldReason: 'existing_target_within_deadband',
    });

    expect(result.applied).toBe(false);
    expect(result.state.belowPocketPx).toBeLessThanOrEqual(24);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_DEADBAND_RECONCILED'))).toBe(false);
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_DEADBAND_BLOCKED'))).toBe(false);

    driver.dispose();
  });

  test('pocket drift below pocket for two consecutive observations triggers authority', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 8,
      targetPreservedForEasing: true,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_below_pocket_1',
    });
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 8,
      targetPreservedForEasing: true,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_below_pocket_2',
    });

    expect(result.applied).toBe(true);
    expect(result.afterScrollTop).toBeGreaterThan(650);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_POCKET_DRIFT_AUTHORITY_APPLIED'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('authorityAction=force_marker_lock_to_pocket'))).toBe(true);

    driver.dispose();
  });

  test('deadband hold is invalidated after repeated below-pocket no-move observations', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    const first = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 650,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_low_pocket_deadband_1',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const second = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 650,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_low_pocket_deadband_2',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const third = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 650,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_low_pocket_deadband_3',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const result = [first, second, third].find((entry) => entry.applied) ?? third;

    expect([first.applied, second.applied, third.applied]).toContain(true);
    expect(result.afterScrollTop).toBeGreaterThan(650);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_DEADBAND_RECONCILED'))).toBe(true);

    driver.dispose();
  });

  test('far pocket drift target freezes instead of jumping', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 8,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_far_target_1',
    });
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 8,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_far_target_2',
    });

    expect(result.applied).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('authorityAction=freeze_far_target'))).toBe(true);

    driver.dispose();
  });

  test('deadband reconciliation correction stays bounded', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    const first = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_bounded_1',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const second = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_bounded_2',
      previousHoldReason: 'existing_target_within_deadband',
    });

    const third = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_bounded_3',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const result = [first, second, third].find((entry) => entry.applied) ?? third;

    expect([first.applied, second.applied, third.applied]).toContain(true);
    expect(result.movedPx).toBeLessThanOrEqual(Math.round(236 * 1.5));

    driver.dispose();
  });

  test('deadband reconciliation refuses far unsafe targets', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_unsafe_1',
      previousHoldReason: 'existing_target_within_deadband',
    });
    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_unsafe_2',
      previousHoldReason: 'existing_target_within_deadband',
    });
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_deadband_unsafe_3',
      previousHoldReason: 'existing_target_within_deadband',
    });

    expect(result.applied).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_DEADBAND_RECONCILED'))).toBe(false);
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_DEADBAND_BLOCKED') && String(call[0] || '').includes('reason=unsafe_target'))).toBe(true);

    driver.dispose();
  });

  test('freeze-far-target low-pocket stall allows bounded local semantic rescue', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    const first = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      nextSpeakableLineIdx: 2,
      currentScrollTop: 650,
      targetScrollTop: 650,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_freeze_far_reconcile_1',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const second = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      nextSpeakableLineIdx: 2,
      currentScrollTop: 650,
      targetScrollTop: 650,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_freeze_far_reconcile_2',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const result = [first, second].find((entry) => entry.applied) ?? second;

    expect([first.applied, second.applied]).toContain(true);
    expect(result.afterScrollTop).toBeGreaterThan(650);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_FREEZE_FAR_TARGET_RECONCILED'))).toBe(true);

    driver.dispose();
  });

  test('freeze-far-target low-pocket stall stays blocked for truly unsafe semantic distance', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    const first = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      nextSpeakableLineIdx: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_freeze_far_blocked_1',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const second = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 3,
      targetLine: 5,
      nextSpeakableLineIdx: 5,
      currentScrollTop: 650,
      targetScrollTop: 1500,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_freeze_far_blocked_2',
      previousHoldReason: 'existing_target_within_deadband',
    });
    const result = [first, second].find((entry) => entry.applied) ?? second;

    expect(result.applied).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_FREEZE_FAR_TARGET_RECONCILED'))).toBe(false);
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LOW_POCKET_FREEZE_FAR_TARGET_BLOCKED') && String(call[0] || '').includes('blockedReason=semantic_distance_unsafe'))).toBe(true);

    driver.dispose();
  });

  test('terminal clamp suppresses pocket correction', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 8,
      terminalClampActive: true,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_terminal_1',
    });
    consoleWarnSpy.mockClear();

    const result = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 8,
      terminalClampActive: true,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_terminal_2',
    });

    expect(result.applied).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('authorityAction=suppress_terminal_clamp'))).toBe(true);

    driver.dispose();
  });

  test('pocket drift cooldown prevents repeated corrections every tick', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };

    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 8,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_cooldown_1',
    });
    const first = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: 650,
      targetScrollTop: 950,
      movedPx: 8,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_cooldown_2',
    });
    expect(first.applied).toBe(true);
    consoleWarnSpy.mockClear();

    const second = driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      currentScrollTop: first.afterScrollTop,
      targetScrollTop: 950,
      movedPx: 0,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'test_cooldown_3',
    });

    expect(second.applied).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_POCKET_DRIFT_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('pending bridge under 2000ms preserves legacy pending completion behavior', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugSeedPendingSpeakableBridge(args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        ageMs?: number;
        proofSource?: string;
        sourceBranch?: string;
      }): void;
    };
    configureRecoveryBridgeScript();

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);
    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 3,
      semanticTarget: 6,
      visualCurrent: 4,
      visualReducedTarget: 4,
      ageMs: 1100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });
    expect((window as any).__tpAsrScrollState?.pendingSpeakableBridge).toEqual(
      expect.objectContaining({
        semanticFrom: 3,
        semanticTarget: 6,
      }),
    );
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'recovery-shadow-under-budget-retry',
      runKey: 'recovery-shadow-under-budget',
      runGeneration: 1,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });

    await jest.advanceTimersByTimeAsync(350);

    expect((window as any).__tpAsr4RecoveryLast).toEqual(
      expect.objectContaining({
        currentLine: 3,
        targetLine: 6,
        recoveryState: 'recovering',
        wouldFreeze: false,
        holdReason: 'pending_bridge_completion_ready',
      }),
    );
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_RECOVERY_BUDGET_STATE'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_RECOVERY_BUDGET_VIOLATION'))).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LIVE_BRIDGE_STALE_LANDING_HOLD_BYPASSED_BY_PENDING_COMPLETION'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED'))).toBe(false);

    driver.dispose();
  });

  test('pending bridge at or beyond 2000ms blocks stale pending completion bypass and emits authority applied', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugSeedPendingSpeakableBridge(args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        ageMs?: number;
        proofSource?: string;
        sourceBranch?: string;
      }): void;
    };
    configureRecoveryBridgeScript();

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);
    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 3,
      semanticTarget: 6,
      visualCurrent: 4,
      visualReducedTarget: 4,
      ageMs: 2100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });
    expect((window as any).__tpAsrScrollState?.pendingSpeakableBridge).toEqual(
      expect.objectContaining({
        semanticFrom: 3,
        semanticTarget: 6,
      }),
    );
    const lineBeforeRetry = driver.getLastLineIndex();
    consoleInfoSpy.mockClear();
    consoleWarnSpy.mockClear();

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'recovery-shadow-over-budget-retry',
      runKey: 'recovery-shadow-over-budget',
      runGeneration: 2,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });

    await jest.advanceTimersByTimeAsync(350);

    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(lineBeforeRetry);
    expect((window as any).__tpAsr4RecoveryLast).toEqual(
      expect.objectContaining({
        currentLine: 3,
        targetLine: 6,
        recoveryState: 'freeze',
        wouldFreeze: true,
        holdReason: expect.any(String),
      }),
    );
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_RECOVERY_BUDGET_VIOLATION'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_LIVE_BRIDGE_STALE_LANDING_HOLD_BYPASSED_BY_PENDING_COMPLETION'))).toBe(false);

    driver.dispose();
  });

  test('fresh bounded forward anchor still advances one safe step under stale-landing pressure', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugSeedPendingSpeakableBridge(args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        ageMs?: number;
        proofSource?: string;
        sourceBranch?: string;
      }): void;
    };
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Driving through northern Orlando.</div>
      <div class="line" data-line="1" style="line-height:24px;">Not perfume amazing.</div>
      <div class="line" data-line="2" style="line-height:24px;">It was thick.</div>
      <div class="line" data-line="3" style="line-height:24px;">You felt it at stoplights.</div>
      <div class="line" data-line="4" style="line-height:24px;">Then the rain gathered.</div>
      <div class="line" data-line="5" style="line-height:24px;">Then the rain broke.</div>
    `;
    const metrics = Array.from({ length: 6 }, (_, idx) => ({ top: idx * 360, height: 236 }));
    Array.from(script.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = metrics[idx];
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 4200 });
    scroller.scrollTop = 0;
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);
    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 3,
      semanticTarget: 6,
      visualCurrent: 4,
      visualReducedTarget: 4,
      ageMs: 2100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });
    consoleWarnSpy.mockClear();

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'recovery-stale-landing-relaxed-1',
      runKey: 'recovery-stale-landing-relaxed',
      runGeneration: 7,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 5,
        bestSim: 0.92,
        topScores: [{ idx: 5, score: 0.92 }],
      },
    });

    await jest.advanceTimersByTimeAsync(350);

    expect(driver.getLastLineIndex()).toBe(4);

    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 4,
      semanticTarget: 5,
      visualCurrent: 5,
      visualReducedTarget: 5,
      ageMs: 2100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 4,
      matchId: 'recovery-stale-landing-relaxed-2',
      runKey: 'recovery-stale-landing-relaxed',
      runGeneration: 7,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 5,
        bestSim: 0.92,
        topScores: [{ idx: 5, score: 0.92 }],
      },
    });

    await jest.advanceTimersByTimeAsync(150);

    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(4);
    expect(driver.getLastLineIndex()).toBeLessThanOrEqual(5);

    driver.dispose();
  });

  test('explicit noMatch keeps stale-landing relaxation blocked', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugSeedPendingSpeakableBridge(args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        ageMs?: number;
        proofSource?: string;
        sourceBranch?: string;
      }): void;
    };
    configureRecoveryBridgeScript();

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);
    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 3,
      semanticTarget: 6,
      visualCurrent: 4,
      visualReducedTarget: 4,
      ageMs: 2100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });
    consoleWarnSpy.mockClear();

    driver.ingest('completely unrelated toaster monologue', true, {
      currentIdx: 3,
      noMatch: true,
      runKey: 'recovery-stale-landing-nomatch',
      runGeneration: 8,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: -1,
        bestSim: Number.NaN,
        topScores: [],
      },
    });

    await jest.advanceTimersByTimeAsync(350);

    expect(driver.getLastLineIndex()).toBe(3);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_STALE_LANDING_RELAXED_FOR_FRESH_FORWARD_ANCHOR'))).toBe(false);

    driver.dispose();
  });

  test('far forward reduced target does not use stale-landing relaxation', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugSeedPendingSpeakableBridge(args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        ageMs?: number;
        proofSource?: string;
        sourceBranch?: string;
      }): void;
    };
    configureRecoveryBridgeScript();

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);
    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 3,
      semanticTarget: 6,
      visualCurrent: 5,
      visualReducedTarget: 5,
      ageMs: 2100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });
    consoleWarnSpy.mockClear();

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'recovery-stale-landing-far-forward',
      runKey: 'recovery-stale-landing-far-forward',
      runGeneration: 9,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 6,
        bestSim: 0.92,
        topScores: [{ idx: 6, score: 0.92 }],
      },
    });

    await jest.advanceTimersByTimeAsync(350);

    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_STALE_LANDING_RELAXED_FOR_FRESH_FORWARD_ANCHOR'))).toBe(false);

    driver.dispose();
  });

  test('fresh local proof after stale bridge expiration can still move normally', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugSeedPendingSpeakableBridge(args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        ageMs?: number;
        proofSource?: string;
        sourceBranch?: string;
      }): void;
    };
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Driving through northern Orlando.</div>
      <div class="line" data-line="1" style="line-height:24px;">Not perfume amazing.</div>
      <div class="line" data-line="2" style="line-height:24px;">It was thick.</div>
      <div class="line" data-line="3" style="line-height:24px;">You felt it at stoplights.</div>
      <div class="line" data-line="4" style="line-height:24px;">Then the rain gathered.</div>
      <div class="line" data-line="5" style="line-height:24px;">Then the rain broke.</div>
    `;
    const metrics = Array.from({ length: 6 }, (_, idx) => ({ top: idx * 360, height: 236 }));
    Array.from(script.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = metrics[idx];
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 4200 });
    scroller.scrollTop = 0;
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);
    driver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 3,
      semanticTarget: 5,
      visualCurrent: 4,
      visualReducedTarget: 4,
      ageMs: 2100,
      proofSource: 'bridge_support',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
    });
    expect((window as any).__tpAsrScrollState?.pendingSpeakableBridge).toEqual(
      expect.objectContaining({
        semanticFrom: 3,
        semanticTarget: 5,
      }),
    );

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'recovery-authority-expire-retry',
      runKey: 'recovery-authority-expire-seed',
      runGeneration: 3,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 5,
        bestSim: 0.9,
        topScores: [{ idx: 5, score: 0.9 }],
      },
    });

    await jest.advanceTimersByTimeAsync(350);
    const afterExpirationLine = driver.getLastLineIndex();

    driver.ingest('Then the rain broke.', true, {
      currentIdx: afterExpirationLine,
      matchId: 'recovery-authority-fresh-proof',
      runKey: 'recovery-authority-expire-seed',
      runGeneration: 3,
      source: 'openai-whisper-bridge',
      speechRunningActual: true,
      match: {
        bestIdx: 5,
        bestSim: 0.97,
        topScores: [{ idx: 5, score: 0.97 }],
      },
    });

    await jest.advanceTimersByTimeAsync(600);

    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED'))).toBe(true);
    expect(driver.getLastLineIndex()).toBeGreaterThan(afterExpirationLine);

    driver.dispose();
  });
});
