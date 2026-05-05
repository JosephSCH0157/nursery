/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR live commit motion', () => {
  let rafSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cafSpy: jest.SpyInstance<void, [number]>;

  beforeEach(() => {
    jest.useFakeTimers();
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
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
  });

  test('caps a forward commit below the wrapped block jump distance without continuing to glide afterward', async () => {
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

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

    const settledTop = scroller.scrollTop;

    await jest.advanceTimersByTimeAsync(800);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBe(settledTop);

    driver.dispose();
  });

  test('caps a far future live ASR match to the next readable line when that line has local support', async () => {
    const driver = createAsrScrollDriver();

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

  test('still caps a far future live ASR match to the next readable line when later content matches more strongly', async () => {
    const driver = createAsrScrollDriver();

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

  test('does not let a stalled far-future final keep the script walking forward on its own', async () => {
    const driver = createAsrScrollDriver();

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

    const warns = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warns.some((line) => line.includes('asr_recovery_chain_blocked'))).toBe(true);
    expect(warns.some((line) => line.includes('asr_recovery_landing_hold_cleared'))).toBe(true);

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
    expect(driver.getLastLineIndex()).toBe(4);

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

    expect(driver.getLastLineIndex()).toBe(7);

    driver.dispose();
  });

  test('allows adjacent proof commits even when marker tracking is healthy under starvation', async () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.setLastLineIndex(1);
    await jest.advanceTimersByTimeAsync(5200);

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

    expect(driver.getLastLineIndex()).toBe(4);

    driver.dispose();
  });

  test('continues pending semantic bridge when a follow-up final re-matches the stale current line', async () => {
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

    expect(driver.getLastLineIndex()).toBe(7);

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

    expect(driver.getLastLineIndex()).toBe(7);
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
        (
          line.includes('reason=asr_pending_speakable_bridge_retry') ||
          line.includes('reason=asr_pending_speakable_bridge_refresh') ||
          line.includes('reason=asr_pending_speakable_bridge_pressure_commit')
        ) &&
        line.includes('semanticTargetViewportState=below'),
      ),
    ).toBe(true);

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

    if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
    else delete (document as any).visibilityState;
    if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
    else delete (document as any).hidden;
    driver.dispose();
  });
});
