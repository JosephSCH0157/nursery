/** @jest-environment jsdom */

import { ASR_LANE_ASR1, ASR_LANE_ASR2 } from '../../src/dev/dev-state';
import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR visual landing recenter', () => {
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
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
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: idx * 567 });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: 236 });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: 236 });
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
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: ASR_LANE_ASR1 };
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

  test('min_step_floor cannot overshoot target', () => {
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: ASR_LANE_ASR2 };
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyVisualActuatorTargetStep(args: any): any;
    };

    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 100,
      targetScrollTop: 104,
      requestedMovePx: 0,
      effectiveMinStepPx: 34,
      currentLineIdx: 1,
      committedLineIdx: 1,
      nextSpeakableLineIdx: 1,
      authority: 'pocket_authority',
      authorityReason: 'within_correction_tolerance_but_outside_hold_tolerance',
      allowedTargetIdx: 1,
      lastVerifiedCommitLineIdx: 1,
      lastVerifiedCommitAgeMs: 0,
    });

    expect(result.afterTop).toBe(104);
    expect(result.clampReason).toBe('min_step_floor');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_VISUAL_TARGET_BOUNDED_STEP'))).toBe(false);

    driver.dispose();
  });

  test('preferred_lower_rail_release clamps to target when target is closer than min step', () => {
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: ASR_LANE_ASR2 };
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyVisualActuatorTargetStep(args: any): any;
    };

    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 817,
      targetScrollTop: 843,
      requestedMovePx: 12,
      effectiveMinStepPx: 34,
      currentLineIdx: 5,
      committedLineIdx: 5,
      nextSpeakableLineIdx: 5,
      authority: 'preferred_lower_rail_release',
      authorityReason: 'preferred_lower_rail_not_settled',
      allowedTargetIdx: 5,
      lastVerifiedCommitLineIdx: 5,
      lastVerifiedCommitAgeMs: 0,
    });

    expect(result.afterTop).toBe(843);

    driver.dispose();
  });

  test('comfort_nudge_follow clamps to target when target is closer than min step', () => {
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: ASR_LANE_ASR2 };
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyVisualActuatorTargetStep(args: any): any;
    };

    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 3360,
      targetScrollTop: 3426,
      requestedMovePx: 10,
      effectiveMinStepPx: 144,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 8,
      authority: 'comfort_nudge_follow',
      authorityReason: 'marker_error_within_tolerance',
      allowedTargetIdx: 8,
      lastVerifiedCommitLineIdx: 8,
      lastVerifiedCommitAgeMs: 0,
    });

    expect(result.afterTop).toBe(3426);

    driver.dispose();
  });

  test('when currentTop is above target pocket authority can apply bounded pullback', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyVisualActuatorTargetStep(args: any): any;
      getLastLineIndex(): number;
    };

    const beforeLine = driver.getLastLineIndex();
    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 3775,
      targetScrollTop: 3698,
      requestedMovePx: 20,
      effectiveMinStepPx: 34,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 8,
      authority: 'pocket_authority',
      authorityReason: 'marker_error_line_too_high',
      allowedTargetIdx: 8,
      lastVerifiedCommitLineIdx: 8,
      lastVerifiedCommitAgeMs: 0,
    });

    expect(result.usedPullback).toBe(true);
    expect(result.afterTop).toBeLessThan(3775);
    expect(result.afterTop).toBeGreaterThanOrEqual(3698);
    expect(driver.getLastLineIndex()).toBe(beforeLine);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_VISUAL_RECENTER_PULLBACK_APPLIED'))).toBe(true);

    driver.dispose();
  });

  test('no forward writes while already above target', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    for (const authority of ['asr-tick', 'pocket_authority', 'asr4-visual-recovery-authority']) {
      const result = driver.__debugApplyScrollWithHybridGuard({
        beforeScrollTop: 3775,
        proposedTop: 3809,
        targetScrollTop: 3698,
        currentLineIdx: 8,
        committedLineIdx: 8,
        nextSpeakableLineIdx: 8,
        allowedTargetIdx: 8,
        selectedAuthority: authority,
        authorityReason: 'marker_error_line_too_high',
        lastVerifiedCommitLineIdx: 8,
        lastVerifiedCommitAgeMs: 500,
      });

      expect(result.appliedTop).toBe(3775);
      expect(result.reason).toBe('visual_forward_overshoot_suppressed');
    }
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_VISUAL_FORWARD_OVERSHOOT_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('pullback blocked by contradiction keeps committed line stable', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyVisualActuatorTargetStep(args: any): any;
      getLastLineIndex(): number;
    };

    const beforeLine = driver.getLastLineIndex();
    const result = driver.__debugApplyVisualActuatorTargetStep({
      beforeScrollTop: 3775,
      targetScrollTop: 3698,
      requestedMovePx: 20,
      effectiveMinStepPx: 34,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 8,
      authority: 'pocket_authority',
      authorityReason: 'marker_error_line_too_high',
      allowedTargetIdx: 8,
      lastVerifiedCommitLineIdx: 8,
      lastVerifiedCommitAgeMs: 0,
      hardContradiction: true,
    });

    expect(result.blockedPullback).toBe(true);
    expect(result.afterTop).toBe(3775);
    expect(driver.getLastLineIndex()).toBe(beforeLine);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_VISUAL_RECENTER_PULLBACK_BLOCKED'))).toBe(true);

    driver.dispose();
  });
});
