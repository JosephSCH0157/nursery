/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR pocket wall live visual guard', () => {
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/?dev=1');
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0" style="line-height:24px;">Zero.</div>
          <div class="line" data-line="1" style="line-height:24px;">One.</div>
          <div class="line" data-line="2" style="line-height:24px;">Two.</div>
          <div class="line" data-line="3" style="line-height:24px;">Three.</div>
          <div class="line" data-line="4" style="line-height:24px;">Four.</div>
          <div class="line" data-line="5" style="line-height:24px;">Five.</div>
        </div>
      </main>
    `;
    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 4000 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
    });
    scroller.scrollTop = 0;
    const metrics = Array.from({ length: 6 }, (_, idx) => ({ top: idx * 567, height: 236 }));
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
    window.history.replaceState({}, '', '/');
  });

  test('hold authority with forward proposedTop suppresses', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1512,
      proposedTop: 1599,
      targetScrollTop: 1531,
      currentLineIdx: 23,
      committedLineIdx: 23,
      nextSpeakableLineIdx: 23,
      allowedTargetIdx: 23,
      selectedAuthority: 'hold',
      authorityReason: 'marker_error_within_tolerance',
      lastVerifiedCommitLineIdx: 23,
      lastVerifiedCommitAgeMs: 209,
    });

    expect(result.effectiveTop).toBe(1512);
    expect(result.appliedTop).toBe(1512);
    expect(result.reason).toBe('hold_forward_write_suppressed');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_HOLD_FORWARD_WRITE_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('unchanged line indexes with proposedTop above target caps to target tolerance', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1709,
      proposedTop: 1803,
      targetScrollTop: 1727,
      currentLineIdx: 26,
      committedLineIdx: 26,
      nextSpeakableLineIdx: 26,
      allowedTargetIdx: 26,
      selectedAuthority: 'pocket_authority',
      authorityReason: 'within_correction_tolerance_but_outside_hold_tolerance',
      lastVerifiedCommitLineIdx: 26,
      lastVerifiedCommitAgeMs: 300,
    });

    expect(result.effectiveTop).toBeLessThanOrEqual(1727 + result.tolerancePx);
    expect(result.appliedTop).toBeLessThanOrEqual(1727 + result.tolerancePx);
    expect(result.appliedTop).toBeGreaterThanOrEqual(1709);
    expect(result.reason).toBe('same_line_overshoot_capped');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_SAME_LINE_OVERSHOOT_CAPPED'))).toBe(true);

    driver.dispose();
  });

  test('allowedTargetIdx=-1 blocks forward movement', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1967,
      proposedTop: 2075,
      targetScrollTop: 1999,
      currentLineIdx: 30,
      committedLineIdx: 30,
      nextSpeakableLineIdx: 30,
      allowedTargetIdx: -1,
      selectedAuthority: 'preferred_lower_rail_release',
      authorityReason: 'preferred_lower_rail_not_settled',
      lastVerifiedCommitLineIdx: 30,
      lastVerifiedCommitAgeMs: 209,
    });

    expect(result.effectiveTop).toBe(1967);
    expect(result.appliedTop).toBe(1967);
    expect(result.reason).toBe('no_safe_target_forward_suppressed');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_NO_SAFE_TARGET_FORWARD_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('no_safe_allowed_target blocks forward movement', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1512,
      proposedTop: 1599,
      targetScrollTop: 1531,
      currentLineIdx: 23,
      committedLineIdx: 23,
      nextSpeakableLineIdx: 23,
      allowedTargetIdx: 23,
      selectedAuthority: 'pocket_authority',
      authorityReason: 'no_safe_allowed_target',
      lastVerifiedCommitLineIdx: 23,
      lastVerifiedCommitAgeMs: 209,
    });

    expect(result.effectiveTop).toBe(1512);
    expect(result.appliedTop).toBe(1512);
    expect(result.reason).toBe('no_safe_target_forward_suppressed');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_NO_SAFE_TARGET_FORWARD_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('backward correction remains allowed', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1599,
      proposedTop: 1531,
      targetScrollTop: 1531,
      currentLineIdx: 23,
      committedLineIdx: 23,
      nextSpeakableLineIdx: 23,
      allowedTargetIdx: 23,
      selectedAuthority: 'hold',
      authorityReason: 'marker_error_line_too_high',
      lastVerifiedCommitLineIdx: 23,
      lastVerifiedCommitAgeMs: 209,
    });

    expect(result.effectiveTop).toBe(1531);
    expect(result.appliedTop).toBe(1531);
    expect(result.reason).toBe('backward_correction_allowed');

    driver.dispose();
  });

  test('fresh verified forward commit still allows bounded forward movement', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1512,
      proposedTop: 1544,
      targetScrollTop: 1540,
      currentLineIdx: 23,
      committedLineIdx: 23,
      nextSpeakableLineIdx: 24,
      allowedTargetIdx: 24,
      selectedAuthority: 'pocket_authority',
      authorityReason: 'fresh_adjacent_under_hold',
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      lastVerifiedCommitLineIdx: 23,
      lastVerifiedCommitAgeMs: 120,
    });

    expect(result.hasFreshVerifiedForwardCommit).toBe(true);
    expect(result.appliedTop).toBeGreaterThan(1512);
    expect(result.appliedTop).toBeLessThanOrEqual(1540 + result.tolerancePx);
    expect(result.reason).toBe('fresh_verified_forward_commit');

    driver.dispose();
  });
});
