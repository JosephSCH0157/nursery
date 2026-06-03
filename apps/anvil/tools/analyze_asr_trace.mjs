#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {
    text: null,
    json: null,
    outJson: null,
    outCsv: null,
    compareStabilizer: false,
    pretty: false,
    positional: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === '--text') args.text = argv[++i] ?? null;
    else if (part === '--json') args.json = argv[++i] ?? null;
    else if (part === '--out-json') args.outJson = argv[++i] ?? null;
    else if (part === '--out-csv') args.outCsv = argv[++i] ?? null;
    else if (part === '--compare-stabilizer') args.compareStabilizer = true;
    else if (part === '--pretty') args.pretty = true;
    else args.positional.push(part);
  }
  for (const file of args.positional) {
    const ext = path.extname(file).toLowerCase();
    if (!args.json && ext === '.json') args.json = file;
    else if (!args.text && (ext === '.txt' || ext === '.log')) args.text = file;
  }
  return args;
}

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8');
}

function clampNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePreview(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function commonPrefixLength(a, b) {
  const left = normalizePreview(a);
  const right = normalizePreview(b);
  const len = Math.min(left.length, right.length);
  let i = 0;
  while (i < len && left[i] === right[i]) i += 1;
  return i;
}

function parseTextLog(text) {
  const lines = text.split(/\r?\n/);
  const finals = [];
  const warnings = [];
  const geometry = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const summaryMatch = line.match(/tp:speech:transcript emit summary (\{.*\})$/);
    if (summaryMatch) {
      try {
        const payload = JSON.parse(summaryMatch[1]);
        finals.push({
          order: finals.length + 1,
          source: 'text-log',
          lineNumber: i + 1,
          matchId: payload.matchId ?? null,
          textLen: clampNumber(payload.textLen, -1),
          textPreview: payload.textPreview ?? '',
          matchBestIdx: clampNumber(payload.matchBestIdx, -1),
          matchBestSim: clampNumber(payload.matchBestSim),
          noMatch: Boolean(payload.noMatch),
          matchReason: payload.matchReason ?? 'unknown',
          matchVia: payload.matchVia ?? null,
          primaryBypassReason: payload.primaryBypassReason ?? null,
        });
      } catch {
        warnings.push({
          type: 'parse_warning',
          lineNumber: i + 1,
          message: 'Failed to parse transcript summary JSON',
        });
      }
      continue;
    }

    const rafMatch = line.match(/\[Violation\] '([^']+)' handler took (\d+)ms/);
    if (rafMatch) {
      warnings.push({
        type: 'performance_warning',
        category: rafMatch[1],
        durationMs: clampNumber(rafMatch[2], 0),
        lineNumber: i + 1,
        line,
      });
      continue;
    }

    const geometryMatch = line.match(/\[MARKER_PADDING\] markerPct=([0-9.]+) hostH=(\d+) markerOffset=(\d+)/);
    if (geometryMatch) {
      geometry.push({
        markerPct: clampNumber(geometryMatch[1]),
        hostH: clampNumber(geometryMatch[2], -1),
        markerOffset: clampNumber(geometryMatch[3], -1),
        lineNumber: i + 1,
      });
    }
  }
  return { finals, warnings, geometry };
}

function parseJsonLog(file) {
  const parsed = JSON.parse(readUtf8(file));
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const responses = [];
  const matches = [];
  const routes = [];
  const diagnostics = [];
  for (const entry of entries) {
    if (entry?.tag === 'ASR_WHISPER_RESPONSE_RECEIVED' && entry.payload && typeof entry.payload === 'object') {
      responses.push({
        ts: entry.ts ?? null,
        seq: clampNumber(entry.payload.seq, -1),
        textLength: clampNumber(entry.payload.textLength, -1),
        providerRequestId: entry.payload.providerRequestId ?? null,
        elapsedSinceLiveStartMs: clampNumber(entry.payload.elapsedSinceLiveStartMs),
      });
      continue;
    }
    if (entry?.tag === 'ASR_MATCH' && entry.payload && typeof entry.payload === 'object') {
      matches.push({
        ts: entry.ts ?? null,
        matchId: entry.payload.matchId ?? null,
        currentIndex: clampNumber(entry.payload.currentIndex, -1),
        bestIndex: clampNumber(entry.payload.bestIndex, -1),
        delta: clampNumber(entry.payload.delta),
        sim: clampNumber(entry.payload.sim),
        final: clampNumber(entry.payload.final, 0),
      });
      continue;
    }
    if (entry?.tag === 'ASR_ROUTE' && entry.payload && !Array.isArray(entry.payload) && typeof entry.payload === 'object') {
      routes.push({
        ts: entry.ts ?? null,
        payload: entry.payload,
      });
      continue;
    }
    if (typeof entry?.stringLine === 'string' && entry.stringLine.includes('matchBestIdx=')) {
      diagnostics.push({
        ts: entry.ts ?? null,
        tag: entry.tag ?? null,
        stringLine: entry.stringLine,
      });
    }
  }
  return {
    exportedAt: parsed.exportedAt ?? null,
    entryCount: clampNumber(parsed.entryCount, 0),
    droppedCount: clampNumber(parsed.droppedCount, 0),
    tagCounts: parsed.tagCounts ?? {},
    responses,
    matches,
    routes,
    diagnostics,
  };
}

function mergeFinals(textFinals, jsonLog) {
  const matchesById = new Map(jsonLog.matches.map((item) => [item.matchId, item]));
  const routeById = new Map(
    jsonLog.routes
      .map((item) => item.payload)
      .filter((payload) => payload?.matchId)
      .map((payload) => [payload.matchId, payload]),
  );

  return textFinals.map((finalItem, index) => {
    const match = finalItem.matchId ? matchesById.get(finalItem.matchId) ?? null : null;
    const route = finalItem.matchId ? routeById.get(finalItem.matchId) ?? null : null;
    const response = jsonLog.responses[index] ?? null;
    return {
      ...finalItem,
      ts: response?.ts ?? match?.ts ?? route?.timestamp ?? null,
      responseSeq: response?.seq ?? index + 1,
      responseTextLen: response?.textLength ?? null,
      currentIndex: match?.currentIndex ?? clampNumber(route?.currentIdx, -1),
      bestIndex: match?.bestIndex ?? finalItem.matchBestIdx,
      delta: match?.delta ?? (index > 0 ? finalItem.matchBestIdx - textFinals[index - 1].matchBestIdx : 0),
      finalFlag: match?.final ?? (route?.final ? 1 : 0),
      routeNoMatch: typeof route?.noMatch === 'boolean' ? route.noMatch : finalItem.noMatch,
      routeSim: clampNumber(route?.sim, finalItem.matchBestSim),
      routeTextLen: route?.text ? String(route.text).length : finalItem.textLen,
    };
  });
}

function analyzeMonotonicity(finals, farJumpThreshold = 3) {
  let forwardMoves = 0;
  let backwardMoves = 0;
  let sameLineRepeats = 0;
  let farJumps = 0;
  const transitions = [];
  for (let i = 1; i < finals.length; i += 1) {
    const prev = finals[i - 1];
    const curr = finals[i];
    const delta = curr.matchBestIdx - prev.matchBestIdx;
    if (delta > 0) forwardMoves += 1;
    if (delta < 0) backwardMoves += 1;
    if (delta === 0) sameLineRepeats += 1;
    if (Math.abs(delta) >= farJumpThreshold) farJumps += 1;
    transitions.push({
      fromOrder: prev.order,
      toOrder: curr.order,
      fromIdx: prev.matchBestIdx,
      toIdx: curr.matchBestIdx,
      delta,
      farJump: Math.abs(delta) >= farJumpThreshold,
      backward: delta < 0,
      repeated: delta === 0,
    });
  }
  return { forwardMoves, backwardMoves, sameLineRepeats, farJumps, farJumpThreshold, transitions };
}

function analyzeStalls(finals) {
  const zones = [];
  if (!finals.length) return zones;
  let start = 0;
  for (let i = 1; i <= finals.length; i += 1) {
    const ended = i === finals.length || finals[i].matchBestIdx !== finals[start].matchBestIdx;
    if (!ended) continue;
    const count = i - start;
    if (count >= 2) {
      const first = finals[start];
      const last = finals[i - 1];
      const tsValues = finals
        .slice(start, i)
        .map((item) => (item.ts ? Date.parse(item.ts) : NaN))
        .filter(Number.isFinite);
      const durationMs =
        tsValues.length >= 2 ? Math.max(0, Math.max(...tsValues) - Math.min(...tsValues)) : null;
      zones.push({
        matchBestIdx: first.matchBestIdx,
        startOrder: first.order,
        endOrder: last.order,
        count,
        durationMs,
        startTs: first.ts,
        endTs: last.ts,
        previews: [...new Set(finals.slice(start, i).map((item) => item.textPreview).filter(Boolean))].slice(0, 3),
      });
    }
    start = i;
  }
  return zones.sort((a, b) => (b.count - a.count) || ((b.durationMs ?? -1) - (a.durationMs ?? -1)));
}

function analyzeChunkQuality(finals) {
  const longOverlappingFinals = [];
  const shortLowConfidenceFinals = [];
  const repeatedPrefixes = [];
  for (let i = 0; i < finals.length; i += 1) {
    const current = finals[i];
    if (current.textLen <= 50 && Number.isFinite(current.matchBestSim) && current.matchBestSim < 0.65) {
      shortLowConfidenceFinals.push({
        order: current.order,
        ts: current.ts,
        textLen: current.textLen,
        matchBestIdx: current.matchBestIdx,
        matchBestSim: current.matchBestSim,
        preview: current.textPreview,
      });
    }
    if (i === 0) continue;
    const prev = finals[i - 1];
    const prefixLen = commonPrefixLength(prev.textPreview, current.textPreview);
    if (prefixLen >= 20) {
      repeatedPrefixes.push({
        order: current.order,
        ts: current.ts,
        prefixLen,
        prevIdx: prev.matchBestIdx,
        matchBestIdx: current.matchBestIdx,
        preview: current.textPreview,
      });
    }
    if (current.textLen >= 250 && prev.textLen >= 120 && prefixLen >= 20) {
      longOverlappingFinals.push({
        order: current.order,
        ts: current.ts,
        matchBestIdx: current.matchBestIdx,
        matchBestSim: current.matchBestSim,
        textLen: current.textLen,
        prevTextLen: prev.textLen,
        prefixLen,
        preview: current.textPreview,
      });
    }
  }
  return { longOverlappingFinals, shortLowConfidenceFinals, repeatedPrefixes };
}

function assessProgressHealth(finals, monotonicity, stalls, chunkQuality) {
  const highestMatchedLine = finals.reduce((max, item) => Math.max(max, item.matchBestIdx), -1);
  const finalMatchedLine = finals.length ? finals[finals.length - 1].matchBestIdx : -1;
  const reasons = [];
  if (monotonicity.backwardMoves >= 4) reasons.push('frequent backward jumps');
  if (monotonicity.sameLineRepeats >= Math.max(4, Math.floor(finals.length * 0.15))) reasons.push('high same-line repeat rate');
  if (monotonicity.farJumps >= 3) reasons.push('multiple far jumps');
  if ((stalls[0]?.count ?? 0) >= 4) reasons.push('stall zones persist on the same line');
  if (chunkQuality.longOverlappingFinals.length >= Math.max(4, Math.floor(finals.length * 0.15))) {
    reasons.push('many long overlapping finals');
  }
  const suitable = reasons.length === 0;
  return {
    highestMatchedLine,
    finalMatchedLine,
    regressionCount: monotonicity.backwardMoves,
    repeatCount: monotonicity.sameLineRepeats,
    directSteeringSuitable: suitable,
    suitabilityReasons: suitable ? ['stream looks stable enough for direct steering'] : reasons,
  };
}

export async function compareWithEvidenceStabilizer(finals, injectedStabilizerModule = null) {
  if (injectedStabilizerModule?.compareAsrTraceFinalsWithStabilizer) {
    return injectedStabilizerModule.compareAsrTraceFinalsWithStabilizer(
      finals,
      injectedStabilizerModule,
    );
  }
  const comparisonModule = await import(
    pathToFileURL(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/features/asr/asr-trace-analyzer-comparison.ts'),
    ).href
  );
  const stabilizerModule = await import(
    pathToFileURL(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/features/asr/asr-evidence-stabilizer.ts'),
    ).href
  );
  return comparisonModule.compareAsrTraceFinalsWithStabilizer(finals, stabilizerModule);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function buildCsv(finals) {
  const header = [
    'order',
    'ts',
    'textLen',
    'matchBestIdx',
    'matchBestSim',
    'noMatch',
    'matchReason',
    'matchId',
    'textPreview',
  ];
  const rows = finals.map((item) =>
    [
      item.order,
      item.ts ?? '',
      item.textLen,
      item.matchBestIdx,
      Number.isFinite(item.matchBestSim) ? item.matchBestSim : '',
      item.noMatch ? 1 : 0,
      item.matchReason ?? '',
      item.matchId ?? '',
      JSON.stringify(item.textPreview ?? ''),
    ].join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

function printReport(result) {
  const lines = [];
  lines.push(`ASR trace summary: ${result.label}`);
  lines.push(`speech finals: ${result.finals.length}`);
  lines.push(`highest matchBestIdx: ${result.progress.highestMatchedLine}`);
  lines.push(`final matchBestIdx: ${result.progress.finalMatchedLine}`);
  lines.push(`backward jumps: ${result.monotonicity.backwardMoves}`);
  lines.push(`same-line repeats: ${result.monotonicity.sameLineRepeats}`);
  lines.push(`far jumps (>=${result.monotonicity.farJumpThreshold} lines): ${result.monotonicity.farJumps}`);
  lines.push(`direct visual/semantic steering: ${result.progress.directSteeringSuitable ? 'suitable' : 'not suitable'}`);
  if (result.progress.suitabilityReasons.length) {
    lines.push(`steering reasons: ${result.progress.suitabilityReasons.join('; ')}`);
  }
  if (result.textWarnings.geometry.length) {
    const geom = result.textWarnings.geometry[0];
    lines.push(`marker geometry: markerPct=${geom.markerPct} hostH=${geom.hostH} markerOffset=${geom.markerOffset}`);
  }
  if (result.textWarnings.performance.length) {
    const warn = result.textWarnings.performance[0];
    lines.push(`top perf warning: ${warn.category} ${formatDuration(warn.durationMs)}`);
  }
  if (result.stabilizerComparison) {
    lines.push(`stabilizer advances: ${result.stabilizerComparison.counts.advance_adjacent}`);
    lines.push(`stabilizer holds: ${result.stabilizerComparison.counts.hold}`);
    lines.push(`stabilizer evidence_only: ${result.stabilizerComparison.counts.evidence_only}`);
    lines.push(`stabilizer reset_needed: ${result.stabilizerComparison.counts.reset_needed}`);
    lines.push(`highest stableCursorIdx: ${result.stabilizerComparison.highestStableCursorIdx}`);
    lines.push(`proposed adjacent commits: ${result.stabilizerComparison.proposedAdjacentCommitCount}`);
    lines.push(
      `proposed commit sequence: ${
        result.stabilizerComparison.proposedAdjacentCommitSequence.length
          ? result.stabilizerComparison.proposedAdjacentCommitSequence.join(' -> ')
          : 'none'
      }`,
    );
    lines.push(
      `every proposed commit monotonic and +1 bounded: ${
        result.stabilizerComparison.everyProposedCommitMonotonicAndBounded ? 'yes' : 'no'
      }`,
    );
    lines.push(`stable cursor monotonic: ${result.stabilizerComparison.monotonic ? 'yes' : 'no'}`);
    lines.push(`any stable advance > +1: ${result.stabilizerComparison.anyAdvanceOverOne ? 'yes' : 'no'}`);
  }
  lines.push('top stall zones:');
  for (const zone of result.stalls.slice(0, 5)) {
    lines.push(
      `  idx=${zone.matchBestIdx} count=${zone.count} duration=${formatDuration(zone.durationMs)} orders=${zone.startOrder}-${zone.endOrder}`,
    );
  }
  return lines.join('\n');
}

export async function analyzeAsrTrace(argv, options = {}) {
  const args = parseArgs(argv);
  if (!args.text && !args.json) {
    throw new Error(
      'Usage: node tools/analyze_asr_trace.mjs --text <log.txt> --json <trace.json> [--compare-stabilizer] [--out-json file] [--out-csv file]',
    );
  }

  const textParsed = args.text ? parseTextLog(readUtf8(args.text)) : { finals: [], warnings: [], geometry: [] };
  const jsonParsed = args.json
    ? parseJsonLog(args.json)
    : { exportedAt: null, entryCount: 0, droppedCount: 0, tagCounts: {}, responses: [], matches: [], routes: [], diagnostics: [] };

  const finals = textParsed.finals.length > 0
    ? mergeFinals(textParsed.finals, jsonParsed)
    : jsonParsed.routes
        .filter((item) => item.payload?.final || item.payload?.isFinal)
        .map((item, index) => ({
          order: index + 1,
          source: 'json-route',
          lineNumber: null,
          matchId: item.payload.matchId ?? null,
          textLen: String(item.payload.text ?? '').length,
          textPreview: String(item.payload.text ?? '').slice(0, 80),
          matchBestIdx: clampNumber(item.payload.line, -1),
          matchBestSim: clampNumber(item.payload.sim),
          noMatch: Boolean(item.payload.noMatch),
          matchReason: item.payload.matchReason ?? 'unknown',
          matchVia: null,
          primaryBypassReason: null,
          ts: item.ts ?? item.payload.timestamp ?? null,
          responseSeq: index + 1,
          responseTextLen: String(item.payload.text ?? '').length,
          currentIndex: clampNumber(item.payload.currentIdx, -1),
          bestIndex: clampNumber(item.payload.line, -1),
          delta: index > 0 ? clampNumber(item.payload.line, -1) - clampNumber(jsonParsed.routes[index - 1]?.payload?.line, -1) : 0,
          finalFlag: item.payload.final ? 1 : 0,
          routeNoMatch: Boolean(item.payload.noMatch),
          routeSim: clampNumber(item.payload.sim),
          routeTextLen: String(item.payload.text ?? '').length,
        }));

  const monotonicity = analyzeMonotonicity(finals);
  const stalls = analyzeStalls(finals);
  const chunkQuality = analyzeChunkQuality(finals);
  const progress = assessProgressHealth(finals, monotonicity, stalls, chunkQuality);
  const stabilizerComparison = args.compareStabilizer
    ? await compareWithEvidenceStabilizer(finals, options.stabilizerModule ?? null)
    : null;

  const result = {
    label: path.basename(args.text ?? args.json),
    inputs: {
      text: args.text,
      json: args.json,
    },
    trace: {
      exportedAt: jsonParsed.exportedAt,
      entryCount: jsonParsed.entryCount,
      droppedCount: jsonParsed.droppedCount,
      tagCounts: jsonParsed.tagCounts,
    },
    finals,
    monotonicity,
    stalls,
    chunkQuality,
    progress,
    stabilizerComparison,
    textWarnings: {
      performance: textParsed.warnings.filter((item) => item.type === 'performance_warning'),
      parsing: textParsed.warnings.filter((item) => item.type === 'parse_warning'),
      geometry: textParsed.geometry,
    },
  };

  return { args, result };
}

async function main() {
  const { args, result } = await analyzeAsrTrace(process.argv.slice(2));

  if (args.outJson) {
    fs.writeFileSync(args.outJson, `${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`, 'utf8');
  }
  if (args.outCsv) {
    fs.writeFileSync(args.outCsv, `${buildCsv(result.finals)}\n`, 'utf8');
  }

  console.log(printReport(result));
}

await main();
