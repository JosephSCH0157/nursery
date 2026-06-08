/** @jest-environment jsdom */

jest.setTimeout(60000);

function bootstrapDom(): void {
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
}

function bootstrapLongDom(lineCount = 16): void {
  const lines = Array.from({ length: lineCount }, (_, idx) => {
    return `<div class="line" data-line="${idx}" style="line-height:24px;">Line ${idx} carries the spoken script content for test ${idx}.</div>`;
  }).join('');
  document.body.innerHTML = `
    <main id="viewer" class="viewer" style="overflow-y:auto">
      <div id="script">${lines}</div>
    </main>
  `;
  const scroller = document.getElementById('viewer') as HTMLElement;
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 9000 });
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
  });
  scroller.scrollTop = 0;

  Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
    const top = idx * 280;
    const height = 220;
    Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: top });
    Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: height });
    Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: height });
    Object.defineProperty(lineEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top,
        left: 0,
        right: 800,
        bottom: top + height,
        width: 800,
        height,
      }),
    });
  });
}

describe('ASR TS-primary matcher proof', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });

    bootstrapDom();
    (window as any).__TP_TS_PRIMARY__ = true;
    (window as any).__tpStore = {
      get(key: string) {
        if (key === 'scrollMode') return 'asr';
        if (key === 'session.phase') return 'live';
        if (key === 'session.asrArmed') return true;
        return undefined;
      },
    };
    (window as any).__TP_MARKER_PCT = 0.4;
    (window as any).scriptWords = [
      'doors', 'sigh',
      'farebox', 'chirps', 'coffee', 'lids', 'do', 'that', 'little', 'click',
      'the', 'seats', 'remember', 'every', 'early', 'shift',
      'neon', 'ads', 'hum', 'above', 'the', 'aisle',
    ];
    (window as any).paraIndex = [
      { start: 0, end: 1, key: 'Doors sigh.', line: 0 },
      { start: 2, end: 9, key: 'Farebox chirps, coffee lids do that little click.', line: 1 },
      { start: 10, end: 15, key: 'The seats remember every early shift.', line: 2 },
      { start: 16, end: 21, key: 'Neon ads hum above the aisle.', line: 3 },
    ];
    (window as any).__vParaIndex = [
      'Doors sigh.',
      'Farebox chirps, coffee lids do that little click.',
      'The seats remember every early shift.',
      'Neon ads hum above the aisle.',
    ];
    (window as any).currentIndex = 0;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__TP_TS_PRIMARY__;
    delete (window as any).__tpSpeech;
    delete (window as any).__tpMatcher;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).scriptWords;
    delete (window as any).paraIndex;
    delete (window as any).__vParaIndex;
    delete (window as any).currentIndex;
  });

  function getGuardPayloads(warnSpy: jest.SpyInstance) {
    return warnSpy.mock.calls
      .map((call) => call[1] as { reason?: string; parts?: string[] } | undefined)
      .filter((payload): payload is { reason: string; parts: string[] } => {
        return !!payload && typeof payload.reason === 'string' && Array.isArray(payload.parts);
      });
  }

  function dispatchSpeechStallRescue(): void {
    window.dispatchEvent(new CustomEvent('tp:asr:rescue', {
      detail: { reason: 'stall:speech_stall' },
    }));
  }

  test('strong adjacent TS-primary match satisfies adjacent proof without no-adjacent hold', async () => {
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    const { setAsrBlocks } = await import('../../src/scroll/asr-block-store');
    ensureSpeechGlobals();
    setAsrBlocks([document.createElement('div')], {
      schemaVersion: 1,
      blockCount: 1,
      createdAt: Date.now(),
      source: 'render',
      units: [{ blockIdx: 0, unitStart: 0, unitEnd: 3, sentenceCount: 4, charCount: 124 }],
    });

    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(0);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'ts-primary-adjacent-proof',
    });
    await jest.advanceTimersByTimeAsync(240);

    expect(driver.getLastLineIndex()).toBe(1);
    const warns = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warns.some((line) => line.includes('asr_live_no_adjacent_match_hold'))).toBe(false);

    driver.dispose();
  });

  test('canonical backend TS-primary evidence can promote a safe bounded forward step without no-adjacent hold', async () => {
    bootstrapLongDom(18);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(10);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 13 carries the spoken script content for test 13.', true, {
      currentIdx: 10,
      matchId: 'ts-primary-safe-forward-correction',
      match: {
        bestIdx: 13,
        bestSim: 0.93,
        topScores: [{ idx: 13, score: 0.93 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(240);

    expect(driver.getLastLineIndex()).toBeGreaterThan(10);
    const warnings = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warnings.some((line) => line.includes('asr_live_no_adjacent_match_hold'))).toBe(false);

    driver.dispose();
  });

  test('unsafe backend matcher evidence still keeps the no-adjacent hold active', async () => {
    bootstrapLongDom(18);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(10);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 13 carries the spoken script content for test 13.', true, {
      currentIdx: 10,
      matchId: 'ts-primary-unsafe-forward-correction',
      match: {
        bestIdx: 13,
        bestSim: 0.48,
        topScores: [{ idx: 13, score: 0.48 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(240);

    expect(driver.getLastLineIndex()).toBeLessThan(13);
    const warnings = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warnings.some((line) => line.includes('asr_live_no_adjacent_match_hold'))).toBe(true);

    driver.dispose();
  });

  test('auto-stall single-step rescue accepts current TS-primary backend proof for 3 to 4', async () => {
    bootstrapLongDom(12);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 3 carries the spoken script content for test 3.', true, {
      currentIdx: 2,
      matchId: 'ts-primary-prep-3-to-4',
      match: {
        bestIdx: 3,
        bestSim: 0.94,
        topScores: [{ idx: 3, score: 0.94 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 3 carries the spoken script content for test 3.', false, {
      currentIdx: 3,
      matchId: 'ts-primary-prime-auto-stall-3-to-4',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [{ idx: 3, score: 0.9 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Line 4 carries the spoken script content for test 4.', true, {
      currentIdx: 3,
      matchId: 'ts-primary-auto-stall-3-to-4',
      match: {
        bestIdx: 4,
        bestSim: 0.92,
        topScores: [{ idx: 4, score: 0.92 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    expect(guardPayloads.some((payload) =>
      payload.reason === 'proof_owned_primary_commit' &&
      payload.parts.includes('current=3') &&
      payload.parts.includes('target=4') &&
      payload.parts.includes('source=auto-stall'),
    )).toBe(true);
    expect(guardPayloads.some((payload) => payload.reason === 'live_strict_rescue_hold_no_local_proof')).toBe(false);

    driver.dispose();
  });

  test('auto-stall single-step rescue accepts current TS-primary backend proof for 24 to 25', async () => {
    bootstrapLongDom(32);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(23);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 24 carries the spoken script content for test 24.', true, {
      currentIdx: 23,
      matchId: 'ts-primary-prep-24-to-25',
      match: {
        bestIdx: 24,
        bestSim: 0.95,
        topScores: [{ idx: 24, score: 0.95 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 24 carries the spoken script content for test 24.', false, {
      currentIdx: 24,
      matchId: 'ts-primary-prime-auto-stall-24-to-25',
      match: {
        bestIdx: 24,
        bestSim: 0.9,
        topScores: [{ idx: 24, score: 0.9 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Line 25 carries the spoken script content for test 25.', true, {
      currentIdx: 24,
      matchId: 'ts-primary-auto-stall-24-to-25',
      match: {
        bestIdx: 25,
        bestSim: 0.91,
        topScores: [{ idx: 25, score: 0.91 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    expect(guardPayloads.some((payload) =>
      payload.reason === 'proof_owned_primary_commit' &&
      payload.parts.includes('current=24') &&
      payload.parts.includes('target=25') &&
      payload.parts.includes('source=auto-stall'),
    )).toBe(true);
    expect(guardPayloads.some((payload) => payload.reason === 'live_strict_rescue_hold_no_local_proof')).toBe(false);

    driver.dispose();
  });

  test('auto-stall backend evidence with a primary bypass stays rejected with a precise reason', async () => {
    bootstrapLongDom(16);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(2);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 3 carries the spoken script content for test 3.', true, {
      currentIdx: 2,
      matchId: 'ts-primary-prep-reject-shape',
      match: {
        bestIdx: 3,
        bestSim: 0.94,
        topScores: [{ idx: 3, score: 0.94 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 3 carries the spoken script content for test 3.', false, {
      currentIdx: 3,
      matchId: 'ts-primary-prime-auto-stall-reject',
      match: {
        bestIdx: 3,
        bestSim: 0.9,
        topScores: [{ idx: 3, score: 0.9 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Line 4 carries the spoken script content for test 4.', true, {
      currentIdx: 3,
      matchId: 'ts-primary-auto-stall-reject',
      match: {
        bestIdx: 4,
        bestSim: 0.93,
        topScores: [{ idx: 4, score: 0.93 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: 'matcher_unavailable',
      } as any,
    });
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    const rejectedPayload = guardPayloads.find((payload) => payload.reason === 'live_strict_rescue_canonical_backend_rejected');
    expect(rejectedPayload).toBeTruthy();
    expect(rejectedPayload?.parts).toContain('source=auto-stall');
    expect(rejectedPayload?.parts).toContain('backendEvidencePresent=1');
    expect(rejectedPayload?.parts).toContain('adjacentStepEligible=0');
    expect(rejectedPayload?.parts).toContain('rescueProofRejectedReason=primary_bypass:matcher_unavailable');
    expect(guardPayloads.some((payload) =>
      payload.reason === 'proof_owned_primary_commit' &&
      payload.parts.includes('source=auto-stall'),
    )).toBe(false);

    driver.dispose();
  });

  test('speech-stall single-step rescue accepts current TS-primary backend proof for 26 to 27', async () => {
    bootstrapLongDom(40);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(25);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 26 carries the spoken script content for test 26.', true, {
      currentIdx: 25,
      matchId: 'ts-primary-prep-26-to-27',
      match: {
        bestIdx: 26,
        bestSim: 0.95,
        topScores: [{ idx: 26, score: 0.95 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 27 carries the spoken script content for test 27.', true, {
      currentIdx: 26,
      matchId: 'ts-primary-speech-stall-26-to-27',
      match: {
        bestIdx: 27,
        bestSim: 0.92,
        topScores: [{ idx: 27, score: 0.92 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(160);
    dispatchSpeechStallRescue();
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    expect(guardPayloads.some((payload) =>
      payload.reason === 'live_strict_rescue_tail_progression_proof' &&
      payload.parts.includes('current=26') &&
      payload.parts.includes('target=27') &&
      payload.parts.includes('source=stall:speech_stall'),
    )).toBe(true);
    expect(guardPayloads.some((payload) =>
      payload.reason === 'live_strict_rescue_canonical_backend_rejected' &&
      payload.parts.includes('source=stall:speech_stall'),
    )).toBe(false);

    driver.dispose();
  });

  test('speech-stall single-step rescue accepts current TS-primary backend proof for 54 to 55', async () => {
    bootstrapLongDom(70);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(53);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 54 carries the spoken script content for test 54.', true, {
      currentIdx: 53,
      matchId: 'ts-primary-prep-54-to-55',
      match: {
        bestIdx: 54,
        bestSim: 0.95,
        topScores: [{ idx: 54, score: 0.95 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 55 carries the spoken script content for test 55.', true, {
      currentIdx: 54,
      matchId: 'ts-primary-speech-stall-54-to-55',
      match: {
        bestIdx: 55,
        bestSim: 0.93,
        topScores: [{ idx: 55, score: 0.93 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(160);
    dispatchSpeechStallRescue();
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    expect(guardPayloads.some((payload) =>
      payload.reason === 'live_strict_rescue_tail_progression_proof' &&
      payload.parts.includes('current=54') &&
      payload.parts.includes('target=55') &&
      payload.parts.includes('source=stall:speech_stall'),
    )).toBe(true);
    expect(guardPayloads.some((payload) =>
      payload.reason === 'live_strict_rescue_canonical_backend_rejected' &&
      payload.parts.includes('source=stall:speech_stall'),
    )).toBe(false);

    driver.dispose();
  });

  test('speech-stall stale-behind backend evidence stays rejected with a precise reason', async () => {
    bootstrapLongDom(40);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(25);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 26 carries the spoken script content for test 26.', true, {
      currentIdx: 25,
      matchId: 'ts-primary-prep-speech-stall-stale',
      match: {
        bestIdx: 26,
        bestSim: 0.95,
        topScores: [{ idx: 26, score: 0.95 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 27 carries the spoken script content for test 27.', true, {
      currentIdx: 26,
      matchId: 'ts-primary-speech-stall-stale',
      match: {
        bestIdx: 24,
        bestSim: 0.92,
        topScores: [{ idx: 24, score: 0.92 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(160);
    dispatchSpeechStallRescue();
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    const rejectedPayload = guardPayloads.find((payload) =>
      payload.reason === 'live_strict_rescue_canonical_backend_rejected' &&
      payload.parts.includes('source=stall:speech_stall'),
    );
    expect(rejectedPayload).toBeTruthy();
    expect(rejectedPayload?.parts).toContain('rescueProofRejectedReason=best_idx_not_forward');

    driver.dispose();
  });

  test('speech-stall stale backend evidence rejects as backend_evidence_stale before target mismatch', async () => {
    bootstrapLongDom(40);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(7);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 9 carries the spoken script content for test 9.', true, {
      currentIdx: 7,
      matchId: 'ts-primary-speech-stall-stale-age',
      match: {
        bestIdx: 9,
        bestSim: 0.84,
        topScores: [{ idx: 9, score: 0.84 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(6443);
    dispatchSpeechStallRescue();
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    const rejectedPayload = guardPayloads.find((payload) =>
      payload.reason === 'live_strict_rescue_canonical_backend_rejected' &&
      payload.parts.includes('source=stall:speech_stall'),
    );
    expect(rejectedPayload).toBeTruthy();
    expect(rejectedPayload?.parts).toContain('rescueProofRejectedReason=backend_evidence_stale');
    expect(rejectedPayload?.parts).toContain('matchBestIdx=9');
    expect(rejectedPayload?.parts).toContain('rescueTargetIdx=9');
    expect(rejectedPayload?.parts).toContain('promotedTargetIdx=8');

    driver.dispose();
  });

  test('auto-stall stale-behind backend evidence still rejects as best_idx_not_forward', async () => {
    bootstrapLongDom(12);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(0);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 1 carries the spoken script content for test 1.', true, {
      currentIdx: 0,
      matchId: 'ts-primary-auto-stall-behind-1',
      match: {
        bestIdx: 1,
        bestSim: 0.73,
        topScores: [{ idx: 1, score: 0.73 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 1 carries the spoken script content for test 1.', false, {
      currentIdx: 1,
      matchId: 'ts-primary-auto-stall-behind-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.73,
        topScores: [{ idx: 1, score: 0.73 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(1200);

    driver.ingest('Line 2 carries the spoken script content for test 2.', true, {
      currentIdx: 1,
      matchId: 'ts-primary-auto-stall-behind-2',
      match: {
        bestIdx: 1,
        bestSim: 0.79,
        topScores: [{ idx: 1, score: 0.79 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    const rejectedPayload = guardPayloads.find((payload) =>
      payload.reason === 'live_strict_rescue_canonical_backend_rejected' &&
      payload.parts.includes('source=auto-stall'),
    );
    expect(rejectedPayload).toBeTruthy();
    expect(rejectedPayload?.parts).toContain('rescueProofRejectedReason=best_idx_not_forward');

    driver.dispose();
  });

  test('speech-stall backend evidence with a primary bypass stays rejected with a precise reason', async () => {
    bootstrapLongDom(40);
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(25);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Line 26 carries the spoken script content for test 26.', true, {
      currentIdx: 25,
      matchId: 'ts-primary-prep-speech-stall-bypass',
      match: {
        bestIdx: 26,
        bestSim: 0.95,
        topScores: [{ idx: 26, score: 0.95 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: null,
      } as any,
    });
    await jest.advanceTimersByTimeAsync(100);
    driver.ingest('Line 27 carries the spoken script content for test 27.', true, {
      currentIdx: 26,
      matchId: 'ts-primary-speech-stall-bypass',
      match: {
        bestIdx: 27,
        bestSim: 0.92,
        topScores: [{ idx: 27, score: 0.92 }],
        via: 'backend',
        reason: 'ts_primary_matcher',
        primaryBypassReason: 'matcher_unavailable',
      } as any,
    });
    await jest.advanceTimersByTimeAsync(160);
    dispatchSpeechStallRescue();
    await jest.advanceTimersByTimeAsync(240);

    const guardPayloads = getGuardPayloads(warnSpy);
    const rejectedPayload = guardPayloads.find((payload) =>
      payload.reason === 'live_strict_rescue_canonical_backend_rejected' &&
      payload.parts.includes('source=stall:speech_stall'),
    );
    expect(rejectedPayload).toBeTruthy();
    expect(rejectedPayload?.parts).toContain('rescueProofRejectedReason=primary_bypass:matcher_unavailable');

    driver.dispose();
  });
});
