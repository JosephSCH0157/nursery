/** @jest-environment jsdom */

import { createAsrLogBuffer, installAsrLogBuffer } from '../../src/features/asr/asr-log-buffer';

describe('ASR log buffer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    delete (window as any).__TP_DEV;
    delete (window as any).__ASR_DIAGNOSTIC_PROOF__;
    delete (window as any).__ASR_LOG_BUFFER__;
    delete (window as any).__copyAsrLog;
    delete (window as any).__downloadAsrLog;
    delete (window as any).__clearAsrLog;
    delete (window as any).__getAsrLogSummary;
    delete (window as any).__asrLogBufferInstalled;
  });

  test('captures ASR entries and exports/clears them', async () => {
    let copied = '';
    const buffer = createAsrLogBuffer({
      now: () => new Date('2026-05-18T17:10:11.000Z'),
      performanceNow: () => 1234.5,
      href: () => 'http://localhost:8080/?dev=1',
      userAgent: () => 'jest',
      copyText: (text) => { copied = text; },
    });

    expect(buffer.captureConsoleCall('warn', [
      '[ASR_VISUAL_MARKER_ERROR_CORRECTION] currentLineIdx=8 committedLineIdx=8 nextSpeakableLineIdx=9 currentScrollTop=220 targetScrollTop=291',
    ])).toBe(true);

    const exported = await buffer.copy();
    expect(exported.entryCount).toBe(1);
    expect(exported.droppedCount).toBe(0);
    expect(exported.tagCounts.ASR_VISUAL_MARKER_ERROR_CORRECTION).toBe(1);
    expect(exported.entries[0].tag).toBe('ASR_VISUAL_MARKER_ERROR_CORRECTION');
    expect(exported.entries[0].currentLineIdx).toBe(8);
    expect(exported.entries[0].scrollTop).toBe(220);
    expect(exported.runPhaseSummaries).toHaveLength(1);
    expect(exported.runPhaseSummaries[0].lineRange).toBe('0-24');
    expect(copied).toContain('"entryCount": 1');

    buffer.clear();
    expect(buffer.entries).toHaveLength(0);
    expect(buffer.droppedCount).toBe(0);
  });

  test('non-serializable payloads do not throw', () => {
    const buffer = createAsrLogBuffer();
    const circular: any = { name: 'circular' };
    circular.self = circular;
    expect(() => {
      buffer.captureConsoleCall('warn', ['[ASR_TEST] payload capture', circular]);
    }).not.toThrow();
    expect(buffer.entries[0].payload).toEqual({
      name: 'circular',
      self: '[Circular]',
    });
  });

  test('max entry cap drops old entries in ring order', () => {
    const buffer = createAsrLogBuffer({ maxEntries: 3 });
    buffer.captureConsoleCall('warn', ['[ASR_ONE] currentLineIdx=1']);
    buffer.captureConsoleCall('warn', ['[ASR_TWO] currentLineIdx=2']);
    buffer.captureConsoleCall('warn', ['[ASR_THREE] currentLineIdx=3']);
    buffer.captureConsoleCall('warn', ['[ASR_FOUR] currentLineIdx=4']);

    expect(buffer.entries).toHaveLength(3);
    expect(buffer.droppedCount).toBe(1);
    expect(buffer.entries.map((e) => e.tag)).toEqual(['ASR_TWO', 'ASR_THREE', 'ASR_FOUR']);
  });

  test('progress logging is throttled by entry interval', () => {
    const progressLines: string[] = [];
    const buffer = createAsrLogBuffer({
      progressEvery: 2,
      progressConsole: (line) => progressLines.push(line),
    });
    buffer.captureConsoleCall('warn', ['[ASR_ONE]']);
    buffer.captureConsoleCall('warn', ['[ASR_TWO]']);
    buffer.captureConsoleCall('warn', ['[ASR_THREE]']);
    buffer.captureConsoleCall('warn', ['[ASR_FOUR]']);
    expect(progressLines).toEqual([
      '[ASR_LOG_PROGRESS] 2 entries captured',
      '[ASR_LOG_PROGRESS] 4 entries captured',
    ]);
  });

  test('exported summaries preserve actuator and chairperson investigation details', async () => {
    const buffer = createAsrLogBuffer({
      now: (() => {
        let tick = 0;
        return () => new Date(`2026-05-20T08:22:${String(10 + tick++).padStart(2, '0')}.000Z`);
      })(),
    });

    buffer.captureConsoleCall('warn', [
      '[ASR_VISUAL_ACTUATOR_APPLIED] requestedPxps=24 appliedPxps=12 frameDtMs=16 requestedDeltaPx=18 appliedDeltaPx=6 beforeScrollTop=200 afterScrollTop=206 targetScrollTop=380 targetDebtPx=132 source=tick_controller clampReason=min_step_floor writerKind=pixel reason=marker_lock_suppressed_recovery maxScrollTop=1200 distanceToMaxScrollTop=994 atScrollLimit=0 scrollHeight=1800 clientHeight=600',
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_VISUAL_ACTUATOR_APPLIED] requestedPxps=22 appliedPxps=12 frameDtMs=16 requestedDeltaPx=17 appliedDeltaPx=6 beforeScrollTop=206 afterScrollTop=212 targetScrollTop=380 targetDebtPx=148 source=tick_controller clampReason=min_step_floor writerKind=pixel reason=marker_lock_suppressed_recovery maxScrollTop=1200 distanceToMaxScrollTop=988 atScrollLimit=0 scrollHeight=1800 clientHeight=600',
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF] appliedDeltaPx=6 targetDebtPx=148 clampReason=min_step_floor reason=marker_lock_suppressed_recovery source=tick_controller shouldEmitChairperson=1',
    ]);

    const exported = await buffer.copy();
    const actuatorSummary = exported.tagSummaries['ASR_VISUAL_ACTUATOR_APPLIED'];
    const chairSummary = exported.tagSummaries['ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF'];

    expect(actuatorSummary.count).toBe(2);
    expect(actuatorSummary.maxTargetDebtPx).toBe(148);
    expect(actuatorSummary.minStepFloorCount).toBe(2);
    expect(actuatorSummary.bigDebtMinStepCount).toBe(2);
    expect(actuatorSummary.largestRepeatedMinStepStreak).toBe(2);
    expect(actuatorSummary.lastMinStepSample?.tag).toBe('ASR_VISUAL_ACTUATOR_APPLIED');
    expect(chairSummary.count).toBe(1);
    expect(chairSummary.maxTargetDebtPx).toBe(148);
    expect(chairSummary.minStepFloorCount).toBe(1);
    expect(chairSummary.bigDebtMinStepCount).toBe(1);
  });

  test('rolling run phase summaries survive ring eviction and preserve late-phase counters', async () => {
    const buffer = createAsrLogBuffer({ maxEntries: 2 });

    buffer.captureConsoleCall('warn', [
      '[ASR_CUE_BRIDGE_COMMIT] currentLineIdx=188 committedLineIdx=190 targetLineIdx=190 actualMovedPx=18',
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_LIVE_POCKET_MAINTENANCE_EVALUATED] currentLineIdx=194 committedLineIdx=195 targetLineIdx=201 pocketHealth=belowPocket belowPocketPx=42 deniedReason=unsafe_target terminalClamp=0 actualMovedPx=0',
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_READER_COMFORT_RESCUE_APPLIED] currentLineIdx=196 committedLineIdx=196 targetLineIdx=196 visualDebtPx=60 belowPocketPx=28 activeLineViewportRatio=0.840 distanceToBottomRailPx=-12 writerSettleActive=1 visualRecoveryCooldownActive=1 cooldownRemainingMs=240 debtBelowLineHeight=0 unsafeTargetReason=unsafe_target targetAcceptedLocal=1 repeatedBelowPocketCount=3 lastCorrectionAgeMs=480 actualMovedPx=20 reason=bridge_hold_local_readability',
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_STARVATION_DETECTED] currentLineIdx=205 committedLineIdx=206 targetLineIdx=209 actualMovedPx=0 reason=bridge_hold_starvation',
    ]);

    const exported = await buffer.copy();

    expect(exported.entryCount).toBe(2);
    expect(exported.droppedCount).toBe(2);
    const lateBucket = exported.runPhaseSummaries.find((summary) => summary.lineStart === 175);
    const tailBucket = exported.runPhaseSummaries.find((summary) => summary.lineStart === 200);
    expect(lateBucket).toBeTruthy();
    expect(tailBucket).toBeTruthy();
    expect(lateBucket?.cueBridgeCommitCount).toBe(1);
    expect(lateBucket?.unsafeTargetCount).toBe(2);
    expect(lateBucket?.readerComfortRescueAppliedCount).toBe(1);
    expect(lateBucket?.belowPocketCount).toBe(1);
    expect(lateBucket?.medianBelowPocketPx).toBe(35);
    expect(lateBucket?.averageCommitDelta).toBe(2);
    expect(tailBucket?.starvationDetectedCount).toBe(1);
  });

  test('starvation summaries fall back to payload and last known line attribution', async () => {
    const buffer = createAsrLogBuffer();

    buffer.captureConsoleCall('warn', [
      '[ASR_LIVE_POCKET_MAINTENANCE_EVALUATED] currentLineIdx=198 committedLineIdx=199 targetLineIdx=201 pocketHealth=belowPocket belowPocketPx=44 deniedReason=unsafe_target',
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_STARVATION_DETECTED]',
      { currentLineIdx: 199, committedLineIdx: 200, reason: 'payload_line_available' },
    ]);
    buffer.captureConsoleCall('warn', [
      '[ASR_STARVATION_DETECTED]',
      { reason: 'fallback_to_last_known_line' },
    ]);

    const exported = await buffer.copy();
    const bucket = exported.runPhaseSummaries.find((summary) => summary.lineStart === 175);

    expect(bucket).toBeTruthy();
    expect(bucket?.starvationDetectedCount).toBe(2);
  });

  test('installer patches console only when enabled and exposes window helpers', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    window.localStorage.setItem('asr_log_buffer', '1');

    installAsrLogBuffer(window as any);
    console.warn('[ASR_TEST] currentLineIdx=3');
    console.warn('[non-asr] should print');

    const buffer = (window as any).__ASR_LOG_BUFFER__;
    expect(buffer.entries).toHaveLength(1);
    expect(infoSpy.mock.calls.some((c) => String(c[0] || '').includes('[ASR_LOG_PROGRESS]'))).toBe(false);
    expect(warnSpy.mock.calls.some((c) => String(c[0] || '').includes('[non-asr] should print'))).toBe(true);

    const exported = await (window as any).__copyAsrLog();
    expect(exported.entryCount).toBe(1);
    (window as any).__clearAsrLog();
    expect(buffer.entries).toHaveLength(0);
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('installer exposes download helper in dev diagnostic mode', () => {
    (window as any).__TP_DEV = true;

    installAsrLogBuffer(window as any);

    expect(typeof (window as any).__downloadAsrLog).toBe('function');
    expect(typeof (window as any).__copyAsrLog).toBe('function');
  });

  test('installer backfills helpers when already installed flag is set', () => {
    (window as any).__TP_DEV = true;
    installAsrLogBuffer(window as any);
    const existingBuffer = (window as any).__ASR_LOG_BUFFER__;

    delete (window as any).__downloadAsrLog;
    delete (window as any).__copyAsrLog;
    (window as any).__asrLogBufferInstalled = true;
    (window as any).__ASR_LOG_BUFFER__ = existingBuffer;

    installAsrLogBuffer(window as any);

    expect(typeof (window as any).__downloadAsrLog).toBe('function');
    expect(typeof (window as any).__copyAsrLog).toBe('function');
  });
});
