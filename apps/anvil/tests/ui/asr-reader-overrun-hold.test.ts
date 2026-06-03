/** @jest-environment jsdom */

import { ASR_LANE_ASR1, ASR_LANE_ASR2 } from '../../src/dev/dev-state';
import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('legacy ASR reader overrun hold', () => {
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  const setRuntimeLane = (lane: string) => {
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: lane };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: (window as any).__tpAsrRuntimeStatus,
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

  test('ASR1 visual recovery stays held while the current line is within the 3-line overrun buffer', () => {
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

    expect(result.applied).toBe(false);
    expect(result.afterScrollTop).toBe(800);

    driver.dispose();
  });

  test('ASR1 pocket drift does not relock while the reader is inside the overrun buffer', () => {
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

    expect(result.applied).toBe(false);
    expect(result.afterScrollTop).toBe(650);

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
});
