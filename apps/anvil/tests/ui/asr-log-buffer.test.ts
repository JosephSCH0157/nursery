/** @jest-environment jsdom */

import { createAsrLogBuffer, installAsrLogBuffer } from '../../src/features/asr/asr-log-buffer';

describe('ASR log buffer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
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
});
