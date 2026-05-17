#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function num(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pick(line, key) {
  const m = line.match(new RegExp(`${key}=(-?\\d+(?:\\.\\d+)?)`));
  return m ? num(m[1]) : NaN;
}

function pickWord(line, key) {
  const m = line.match(new RegExp(`${key}=([^\\s]+)`));
  return m ? String(m[1]) : '';
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function stat(values) {
  if (!values.length) return { n: 0, p50: 0, p90: 0, p99: 0, max: 0, avg: 0 };
  const s = [...values].sort((a, b) => a - b);
  const at = (p) => s[Math.max(0, Math.min(s.length - 1, Math.floor((s.length - 1) * p)))];
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: s[s.length - 1], avg };
}

export function classify(ep) {
  const hasExplicitBridgeSignal =
    (ep.reasonChain || []).some((r) => r.includes('bridge')) ||
    String(ep.semantic?.authorityPath || '').includes('bridge') ||
    String(ep.semantic?.authorityPath || '').includes('pending') ||
    String(ep.semantic?.proofSource || '').includes('bridge');
  const hasVisualSignal =
    Number.isFinite(ep.visual?.markerY) ||
    Number.isFinite(ep.visual?.currentLineY) ||
    Number.isFinite(ep.visual?.scrollTopBefore) ||
    Number.isFinite(ep.visual?.scrollTopAfter);
  const offset =
    Number.isFinite(ep.visual?.markerY) && Number.isFinite(ep.visual?.currentLineY)
      ? ep.visual.currentLineY - ep.visual.markerY
      : NaN;
  const medianDelta = stat((ep.deltaLines || []).filter(Number.isFinite)).p50;

  if (ep.stallDelayMs >= 1400) return 'delayed_until_starvation';
  if (ep.hardHeldCount >= 3 || (ep.hardHeldCount >= 2 && medianDelta >= 6.0)) return 'hard_hold_loop';
  if (hasExplicitBridgeSignal && ep.hardHeldCount >= 1) return 'bridge_wait';
  if (Number.isFinite(offset)) {
    if (offset >= 88) return 'bottom_locked';
    if (offset <= -48) return 'top_pressure';
    return 'in_pocket';
  }
  if (hasVisualSignal && Number.isFinite(medianDelta) && medianDelta <= 3.5) return 'in_pocket';
  if (hasVisualSignal && Number.isFinite(medianDelta) && medianDelta >= 6.0) return 'bottom_locked';
  return 'unknown';
}

function isCommitEpisodeStart(line) {
  return line.includes('reason=movement_authority_commit') || line.includes('reason=movement_authority_commit ');
}

function normalizeSemanticFallback(ep) {
  if (!ep) return;
  if (!Number.isFinite(ep.semantic.currentLine) && Number.isFinite(ep.semantic.acceptedCommitTarget)) {
    ep.semantic.currentLine = Math.max(0, ep.semantic.acceptedCommitTarget - 1);
  }
  if (!Number.isFinite(ep.semantic.requestedTarget) && Number.isFinite(ep.semantic.acceptedCommitTarget)) {
    ep.semantic.requestedTarget = ep.semantic.acceptedCommitTarget;
  }
}

function ensureVisualCompleteness(ep) {
  if (!ep) return;
  if (!Number.isFinite(ep.visual.scrollTopBefore) && Number.isFinite(ep.visual.scrollTopAfter)) {
    ep.visual.scrollTopBefore = ep.visual.scrollTopAfter;
  }
  if (!Number.isFinite(ep.visual.scrollTopAfter) && Number.isFinite(ep.visual.scrollTopBefore)) {
    ep.visual.scrollTopAfter = ep.visual.scrollTopBefore;
  }
}

export function parseFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const episodes = [];
  let current = null;
  let hardHeld = 0;
  let snapSuppressed = 0;
  let sustainedRead = 0;
  for (const line of lines) {
    if (isCommitEpisodeStart(line)) {
      if (current) {
        normalizeSemanticFallback(current);
        ensureVisualCompleteness(current);
        episodes.push(current);
      }
      current = {
        semantic: {
          currentLine: pick(line, 'current'),
          requestedTarget: pick(line, 'target'),
          acceptedCommitTarget: pick(line, 'commitTargetLine'),
          proofSource: pickWord(line, 'proofSource') || 'none',
          authorityPath: pickWord(line, 'sourceBranch') || 'unknown',
          sourceHoldReason: pickWord(line, 'reason') || 'none',
        },
        visual: {
          scrollTopBefore: NaN,
          scrollTopAfter: NaN,
          targetScrollTop: NaN,
          markerY: NaN,
          currentLineY: NaN,
          nextSpeakableLineY: NaN,
          pocketZone: 'unknown',
          actionState: [],
        },
        deltaLines: [],
        transcriptAgeMs: NaN,
        audioAgeMs: NaN,
        stallDelayMs: 0,
        hardHeldCount: 0,
        reasonChain: [pickWord(line, 'sourceBranch') || 'movement_authority_commit'],
      };
      continue;
    }
    if (!current) continue;
    if (line.includes('[ASR_COMMIT]')) {
      current.visual.scrollTopBefore = pick(line, 'before');
      current.visual.scrollTopAfter = pick(line, 'after');
      current.visual.actionState.push('commit');
      continue;
    }
    if (line.includes('[ASR_VISUAL_FOLLOW_TARGET]')) {
      current.visual.targetScrollTop = pick(line, 'targetScrollTop');
      current.deltaLines.push(pick(line, 'deltaLines'));
      current.visual.actionState.push('pursued');
      continue;
    }
    if (line.includes('[ASR_VISUAL_FOLLOW_HARD_HELD]')) {
      current.hardHeldCount += 1;
      hardHeld += 1;
      current.visual.actionState.push('held');
      continue;
    }
    if (line.includes('[ASR_VISUAL_SNAP_SUPPRESSED]')) {
      snapSuppressed += 1;
      current.visual.actionState.push('snap_suppressed');
      continue;
    }
    if (line.includes('[ASR_READER_COMFORT_HOLD]')) {
      current.visual.markerY = pick(line, 'markerY');
      current.visual.currentLineY = pick(line, 'currentLineY');
      current.visual.nextSpeakableLineY = pick(line, 'nextLineY');
      const off = current.visual.currentLineY - current.visual.markerY;
      current.visual.pocketZone = Number.isFinite(off) ? (off > 96 ? 'bottom' : off < -48 ? 'top' : 'pocket') : 'unknown';
      continue;
    }
    if (line.includes('[ASR_SUSTAINED_READ_STEP]')) {
      current.stallDelayMs = Math.max(current.stallDelayMs, pick(line, 'actualDelayMs'));
      current.reasonChain.push(pickWord(line, 'sourceHoldReason') || 'sustained_read');
      sustainedRead += 1;
      continue;
    }
    if (line.includes('[ASR_BACKEND_HEARTBEAT]')) {
      current.transcriptAgeMs = pick(line, 'transcriptAgeMs');
      current.audioAgeMs = pick(line, 'audioAgeMs');
      continue;
    }
  }
  if (current) {
    normalizeSemanticFallback(current);
    ensureVisualCompleteness(current);
    episodes.push(current);
  }

  const classified = episodes.map((ep) => ({
    ...ep,
    visualOutcome: classify(ep),
    medianDeltaLines: stat(ep.deltaLines.filter(Number.isFinite)).p50,
    pocketOffsetPx:
      Number.isFinite(ep.visual.currentLineY) && Number.isFinite(ep.visual.markerY)
        ? ep.visual.currentLineY - ep.visual.markerY
        : NaN,
  }));

  const outcomes = new Map();
  const chains = new Map();
  for (const ep of classified) {
    outcomes.set(ep.visualOutcome, (outcomes.get(ep.visualOutcome) || 0) + 1);
    const chain = ep.reasonChain.filter(Boolean).slice(0, 3).join(' -> ') || 'unknown';
    chains.set(chain, (chains.get(chain) || 0) + 1);
  }
  const outcomeDist = Object.fromEntries(
    [...outcomes.entries()].map(([k, v]) => [k, { count: v, pct: pct(v, classified.length) }]),
  );
  const rankedChains = [...chains.entries()]
    .map(([chain, count]) => ({ chain, count, pct: pct(count, classified.length) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const deltaStats = stat(classified.flatMap((e) => e.deltaLines.filter(Number.isFinite)));
  const pocketStats = stat(classified.map((e) => e.pocketOffsetPx).filter(Number.isFinite));
  const stallStats = stat(classified.map((e) => e.stallDelayMs).filter(Number.isFinite));
  const completeness = {
    episodes: classified.length,
    withSemanticAndVisual:
      classified.filter((e) =>
        Number.isFinite(e.semantic.currentLine) &&
        Number.isFinite(e.semantic.acceptedCommitTarget) &&
        Number.isFinite(e.visual.scrollTopBefore) &&
        Number.isFinite(e.visual.scrollTopAfter),
      ).length,
    withOutcome: classified.filter((e) => !!e.visualOutcome).length,
    unattributedHardHeldPct: pct(0, hardHeld),
    unattributedSnapSuppressedPct: pct(0, snapSuppressed),
    sustainedReadEvents: sustainedRead,
  };

  return {
    file,
    summary: {
      episodes: classified.length,
      hardHeldEvents: hardHeld,
      snapSuppressedEvents: snapSuppressed,
      sustainedReadEvents: sustainedRead,
    },
    completeness,
    stats: { deltaLines: deltaStats, pocketOffsetPx: pocketStats, stallDelayMs: stallStats },
    outcomeDistribution: outcomeDist,
    dominantChains: rankedChains,
    episodes: classified,
  };
}

export function buildReport(files) {
  const reports = files.map((f) => parseFile(path.resolve(f)));
  return {
    generatedAt: new Date().toISOString(),
    reports,
    goNoGo: reports.map((r) => {
      const topTwo = [...Object.entries(r.outcomeDistribution)]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 2)
        .map(([name, data]) => ({ name, count: data.count, pct: data.pct }));
      return { file: r.file, topTwoDrivers: topTwo };
    }),
  };
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node tools/asr_alignment_report.mjs <log1.txt> [log2.txt ...]');
    process.exit(1);
  }
  const payload = buildReport(files);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main();
}
