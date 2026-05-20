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

type InstallWindow = Window & typeof globalThis & {
  __ASR_LOG_BUFFER__?: any;
  __copyAsrLog?: () => Promise<AsrLogExport> | AsrLogExport;
  __downloadAsrLog?: () => AsrLogExport | null;
  __clearAsrLog?: () => void;
  __getAsrLogSummary?: () => Record<string, unknown>;
  __asrLogBufferInstalled?: boolean;
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

const DEFAULT_MAX_ENTRIES = 50000;
const DEFAULT_PROGRESS_EVERY = 250;
const MAX_STRING_LEN = 2000;
const DEFAULT_MIN_STEP_PX = 6;
const BIG_DEBT_MIN_STEP_THRESHOLD_PX = 120;
const TRACKED_SUMMARY_FAMILIES = new Set<string>([
  'ASR_VISUAL_ACTUATOR_APPLIED',
  'ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF',
  'ASR_READER_COMFORT_HOLD',
  'ASR_READER_COMFORT_NUDGE',
  'ASR_SCROLL_AUTHORITY_SELECTED',
  'ASR_VISUAL_FOLLOW_*',
]);

function detectEnabled(win: Window): boolean {
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
  let droppedCount = 0;
  let writeIndex = 0;
  let capturedCount = 0;

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

  function captureConsoleCall(method: ConsoleMethod, args: unknown[]): boolean {
    const line = extractTextArg(args);
    if (!isAsrDiagnosticLine(line)) return false;
    const payload = sanitizeValue(extractPayloadArg(args));
    append({
      ts: now().toISOString(),
      performanceNowMs: performanceNow(),
      method,
      tag: extractTag(line),
      message: line,
      stringLine: line,
      payload,
      runKey: parseFieldString(line, 'runKey') ?? (payload && typeof payload === 'object' ? String((payload as any).runKey ?? '') || null : null),
      runGeneration: parseFieldNumber(line, 'runGeneration') ?? (payload && typeof payload === 'object' ? Number((payload as any).runGeneration ?? NaN) || null : null),
      currentLineIdx: parseFieldNumber(line, 'currentLineIdx') ?? parseFieldNumber(line, 'current') ?? null,
      committedLineIdx: parseFieldNumber(line, 'committedLineIdx') ?? parseFieldNumber(line, 'commitIndex') ?? null,
      nextSpeakableLineIdx: parseFieldNumber(line, 'nextSpeakableLineIdx') ?? null,
      scrollTop: parseFieldNumber(line, 'scrollTop') ?? parseFieldNumber(line, 'currentScrollTop') ?? parseFieldNumber(line, 'beforeScrollTop') ?? null,
      targetScrollTop: parseFieldNumber(line, 'targetScrollTop') ?? null,
    });
    return true;
  }

  function clear(): void {
    entries.length = 0;
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
  if (win.__asrLogBufferInstalled) return;
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

  win.__ASR_LOG_BUFFER__ = buffer;
  win.__copyAsrLog = () => buffer.copy();
  win.__downloadAsrLog = () => buffer.download();
  win.__clearAsrLog = () => buffer.clear();
  win.__getAsrLogSummary = () => buffer.summary();
}
