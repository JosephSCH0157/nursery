type ConsoleMethod = 'log' | 'info' | 'warn' | 'debug';

export type AsrLogBufferEntry = {
  ts: string;
  performanceNowMs: number;
  method: ConsoleMethod;
  tag: string;
  message: string;
  stringLine: string;
  payload: unknown;
  runKey: string | null;
  runGeneration: number | null;
  currentLineIdx: number | null;
  committedLineIdx: number | null;
  nextSpeakableLineIdx: number | null;
  scrollTop: number | null;
  targetScrollTop: number | null;
};

export type AsrLogExport = {
  exportedAt: string;
  href: string;
  userAgent: string;
  entryCount: number;
  droppedCount: number;
  tagCounts: Record<string, number>;
  tagSummaries: Record<string, AsrLogTagSummary>;
  runPhaseSummaries: AsrRunPhaseSummary[];
  entries: AsrLogBufferEntry[];
};

export type AsrLogTagSummary = {
  family: string;
  count: number;
  firstTs: string | null;
  lastTs: string | null;
  sampledCount: number;
  droppedCount: number;
  lastSample: AsrLogBufferEntry | null;
  maxInterestSample: AsrLogBufferEntry | null;
  maxTargetDebtPx: number | null;
  minStepFloorCount: number;
  bigDebtMinStepCount: number;
  largestRepeatedMinStepStreak: number;
  lastMinStepSample: AsrLogBufferEntry | null;
};

export type AsrRunPhaseSummary = {
  tag: 'ASR_RUN_PHASE_SUMMARY';
  lineStart: number;
  lineEnd: number;
  lineRange: string;
  bucketSize: number;
  entryCount: number;
  commitCount: number;
  averageCommitDelta: number;
  bridgeCommitCount: number;
  cueBridgeCommitCount: number;
  starvationDetectedCount: number;
  rescueCount: number;
  liveStrictBridgeLandingHoldCount: number;
  unsafeTargetCount: number;
  debtBelowLineHeightCount: number;
  markerErrorLineTooHighCount: number;
  readerComfortRescueAppliedCount: number;
  readerComfortRescueBlockedCount: number;
  safeLivePocketCorrectionAppliedCount: number;
  safeLivePocketCorrectionBlockedCount: number;
  inPocketCount: number;
  belowPocketCount: number;
  abovePocketCount: number;
  medianBelowPocketPx: number;
  maxBelowPocketPx: number;
  terminalClampCount: number;
  visualActuatorClampReasons: Record<string, number>;
  averageActualMovedPx: number;
};

type InstallWindow = Window & typeof globalThis & {
  __ASR_LOG_BUFFER__?: any;
  __copyAsrLog?: () => Promise<AsrLogExport> | AsrLogExport;
  __downloadAsrLog?: () => AsrLogExport | null;
  __clearAsrLog?: () => void;
  __getAsrLogSummary?: () => Record<string, unknown>;
  __asrLogBufferInstalled?: boolean;
};

type AsrLogInstallHost = {
  __ASR_LOG_BUFFER__?: any;
  __copyAsrLog?: () => Promise<AsrLogExport> | AsrLogExport;
  __downloadAsrLog?: () => AsrLogExport | null;
  __clearAsrLog?: () => void;
  __getAsrLogSummary?: () => Record<string, unknown>;
};

type BufferOptions = {
  maxEntries?: number;
  progressEvery?: number;
  now?: () => Date;
  performanceNow?: () => number;
  href?: () => string;
  userAgent?: () => string;
  copyText?: (text: string) => Promise<void> | void;
  downloadText?: (filename: string, text: string) => void;
  progressConsole?: (line: string) => void;
};

const DEFAULT_MAX_ENTRIES = 150000;
const DEFAULT_PROGRESS_EVERY = 10000;
const MAX_STRING_LEN = 2000;
const DEFAULT_MIN_STEP_PX = 6;
const BIG_DEBT_MIN_STEP_THRESHOLD_PX = 120;
const DEFAULT_LINE_BUCKET_SIZE = 25;
const NOISY_ASR_TAG_COALESCE_SAMPLE_EVERY = 120;
const NOISY_ASR_TAG_COALESCE_MIN_MS = 2500;
const NOISY_ASR_TAGS = new Set<string>([
  'ASR_SCROLL_WRITE_AUDIT',
  'ASR_LIVE_POCKET_MAINTENANCE_CALLSITE_REACHED',
  'ASR_POCKET_WALL_EVALUATED',
  'ASR_LOW_POCKET_DEADBAND_BLOCKED',
  'ASR_VISUAL_RECOVERY_BOOST_BLOCKED',
  'ASR_VISUAL_DEBT_CATCHUP_EVALUATION_SEEN',
  'ASR_LEAD_AWARE_PURSUIT_CAP',
  'ASR_READER_PRESSURE_REDUCED',
  'ASR_READER_IDLE_FORWARD_HOLD_APPLIED',
  'ASR_FORWARD_WRITE_SUPPRESSED_TARGET_SATISFIED',
  'ASR_VISUAL_AUTHORITY_LEAD_PRESSURE_EVALUATED',
]);
const TRACKED_SUMMARY_FAMILIES = new Set<string>([
  'ASR_VISUAL_ACTUATOR_APPLIED',
  'ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF',
  'ASR_READER_COMFORT_HOLD',
  'ASR_READER_COMFORT_NUDGE',
  'ASR_POST_RELEASE_AUTHORITY_PROTECTED',
  'ASR_POST_FLOOR_AUTHORITY_PROTECTED',
  'ASR_POST_FLOOR_POCKET_WALL_PROTECTED',
  'ASR_SCROLL_AUTHORITY_SELECTED',
  'ASR_VISUAL_CONTROL_DECISION',
  'ASR_RECOVERY_EPISODE_*',
  'ASR_BACKWARD_TARGET_REJECTED',
  'ASR_RECOVERY_STEP_APPLIED',
  'ASR_SETTLE_COMPLETE',
  'ASR_VISUAL_FOLLOW_*',
]);

function detectEnabled(win: Window): boolean {
  const host = win as Window & {
    __TP_DEV?: unknown;
    __TP_DEV1?: unknown;
    __tpDevMode?: unknown;
    __ASR_DIAGNOSTIC_PROOF__?: unknown;
    __ASR_INIT_IMPL__?: unknown;
    __asrLogBufferInstalled?: unknown;
  };
  if (
    host.__TP_DEV === true ||
    host.__TP_DEV1 === true ||
    host.__tpDevMode === true ||
    host.__ASR_DIAGNOSTIC_PROOF__ ||
    host.__ASR_INIT_IMPL__ ||
    host.__asrLogBufferInstalled === true
  ) {
    return true;
  }
  try {
    const params = new URLSearchParams(win.location.search || '');
    if (params.get('dev') === '1') return true;
    if (params.get('asr_log_buffer') === '1') return true;
  } catch {}
  try {
    if (win.localStorage?.getItem('tp_dev_mode') === '1') return true;
    if (win.localStorage?.getItem('asr_log_buffer') === '1') return true;
  } catch {}
  return false;
}

function extractTextArg(args: unknown[]): string {
  for (const arg of args) {
    if (typeof arg === 'string' && arg.trim()) return arg;
  }
  return '';
}

function extractPayloadArg(args: unknown[]): unknown {
  for (const arg of args) {
    if (arg && typeof arg === 'object') return arg;
  }
  return null;
}

function truncateString(value: string): string {
  return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…` : value;
}

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return '[Function]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message || ''),
      stack: truncateString(value.stack || ''),
    };
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { type: 'Blob', size: value.size, mime: value.type || '' };
  }
  if (value instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', byteLength: value.byteLength };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      type: Object.prototype.toString.call(value).slice(8, -1),
      byteLength: (value as ArrayBufferView).byteLength,
    };
  }
  if (typeof Element !== 'undefined' && value instanceof Element) {
    return {
      type: 'Element',
      tagName: value.tagName,
      id: (value as HTMLElement).id || '',
      className: (value as HTMLElement).className || '',
    };
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    if (depth >= 4) return '[MaxDepth]';
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
    for (const [key, item] of entries) {
      out[key] = sanitizeValue(item, depth + 1, seen);
    }
    return out;
  }
  try {
    return truncateString(String(value));
  } catch {
    return '[Unserializable]';
  }
}

function extractTag(line: string): string {
  const bracket = line.match(/^\s*\[([^\]]+)\]/);
  if (bracket) return bracket[1];
  const token = line.match(/\b(ASR_[A-Z0-9_]+)\b/);
  return token ? token[1] : 'ASR';
}

function parseFieldNumber(line: string, key: string): number | null {
  const match = line.match(new RegExp(`${key}=(-?\\d+(?:\\.\\d+)?)`));
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function parseFieldString(line: string, key: string): string | null {
  const match = line.match(new RegExp(`${key}=([^\\s]+)`));
  return match ? match[1] : null;
}

function parsePayloadNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const num = Number((payload as Record<string, unknown>)[key]);
  return Number.isFinite(num) ? num : null;
}

function parsePayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getTrackedSummaryFamily(tag: string): string | null {
  if (tag.startsWith('ASR_VISUAL_FOLLOW_')) return 'ASR_VISUAL_FOLLOW_*';
  return TRACKED_SUMMARY_FAMILIES.has(tag) ? tag : null;
}

function getEntryFieldNumber(entry: AsrLogBufferEntry, key: string): number | null {
  return parseFieldNumber(entry.stringLine, key) ?? parsePayloadNumber(entry.payload, key);
}

function getEntryFieldString(entry: AsrLogBufferEntry, key: string): string | null {
  return parseFieldString(entry.stringLine, key) ?? parsePayloadString(entry.payload, key);
}

type MutableAsrRunPhaseSummary = {
  lineStart: number;
  lineEnd: number;
  entryCount: number;
  commitCount: number;
  commitDeltaSum: number;
  commitDeltaCount: number;
  bridgeCommitCount: number;
  cueBridgeCommitCount: number;
  starvationDetectedCount: number;
  rescueCount: number;
  liveStrictBridgeLandingHoldCount: number;
  unsafeTargetCount: number;
  debtBelowLineHeightCount: number;
  markerErrorLineTooHighCount: number;
  readerComfortRescueAppliedCount: number;
  readerComfortRescueBlockedCount: number;
  safeLivePocketCorrectionAppliedCount: number;
  safeLivePocketCorrectionBlockedCount: number;
  inPocketCount: number;
  belowPocketCount: number;
  abovePocketCount: number;
  belowPocketSamples: number[];
  maxBelowPocketPx: number;
  terminalClampCount: number;
  visualActuatorClampReasons: Record<string, number>;
  actualMovedPxSum: number;
  actualMovedPxCount: number;
};

function resolveSummaryLineIdx(entry: AsrLogBufferEntry): number | null {
  if (entry.currentLineIdx != null) return Math.max(0, entry.currentLineIdx);
  if (entry.committedLineIdx != null) return Math.max(0, entry.committedLineIdx);
  if (entry.nextSpeakableLineIdx != null) return Math.max(0, entry.nextSpeakableLineIdx);
  const targetLineIdx = getEntryFieldNumber(entry, 'targetLineIdx');
  return targetLineIdx != null ? Math.max(0, Math.floor(targetLineIdx)) : null;
}

function isCommitEntry(entry: AsrLogBufferEntry): boolean {
  if (entry.tag.includes('COMMIT')) return true;
  return /\bcommit(LineIdx|Index|Target|TargetIdx)?=/.test(entry.stringLine);
}

function incrementMapCount(map: Record<string, number>, key: string | null): void {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function getOrCreateRunPhaseSummary(
  summaries: Map<number, MutableAsrRunPhaseSummary>,
  lineIdx: number,
): MutableAsrRunPhaseSummary {
  const bucketStart = Math.floor(Math.max(0, lineIdx) / DEFAULT_LINE_BUCKET_SIZE) * DEFAULT_LINE_BUCKET_SIZE;
  const existing = summaries.get(bucketStart);
  if (existing) return existing;
  const created: MutableAsrRunPhaseSummary = {
    lineStart: bucketStart,
    lineEnd: bucketStart + DEFAULT_LINE_BUCKET_SIZE - 1,
    entryCount: 0,
    commitCount: 0,
    commitDeltaSum: 0,
    commitDeltaCount: 0,
    bridgeCommitCount: 0,
    cueBridgeCommitCount: 0,
    starvationDetectedCount: 0,
    rescueCount: 0,
    liveStrictBridgeLandingHoldCount: 0,
    unsafeTargetCount: 0,
    debtBelowLineHeightCount: 0,
    markerErrorLineTooHighCount: 0,
    readerComfortRescueAppliedCount: 0,
    readerComfortRescueBlockedCount: 0,
    safeLivePocketCorrectionAppliedCount: 0,
    safeLivePocketCorrectionBlockedCount: 0,
    inPocketCount: 0,
    belowPocketCount: 0,
    abovePocketCount: 0,
    belowPocketSamples: [],
    maxBelowPocketPx: 0,
    terminalClampCount: 0,
    visualActuatorClampReasons: {},
    actualMovedPxSum: 0,
    actualMovedPxCount: 0,
  };
  summaries.set(bucketStart, created);
  return created;
}

function updateRunPhaseSummary(summary: MutableAsrRunPhaseSummary, entry: AsrLogBufferEntry): void {
  summary.entryCount += 1;
  if (isCommitEntry(entry)) {
    summary.commitCount += 1;
    const currentLineIdx = entry.currentLineIdx ?? getEntryFieldNumber(entry, 'currentLineIdx');
    const committedLineIdx =
      entry.committedLineIdx ??
      getEntryFieldNumber(entry, 'committedLineIdx') ??
      getEntryFieldNumber(entry, 'targetLineIdx');
    if (currentLineIdx != null && committedLineIdx != null) {
      summary.commitDeltaSum += Math.max(0, committedLineIdx - currentLineIdx);
      summary.commitDeltaCount += 1;
    }
  }

  const lowerTag = entry.tag.toLowerCase();
  const lowerLine = entry.stringLine.toLowerCase();
  if (lowerTag.includes('bridge_commit') || lowerLine.includes('bridge_commit')) {
    summary.bridgeCommitCount += 1;
  }
  if (entry.tag === 'ASR_CUE_BRIDGE_COMMIT' || lowerLine.includes('cue_bridge_commit')) {
    summary.cueBridgeCommitCount += 1;
  }
  if (entry.tag === 'ASR_STARVATION_DETECTED') {
    summary.starvationDetectedCount += 1;
  }
  if (lowerTag.includes('rescue') || /\brescue\b/.test(lowerLine)) {
    summary.rescueCount += 1;
  }
  if (
    lowerLine.includes('live_strict_bridge_stale_landing_hold') ||
    lowerLine.includes('live_strict_bridge_landing_hold') ||
    entry.tag === 'ASR_LIVE_BRIDGE_COMPLETION_HELD'
  ) {
    summary.liveStrictBridgeLandingHoldCount += 1;
  }
  if (
    getEntryFieldString(entry, 'deniedReason') === 'unsafe_target' ||
    getEntryFieldString(entry, 'unsafeTargetReason') === 'unsafe_target'
  ) {
    summary.unsafeTargetCount += 1;
  }
  if (
    getEntryFieldString(entry, 'reason') === 'debt_below_line_height' ||
    lowerLine.includes('reason=debt_below_line_height')
  ) {
    summary.debtBelowLineHeightCount += 1;
  }
  if (
    getEntryFieldString(entry, 'reason') === 'marker_error_line_too_high' ||
    lowerLine.includes('reason=marker_error_line_too_high')
  ) {
    summary.markerErrorLineTooHighCount += 1;
  }
  if (entry.tag === 'ASR_READER_COMFORT_RESCUE_APPLIED') {
    summary.readerComfortRescueAppliedCount += 1;
  }
  if (entry.tag === 'ASR_READER_COMFORT_RESCUE_BLOCKED') {
    summary.readerComfortRescueBlockedCount += 1;
  }
  if (entry.tag === 'ASR_SAFE_LIVE_POCKET_CORRECTION_APPLIED') {
    summary.safeLivePocketCorrectionAppliedCount += 1;
  }
  if (entry.tag === 'ASR_SAFE_LIVE_POCKET_CORRECTION_BLOCKED') {
    summary.safeLivePocketCorrectionBlockedCount += 1;
  }

  const pocketHealth = getEntryFieldString(entry, 'pocketHealth');
  if (pocketHealth === 'inPocket') summary.inPocketCount += 1;
  else if (pocketHealth === 'belowPocket') summary.belowPocketCount += 1;
  else if (pocketHealth === 'abovePocket') summary.abovePocketCount += 1;

  const belowPocketPx = getEntryFieldNumber(entry, 'belowPocketPx');
  if (belowPocketPx != null && belowPocketPx >= 0) {
    const rounded = Math.round(belowPocketPx);
    summary.belowPocketSamples.push(rounded);
    summary.maxBelowPocketPx = Math.max(summary.maxBelowPocketPx, rounded);
  }

  const terminalClampActive = getEntryFieldNumber(entry, 'terminalClamp');
  const deniedReason = getEntryFieldString(entry, 'deniedReason');
  const blockedReason = getEntryFieldString(entry, 'blockedReason');
  if (
    terminalClampActive === 1 ||
    deniedReason === 'terminal_clamp' ||
    deniedReason === 'terminal_near_end' ||
    blockedReason === 'terminal_clamp'
  ) {
    summary.terminalClampCount += 1;
  }

  const clampReason = getEntryFieldString(entry, 'clampReason') ?? getEntryFieldString(entry, 'blockedReason');
  if (entry.tag === 'ASR_VISUAL_ACTUATOR_APPLIED' || entry.tag === 'ASR_VISUAL_DEBT_CATCHUP_BLOCKED') {
    incrementMapCount(summary.visualActuatorClampReasons, clampReason);
  }

  const actualMovedPx =
    getEntryFieldNumber(entry, 'actualMovedPx') ??
    getEntryFieldNumber(entry, 'appliedDeltaPx') ??
    getEntryFieldNumber(entry, 'movedPx');
  if (actualMovedPx != null) {
    summary.actualMovedPxSum += actualMovedPx;
    summary.actualMovedPxCount += 1;
  }
}

function finalizeRunPhaseSummaries(summaries: Map<number, MutableAsrRunPhaseSummary>): AsrRunPhaseSummary[] {
  const ordered = Array.from(summaries.values()).sort((a, b) => a.lineStart - b.lineStart);
  return ordered.map((summary) => {
    const belowPocketSamples = summary.belowPocketSamples.slice().sort((a, b) => a - b);
    let medianBelowPocketPx = 0;
    if (belowPocketSamples.length > 0) {
      const mid = Math.floor(belowPocketSamples.length / 2);
      medianBelowPocketPx =
        belowPocketSamples.length % 2 === 0
          ? Math.round((belowPocketSamples[mid - 1] + belowPocketSamples[mid]) / 2)
          : belowPocketSamples[mid];
    }
    return {
      tag: 'ASR_RUN_PHASE_SUMMARY',
      lineStart: summary.lineStart,
      lineEnd: summary.lineEnd,
      lineRange: `${summary.lineStart}-${summary.lineEnd}`,
      bucketSize: DEFAULT_LINE_BUCKET_SIZE,
      entryCount: summary.entryCount,
      commitCount: summary.commitCount,
      averageCommitDelta:
        summary.commitDeltaCount > 0
          ? Number((summary.commitDeltaSum / summary.commitDeltaCount).toFixed(3))
          : 0,
      bridgeCommitCount: summary.bridgeCommitCount,
      cueBridgeCommitCount: summary.cueBridgeCommitCount,
      starvationDetectedCount: summary.starvationDetectedCount,
      rescueCount: summary.rescueCount,
      liveStrictBridgeLandingHoldCount: summary.liveStrictBridgeLandingHoldCount,
      unsafeTargetCount: summary.unsafeTargetCount,
      debtBelowLineHeightCount: summary.debtBelowLineHeightCount,
      markerErrorLineTooHighCount: summary.markerErrorLineTooHighCount,
      readerComfortRescueAppliedCount: summary.readerComfortRescueAppliedCount,
      readerComfortRescueBlockedCount: summary.readerComfortRescueBlockedCount,
      safeLivePocketCorrectionAppliedCount: summary.safeLivePocketCorrectionAppliedCount,
      safeLivePocketCorrectionBlockedCount: summary.safeLivePocketCorrectionBlockedCount,
      inPocketCount: summary.inPocketCount,
      belowPocketCount: summary.belowPocketCount,
      abovePocketCount: summary.abovePocketCount,
      medianBelowPocketPx,
      maxBelowPocketPx: summary.maxBelowPocketPx,
      terminalClampCount: summary.terminalClampCount,
      visualActuatorClampReasons: summary.visualActuatorClampReasons,
      averageActualMovedPx:
        summary.actualMovedPxCount > 0
          ? Number((summary.actualMovedPxSum / summary.actualMovedPxCount).toFixed(3))
          : 0,
    };
  });
}

function computeInterestScore(entry: AsrLogBufferEntry): number {
  const targetDebtPx = getEntryFieldNumber(entry, 'targetDebtPx');
  if (targetDebtPx != null) return Math.abs(targetDebtPx);
  const visualErrorPx = getEntryFieldNumber(entry, 'visualErrorPx');
  if (visualErrorPx != null) return Math.abs(visualErrorPx);
  const deltaPx = getEntryFieldNumber(entry, 'deltaPx');
  if (deltaPx != null) return Math.abs(deltaPx);
  if (entry.targetScrollTop != null && entry.scrollTop != null) {
    return Math.abs(entry.targetScrollTop - entry.scrollTop);
  }
  return 0;
}

function buildTagCounts(entries: AsrLogBufferEntry[]): Record<string, number> {
  const tagCounts: Record<string, number> = {};
  for (const entry of entries) {
    tagCounts[entry.tag] = (tagCounts[entry.tag] || 0) + 1;
  }
  return tagCounts;
}

function buildTagSummaries(entries: AsrLogBufferEntry[]): Record<string, AsrLogTagSummary> {
  const summaries: Record<string, AsrLogTagSummary> = {};
  const maxInterestScores = new Map<string, number>();
  const minStepStreaks = new Map<string, number>();
  for (const entry of entries) {
    const family = getTrackedSummaryFamily(entry.tag);
    if (!family) continue;
    if (!summaries[family]) {
      summaries[family] = {
        family,
        count: 0,
        firstTs: null,
        lastTs: null,
        sampledCount: 0,
        droppedCount: 0,
        lastSample: null,
        maxInterestSample: null,
        maxTargetDebtPx: null,
        minStepFloorCount: 0,
        bigDebtMinStepCount: 0,
        largestRepeatedMinStepStreak: 0,
        lastMinStepSample: null,
      };
      maxInterestScores.set(family, Number.NEGATIVE_INFINITY);
      minStepStreaks.set(family, 0);
    }
    const summary = summaries[family];
    summary.count += 1;
    summary.firstTs = summary.firstTs ?? entry.ts;
    summary.lastTs = entry.ts;
    summary.lastSample = entry;

    const targetDebtPx = getEntryFieldNumber(entry, 'targetDebtPx');
    if (targetDebtPx != null && (summary.maxTargetDebtPx == null || targetDebtPx > summary.maxTargetDebtPx)) {
      summary.maxTargetDebtPx = targetDebtPx;
    }

    const interestScore = computeInterestScore(entry);
    if (interestScore >= (maxInterestScores.get(family) ?? Number.NEGATIVE_INFINITY)) {
      maxInterestScores.set(family, interestScore);
      summary.maxInterestSample = entry;
    }

    const appliedDeltaPx = getEntryFieldNumber(entry, 'appliedDeltaPx');
    const clampReason = getEntryFieldString(entry, 'clampReason');
    const isMinStepFloor = Math.round(appliedDeltaPx ?? Number.NaN) === DEFAULT_MIN_STEP_PX && clampReason === 'min_step_floor';
    if (isMinStepFloor) {
      const nextStreak = (minStepStreaks.get(family) || 0) + 1;
      minStepStreaks.set(family, nextStreak);
      summary.minStepFloorCount += 1;
      summary.lastMinStepSample = entry;
      summary.largestRepeatedMinStepStreak = Math.max(summary.largestRepeatedMinStepStreak, nextStreak);
      if ((targetDebtPx ?? Number.NEGATIVE_INFINITY) >= BIG_DEBT_MIN_STEP_THRESHOLD_PX) {
        summary.bigDebtMinStepCount += 1;
      }
    } else {
      minStepStreaks.set(family, 0);
    }
  }
  return summaries;
}

function isAsrDiagnosticLine(line: string): boolean {
  if (!line) return false;
  if (line.includes('[ASR_LOG_PROGRESS]')) return false;
  if (/^\s*\[ASR[^\]]*\]/.test(line)) return true;
  if (/\bASR_[A-Z0-9_]+\b/.test(line)) return true;
  return /^\s*\[ASR\]/.test(line);
}

export function createAsrLogBuffer(options: BufferOptions = {}) {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  const progressEvery = Math.max(1, Math.floor(options.progressEvery ?? DEFAULT_PROGRESS_EVERY));
  const entries: AsrLogBufferEntry[] = [];
  const runPhaseSummaries = new Map<number, MutableAsrRunPhaseSummary>();
  let lastKnownSummaryLineIdx: number | null = null;
  let droppedCount = 0;
  let writeIndex = 0;
  let capturedCount = 0;
  const noisyTagState = new Map<string, { key: string; suppressed: number; lastEmitAt: number }>();

  const now = options.now ?? (() => new Date());
  const performanceNow = options.performanceNow ?? (() => {
    try { return performance.now(); } catch { return -1; }
  });
  const href = options.href ?? (() => {
    try { return window.location.href; } catch { return ''; }
  });
  const userAgent = options.userAgent ?? (() => {
    try { return navigator.userAgent; } catch { return ''; }
  });

  function getOrderedEntries(): AsrLogBufferEntry[] {
    if (entries.length < maxEntries || writeIndex === 0) return entries.slice();
    return entries.slice(writeIndex).concat(entries.slice(0, writeIndex));
  }

  function append(entry: AsrLogBufferEntry): void {
    let lineIdx = resolveSummaryLineIdx(entry);
    if (lineIdx != null) {
      lastKnownSummaryLineIdx = lineIdx;
    } else if (entry.tag === 'ASR_STARVATION_DETECTED' && lastKnownSummaryLineIdx != null) {
      lineIdx = lastKnownSummaryLineIdx;
    }
    if (lineIdx != null) {
      updateRunPhaseSummary(getOrCreateRunPhaseSummary(runPhaseSummaries, lineIdx), entry);
    }
    if (entries.length < maxEntries) {
      entries.push(entry);
    } else {
      entries[writeIndex] = entry;
      writeIndex = (writeIndex + 1) % maxEntries;
      droppedCount += 1;
    }
    capturedCount += 1;
    if (capturedCount % progressEvery === 0) {
      try { options.progressConsole?.(`[ASR_LOG_PROGRESS] ${capturedCount} entries captured`); } catch {}
    }
  }

  function buildNoisyCoalesceKey(tag: string, line: string): string {
    const reason = parseFieldString(line, 'reason') || 'none';
    const authority = parseFieldString(line, 'authority') || 'none';
    const callsiteReason = parseFieldString(line, 'callsiteReason') || 'none';
    const blockedReason = parseFieldString(line, 'blockedReason') || 'none';
    const finalDecision = parseFieldString(line, 'finalDecision') || 'none';
    const decisionReason = parseFieldString(line, 'decisionReason') || 'none';
    const leadState = parseFieldString(line, 'leadState') || 'none';
    const idx = parseFieldNumber(line, 'currentLineIdx') ?? parseFieldNumber(line, 'current') ?? -1;
    const debtBucketRaw = parseFieldNumber(line, 'targetDebtPx') ?? parseFieldNumber(line, 'debtPx') ?? -1;
    const debtBucket = debtBucketRaw >= 0 ? Math.round(debtBucketRaw / 25) : -1;
    return [tag, reason, authority, callsiteReason, blockedReason, finalDecision, decisionReason, leadState, idx, debtBucket].join('|');
  }

  function shouldCoalesceNoisyTag(tag: string, line: string): boolean {
    if (!NOISY_ASR_TAGS.has(tag)) return false;
    const nowMs = Date.now();
    const nextKey = buildNoisyCoalesceKey(tag, line);
    const prev = noisyTagState.get(tag);
    if (!prev || prev.key !== nextKey) {
      noisyTagState.set(tag, { key: nextKey, suppressed: 0, lastEmitAt: nowMs });
      return false;
    }
    prev.suppressed += 1;
    const shouldSample = prev.suppressed % NOISY_ASR_TAG_COALESCE_SAMPLE_EVERY === 0;
    const shouldTimeSample = nowMs - prev.lastEmitAt >= NOISY_ASR_TAG_COALESCE_MIN_MS;
    if (!shouldSample && !shouldTimeSample) {
      return true;
    }
    prev.lastEmitAt = nowMs;
    return false;
  }

  function captureConsoleCall(method: ConsoleMethod, args: unknown[]): boolean {
    const line = extractTextArg(args);
    if (!isAsrDiagnosticLine(line)) return false;
    const tag = extractTag(line);
    if (shouldCoalesceNoisyTag(tag, line)) return true;
    const payload = sanitizeValue(extractPayloadArg(args));
    append({
      ts: now().toISOString(),
      performanceNowMs: performanceNow(),
      method,
      tag,
      message: line,
      stringLine: line,
      payload,
      runKey: parseFieldString(line, 'runKey') ?? (payload && typeof payload === 'object' ? String((payload as any).runKey ?? '') || null : null),
      runGeneration: parseFieldNumber(line, 'runGeneration') ?? (payload && typeof payload === 'object' ? Number((payload as any).runGeneration ?? NaN) || null : null),
      currentLineIdx:
        parseFieldNumber(line, 'currentLineIdx') ??
        parseFieldNumber(line, 'current') ??
        parsePayloadNumber(payload, 'currentLineIdx') ??
        parsePayloadNumber(payload, 'current') ??
        null,
      committedLineIdx:
        parseFieldNumber(line, 'committedLineIdx') ??
        parseFieldNumber(line, 'commitIndex') ??
        parsePayloadNumber(payload, 'committedLineIdx') ??
        parsePayloadNumber(payload, 'commitIndex') ??
        null,
      nextSpeakableLineIdx:
        parseFieldNumber(line, 'nextSpeakableLineIdx') ??
        parsePayloadNumber(payload, 'nextSpeakableLineIdx') ??
        null,
      scrollTop: parseFieldNumber(line, 'scrollTop') ?? parseFieldNumber(line, 'currentScrollTop') ?? parseFieldNumber(line, 'beforeScrollTop') ?? null,
      targetScrollTop: parseFieldNumber(line, 'targetScrollTop') ?? null,
    });
    return true;
  }

  function clear(): void {
    entries.length = 0;
    runPhaseSummaries.clear();
    lastKnownSummaryLineIdx = null;
    droppedCount = 0;
    writeIndex = 0;
    capturedCount = 0;
  }

  function exportObject(): AsrLogExport {
    const orderedEntries = getOrderedEntries();
    const tagCounts = buildTagCounts(orderedEntries);
    const tagSummaries = buildTagSummaries(orderedEntries);
    return {
      exportedAt: now().toISOString(),
      href: href(),
      userAgent: userAgent(),
      entryCount: orderedEntries.length,
      droppedCount,
      tagCounts,
      tagSummaries,
      runPhaseSummaries: finalizeRunPhaseSummaries(runPhaseSummaries),
      entries: orderedEntries,
    };
  }

  async function copy(): Promise<AsrLogExport> {
    const exported = exportObject();
    const text = JSON.stringify(exported, null, 2);
    if (options.copyText) {
      await options.copyText(text);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    return exported;
  }

  function download(): AsrLogExport | null {
    const exported = exportObject();
    const text = JSON.stringify(exported, null, 2);
    const stamp = exported.exportedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const filename = `asr-log-${stamp}.json`;
    if (options.downloadText) {
      options.downloadText(filename, text);
      return exported;
    }
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return exported;
    } catch {
      return null;
    }
  }

  function summary(): Record<string, unknown> {
    const ordered = getOrderedEntries();
    return {
      entryCount: ordered.length,
      droppedCount,
      maxEntries,
      progressEvery,
      firstTag: ordered[0]?.tag ?? null,
      lastTag: ordered[ordered.length - 1]?.tag ?? null,
      tagCounts: buildTagCounts(ordered),
      tagSummaries: buildTagSummaries(ordered),
      runPhaseSummaries: finalizeRunPhaseSummaries(runPhaseSummaries),
    };
  }

  return {
    captureConsoleCall,
    clear,
    exportObject,
    copy,
    download,
    summary,
    get entries() {
      return getOrderedEntries();
    },
    get droppedCount() {
      return droppedCount;
    },
    get maxEntries() {
      return maxEntries;
    },
  };
}

export function installAsrLogBuffer(win: InstallWindow = window as InstallWindow): void {
  if (typeof win === 'undefined') return;
  if (!detectEnabled(win)) return;
  const bindHelpers = (host: AsrLogInstallHost, buffer: ReturnType<typeof createAsrLogBuffer>) => {
    host.__ASR_LOG_BUFFER__ = buffer;
    host.__copyAsrLog = () => buffer.copy();
    host.__downloadAsrLog = () => buffer.download();
    host.__clearAsrLog = () => buffer.clear();
    host.__getAsrLogSummary = () => buffer.summary();
  };
  const globalHost = (typeof globalThis === 'object' && globalThis)
    ? (globalThis as unknown as AsrLogInstallHost)
    : null;
  const existingBuffer = (win.__ASR_LOG_BUFFER__ || globalHost?.__ASR_LOG_BUFFER__) as ReturnType<typeof createAsrLogBuffer> | undefined;
  if (win.__asrLogBufferInstalled && existingBuffer) {
    bindHelpers(win, existingBuffer);
    if (globalHost && globalHost !== (win as unknown as AsrLogInstallHost)) {
      bindHelpers(globalHost, existingBuffer);
    }
    return;
  }
  win.__asrLogBufferInstalled = true;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    debug: console.debug.bind(console),
  };

  const buffer = createAsrLogBuffer({
    progressConsole: (line) => orig.info(line),
  });

  const wrap = (method: ConsoleMethod) => (...args: unknown[]) => {
    if (buffer.captureConsoleCall(method, args)) return;
    orig[method](...args);
  };

  console.log = wrap('log');
  console.info = wrap('info');
  console.warn = wrap('warn');
  console.debug = wrap('debug');

  bindHelpers(win, buffer);
  if (globalHost && globalHost !== (win as unknown as AsrLogInstallHost)) {
    bindHelpers(globalHost, buffer);
  }
}
