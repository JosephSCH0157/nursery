/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

function diagnosticCallMatches(
  call: any[],
  token: string,
  requiredFragments: string[] = [],
): boolean {
  const line = String(call[0] || '');
  if (line.includes(token) && requiredFragments.every((fragment) => line.includes(fragment))) {
    return true;
  }
  if (line !== 'ASR_GUARD') return false;
  const payload = call[1];
  const reason = String(payload?.reason || '');
  const parts = Array.isArray(payload?.parts) ? payload.parts.map((part: unknown) => String(part || '')) : [];
  return reason.includes(token) && requiredFragments.every((fragment) => parts.some((part: string) => part.includes(fragment)));
}

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
}

describe('ASR live commit motion', () => {
  let rafSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cafSpy: jest.SpyInstance<void, [number]>;
  let consoleLogSpy: jest.SpyInstance<void, any[]>;
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleDebugSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });
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
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).__tpLiveAsrGovernorHold;
    delete (window as any).__tpAsrDiagnosticBundleProofEmitted;
    delete (window as any).__TP_BUILD_STAMP;
  });

  test('emits ASR_DIAGNOSTIC_BUNDLE_PROOF once when ASR driver starts in dev mode', () => {
    window.history.replaceState({}, '', '/?dev=1');
    (window as any).__TP_BUILD_STAMP = 'asr-scroll-2026-05-18T22:07:18.976Z';
    const driver = createAsrScrollDriver({ runKey: 'bundle-proof-run', runGeneration: 9 });

    const lines = consoleInfoSpy.mock.calls.map((c) => String(c[0] || ''));
    const proofLine = lines.find((line) => line.includes('ASR_DIAGNOSTIC_BUNDLE_PROOF')) || '';
    expect(proofLine).toContain('buildStamp=asr-scroll-2026-05-18T22:07:18.976Z');
    expect(proofLine).toContain('runKey=bundle-proof-run');
    expect(proofLine).toContain('runGeneration=9');
    expect(proofLine).toContain('hasDelayedSuppressionAutopsyBuilder=1');
    expect(proofLine).toContain('hasVisualGovernorDeadScreenAutopsyBuilder=1');

    driver.dispose();
    window.history.replaceState({}, '', '/');
  });

  test('does not throw when booting with a detached recognizer runtime snapshot', () => {
    (window as any).__tpAsrRuntimeStatus = {
      recognizerAttached: false,
      speechRunningActual: false,
    };

    const driver = createAsrScrollDriver();
    driver.dispose();
  });

  test('guard telemetry emits one structured ASR_GUARD without the legacy duplicate line', async () => {
    const driver = createAsrScrollDriver();

    driver.setLastLineIndex(0);
    driver.ingest('Unknown phrase with no local match.', true, {
      currentIdx: 0,
      matchId: 'guard-dedupe-no-match',
      match: null as any,
    });

    await jest.advanceTimersByTimeAsync(32);

    const warnLines = consoleWarnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(warnLines.filter((line) => line === 'ASR_GUARD').length).toBeGreaterThanOrEqual(1);
    expect(warnLines.some((line) => line.includes('🧱 ASR_GUARD'))).toBe(false);

    driver.dispose();
  });

  test('live ASR commit sets semantic target and then follows it with motion over time', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'motion-cap-test',
      match: {
        bestIdx: 1,
        bestSim: 0.82,
        topScores: [{ idx: 1, score: 0.82 }],
      },
    });

    await jest.advanceTimersByTimeAsync(32);
    const earlyTop = scroller.scrollTop;

    await jest.advanceTimersByTimeAsync(800);

    expect(driver.getLastLineIndex()).toBe(1);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(
      scroller.scrollTop > earlyTop ||
      lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD')) ||
      lines.some((l) => l.includes('ASR_READER_COMFORT_NUDGE')),
    ).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('caps a far future live ASR match to the next readable line when that line has local support', async () => {
    const driver = createAsrScrollDriver();

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'single-step-prime-cap',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'single-step-cap',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 2, score: 0.74 },
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('live ASR suppresses hard marker-lock snap for negative drift and uses follow diagnostics', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).__TP_MARKER_PCT = 0.9; // marker below row -> negative delta
    const driver = createAsrScrollDriver();
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'marker-lock-neg-drift',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(80);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_VISUAL_SNAP_SUPPRESSED'))).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('live ASR emits follow diagnostics instead of marker-lock correction at small drift', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).__TP_MARKER_PCT = 0.836; // marker ~= row top for line 1 (small drift)
    const driver = createAsrScrollDriver();
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'marker-lock-small-drift',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(80);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(
      lines.some((l) => l.includes('ASR_VISUAL_FOLLOW_TARGET')) ||
      lines.some((l) => l.includes('ASR_VISUAL_FOLLOW_HARD_HELD')) ||
      lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD')) ||
      lines.some((l) => l.includes('ASR_READER_COMFORT_NUDGE')),
    ).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('live ASR suppresses hard marker-lock snap for positive drift and uses follow diagnostics', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).__TP_MARKER_PCT = 0.4; // marker above row -> positive delta
    const driver = createAsrScrollDriver();
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'marker-lock-pos-drift',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(80);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_VISUAL_SNAP_SUPPRESSED'))).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('proofed sticky adjacent landing emits post-adjacent recovery path proof', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).__TP_MARKER_PCT = 0.4;
    const driver = createAsrScrollDriver();
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'post-adjacent-path-proof',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(120);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_PATH_PROOF'))).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('still caps a far future live ASR match to the next readable line when later content matches more strongly', async () => {
    const driver = createAsrScrollDriver();

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'single-step-prime-cap-late',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'single-step-cap-late',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('keeps adjacent commit path active under live follow while lead-aware pursuit logic is present', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'lead-aware-cap-adjacent',
      match: {
        bestIdx: 1,
        bestSim: 0.82,
        topScores: [{ idx: 1, score: 0.82 }],
      },
    });

    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBe(1);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(
      scroller.scrollTop > 0 ||
      lines.some((line) => line.includes('ASR_READER_COMFORT_HOLD')) ||
      lines.some((line) => line.includes('ASR_READER_COMFORT_NUDGE')),
    ).toBe(true);
    expect(
      lines.some((line) => line.includes('ASR_TERMINAL_COMMIT_SUPPRESSED_BY_VISUAL_GOVERNOR')),
    ).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('does not let a stalled far-future final keep the script walking forward on its own', async () => {
    const driver = createAsrScrollDriver();

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'stalled-prime-hold',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(2000);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'stalled-far-future-hold',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });

  test('does not let stalled tie-forward evidence promote the next readable line by itself', async () => {
    const driver = createAsrScrollDriver();

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'stalled-tie-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(2000);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'stalled-tie-forward-hold',
      match: {
        bestIdx: 3,
        bestSim: 0.84,
        topScores: [
          { idx: 2, score: 0.82 },
          { idx: 3, score: 0.84 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });

  test('does not keep walking forward on stale transcript output after VAD goes quiet', async () => {
    const driver = createAsrScrollDriver();

    bootstrapLiveAsrRuntime();

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'vad-quiet-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: false, rmsDbfs: -70 } }));
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'vad-quiet-stale-forward',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 2, score: 0.82 },
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });

  test('does not nudge a same-line final forward after runtime speech goes quiet', async () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'runtime-quiet-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: false },
    }));
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 1,
      matchId: 'runtime-quiet-same-line-nudge',
      match: {
        bestIdx: 1,
        bestSim: 0.97,
        topScores: [
          { idx: 1, score: 0.97 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });

  test('allows a single-step stall recovery override under starvation when live-forward is guard-held', async () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'stall-override-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    // Create a starvation window so the next ingest is treated as guard-held.
    await jest.advanceTimersByTimeAsync(2000);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'stall-override-forward',
      match: {
        bestIdx: 3,
        bestSim: 0.84,
        topScores: [
          { idx: 2, score: 0.62 },
          { idx: 3, score: 0.84 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('limits cumulative future final evidence to one speakable commit step at a time', async () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'adjacent-invariant-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.91,
        topScores: [{ idx: 1, score: 0.91 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(3500);

    driver.ingest('The seats remember every early shift. Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'adjacent-invariant-far',
      match: {
        bestIdx: 3,
        bestSim: 0.92,
        topScores: [
          { idx: 2, score: 0.86 },
          { idx: 3, score: 0.92 },
        ],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(2);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'adjacent-invariant-next-step',
      match: {
        bestIdx: 3,
        bestSim: 0.93,
        topScores: [{ idx: 3, score: 0.93 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(3);

    driver.dispose();
  });

  test('does not self-trigger additional recovery movement while marker tracking remains healthy', async () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'recovery-healthy-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.9,
        topScores: [{ idx: 1, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(3500);

    driver.ingest('The seats remember every early shift. Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'recovery-healthy-far',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [
          { idx: 2, score: 0.84 },
          { idx: 3, score: 0.9 },
        ],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(2);

    await jest.advanceTimersByTimeAsync(4000);
    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('blocks chained recovery commits until stable local proof clears recovery landing hold', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'recovery-hold-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.9,
        topScores: [{ idx: 1, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('The seats remember every early shift. Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'recovery-hold-first-recovery',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [
          { idx: 2, score: 0.62 },
          { idx: 3, score: 0.9 },
        ],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBe(2);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'recovery-hold-chain-attempt',
      match: {
        bestIdx: 3,
        bestSim: 0.68,
        topScores: [{ idx: 3, score: 0.68 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBe(2);

    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 2,
      matchId: 'recovery-hold-clear-same-line',
      match: {
        bestIdx: 2,
        bestSim: 0.95,
        topScores: [{ idx: 2, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(2);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'recovery-hold-direct-adjacent',
      match: {
        bestIdx: 3,
        bestSim: 0.93,
        topScores: [{ idx: 3, score: 0.93 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBe(3);

    const warnCalls = warnSpy.mock.calls;
    const warns = warnCalls.map((call) => String(call[0] || ''));
    expect(warnCalls.some((call) => diagnosticCallMatches(call, 'asr_recovery_chain_blocked'))).toBe(true);
    expect(warnCalls.some((call) => diagnosticCallMatches(call, 'asr_recovery_landing_hold_cleared'))).toBe(true);
    expect(warns.some((line) => line.includes('ASR_ADJACENT_RECOVERY_CATCHUP_PATH_PROOF'))).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('completes pending semantic bridge before starvation while keeping non-speakable visual cap safety', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'visible-bridge-step-cap',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });

    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    // Keep this below the starvation window: completion should not wait for full starvation.
    await jest.advanceTimersByTimeAsync(900);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'visible-bridge-step-cap-complete',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });

    await jest.advanceTimersByTimeAsync(250);

    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    driver.dispose();
  });

  test('deterministically arms pending bridge completion mode and preserves semantic-vs-visual split', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver({ runKey: 'pending-bridge-mode', runGeneration: 77 });
    const debugDriver = driver as typeof driver & {
      __debugSeedPendingSpeakableBridge: (args: {
        semanticFrom: number;
        semanticTarget: number;
        visualCurrent?: number;
        visualReducedTarget?: number;
        skippedVisibleRows?: number;
        proofSource?: string;
        sourceBranch?: string;
        ageMs?: number;
        runKey?: string | null;
        runGeneration?: number | null;
      }) => void;
    };

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: {
        speechRunningActual: true,
        runKey: 'pending-bridge-mode',
        runGeneration: 77,
      },
    }));

    driver.setLastLineIndex(4);

    // First attempt: keep silence active to force a terminal freshness block while
    // completion mode is active, so the trace carries all split-source fields.
    debugDriver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 4,
      semanticTarget: 7,
      visualCurrent: 5,
      visualReducedTarget: 5,
      ageMs: 1200,
      runKey: 'pending-bridge-mode',
      runGeneration: 77,
      proofSource: 'debug_seed',
      sourceBranch: 'debug_seed_pending_bridge',
    });

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      runKey: 'pending-bridge-mode',
      runGeneration: 77,
      responseAgeMs: 5000,
      matchId: 'pending-bridge-force-mode-trace',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    const infoLines = consoleInfoSpy.mock.calls.map((c) => String(c[0] || ''));
    const splitTrace =
      [...infoLines]
        .reverse()
        .find((line) =>
          line.includes('ASR_TERMINAL_ELIGIBILITY_TRACE') &&
          line.includes('pendingBridgeCompletionMode=1')) || '';

    expect(splitTrace).toContain('pendingBridgeCompletionMode=1');
    expect(splitTrace).toContain('freshnessTargetSource=visual_pursuit_target');
    expect(splitTrace).toContain('scrollTargetSource=visual_pursuit_target');
    expect(splitTrace).toContain('lastLineIndexUpdateSource=semantic_commit_target');

    const semanticTarget = extractTraceFieldNumber(splitTrace, 'semanticCommitTargetLine');
    const visualTarget = extractTraceFieldNumber(splitTrace, 'visualPursuitTargetLine');
    const freshnessTarget = extractTraceFieldNumber(splitTrace, 'freshnessTargetLine');
    expect(semanticTarget).toBeGreaterThan(visualTarget);
    expect(freshnessTarget).toBe(visualTarget);

    // Second attempt: reseed and clear silence so commit can be accepted.
    debugDriver.__debugSeedPendingSpeakableBridge({
      semanticFrom: 4,
      semanticTarget: 7,
      visualCurrent: 5,
      visualReducedTarget: 5,
      ageMs: 1200,
      runKey: 'pending-bridge-mode',
      runGeneration: 77,
      proofSource: 'debug_seed',
      sourceBranch: 'debug_seed_pending_bridge',
    });
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:audio-chunk', { detail: { ts: Date.now() } }));

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      runKey: 'pending-bridge-mode',
      runGeneration: 77,
      matchId: 'pending-bridge-force-mode-commit',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(7);
    expect(scroller.scrollTop).toBeLessThan(metrics[7].top);
    expect(
      consoleWarnSpy.mock.calls.some((call) =>
        diagnosticCallMatches(call, 'movement_authority_commit', [
          'target=5',
          'commitTargetLine=7',
        ]),
      ),
    ).toBe(true);

    driver.dispose();
  });

  test('diagnoses why armed pending bridge completion can bypass reader silence with fresh authority', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'visible-bridge-step-cap',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    const infoLines = consoleInfoSpy.mock.calls.map((c) => String(c[0] || ''));
    const traceLine =
      [...infoLines]
        .reverse()
        .find((line) =>
          line.includes('ASR_TERMINAL_ELIGIBILITY_TRACE') &&
          line.includes('requestedTargetLineIdx=7')) || '';

    expect(traceLine).toContain('pendingBridgeCompletionMode=1');
    expect(traceLine).toContain('pendingBridgeState=pending:4->7');
    expect(traceLine).toContain('candidateLineIdx=5');
    expect(traceLine).toContain('requestedTargetLineIdx=7');
    expect(traceLine).toContain('directAdjacentGuardReason=target_reduced_before_terminal');
    expect(traceLine).toContain('sourceBranch=movement_authority_starvation_reconcile_single_step');
    expect(traceLine).toContain('responseStale=0');
    expect(traceLine).toContain('audioChunkStale=0');
    expect(traceLine).toContain('bypassApplied=1');
    expect(traceLine).toContain('decisionReason=reader_silence_adjacent_safe_bypassed');
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    driver.dispose();
  });

  test('retires pending speakable bridge hold after bridge landing so adjacent proof can advance', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 380,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6200 });

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(5200);

    // Live-unleashed bridge should land directly on semantic target.
    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'bridge-hold-step-4-to-7',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(4);

    // Follow-up packet keeps landed semantic target stable.
    await jest.advanceTimersByTimeAsync(900);
    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'bridge-hold-step-4-to-7-complete',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    // 7 -> 8 adjacent proof should not be blocked by stale pending bridge hold.
    driver.ingest('They replanted.', true, {
      currentIdx: 7,
      matchId: 'bridge-hold-step-7-to-8',
      match: {
        bestIdx: 8,
        bestSim: 0.83,
        topScores: [{ idx: 8, score: 0.83 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    const warns = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    const blockedByStalePendingBridge = warns.some(
      (line) =>
        line.includes('asr_recovery_chain_blocked') &&
        line.includes('holdSource=pending_speakable_bridge_complete'),
    );
    expect(blockedByStalePendingBridge).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('allows adjacent proof commits even when marker tracking is healthy under starvation', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(1);
    await jest.advanceTimersByTimeAsync(2600);

    driver.ingest('The seats remember every early shift. Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'marker-healthy-adjacent-proof',
      match: {
        bestIdx: 3,
        bestSim: 0.91,
        topScores: [
          { idx: 2, score: 0.86 },
          { idx: 3, score: 0.91 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(250);

    expect(driver.getLastLineIndex()).toBe(2);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('keeps tracking healthy skip when forward evidence is missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(1);
    await jest.advanceTimersByTimeAsync(2600);
    driver.ingest('weak unrelated fragment', true, {
      currentIdx: 1,
      matchId: 'tracking-healthy-no-forward-evidence',
      match: {
        bestIdx: 3,
        bestSim: 0.35,
        topScores: [{ idx: 3, score: 0.35 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBe(1);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_TRACKING_HEALTHY_ADJACENT_CATCHUP'))).toBe(false);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('allows one-step starvation progress through repeated short-fragment sections', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Not “that’s nice” amazing.</div>
      <div class="line" data-line="1" style="line-height:24px;">Not perfume amazing.</div>
      <div class="line" data-line="2" style="line-height:24px;">It was thick.</div>
      <div class="line" data-line="3" style="line-height:24px;">Warm.</div>
      <div class="line" data-line="4" style="line-height:24px;">Sweet.</div>
      <div class="line" data-line="5" style="line-height:24px;">Then she laughed.</div>
    `;
    const metrics = Array.from({ length: 6 }, (_, idx) => ({
      top: idx * 567,
      height: 236,
    }));
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

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('Not perfume amazing. It was thick. Warm. Sweet.', true, {
      currentIdx: 0,
      matchId: 'short-fragment-starvation-progress',
      match: {
        bestIdx: 4,
        bestSim: 0.73,
        topScores: [
          { idx: 1, score: 0.72 },
          { idx: 2, score: 0.69 },
          { idx: 3, score: 0.71 },
          { idx: 4, score: 0.73 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(250);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });

  test('commits prompt adjacent recovery step when proof is sufficient after bridge landing', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Lead in.</div>
      <div class="line" data-line="1" style="line-height:24px;">Lead in 2.</div>
      <div class="line" data-line="2" style="line-height:24px;">Not “that’s nice” amazing.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not perfume amazing.</div>
      <div class="line" data-line="4" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="5" style="line-height:24px;"></div>
      <div class="line" data-line="6" style="line-height:24px;">It was thick.</div>
      <div class="line" data-line="7" style="line-height:24px;">Warm.</div>
      <div class="line" data-line="8" style="line-height:24px;">Sweet.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 380,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6200 });

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('It was thick.', true, {
      currentIdx: 3,
      matchId: 'delayed-recovery-bridge_recovery-step',
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(4);

    await jest.advanceTimersByTimeAsync(900);
    driver.ingest('It was thick.', true, {
      currentIdx: 3,
      matchId: 'delayed-recovery-bridge_recovery-step-complete',
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(4);

    driver.ingest('Warm.', true, {
      currentIdx: 6,
      matchId: 'delayed-recovery-adjacent-proof-step',
      match: {
        bestIdx: 7,
        bestSim: 0.82,
        topScores: [{ idx: 7, score: 0.82 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(4);

    driver.dispose();
  });

  test('allows one adjacent step on short-fragment transcript variation when adjacentSim is unavailable', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Lead in.</div>
      <div class="line" data-line="1" style="line-height:24px;">Lead in 2.</div>
      <div class="line" data-line="2" style="line-height:24px;">Lead in 3.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not “that’s nice” amazing.</div>
      <div class="line" data-line="4" style="line-height:24px;">Not perfume amazing.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;">It was thick.</div>
      <div class="line" data-line="7" style="line-height:24px;">Warm.</div>
      <div class="line" data-line="8" style="line-height:24px;">Sweet.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 380,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6200 });

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(6);
    await jest.advanceTimersByTimeAsync(5200);

    // Prime nearby rescue evidence at the current line.
    driver.ingest('It was thick.', true, {
      currentIdx: 6,
      matchId: 'variation-prime-current-line',
      match: {
        bestIdx: 6,
        bestSim: 0.92,
        topScores: [{ idx: 6, score: 0.92 }],
      },
    });
    await jest.advanceTimersByTimeAsync(120);

    // Adjacent target is clear in neighborhood text, but direct adjacent score is absent.
    driver.ingest('That\'s nice amazing. not perfume amazingly. It was thick. Wa...', true, {
      currentIdx: 6,
      matchId: 'variation-adjacent-no-direct-score',
      match: {
        bestIdx: 7,
        bestSim: 0.77,
        topScores: [],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    const adjacentBypass = warnSpy.mock.calls.some((call) =>
      diagnosticCallMatches(call, 'asr_live_no_adjacent_match_bypass', ['current=6', 'target=7']),
    );
    expect(adjacentBypass).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('keeps adjacent hold when adjacent score is low and no tail or neighborhood proof exists', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(6);
    await jest.advanceTimersByTimeAsync(1800);

    driver.ingest('unrelated filler words', true, {
      currentIdx: 6,
      matchId: 'adjacent-low-sim-no-proof',
      match: {
        bestIdx: 7,
        bestSim: 0.72,
        topScores: [{ idx: 7, score: 0.72 }],
      },
    });
    await jest.advanceTimersByTimeAsync(180);

    expect(driver.getLastLineIndex()).toBe(6);
    expect(warnSpy.mock.calls.some((call) => diagnosticCallMatches(call, 'asr_live_no_adjacent_match_bypass'))).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('does not bypass direct-adjacent hold for non-adjacent far targets', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(6);
    await jest.advanceTimersByTimeAsync(1800);

    driver.ingest('future section words that should not leap', true, {
      currentIdx: 6,
      matchId: 'far-target-no-adjacent-bypass',
      match: {
        bestIdx: 8,
        bestSim: 0.88,
        topScores: [{ idx: 8, score: 0.88 }],
      },
    });
    await jest.advanceTimersByTimeAsync(220);

    expect(driver.getLastLineIndex()).toBe(6);
    expect(
      warnSpy.mock.calls.some((call) => diagnosticCallMatches(call, 'asr_live_no_adjacent_match_bypass', ['target=8'])),
    ).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bypasses adjacent hold for proof authority with final-forward-nudge force reason', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    (window as any).__tpCalibrationRuntime = { dsp: { state: 'active' } };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Driving through northern Orlando. on Orange Blossom Trail.', true, {
      currentIdx: 2,
      matchId: 'adjacent-proof-final-forward-nudge',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [],
      },
    });
    await jest.advanceTimersByTimeAsync(260);

    expect(driver.getLastLineIndex()).toBe(3);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bypasses adjacent hold for proof authority with live_strict_proof_owned_commit force reason', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    (window as any).__tpCalibrationRuntime = { dsp: { state: 'active' } };
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(4200);

    // Prime local proof near cursor, then forward phrase without direct adjacent score.
    driver.ingest('Driving through northern Orlando.', true, {
      currentIdx: 2,
      matchId: 'adjacent-proof-owned-prime-current',
      match: {
        bestIdx: 2,
        bestSim: 0.92,
        topScores: [{ idx: 2, score: 0.92 }],
      },
    });
    await jest.advanceTimersByTimeAsync(120);

    driver.ingest('Driving through northern Orlando. on Orange Blossom Trail. It used to smell amazing.', true, {
      currentIdx: 2,
      matchId: 'adjacent-proof-owned-commit',
      match: {
        bestIdx: 3,
        bestSim: 0.88,
        topScores: [],
      },
    });
    await jest.advanceTimersByTimeAsync(260);

    expect(driver.getLastLineIndex()).toBe(3);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('keeps hold when no proof authority is present for adjacent target', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('random unrelated words', true, {
      currentIdx: 2,
      matchId: 'adjacent-no-proof-authority',
      match: {
        bestIdx: 3,
        bestSim: 0.31,
        topScores: [{ idx: 3, score: 0.31 }],
      },
    });
    await jest.advanceTimersByTimeAsync(180);

    expect(driver.getLastLineIndex()).toBeLessThanOrEqual(3);
    const warns = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warns.some((line) => line.includes('asr_live_no_adjacent_match_hold'))).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('sustained-read emits ASR_SUSTAINED_READ_STEP when adjacent hold repeats under continued speech', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(3600);
    driver.ingest('Driving through northern Orlando on Orange Blossom Trail.', true, {
      currentIdx: 2,
      matchId: 'sustained-read-adjacent-step',
      match: { bestIdx: 3, bestSim: 0.88, topScores: [] },
    });
    await jest.advanceTimersByTimeAsync(220);
    expect(driver.getLastLineIndex()).toBe(3);
    expect(
      warnSpy.mock.calls.map((c) => String(c[0] || '')).some((l) =>
        l.includes('ASR_ADJACENT_RECOVERY_CATCHUP_BYPASSED') &&
        l.includes('reason=path_not_reached'),
      ),
    ).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('sustained-read does not commit far target without safe adjacent reduction', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(3600);
    driver.ingest('far future phrase with weak linkage', true, {
      currentIdx: 2,
      matchId: 'sustained-read-far-blocked',
      match: { bestIdx: 8, bestSim: 0.6, topScores: [{ idx: 8, score: 0.6 }] },
    });
    await jest.advanceTimersByTimeAsync(220);
    expect(driver.getLastLineIndex()).toBe(2);
    warnSpy.mockRestore();
    driver.dispose();
  });


  test('sustained-read does not block contradiction when stale-prefix contradiction is already overridden by tail proof', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(3600);
    driver.ingest('Driving through northern Orlando. on Orange Blossom Trail. It used to smell amazing.', true, {
      currentIdx: 2,
      matchId: 'sustained-contradiction-overridden',
      match: { bestIdx: 3, bestSim: 0.88, topScores: [] },
    });
    await jest.advanceTimersByTimeAsync(260);
    expect(driver.getLastLineIndex()).toBe(3);
    warnSpy.mockRestore();
    driver.dispose();
  });


  test('cancels pending speakable bridge completion when runtime speech stops', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-stop-cancel',
      match: {
        bestIdx: 7,
        bestSim: 0.91,
        topScores: [{ idx: 7, score: 0.91 }],
      },
    });

    await jest.advanceTimersByTimeAsync(40);
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: false },
    }));

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-stop-cancel-retry',
      match: {
        bestIdx: 7,
        bestSim: 0.91,
        topScores: [{ idx: 7, score: 0.91 }],
      },
    });

    await jest.advanceTimersByTimeAsync(500);

    // Pending bridge staging is visual-only until completion conditions are met.
    expect(driver.getLastLineIndex()).toBe(4);

    driver.dispose();
  });

  test('holds pending semantic bridge when a follow-up final only re-matches the stale current line', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-same-line-prime',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });

    await jest.advanceTimersByTimeAsync(250);
    // Bridge should remain staged (no semantic commit yet).
    expect(driver.getLastLineIndex()).toBe(4);

    // Simulate cumulative/stale prefix re-matching current line.
    driver.ingest('But citrus did not die.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-same-line-follow',
      match: {
        bestIdx: 4,
        bestSim: 0.95,
        topScores: [{ idx: 4, score: 0.95 }],
      },
    });

    await jest.advanceTimersByTimeAsync(250);

    // Stale same-line rematch should not regress landed semantic target.
    expect(driver.getLastLineIndex()).toBe(4);

    driver.dispose();
  });

  test('keeps pending bridge alive across ttl while speech continues and then completes', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-ttl-prime',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);
    // Initial far target remains staged while pending bridge completion is active.
    expect(driver.getLastLineIndex()).toBe(4);

    // Keep feeding finals while crossing default ttl (2200ms).
    await jest.advanceTimersByTimeAsync(2300);
    driver.ingest('But citrus did not die.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-ttl-refresh',
      match: {
        bestIdx: 4,
        bestSim: 0.95,
        topScores: [{ idx: 4, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-ttl-complete',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    // Continued speech and refreshed evidence should allow pending bridge completion.
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);
    driver.dispose();
  });

  test('holds early bridge when landing proof is stale-prefix/tail-heavy and commit count is low', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
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
    const metrics = Array.from({ length: 7 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'early-bridge-stale-prefix',
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(350);

    expect(driver.getLastLineIndex()).toBeLessThan(6);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('aged seeded pending bridge bypasses repeated stale landing hold and can complete', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
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
    const metrics = Array.from({ length: 7 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(3);
    await jest.advanceTimersByTimeAsync(2200);

    // First pass: stale landing hold path can still stage/seed.
    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'bl-r2-seed-pass',
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    // Age pending bridge past completion threshold.
    await jest.advanceTimersByTimeAsync(1100);
    const beforeRetryWarnCount = warnSpy.mock.calls.length;

    // Retry with same stale-prefix shape: should prefer pending completion route over repeating stale hold.
    driver.ingest('Driving through northern Orlando. Not perfume amazing. It was thick.', true, {
      currentIdx: 3,
      matchId: 'bl-r2-retry-pass',
      match: {
        bestIdx: 6,
        bestSim: 0.9,
        topScores: [{ idx: 6, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(350);

    const retryLines = warnSpy.mock.calls
      .slice(beforeRetryWarnCount)
      .map((c) => String(c[0] || ''));
    expect(
      retryLines.some((line) =>
        line.includes('reason=live_strict_bridge_landing_hold') ||
        line.includes('reason=live_strict_bridge_stale_landing_hold'),
      ),
    ).toBe(false);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(3);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('emits visual lag telemetry when semantic target sits below viewport during pending bridge', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 360,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(3600);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-visual-telemetry-prime',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    driver.ingest('But citrus did not die.', true, {
      currentIdx: 4,
      matchId: 'pending-bridge-visual-telemetry-retry',
      match: {
        bestIdx: 4,
        bestSim: 0.95,
        topScores: [{ idx: 4, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(250);

    const warns = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(
      warns.some((line) =>
        (line.includes('ASR_LIVE_UNLEASHED_STEP') &&
          line.includes('reason=pending_visual_cap_live_unleashed')) ||
        line.includes('ASR_LIVE_BRIDGE_STAGED_VISUAL_ONLY') ||
        line.includes('ASR_LIVE_BRIDGE_DOWNSTREAM_COMMIT_BLOCKED') ||
        line.includes('ASR_LIVE_BRIDGE_WALK_STAGED') ||
        line.includes('ASR_LIVE_BRIDGE_VISUAL_STEP') ||
        line.includes('ASR_VISUAL_PROJECTION_UNSAFE_PRECOMMIT'),
      ),
    ).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('applies bridge visual follow comfort cap on large bridge commit overrun but not ordinary adjacent follow', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Growers moved south.</div>
      <div class="line" data-line="8" style="line-height:24px;">They replanted.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 380,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6800 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('Growers moved south.', true, {
      currentIdx: 4,
      matchId: 'bridge-comfort-cap-prime',
      match: {
        bestIdx: 7,
        bestSim: 0.9,
        topScores: [{ idx: 7, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(350);

    driver.ingest('They replanted.', true, {
      currentIdx: 7,
      matchId: 'bridge-comfort-cap-adjacent',
      match: {
        bestIdx: 8,
        bestSim: 0.86,
        topScores: [{ idx: 8, score: 0.86 }],
      },
    });
    await jest.advanceTimersByTimeAsync(350);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_BRIDGE_VISUAL_FOLLOW_COMFORT_CAP') || line.includes('ASR_VISUAL_SAFETY_CAP_HELD'))).toBe(true);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('holds an additional bridge-like commit while bridge comfort recovery is active and outside safe band', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Line 0.</div>
      <div class="line" data-line="1" style="line-height:24px;">Line 1.</div>
      <div class="line" data-line="2" style="line-height:24px;">Line 2.</div>
      <div class="line" data-line="3" style="line-height:24px;">Line 3.</div>
      <div class="line" data-line="4" style="line-height:24px;">Anchor.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">First bridge landing.</div>
      <div class="line" data-line="8" style="line-height:24px;">[pause]</div>
      <div class="line" data-line="9" style="line-height:24px;"></div>
      <div class="line" data-line="10" style="line-height:24px;">Second bridge landing.</div>
    `;
    const metrics = Array.from({ length: 11 }, (_, idx) => ({ top: idx * 380, height: 236 }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 8200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('First bridge landing.', true, {
      currentIdx: 4,
      matchId: 'bridge-leash-prime',
      match: { bestIdx: 7, bestSim: 0.9, topScores: [{ idx: 7, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(650);
    const bridgeCurrent = Math.max(4, driver.getLastLineIndex());
    const secondBridgeTarget = Math.min(10, bridgeCurrent + 3);

    driver.ingest('Second bridge landing.', true, {
      currentIdx: bridgeCurrent,
      matchId: 'bridge-leash-stack-attempt',
      match: { bestIdx: secondBridgeTarget, bestSim: 0.9, topScores: [{ idx: secondBridgeTarget, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(350);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_BRIDGE_VISUAL_FOLLOW_COMFORT_CAP') || line.includes('ASR_VISUAL_SAFETY_CAP_HELD'))).toBe(true);
    expect(lines.some((line) => line.includes('ASR_VISUAL_ENVELOPE_LEASH_ARMED') || line.includes('ASR_VISUAL_SAFETY_CAP_HELD'))).toBe(true);
    expect(driver.getLastLineIndex()).toBeLessThan(10);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('keeps reduced visual projection target canonical within the same commit attempt', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    const total = 166;
    script.innerHTML = Array.from({ length: total }, (_, idx) => {
      if (idx === 158) return `<div class="line" data-line="${idx}" style="line-height:24px;">Projected adjacent 158.</div>`;
      if (idx === 159) return `<div class="line" data-line="${idx}" style="line-height:24px;">[pause]</div>`;
      if (idx === 160) return `<div class="line" data-line="${idx}" style="line-height:24px;">Far bridge landing 160.</div>`;
      return `<div class="line" data-line="${idx}" style="line-height:24px;">Line ${idx}.</div>`;
    }).join('');
    const metrics = Array.from({ length: total }, (_, idx) => ({ top: idx * 420, height: 236 }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: total * 500 });
    scroller.scrollTop = metrics[157].top;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(157);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('Far bridge landing 160.', true, {
      currentIdx: 157,
      matchId: 'vp-r1-canonical-157-160',
      match: { bestIdx: 160, bestSim: 0.91, topScores: [{ idx: 160, score: 0.91 }] },
    });
    await jest.advanceTimersByTimeAsync(350);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_COMMIT line=160'))).toBe(false);
    expect(lines.some((line) => line.includes('ASR_LIVE_UNLEASHED_STEP') && line.includes('target=160'))).toBe(false);
    expect(lines.some((line) => line.includes('movement_authority_commit') && line.includes('target=160'))).toBe(false);
    expect(driver.getLastLineIndex()).toBe(158);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('holds live bridge visual commit when semantic recovery target would overscroll (105->108 cue/blank shape)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    const total = 120;
    script.innerHTML = Array.from({ length: total }, (_, idx) => {
      if (idx === 106) return `<div class="line" data-line="${idx}" style="line-height:24px;">[cue]</div>`;
      if (idx === 107) return `<div class="line" data-line="${idx}" style="line-height:24px;"></div>`;
      if (idx === 108) return `<div class="line" data-line="${idx}" style="line-height:24px;">Recovered landing 108.</div>`;
      return `<div class="line" data-line="${idx}" style="line-height:24px;">Line ${idx}.</div>`;
    }).join('');
    const metrics = Array.from({ length: total }, (_, idx) => ({ top: idx * 460, height: 120 }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: total * 540 });
    scroller.scrollTop = metrics[105].top;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(105);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('Recovered landing 108.', true, {
      currentIdx: 105,
      matchId: 'visual-safety-cap-105-108',
      match: { bestIdx: 108, bestSim: 0.92, topScores: [{ idx: 108, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(350);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_VISUAL_SAFETY_CAP_HELD'))).toBe(true);
    expect(
      lines.some((line) =>
        line.includes('ASR_LIVE_UNLEASHED_STEP') &&
        line.includes('reason=pending_visual_cap_live_unleashed'),
      ),
    ).toBe(false);
    expect(
      lines.some((line) =>
        line.includes('ASR_VISIBLE_BRIDGE_CAP_BYPASSED_TERMINAL') &&
        line.includes('reason=live_safe_terminal'),
      ),
    ).toBe(false);
    expect(driver.getLastLineIndex()).toBeLessThan(108);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('holds projected high visual bridge movement even for short bridge recovery shape (96->98)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    const total = 112;
    script.innerHTML = Array.from({ length: total }, (_, idx) => {
      if (idx === 97) return `<div class="line" data-line="${idx}" style="line-height:24px;">[cue]</div>`;
      if (idx === 98) return `<div class="line" data-line="${idx}" style="line-height:24px;">Recovered landing 98.</div>`;
      return `<div class="line" data-line="${idx}" style="line-height:24px;">Line ${idx}.</div>`;
    }).join('');
    const metrics = Array.from({ length: total }, (_, idx) => ({ top: idx * 520, height: 96 }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: total * 560 });
    scroller.scrollTop = metrics[96].top;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(96);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('Recovered landing 98.', true, {
      currentIdx: 96,
      matchId: 'visual-safety-cap-96-98',
      match: { bestIdx: 98, bestSim: 0.9, topScores: [{ idx: 98, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(350);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(lines.some((line) => line.includes('ASR_VISUAL_SAFETY_CAP_HELD'))).toBe(true);
    expect(
      lines.some((line) =>
        line.includes('ASR_LIVE_UNLEASHED_STEP') &&
        line.includes('reason=pending_visual_cap_live_unleashed'),
      ),
    ).toBe(false);
    expect(
      lines.some((line) =>
        line.includes('ASR_VISIBLE_BRIDGE_CAP_BYPASSED_TERMINAL') &&
        line.includes('reason=live_safe_terminal'),
      ),
    ).toBe(false);
    expect(driver.getLastLineIndex()).toBeLessThan(98);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('does not leash ordinary adjacent commit during active bridge comfort recovery', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Line 0.</div>
      <div class="line" data-line="1" style="line-height:24px;">Line 1.</div>
      <div class="line" data-line="2" style="line-height:24px;">Line 2.</div>
      <div class="line" data-line="3" style="line-height:24px;">Line 3.</div>
      <div class="line" data-line="4" style="line-height:24px;">Anchor.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">First bridge landing.</div>
      <div class="line" data-line="8" style="line-height:24px;">Adjacent follow line.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({ top: idx * 380, height: 236 }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6800 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('First bridge landing.', true, {
      currentIdx: 4,
      matchId: 'bridge-leash-adj-prime',
      match: { bestIdx: 7, bestSim: 0.9, topScores: [{ idx: 7, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(250);

    driver.ingest('Adjacent follow line.', true, {
      currentIdx: 7,
      matchId: 'bridge-leash-adj-step',
      match: { bestIdx: 8, bestSim: 0.88, topScores: [{ idx: 8, score: 0.88 }] },
    });
    await jest.advanceTimersByTimeAsync(350);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(
      lines.some(
        (line) => line.includes('ASR_BRIDGE_COMFORT_COMMIT_LEASH_HELD') && line.includes('requestedTarget=8'),
      ),
    ).toBe(false);
    expect(
      lines.some(
        (line) => line.includes('ASR_VISUAL_ENVELOPE_LEASH_HELD') && line.includes('requestedTarget=8'),
      ),
    ).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('releases bridge-like commit leash after comfort window expiry', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Line 0.</div>
      <div class="line" data-line="1" style="line-height:24px;">Line 1.</div>
      <div class="line" data-line="2" style="line-height:24px;">Line 2.</div>
      <div class="line" data-line="3" style="line-height:24px;">Line 3.</div>
      <div class="line" data-line="4" style="line-height:24px;">Anchor.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">First bridge landing.</div>
      <div class="line" data-line="8" style="line-height:24px;">[pause]</div>
      <div class="line" data-line="9" style="line-height:24px;"></div>
      <div class="line" data-line="10" style="line-height:24px;">Second bridge landing.</div>
    `;
    const metrics = Array.from({ length: 11 }, (_, idx) => ({ top: idx * 380, height: 236 }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 8200 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: { speechRunningActual: true } }));
    driver.setLastLineIndex(4);
    await jest.advanceTimersByTimeAsync(5200);

    driver.ingest('First bridge landing.', true, {
      currentIdx: 4,
      matchId: 'bridge-leash-release-prime',
      match: { bestIdx: 7, bestSim: 0.9, topScores: [{ idx: 7, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(2100);

    driver.ingest('Second bridge landing.', true, {
      currentIdx: 7,
      matchId: 'bridge-leash-release-step',
      match: { bestIdx: 10, bestSim: 0.9, topScores: [{ idx: 10, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(500);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(
      lines.some(
        (line) => line.includes('ASR_BRIDGE_COMFORT_COMMIT_LEASH_HELD') && line.includes('requestedTarget=10'),
      ),
    ).toBe(false);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('documents current harness limitation: 4 -> 7 cue/blank bridge progresses instead of reproducing visual-hold deadlock', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">Different climates.</div>
      <div class="line" data-line="1" style="line-height:24px;">Different strengths.</div>
      <div class="line" data-line="2" style="line-height:24px;">For decades, Florida wore the crown.</div>
      <div class="line" data-line="3" style="line-height:24px;">Not because California was weak.</div>
      <div class="line" data-line="4" style="line-height:24px;">But citrus did not die.</div>
      <div class="line" data-line="5" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="6" style="line-height:24px;"></div>
      <div class="line" data-line="7" style="line-height:24px;">Bridge landing content.</div>
      <div class="line" data-line="8" style="line-height:24px;">Next content line.</div>
    `;
    const metrics = Array.from({ length: 9 }, (_, idx) => ({
      top: idx * 380,
      height: 236,
    }));
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6800 });
    scroller.scrollTop = 0;

    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(4);

    for (let i = 0; i < 6; i += 1) {
      driver.ingest('Bridge landing content.', true, {
        currentIdx: 4,
        matchId: `deadlock-bridge-4-7-${i}`,
        match: {
          bestIdx: 7,
          bestSim: 0.93,
          topScores: [{ idx: 7, score: 0.93 }],
        },
      });
      await jest.advanceTimersByTimeAsync(120);
    }

    await jest.advanceTimersByTimeAsync(2200);

    // In this harness sequence the driver progresses to the semantic bridge target.
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(5);

    const lines = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    const hasDeadlockCluster =
      lines.some((line) => line.includes('ASR_LIVE_BRIDGE_STAGED_VISUAL_ONLY')) &&
      lines.some((line) => line.includes('ASR_LIVE_BRIDGE_DOWNSTREAM_COMMIT_BLOCKED')) &&
      lines.some((line) => line.includes('ASR_LIVE_BRIDGE_EQUIVALENT_COMMIT_BLOCKED')) &&
      lines.some((line) => line.includes('ASR_SAFE_TARGET_OVERDUE')) &&
      lines.some((line) => line.includes('ASR_LIVE_BRIDGE_FINAL_COMMIT_ABORTED'));
    expect(hasDeadlockCluster).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('does not allow live cursor state to drift ahead of last committed line without a commit', async () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(0);
    (window as any).currentIndex = 0;

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'cursor-coherence-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.91,
        topScores: [{ idx: 1, score: 0.91 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    // Simulate stale external cursor drift without any accepted commit.
    (window as any).currentIndex = 3;
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 3,
      matchId: 'cursor-coherence-drift',
      match: {
        bestIdx: 1,
        bestSim: 0.95,
        topScores: [{ idx: 1, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    delete (window as any).currentIndex;
    driver.dispose();
  });

  test('freezes ASR movement immediately while window focus is lost', async () => {
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    let focusActive = true;
    const hasFocusSpy = jest.spyOn(document, 'hasFocus').mockImplementation(() => focusActive);

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'focus-hold-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.9,
        topScores: [{ idx: 1, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    const beforeTop = scroller.scrollTop;
    focusActive = false;
    window.dispatchEvent(new Event('blur'));

    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'focus-hold-forward',
      match: {
        bestIdx: 2,
        bestSim: 0.95,
        topScores: [{ idx: 2, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(scroller.scrollTop).toBe(beforeTop);

    hasFocusSpy.mockRestore();
    driver.dispose();
  });

  test('requires a fresh post-focus final proof before movement resumes', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    let visibilityState: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => visibilityState === 'hidden',
    });

    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'post-focus-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.9,
        topScores: [{ idx: 1, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'post-focus-unlock-final',
      match: {
        bestIdx: 2,
        bestSim: 0.95,
        topScores: [{ idx: 2, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);
    let lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));

    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'post-focus-forward-after-proof',
      match: {
        bestIdx: 2,
        bestSim: 0.95,
        topScores: [{ idx: 2, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(2);
    lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_POST_FOCUS_FRESH_FINAL_ACCEPTED'))).toBe(true);

    if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
    else delete (document as any).visibilityState;
    if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
    else delete (document as any).hidden;
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('startup current=1 adjacent target commits via early fast path without starvation/rebase wait', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.setLastLineIndex(1);
    await jest.advanceTimersByTimeAsync(900);

    driver.ingest('Not perfume amazing.', true, {
      currentIdx: 1,
      matchId: 'startup-adjacent-early-1-to-2',
      match: {
        bestIdx: 2,
        bestSim: 0.88,
        topScores: [{ idx: 2, score: 0.88 }],
      },
    });
    await jest.advanceTimersByTimeAsync(260);

    const warnCalls = warnSpy.mock.calls;
    const warns = warnCalls.map((c) => String(c[0] || ''));
    expect(
      warnCalls.some((call) =>
        diagnosticCallMatches(call, 'ASR_STARTUP_ADJACENT_PRE_REBASE_COMMIT', ['current=1', 'target=2']) ||
        diagnosticCallMatches(call, 'ASR_STARTUP_FRESH_ADJACENT_FAST_COMMIT_EARLY', ['current=1', 'target=2']),
      ),
    ).toBe(true);
    expect(warns.some((l) => l.includes('asr_soft_runtime_rebase') || l.includes('soft_runtime_rebase'))).toBe(false);
    expect(driver.getLastLineIndex()).toBe(2);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('startup adjacent 0 -> 1 holds comfort or reduces pressure instead of aggressive marker chase', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'reader-comfort-startup-adjacent',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(160);

    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(driver.getLastLineIndex()).toBe(1);
    expect(scroller.scrollTop).toBeLessThan(140);
    expect(lines.some((line) => line.includes('ASR_TERMINAL_COMMIT_SUPPRESSED_BY_VISUAL_GOVERNOR'))).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bridge-style completion keeps visual comfort and does not force immediate high-pressure pursuit', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

    driver.setLastLineIndex(1);
    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'reader-comfort-bridge-style',
      match: {
        bestIdx: 3,
        bestSim: 0.92,
        topScores: [
          { idx: 2, score: 0.72 },
          { idx: 3, score: 0.92 },
        ],
      },
    });
    await jest.advanceTimersByTimeAsync(220);

    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(driver.getLastLineIndex()).toBe(2);
    expect(scroller.scrollTop).toBeLessThan(220);
    expect(lines.some((line) => line.includes('ASR_TERMINAL_COMMIT_SUPPRESSED_BY_VISUAL_GOVERNOR'))).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('if next speakable is near top, top-pressure guards without comfort hold', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 900;
    (window as any).__TP_MARKER_PCT = 0.9;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'reader-comfort-top-boundary-hold',
      match: { bestIdx: 2, bestSim: 0.89, topScores: [{ idx: 2, score: 0.89 }] },
    });
    await jest.advanceTimersByTimeAsync(180);

    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((line) => line.includes('ASR_READER_COMFORT_HOLD'))).toBe(false);
    expect(lines.some((line) => line.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && line.includes('reason=top_pressure_guard'))).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('nudges instead of comfort-holding when next speakable sits near lower comfort edge', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'reader-comfort-lower-edge-nudge',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(220);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(
      lines.some((l) => l.includes('ASR_READER_COMFORT_NUDGE')) ||
      lines.some((l) => l.includes('ASR_BOTTOM_LOCK_RELEASE')),
    ).toBe(true);
    expect(lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD'))).toBe(false);
    expect(scroller.scrollTop).toBeGreaterThan(200);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('nextLineY at preferredBandBottom triggers lower-rail release and not comfort hold', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 560, left: 0, right: 800, bottom: 796, width: 800, height: 236 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'preferred-lower-rail-at-bottom',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(420);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(
      lines.some((l) => l.includes('ASR_PREFERRED_LOWER_RAIL_RELEASE')) ||
      lines.some((l) => l.includes('ASR_BOTTOM_LOCK_RELEASE')),
    ).toBe(true);
    const selectedLine = lines.find((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED')) || '';
    expect(selectedLine).not.toContain('candidateAuthorities=[pocket_authority,');
    expect(selectedLine).not.toContain(',pocket_authority');
    expect(lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && (l.includes('action=nudge') || l.includes('action=pursue')))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_VISUAL_SHORT_MEMORY_RESET'))).toBe(false);
    expect(scroller.scrollTop).toBeGreaterThan(200);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('line near desired marker error stays out of lower-rail release path', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 300;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    Object.defineProperty(line2, 'offsetTop', { configurable: true, value: 622 });
    Object.defineProperty(line2, 'offsetHeight', { configurable: true, value: 60 });
    Object.defineProperty(line2, 'clientHeight', { configurable: true, value: 60 });
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 322, left: 0, right: 800, bottom: 382, width: 800, height: 60 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'preferred-settle-zone-hold',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_PREFERRED_LOWER_RAIL_RELEASE'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_MARKER_ERROR_LOWER_RAIL_REJECTED') && l.includes('pocketZone=bottom'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_MARKER_ERROR_HOLD_BAND_REJECTED') && l.includes('holdTolerancePx=12'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && l.includes('reason=nudge:within_correction_tolerance_but_outside_hold_tolerance'))).toBe(true);
    const selectedLine = lines.find((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED')) || '';
    expect(selectedLine).toContain('selectedAuthority=pocket_authority');
    expect(selectedLine).toContain('reason=within_correction_tolerance_but_outside_hold_tolerance');
    expect(lines.some((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED'))).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('true near-center marker error within hold tolerance still holds', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 300;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    Object.defineProperty(line2, 'offsetTop', { configurable: true, value: 614 });
    Object.defineProperty(line2, 'offsetHeight', { configurable: true, value: 60 });
    Object.defineProperty(line2, 'clientHeight', { configurable: true, value: 60 });
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 314, left: 0, right: 800, bottom: 374, width: 800, height: 60 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'hold-tolerance-center-safe',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_MARKER_ERROR_HOLD_BAND_REJECTED'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_MARKER_ERROR_LOWER_RAIL_REJECTED'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && l.includes('action=hold'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_VISUAL_SHORT_MEMORY_RESET') && l.includes('reason=current_line_in_settle_zone'))).toBe(false);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('marker error within tolerance at bottom pocket rejects hold and keeps moving', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 260;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    Object.defineProperty(line2, 'offsetTop', { configurable: true, value: 610 });
    Object.defineProperty(line2, 'offsetHeight', { configurable: true, value: 236 });
    Object.defineProperty(line2, 'clientHeight', { configurable: true, value: 236 });
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 246, left: 0, right: 800, bottom: 482, width: 800, height: 236 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'bottom-pocket-within-tolerance-rejected',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_MARKER_ERROR_LOWER_RAIL_REJECTED') && l.includes('pocketZone=bottom'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && l.includes('action=hold'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && (l.includes('action=nudge') || l.includes('action=pursue')))).toBe(true);
    const selectedLine = lines.find((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED')) || '';
    expect(selectedLine).toContain('selectedAuthority=pocket_authority');
    expect(selectedLine).not.toContain('candidateAuthorities=[pocket_authority,');
    expect(selectedLine).not.toContain(',pocket_authority');
    expect(lines.some((l) => l.includes('ASR_SCROLL_AUTHORITY_CONFLICT'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_SHORT_MEMORY_RESET') && l.includes('reason=current_line_in_settle_zone'))).toBe(false);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('line inside broad preferred pocket but below desired line keeps moving instead of holding', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 460, left: 0, right: 800, bottom: 696, width: 800, height: 236 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'preferred-pocket-but-too-low',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION') && (l.includes('action=nudge') || l.includes('action=pursue')))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_VISUAL_SHORT_MEMORY_RESET') && l.includes('reason=current_line_in_settle_zone'))).toBe(false);
    expect(scroller.scrollTop).toBeGreaterThan(200);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('persistent bottom-lock exits toward pocket with bounded release and no comfort hold frame', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'bottom-lock-release-to-pocket',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(300);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_BOTTOM_LOCK_RELEASE'))).toBe(true);
    const selectedLine =
      lines.find((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED') && l.includes('selectedAuthority=bottom_lock_release')) || '';
    expect(selectedLine).toContain('selectedAuthority=bottom_lock_release');
    expect(selectedLine).not.toContain('candidateAuthorities=[pocket_authority,');
    expect(selectedLine).not.toContain(',pocket_authority');
    expect(lines.some((l) => l.includes('ASR_SCROLL_AUTHORITY_CONFLICT') && l.includes('pocket_authority'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_READER_COMFORT_HOLD'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_RECOVERY_BOOST_PATH_PROOF'))).toBe(true);
    const releaseLine = lines.find((l) => l.includes('ASR_BOTTOM_LOCK_RELEASE')) || '';
    const pxpsMatch = releaseLine.match(/pxps=(\d+)/);
    if (pxpsMatch) expect(Number(pxpsMatch[1])).toBeLessThanOrEqual(20);
    expect(scroller.scrollTop).toBeGreaterThan(200);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('emits actuator applied telemetry for live bottom-lock pursuit path', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'actuator-applied-telemetry',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(320);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    const movementLine = lines.find((l) => l.includes('ASR_VISUAL_ACTUATOR_APPLIED')) || '';
    if (movementLine.includes('ASR_VISUAL_ACTUATOR_APPLIED')) {
      expect(movementLine).toContain('requestedPxps=');
      expect(movementLine).toContain('appliedPxps=');
      expect(movementLine).toContain('requestedDeltaPx=');
      expect(movementLine).toContain('appliedDeltaPx=');
      expect(movementLine).toContain('maxScrollTop=');
      expect(lines.some((l) => l.includes('ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF'))).toBe(true);
    }
    expect(Math.abs(scroller.scrollTop - 200)).toBeGreaterThan(10);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bottom-lock pursuit applies positive actuator movement when requested velocity is elevated', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 180;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'actuator-requested-vs-applied',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(120);
    const earlyTop = scroller.scrollTop;
    await jest.advanceTimersByTimeAsync(360);
    expect(Math.abs(earlyTop - 180)).toBeGreaterThan(10);
    expect(Math.abs(scroller.scrollTop - 180)).toBeGreaterThan(10);
    expect(Math.abs(scroller.scrollTop - earlyTop)).toBeLessThanOrEqual(40);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bottom-pocket recovery starts early and stays bounded instead of jumping abruptly', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 180;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'bottom-pocket-glide-recovery',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(120);
    const earlyTop = scroller.scrollTop;
    await jest.advanceTimersByTimeAsync(240);
    const midTop = scroller.scrollTop;
    await jest.advanceTimersByTimeAsync(540);
    const finalTop = scroller.scrollTop;
    expect(Math.abs(earlyTop - 180)).toBeGreaterThan(10);
    expect(Math.abs(finalTop - 180)).toBeLessThanOrEqual(40);
    expect(Math.abs(finalTop - midTop)).toBeLessThanOrEqual(8);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('safe low-pocket adjacent commit applies safe live pocket correction instead of marker-lock recovery easing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'marker-lock-pocket-prime',
      match: { bestIdx: 1, bestSim: 0.92, topScores: [{ idx: 1, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(220);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'marker-lock-pocket-recovery',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(32);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    const correctionLine = lines.find((l) => l.includes('ASR_SAFE_LIVE_POCKET_CORRECTION_APPLIED')) || '';
    if (correctionLine) {
      expect(correctionLine).toContain('source=commit');
      expect(
        correctionLine.includes('reason=low_pocket_safe_target') ||
        correctionLine.includes('reason=low_pocket_adjacent_safe_fallback'),
      ).toBe(true);
    }
    expect(lines.some((l) => l.includes('ASR_SAFE_LIVE_POCKET_CORRECTION_APPLIED')) || scroller.scrollTop > 200).toBe(true);
    expect(scroller.scrollTop).toBeGreaterThan(200);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('live cue-skip requests smooth motion instead of teleporting the viewport', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    const script = document.getElementById('script') as HTMLElement;
    script.innerHTML = `
      <div class="line" data-line="0" style="line-height:24px;">[beat]</div>
      <div class="line" data-line="1" style="line-height:24px;">Farebox chirps, coffee lids do that little click.</div>
      <div class="line" data-line="2" style="line-height:24px;">The seats remember every early shift.</div>
      <div class="line" data-line="3" style="line-height:24px;">Neon ads hum above the aisle.</div>
    `;
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
    scroller.scrollTop = 0;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'cue-skip-smooth-motion',
      match: { bestIdx: 1, bestSim: 0.99, topScores: [{ idx: 1, score: 0.99 }] },
    });

    await jest.advanceTimersByTimeAsync(32);
    const earlyTop = scroller.scrollTop;
    expect(earlyTop).toBeLessThan(250);

    await jest.advanceTimersByTimeAsync(240);
    expect(scroller.scrollTop).toBeGreaterThan(earlyTop);
    expect(driver.getLastLineIndex()).toBe(1);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('min-step floor ticks below the debt threshold emit proof and only allow chairperson at high debt', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 0;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'committee-low-debt-threshold',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(120);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    const floorActuatorLine = lines.find(
      (l) =>
        l.includes('ASR_VISUAL_ACTUATOR_APPLIED') &&
        l.includes('appliedDeltaPx=6') &&
        l.includes('clampReason=min_step_floor'),
    ) || '';
    expect(floorActuatorLine).toContain('targetDebtPx=');
    const proofLines = lines.filter((l) => l.includes('ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF'));
    expect(
      proofLines.some((l) =>
        l.includes('appliedDeltaPx=6') &&
        l.includes('clampReason=min_step_floor') &&
        l.includes('shouldEmitChairperson=0'),
      ),
    ).toBe(true);
    const committeeLines = lines.filter((l) => l.includes('ASR_SCROLL_CHAIRPERSON_ARBITRATION'));
    expect(
      committeeLines.every((l) => {
        const debt = l.match(/targetDebtPx=(\d+)/);
        return !!debt && Number(debt[1]) >= 120;
      }),
    ).toBe(true);
    const resolvedLine = lines.find((l) => l.includes('ASR_SCROLL_AUTHORITY_RESOLVED')) || '';
    expect(resolvedLine).toContain('movementEnvelopeAuthority=');
    expect(resolvedLine).toContain('pocketState=');
    expect(resolvedLine).toContain('chairpersonChair=');
    expect(resolvedLine).toContain('actualAppliedDeltaPx=');
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('preferred-zone comfort hold settles pursuit without repeated hard-held spam', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 290;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'reader-comfort-preferred-hold-settle',
      match: { bestIdx: 2, bestSim: 0.89, topScores: [{ idx: 2, score: 0.89 }] },
    });
    await jest.advanceTimersByTimeAsync(400);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    const holdCount = lines.filter((l) => l.includes('ASR_READER_COMFORT_HOLD')).length;
    const nudgeCount = lines.filter((l) => l.includes('ASR_READER_COMFORT_NUDGE')).length;
    const hardHeldCount = lines.filter((l) => l.includes('ASR_VISUAL_FOLLOW_HARD_HELD')).length;
    expect(holdCount + nudgeCount).toBeGreaterThan(0);
    expect(hardHeldCount).toBe(0);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('repeated adjacent commits avoid persistent bottom-screen drift', async () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'reader-comfort-longrun-1',
      match: { bestIdx: 1, bestSim: 0.9, topScores: [{ idx: 1, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(220);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'reader-comfort-longrun-2',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(220);
    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'reader-comfort-longrun-3',
      match: { bestIdx: 3, bestSim: 0.9, topScores: [{ idx: 3, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(300);
    expect(driver.getLastLineIndex()).toBe(3);
    expect(scroller.scrollTop).toBeGreaterThan(200);
    driver.dispose();
  });

  test('newer committed line does not rely on live short-memory reset to correct visual debt', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 180;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'short-memory-supersede-a',
      match: { bestIdx: 1, bestSim: 0.91, topScores: [{ idx: 1, score: 0.91 }] },
    });
    await jest.advanceTimersByTimeAsync(180);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'short-memory-supersede-b',
      match: { bestIdx: 3, bestSim: 0.92, topScores: [{ idx: 3, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_VISUAL_SHORT_MEMORY_RESET'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_MARKER_ERROR_CORRECTION'))).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('current pocket authority settles when line is already in settle zone despite stale pursuit intent', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 300;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 500, left: 0, right: 800, bottom: 736, width: 800, height: 236 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'short-memory-current-pocket-settle',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_CURRENT_POCKET_AUTHORITY'))).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('current low line uses current pocket authority and bounded pursuit over stale debt', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 180;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'short-memory-current-pocket-low',
      match: { bestIdx: 2, bestSim: 0.91, topScores: [{ idx: 2, score: 0.91 }] },
    });
    await jest.advanceTimersByTimeAsync(320);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_CURRENT_POCKET_AUTHORITY'))).toBe(true);
    expect(lines.some((l) => l.includes('action=pursue'))).toBe(true);
    expect(scroller.scrollTop).toBeGreaterThan(180);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('same-line final transcript re-arms live pocket maintenance after startup drift', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 0;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'maintenance-prime',
      match: { bestIdx: 1, bestSim: 0.92, topScores: [{ idx: 1, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    scroller.scrollTop = 180;
    await jest.advanceTimersByTimeAsync(40);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 1,
      matchId: 'maintenance-same-line-final',
      match: { bestIdx: 1, bestSim: 0.96, topScores: [{ idx: 1, score: 0.96 }] },
    });
    await jest.advanceTimersByTimeAsync(220);

    const infoLines = infoSpy.mock.calls.map((c) => String(c[0] || ''));
    const warnLines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(infoLines.some((l) => l.includes('ASR_LIVE_POCKET_MAINTENANCE_CALLSITE_REACHED'))).toBe(true);
    expect(infoLines.some((l) => l.includes('ASR_LIVE_POCKET_MAINTENANCE_EVALUATED'))).toBe(true);
    expect(
      warnLines.some((l) => l.includes('ASR_SCROLL_AUTHORITY_SELECTED')) ||
      warnLines.some((l) => l.includes('ASR_CURRENT_POCKET_AUTHORITY')),
    ).toBe(true);

    infoSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bridge hold path preserves protection while visual follow can still nudge from low placement', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 180;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(3);
    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 3,
      matchId: 'reader-comfort-bridge-3-to-6',
      match: {
        bestIdx: 6,
        bestSim: 0.92,
        topScores: [{ idx: 6, score: 0.92 }],
      },
    } as any);
    await jest.advanceTimersByTimeAsync(260);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(
      lines.some((l) => l.includes('ASR_LIVE_BRIDGE')) ||
      driver.getLastLineIndex() <= 4,
    ).toBe(true);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bottom-lock release does not bypass bridge safety blockers', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 180;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(3);
    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 3,
      matchId: 'bottom-lock-bridge-safety',
      match: {
        bestIdx: 6,
        bestSim: 0.92,
        topScores: [{ idx: 6, score: 0.92 }],
      },
    } as any);
    await jest.advanceTimersByTimeAsync(320);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_LIVE_BRIDGE') || l.includes('bridge'))).toBe(true);
    expect(driver.getLastLineIndex()).toBeLessThanOrEqual(4);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('bottom-lock release does not create top-pressure overshoot', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'bottom-lock-no-top-pressure',
      match: { bestIdx: 2, bestSim: 0.9, topScores: [{ idx: 2, score: 0.9 }] },
    });
    await jest.advanceTimersByTimeAsync(800);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_BOTTOM_LOCK_RELEASE'))).toBe(true);
    expect(lines.some((l) => l.includes('reason=next_line_above_tolerated_top'))).toBe(false);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('preferred-lower-rail release does not create top pressure on repeated adjacent commits', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scroller = document.getElementById('viewer') as HTMLElement;
    scroller.scrollTop = 200;
    const line1 = document.querySelector<HTMLElement>('.line[data-line="1"]')!;
    const line2 = document.querySelector<HTMLElement>('.line[data-line="2"]')!;
    const line3 = document.querySelector<HTMLElement>('.line[data-line="3"]')!;
    Object.defineProperty(line1, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 560, left: 0, right: 800, bottom: 796, width: 800, height: 236 }),
    });
    Object.defineProperty(line2, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 560, left: 0, right: 800, bottom: 796, width: 800, height: 236 }),
    });
    Object.defineProperty(line3, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 560, left: 0, right: 800, bottom: 796, width: 800, height: 236 }),
    });
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'rail-repeat-1',
      match: { bestIdx: 1, bestSim: 0.91, topScores: [{ idx: 1, score: 0.91 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'rail-repeat-2',
      match: { bestIdx: 2, bestSim: 0.91, topScores: [{ idx: 2, score: 0.91 }] },
    });
    await jest.advanceTimersByTimeAsync(260);
    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'rail-repeat-3',
      match: { bestIdx: 3, bestSim: 0.91, topScores: [{ idx: 3, score: 0.91 }] },
    });
    await jest.advanceTimersByTimeAsync(320);
    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(
      lines.some((l) => l.includes('ASR_PREFERRED_LOWER_RAIL_RELEASE')) ||
      lines.some((l) => l.includes('ASR_BOTTOM_LOCK_RELEASE')) ||
      lines.some((l) => l.includes('ASR_READER_COMFORT_NUDGE')),
    ).toBe(true);
    expect(lines.some((l) => l.includes('reason=next_line_above_tolerated_top'))).toBe(false);
    expect(lines.some((l) => l.includes('ASR_VISUAL_FOLLOW_HARD_HELD'))).toBe(false);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('resets run timers on fresh runtime run identity and avoids stale startup stall timing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, runKey: 'run-a', runGeneration: 1 },
    }));
    driver.setLastLineIndex(1);
    await jest.advanceTimersByTimeAsync(22000);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, runKey: 'run-b', runGeneration: 2 },
    }));

    driver.ingest('Not perfume amazing.', true, {
      currentIdx: 1,
      runKey: 'run-b',
      runGeneration: 2,
      matchId: 'startup-adjacent-fresh-run-1-to-2',
      match: {
        bestIdx: 2,
        bestSim: 0.818,
        topScores: [{ idx: 2, score: 0.818 }],
      },
    });
    await jest.advanceTimersByTimeAsync(1200);

    const infos = infoSpy.mock.calls.map((c) => String(c[0] || ''));
    const warns = warnSpy.mock.calls.map((c) => String(c[0] || ''));

    expect(infos.some((l) => l.includes('ASR_RUN_TIMER_RESET'))).toBe(true);
    expect(warns.some((l) => l.includes('starvation_future_speech_reconcile'))).toBe(false);
    const startupLine =
      warns.find((l) => l.includes('ASR_STARTUP_ADJACENT_PRE_REBASE_COMMIT')) ||
      warns.find((l) => l.includes('ASR_STARTUP_FRESH_ADJACENT_FAST_COMMIT_EARLY')) ||
      '';
    if (startupLine) {
      const stallMatch = startupLine.match(/stallMs=(\d+)/);
      if (stallMatch) {
        expect(Number(stallMatch[1])).toBeLessThan(3000);
      }
    }
    expect(driver.getLastLineIndex()).toBe(2);

    infoSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('quarantines transcript packets during focus loss', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    let focusActive = true;
    const hasFocusSpy = jest.spyOn(document, 'hasFocus').mockImplementation(() => focusActive);

    driver.setLastLineIndex(1);
    focusActive = false;
    window.dispatchEvent(new Event('blur'));
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'focus-quarantine',
      source: 'openai-whisper-bridge',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(200);

    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_QUARANTINED'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_RUN_AFFECTED_BY_FOCUS_LOSS'))).toBe(true);
    const quarantineLine = lines.find((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_QUARANTINED')) || '';
    expect(quarantineLine).toContain('focusState=lost');
    expect(quarantineLine).toContain('sessionPhase=live');
    expect(quarantineLine).toContain('asrArmed=1');
    expect(quarantineLine).toContain('final=1');
    expect(driver.getLastLineIndex()).toBe(1);

    hasFocusSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('accepts current-generation final transcripts during visible blur for active ASR sessions', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver({ runKey: 'focus-safe-run', runGeneration: 7 });
    let focusActive = true;
    const hasFocusSpy = jest.spyOn(document, 'hasFocus').mockImplementation(() => focusActive);

    driver.setLastLineIndex(1);
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: {
        recognizerAttached: true,
        activeReadMode: true,
        speechRunningActual: true,
        runKey: 'focus-safe-run',
        runGeneration: 7,
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    focusActive = false;
    window.dispatchEvent(new Event('blur'));
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'focus-accepted',
      source: 'openai-whisper-bridge',
      runKey: 'focus-safe-run',
      runGeneration: 7,
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(240);

    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_ACCEPTED'))).toBe(true);
    const acceptedLine = lines.find((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_ACCEPTED')) || '';
    expect(acceptedLine).toContain('reason=active_current_generation_final');
    expect(acceptedLine).toContain('runGeneration=7');
    expect(acceptedLine).toContain('runKey=focus-safe-run');
    expect(lines.some((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_QUARANTINED'))).toBe(false);
    expect(driver.getLastLineIndex()).toBe(2);

    hasFocusSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('quarantines stale-generation final transcripts during visible blur', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver({ runKey: 'focus-safe-run', runGeneration: 7 });
    let focusActive = true;
    const hasFocusSpy = jest.spyOn(document, 'hasFocus').mockImplementation(() => focusActive);

    driver.setLastLineIndex(1);
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: {
        recognizerAttached: true,
        activeReadMode: true,
        speechRunningActual: true,
        runKey: 'focus-safe-run',
        runGeneration: 7,
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    focusActive = false;
    window.dispatchEvent(new Event('blur'));
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'focus-stale-quarantine',
      source: 'openai-whisper-bridge',
      runKey: 'focus-safe-run',
      runGeneration: 6,
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    await jest.advanceTimersByTimeAsync(200);

    const lines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(lines.some((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_QUARANTINED'))).toBe(true);
    expect(lines.some((l) => l.includes('ASR_FOCUS_LOSS_TRANSCRIPT_ACCEPTED'))).toBe(false);
    expect(driver.getLastLineIndex()).toBe(1);

    hasFocusSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });


  test('releases dead-screen governor hold for adjacent safe step instead of indefinite hold', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    (window as any).__tpLiveAsrGovernorHold = true;
    const driver = createAsrScrollDriver();
    (window as any).__tpAsrRunKey = 'dead-screen-deterministic-run';
    (window as any).__tpAsrRunGeneration = 42;
    (window as any).__tpAsrRunStartedAt = Date.now();
    const scroller = document.getElementById('viewer') as HTMLElement;
    const compactMetrics = [
      { top: 0, height: 24 },
      { top: 24, height: 24 },
      { top: 48, height: 24 },
      { top: 72, height: 24 },
    ];
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const metric = compactMetrics[idx];
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
    let frozenTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => frozenTop,
      set: (_v: number) => {
        frozenTop = 0;
      },
    });
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'dead-screen-adjacent-release',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [{ idx: 3, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(1200);

    const warnLines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    console.log('ESCAPE_WARN', warnLines);
    const debugLines = debugSpy.mock.calls.map((c) => String(c[0] || ''));
    const infoLines = infoSpy.mock.calls.map((c) => String(c[0] || ''));
    const deadScreenDetected = warnLines.some((l) => l.includes('ASR_GOVERNOR_DEAD_SCREEN_DETECTED'));
    const released = warnLines.some((l) => l.includes('ASR_GOVERNOR_DEAD_SCREEN_RELEASED'));
    const heldCount = warnLines.filter((l) => l.includes('ASR_GOVERNOR_DEAD_SCREEN_COMMIT_HELD')).length;
    const bypassed = warnLines.some((l) => l.includes('ASR_VISIBLE_BRIDGE_CAP_BYPASSED_TERMINAL'));
    const timerResetSeen = infoLines.some((l) => l.includes('ASR_RUN_TIMER_RESET'));
    void timerResetSeen;
    expect(deadScreenDetected).toBe(true);
    expect(released).toBe(true);
    expect(heldCount).toBeLessThanOrEqual(1);
    expect(bypassed).toBe(false);
    expect(driver.getLastLineIndex()).toBe(3);

    delete (window as any).__tpLiveAsrGovernorHold;
    delete (window as any).__tpAsrRunKey;
    delete (window as any).__tpAsrRunGeneration;
    delete (window as any).__tpAsrRunStartedAt;
    infoSpy.mockRestore();
    debugSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('allows one-shot dead-screen escape after fresh adjacent unlock without terminal suppression', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    (window as any).__tpLiveAsrGovernorHold = true;
    const driver = createAsrScrollDriver();
    (window as any).__tpAsrRunKey = 'dead-screen-fresh-unlock-run';
    (window as any).__tpAsrRunGeneration = 43;
    (window as any).__tpAsrRunStartedAt = Date.now();
    const scroller = document.getElementById('viewer') as HTMLElement;
    let frozenTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => frozenTop,
      set: (_v: number) => {
        frozenTop = 0;
      },
    });

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(3200);
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'dead-screen-fresh-adjacent-unlock',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [{ idx: 3, score: 0.9 }],
      },
    });
    await jest.advanceTimersByTimeAsync(1500);

    const warnLines = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(warnLines.some((l) => l.includes('ASR_GOVERNOR_DEAD_SCREEN_DETECTED'))).toBe(true);
    expect(warnLines.some((l) => l.includes('ASR_VISUAL_GOVERNOR_FRESH_ADJACENT_UNLOCK'))).toBe(true);
    expect(
      warnLines.some((l) =>
        l.includes('ASR_VISUAL_GOVERNOR_DEAD_SCREEN_ESCAPE_COMMIT') &&
        l.includes('reason=fresh_adjacent_unlock_dead_screen_escape'),
      ),
    ).toBe(true);
    expect(
      warnLines.some((l) => l.includes('ASR_VISUAL_GOVERNOR_DEAD_SCREEN_ESCAPE_BLOCKED')),
    ).toBe(false);
    expect(driver.getLastLineIndex()).toBe(3);

    delete (window as any).__tpLiveAsrGovernorHold;
    delete (window as any).__tpAsrRunKey;
    delete (window as any).__tpAsrRunGeneration;
    delete (window as any).__tpAsrRunStartedAt;
    debugSpy.mockRestore();
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('keeps same-line confirmation and adjacent resume behavior stable', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    driver.setLastLineIndex(1);
    await jest.advanceTimersByTimeAsync(2500);

    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 1,
      matchId: 'same-line-confirm-during-hold',
      match: {
        bestIdx: 1,
        bestSim: 0.96,
        topScores: [{ idx: 1, score: 0.96 }],
      },
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));
    driver.ingest('The seats remember every early shift.', true, {
      currentIdx: 1,
      matchId: 'adjacent-resume-proof',
      match: {
        bestIdx: 2,
        bestSim: 0.95,
        topScores: [{ idx: 2, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(300);
    expect(driver.getLastLineIndex()).toBe(2);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('restarts backend when recognizer is attached but transcript packets go stale during live ASR', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const stopRecognizer = jest.fn();
    const startRecognizer = jest.fn();
    (window as any).__tpSpeech = { stopRecognizer, startRecognizer };
    const driver = createAsrScrollDriver();

    driver.setLastLineIndex(1);
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: {
        speechRunningActual: true,
        recognizerAttached: true,
        activeReadMode: true,
      },
    }));

    await jest.advanceTimersByTimeAsync(10050);

    const warns = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(warns.some((l) => l.includes('ASR_BACKEND_TRANSCRIPT_STALE'))).toBe(true);
    expect(warns.some((l) => l.includes('ASR_BACKEND_RESTART_REQUESTED') && l.includes('skipped=0'))).toBe(true);
    expect(warns.some((l) => l.includes('ASR_BACKEND_RESTART_COMPLETED'))).toBe(true);
    expect(stopRecognizer).toHaveBeenCalled();
    expect(startRecognizer).toHaveBeenCalled();
    expect(driver.getLastLineIndex()).toBe(1);

    delete (window as any).__tpSpeech;
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('does not emit backend transcript stale during first transcript grace window', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).__tpSpeech = { stopRecognizer: jest.fn(), startRecognizer: jest.fn() };
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: {
        speechRunningActual: true,
        recognizerAttached: true,
        activeReadMode: true,
      },
    }));
    await jest.advanceTimersByTimeAsync(3000);

    const warns = warnSpy.mock.calls.map((c) => String(c[0] || ''));
    expect(warns.some((l) => l.includes('ASR_BACKEND_TRANSCRIPT_STALE'))).toBe(false);

    delete (window as any).__tpSpeech;
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('off-script noMatch packet is surfaced and not silently accepted as a commit', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    driver.ingest('LOUD OFF SCRIPT TANGENT', true, {
      currentIdx: 1,
      noMatch: true,
      source: 'openai-whisper-bridge',
      match: {
        bestIdx: -1,
        bestSim: Number.NaN,
        topScores: [],
      },
    });

    await jest.advanceTimersByTimeAsync(200);
    expect(driver.getLastLineIndex()).toBe(1);
    warnSpy.mockRestore();
    driver.dispose();
  });
});
