import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function runReport(logFiles: string[]) {
  const args = ['tools/asr_alignment_report.mjs', ...logFiles];
  const out = execFileSync('node', args, {
    cwd: path.resolve(process.cwd()),
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function makeTmpLog(lines: string[]): string {
  const file = path.join(os.tmpdir(), `asr-alignment-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

describe('ASR alignment report diagnostics', () => {
  test('deterministic replay report for same logs', () => {
    const log1 = makeTmpLog([
      'x reason=movement_authority_commit current=10 target=11 commitTargetLine=11 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof',
      '[ASR_COMMIT] before=100 after=100',
      '[ASR_VISUAL_FOLLOW_TARGET] targetScrollTop=180 currentScrollTop=100 deltaPx=80 deltaLines=3.20',
      '[ASR_READER_COMFORT_HOLD] markerY=390 currentLineY=482 nextLineY=482',
    ]);
    const log2 = makeTmpLog([
      'x reason=movement_authority_commit current=12 target=13 commitTargetLine=13 proofSource=strict_adjacent_tail_progression sourceBranch=movement_authority_proof',
      '[ASR_COMMIT] before=200 after=200',
      '[ASR_VISUAL_FOLLOW_TARGET] targetScrollTop=360 currentScrollTop=200 deltaPx=160 deltaLines=6.64',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=200 targetScrollTop=360 deltaPx=160',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=200 targetScrollTop=360 deltaPx=160',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=200 targetScrollTop=360 deltaPx=160',
    ]);
    const a = runReport([log1, log2]);
    const b = runReport([log1, log2]);
    const normalize = (payload: any) => ({
      reports: payload.reports.map((r: any) => ({
        file: r.file,
        summary: r.summary,
        completeness: r.completeness,
        outcomeDistribution: r.outcomeDistribution,
      })),
      goNoGo: payload.goNoGo,
    });
    expect(normalize(a)).toEqual(normalize(b));
  });

  test('classification: complete lower-band episode is not unknown', () => {
    const log = makeTmpLog([
      'x reason=movement_authority_commit current=10 target=11 commitTargetLine=11 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof',
      '[ASR_COMMIT] before=100 after=100',
      '[ASR_VISUAL_FOLLOW_TARGET] targetScrollTop=180 currentScrollTop=100 deltaPx=80 deltaLines=3.20',
      '[ASR_READER_COMFORT_HOLD] markerY=390 currentLineY=482 nextLineY=482',
    ]);
    const payload = runReport([log]);
    const report = payload.reports[0];
    const keys = Object.keys(report.outcomeDistribution);
    expect(keys).not.toContain('unknown');
    expect(keys.some((k) => k === 'in_pocket' || k === 'bottom_locked')).toBe(true);
  });

  test('classification: repeated hold ticks becomes hard_hold_loop', () => {
    const lines = [
      'x reason=movement_authority_commit current=12 target=13 commitTargetLine=13 proofSource=strict_adjacent_tail_progression sourceBranch=movement_authority_proof',
      '[ASR_COMMIT] before=200 after=200',
      '[ASR_VISUAL_FOLLOW_TARGET] targetScrollTop=360 currentScrollTop=200 deltaPx=160 deltaLines=6.64',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=200 targetScrollTop=360 deltaPx=160',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=200 targetScrollTop=360 deltaPx=160',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=200 targetScrollTop=360 deltaPx=160',
    ];
    const log = makeTmpLog(lines);
    const payload = runReport([log]);
    expect(payload.reports[0].outcomeDistribution.hard_hold_loop.count).toBe(1);
  });

  test('classification: starvation delay becomes delayed_until_starvation', () => {
    const log = makeTmpLog([
      'x reason=movement_authority_commit current=12 target=13 commitTargetLine=13 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof',
      '[ASR_COMMIT] before=300 after=300',
      '[ASR_VISUAL_FOLLOW_TARGET] targetScrollTop=390 currentScrollTop=300 deltaPx=90 deltaLines=3.81',
      '[ASR_SUSTAINED_READ_STEP] sourceHoldReason=asr_live_no_adjacent_match_hold actualDelayMs=2063',
    ]);
    const payload = runReport([log]);
    expect(payload.reports[0].outcomeDistribution.delayed_until_starvation.count).toBe(1);
  });

  test('classification: bridge staged pending completion becomes bridge_wait', () => {
    const log = makeTmpLog([
      'x reason=movement_authority_commit current=113 target=114 commitTargetLine=114 proofSource=strict_speakable_bridge_landing sourceBranch=movement_authority_pending_bridge_pressure',
      '[ASR_COMMIT] before=8106 after=8106',
      '[ASR_VISUAL_FOLLOW_TARGET] targetScrollTop=8178 currentScrollTop=8106 deltaPx=72 deltaLines=3.00',
      '[ASR_VISUAL_FOLLOW_HARD_HELD] currentScrollTop=8106 targetScrollTop=8178 deltaPx=72',
    ]);
    const payload = runReport([log]);
    expect(payload.reports[0].outcomeDistribution.bridge_wait.count).toBe(1);
  });
});
