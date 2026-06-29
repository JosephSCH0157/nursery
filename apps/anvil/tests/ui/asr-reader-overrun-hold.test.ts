/** @jest-environment jsdom */

import { ASR_LANE_ASR1, ASR_LANE_ASR2 } from '../../src/dev/dev-state';
import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('legacy ASR reader overrun hold', () => {
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  const setRuntimeLane = (lane: string) => {
    (window as any).__tpAsrRuntimeStatus = {
      ...((window as any).__tpAsrRuntimeStatus || {}),
      activeAsrLane: lane,
    };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: (window as any).__tpAsrRuntimeStatus,
    }));
  };

  const setFreshSpeechRuntime = () => {
    (window as any).__tpAsrRuntimeStatus = {
      ...((window as any).__tpAsrRuntimeStatus || {}),
      recognizerAttached: true,
      activeReadMode: true,
      speechRunningActual: true,
    };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: (window as any).__tpAsrRuntimeStatus,
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/?dev=1');
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0" style="line-height:24px;">Line 0.</div>
          <div class="line" data-line="1" style="line-height:24px;">Line 1.</div>
          <div class="line" data-line="2" style="line-height:24px;">Line 2.</div>
          <div class="line" data-line="3" style="line-height:24px;">Line 3.</div>
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
    delete (window as any).__tpAsrRuntimeStatus;
    window.history.replaceState({}, '', '/');
  });

  test('ASR1 visual recovery does not stay held when forward visual debt shows the reader is sinking', () => {
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
    setRuntimeLane(ASR_LANE_ASR1);

    driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 800,
      afterScrollTop: 800,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });
    const result = driver.__debugObserveAsr4VisualRecoveryCommit({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      beforeScrollTop: 800,
      afterScrollTop: 800,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
    });

    expect(result.consecutiveNoMoveCommits).toBe(2);
    expect(result.afterScrollTop).toBeGreaterThanOrEqual(800);
    expect(
      consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED')),
    ).toBe(true);
    expect(
      consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_READER_OVERRUN_HOLD')),
    ).toBe(false);

    driver.dispose();
  });

  test('ASR1 pocket drift does not relock when forward visual debt shows the reader is sinking', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };
    setRuntimeLane(ASR_LANE_ASR1);

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
      reason: 'reader_overrun_hold_probe_1',
    });
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
      reason: 'reader_overrun_hold_probe_2',
    });

    expect(result.consecutiveBelowPocketCount).toBe(2);
    expect(result.afterScrollTop).toBeGreaterThanOrEqual(650);
    expect(result.state.belowPocketPx).toBeGreaterThan(result.state.lineHeightPx);
    expect(['bottomReading', 'belowPocket']).toContain(result.state.pocketHealth);
    expect(
      consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR4_POCKET_DRIFT_AUTHORITY_APPLIED')),
    ).toBe(true);
    expect(
      consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_READER_OVERRUN_HOLD')),
    ).toBe(false);

    driver.dispose();
  });

  test('ASR2 does not enter the legacy reader overrun hold for the same pocket-drift observation', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };
    setRuntimeLane(ASR_LANE_ASR2);

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
      reason: 'reader_overrun_hold_lane_probe_1',
    });
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
      reason: 'reader_overrun_hold_lane_probe_2',
    });

    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_READER_OVERRUN_HOLD'))).toBe(false);

    driver.dispose();
  });

  test('ASR1 does not enter legacy reader overrun hold when speakable lead shows the reader is sinking', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugObserveAsr4PocketDrift: any;
    };
    setRuntimeLane(ASR_LANE_ASR1);

    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      nextSpeakableLineIdx: 7,
      currentScrollTop: 650,
      targetScrollTop: 980,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'reader_overrun_sinking_probe_1',
    });
    driver.__debugObserveAsr4PocketDrift({
      currentLine: 1,
      committedLine: 2,
      targetLine: 2,
      nextSpeakableLineIdx: 7,
      currentScrollTop: 650,
      targetScrollTop: 980,
      movedPx: 0,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      followMode: 'live_asr_follow',
      scrollReason: 'test',
      reason: 'reader_overrun_sinking_probe_2',
    });

    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_READER_OVERRUN_HOLD'))).toBe(false);

    driver.dispose();
  });

  test('owner-active post-commit recovery emits starvation evaluated proof for the late no-move hold shape', () => {
    window.history.replaceState({}, '', '/?dev=1&open=script&asr_visual_chairperson_owner=1');
    setFreshSpeechRuntime();
    setRuntimeLane(ASR_LANE_ASR1);
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
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 350;
    const metrics = [
      { top: 0, height: 236 },
      { top: 300, height: 236 },
      { top: 600, height: 236 },
      { top: 900, height: 236 },
    ];
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = metrics[idx];
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: metric.top });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: metric.height });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: metric.height });
      Object.defineProperty(lineEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: metric.top - scroller.scrollTop,
          left: 0,
          right: 800,
          bottom: metric.top - scroller.scrollTop + metric.height,
          width: 800,
          height: metric.height,
        }),
      });
    });

    for (let i = 0; i < 15; i += 1) {
      driver.__debugObserveAsr4VisualRecoveryCommit({
        currentLine: 1,
        committedLine: 2,
        targetLine: 2,
        beforeScrollTop: 350,
        afterScrollTop: 350,
        movedPx: 0,
        directWriteBlocked: true,
        targetPreservedForEasing: true,
        visualSnapSuppressed: true,
      });
    }

    expect(
      consoleInfoSpy.mock.calls.some((call) => {
        const line = String(call[0] || '');
        return line.includes('ASR_POST_COMMIT_RECOVERY_STARVATION_EVALUATED') &&
          line.includes('speechFresh=1') &&
          line.includes('ownershipActive=1') &&
          line.includes('visualSnapSuppressed=1') &&
          (
            line.includes('consecutiveNoMoveCommits=15') ||
            line.includes('consecutiveNoMoveCommits=4')
          );
      }),
    ).toBe(true);
    expect(
      consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_POST_COMMIT_RECOVERY_STARVATION_BYPASSED')),
    ).toBe(true);

    driver.dispose();
  });

});
