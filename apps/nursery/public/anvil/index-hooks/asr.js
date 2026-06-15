// src/features/asr/asr-log-buffer.ts
var DEFAULT_MAX_ENTRIES = 15e4;
var DEFAULT_PROGRESS_EVERY = 1e4;
var MAX_STRING_LEN = 2e3;
var DEFAULT_MIN_STEP_PX = 6;
var BIG_DEBT_MIN_STEP_THRESHOLD_PX = 120;
var DEFAULT_LINE_BUCKET_SIZE = 25;
var NOISY_ASR_TAG_COALESCE_SAMPLE_EVERY = 120;
var NOISY_ASR_TAG_COALESCE_MIN_MS = 2500;
var NOISY_ASR_TAGS = /* @__PURE__ */ new Set([
  "ASR_LIVE_POCKET_MAINTENANCE_CALLSITE_REACHED",
  "ASR_POCKET_WALL_EVALUATED",
  "ASR_LOW_POCKET_DEADBAND_BLOCKED",
  "ASR_VISUAL_RECOVERY_BOOST_BLOCKED",
  "ASR_VISUAL_DEBT_CATCHUP_EVALUATION_SEEN",
  "ASR_LEAD_AWARE_PURSUIT_CAP",
  "ASR_READER_PRESSURE_REDUCED",
  "ASR_VISUAL_AUTHORITY_LEAD_PRESSURE_EVALUATED"
]);
var TRACKED_SUMMARY_FAMILIES = /* @__PURE__ */ new Set([
  "ASR_VISUAL_ACTUATOR_APPLIED",
  "ASR_SCROLL_CHAIRPERSON_EMISSION_PROOF",
  "ASR_READER_COMFORT_HOLD",
  "ASR_READER_COMFORT_NUDGE",
  "ASR_POST_RELEASE_AUTHORITY_PROTECTED",
  "ASR_POST_FLOOR_AUTHORITY_PROTECTED",
  "ASR_POST_FLOOR_POCKET_WALL_PROTECTED",
  "ASR_SCROLL_AUTHORITY_SELECTED",
  "ASR_VISUAL_CONTROL_DECISION",
  "ASR_RECOVERY_EPISODE_*",
  "ASR_BACKWARD_TARGET_REJECTED",
  "ASR_RECOVERY_STEP_APPLIED",
  "ASR_SETTLE_COMPLETE",
  "ASR_VISUAL_FOLLOW_*"
]);
function detectEnabled(win) {
  const host = win;
  if (host.__TP_DEV === true || host.__TP_DEV1 === true || host.__tpDevMode === true || host.__ASR_DIAGNOSTIC_PROOF__ || host.__ASR_INIT_IMPL__ || host.__asrLogBufferInstalled === true) {
    return true;
  }
  try {
    const params = new URLSearchParams(win.location.search || "");
    if (params.get("dev") === "1") return true;
    if (params.get("asr_log_buffer") === "1") return true;
  } catch {
  }
  try {
    if (win.localStorage?.getItem("tp_dev_mode") === "1") return true;
    if (win.localStorage?.getItem("asr_log_buffer") === "1") return true;
  } catch {
  }
  return false;
}
function extractTextArg(args) {
  for (const arg of args) {
    if (typeof arg === "string" && arg.trim()) return arg;
  }
  return "";
}
function extractPayloadArg(args) {
  for (const arg of args) {
    if (arg && typeof arg === "object") return arg;
  }
  return null;
}
function truncateString(value) {
  return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}\u2026` : value;
}
function sanitizeValue(value, depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message || ""),
      stack: truncateString(value.stack || "")
    };
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return { type: "Blob", size: value.size, mime: value.type || "" };
  }
  if (value instanceof ArrayBuffer) {
    return { type: "ArrayBuffer", byteLength: value.byteLength };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      type: Object.prototype.toString.call(value).slice(8, -1),
      byteLength: value.byteLength
    };
  }
  if (typeof Element !== "undefined" && value instanceof Element) {
    return {
      type: "Element",
      tagName: value.tagName,
      id: value.id || "",
      className: value.className || ""
    };
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (depth >= 4) return "[MaxDepth]";
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1, seen));
    }
    const out = {};
    const entries = Object.entries(value).slice(0, 50);
    for (const [key, item] of entries) {
      out[key] = sanitizeValue(item, depth + 1, seen);
    }
    return out;
  }
  try {
    return truncateString(String(value));
  } catch {
    return "[Unserializable]";
  }
}
function extractTag(line) {
  const bracket = line.match(/^\s*\[([^\]]+)\]/);
  if (bracket) return bracket[1];
  const token = line.match(/\b(ASR_[A-Z0-9_]+)\b/);
  return token ? token[1] : "ASR";
}
function parseFieldNumber(line, key) {
  const match = line.match(new RegExp(`${key}=(-?\\d+(?:\\.\\d+)?)`));
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}
function parseFieldString(line, key) {
  const match = line.match(new RegExp(`${key}=([^\\s]+)`));
  return match ? match[1] : null;
}
function parsePayloadNumber(payload, key) {
  if (!payload || typeof payload !== "object") return null;
  const num = Number(payload[key]);
  return Number.isFinite(num) ? num : null;
}
function parsePayloadString(payload, key) {
  if (!payload || typeof payload !== "object") return null;
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}
function getTrackedSummaryFamily(tag) {
  if (tag.startsWith("ASR_VISUAL_FOLLOW_")) return "ASR_VISUAL_FOLLOW_*";
  return TRACKED_SUMMARY_FAMILIES.has(tag) ? tag : null;
}
function getEntryFieldNumber(entry, key) {
  return parseFieldNumber(entry.stringLine, key) ?? parsePayloadNumber(entry.payload, key);
}
function getEntryFieldString(entry, key) {
  return parseFieldString(entry.stringLine, key) ?? parsePayloadString(entry.payload, key);
}
function resolveSummaryLineIdx(entry) {
  if (entry.currentLineIdx != null) return Math.max(0, entry.currentLineIdx);
  if (entry.committedLineIdx != null) return Math.max(0, entry.committedLineIdx);
  if (entry.nextSpeakableLineIdx != null) return Math.max(0, entry.nextSpeakableLineIdx);
  const targetLineIdx = getEntryFieldNumber(entry, "targetLineIdx");
  return targetLineIdx != null ? Math.max(0, Math.floor(targetLineIdx)) : null;
}
function isCommitEntry(entry) {
  if (entry.tag.includes("COMMIT")) return true;
  return /\bcommit(LineIdx|Index|Target|TargetIdx)?=/.test(entry.stringLine);
}
function incrementMapCount(map, key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return;
  map[safeKey] = (map[safeKey] || 0) + 1;
}
function getOrCreateRunPhaseSummary(summaries, lineIdx) {
  const bucketStart = Math.floor(Math.max(0, lineIdx) / DEFAULT_LINE_BUCKET_SIZE) * DEFAULT_LINE_BUCKET_SIZE;
  const existing = summaries.get(bucketStart);
  if (existing) return existing;
  const created = {
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
    actualMovedPxCount: 0
  };
  summaries.set(bucketStart, created);
  return created;
}
function updateRunPhaseSummary(summary, entry) {
  summary.entryCount += 1;
  if (isCommitEntry(entry)) {
    summary.commitCount += 1;
    const currentLineIdx = entry.currentLineIdx ?? getEntryFieldNumber(entry, "currentLineIdx");
    const committedLineIdx = entry.committedLineIdx ?? getEntryFieldNumber(entry, "committedLineIdx") ?? getEntryFieldNumber(entry, "targetLineIdx");
    if (currentLineIdx != null && committedLineIdx != null) {
      summary.commitDeltaSum += Math.max(0, committedLineIdx - currentLineIdx);
      summary.commitDeltaCount += 1;
    }
  }
  const lowerTag = entry.tag.toLowerCase();
  const lowerLine = entry.stringLine.toLowerCase();
  if (lowerTag.includes("bridge_commit") || lowerLine.includes("bridge_commit")) {
    summary.bridgeCommitCount += 1;
  }
  if (entry.tag === "ASR_CUE_BRIDGE_COMMIT" || lowerLine.includes("cue_bridge_commit")) {
    summary.cueBridgeCommitCount += 1;
  }
  if (entry.tag === "ASR_STARVATION_DETECTED") {
    summary.starvationDetectedCount += 1;
  }
  if (lowerTag.includes("rescue") || /\brescue\b/.test(lowerLine)) {
    summary.rescueCount += 1;
  }
  if (lowerLine.includes("live_strict_bridge_stale_landing_hold") || lowerLine.includes("live_strict_bridge_landing_hold") || entry.tag === "ASR_LIVE_BRIDGE_COMPLETION_HELD") {
    summary.liveStrictBridgeLandingHoldCount += 1;
  }
  if (getEntryFieldString(entry, "deniedReason") === "unsafe_target" || getEntryFieldString(entry, "unsafeTargetReason") === "unsafe_target") {
    summary.unsafeTargetCount += 1;
  }
  if (getEntryFieldString(entry, "reason") === "debt_below_line_height" || lowerLine.includes("reason=debt_below_line_height")) {
    summary.debtBelowLineHeightCount += 1;
  }
  if (getEntryFieldString(entry, "reason") === "marker_error_line_too_high" || lowerLine.includes("reason=marker_error_line_too_high")) {
    summary.markerErrorLineTooHighCount += 1;
  }
  if (entry.tag === "ASR_READER_COMFORT_RESCUE_APPLIED") {
    summary.readerComfortRescueAppliedCount += 1;
  }
  if (entry.tag === "ASR_READER_COMFORT_RESCUE_BLOCKED") {
    summary.readerComfortRescueBlockedCount += 1;
  }
  if (entry.tag === "ASR_SAFE_LIVE_POCKET_CORRECTION_APPLIED") {
    summary.safeLivePocketCorrectionAppliedCount += 1;
  }
  if (entry.tag === "ASR_SAFE_LIVE_POCKET_CORRECTION_BLOCKED") {
    summary.safeLivePocketCorrectionBlockedCount += 1;
  }
  const pocketHealth = getEntryFieldString(entry, "pocketHealth");
  if (pocketHealth === "inPocket") summary.inPocketCount += 1;
  else if (pocketHealth === "belowPocket") summary.belowPocketCount += 1;
  else if (pocketHealth === "abovePocket") summary.abovePocketCount += 1;
  const belowPocketPx = getEntryFieldNumber(entry, "belowPocketPx");
  if (belowPocketPx != null && belowPocketPx >= 0) {
    const rounded = Math.round(belowPocketPx);
    summary.belowPocketSamples.push(rounded);
    summary.maxBelowPocketPx = Math.max(summary.maxBelowPocketPx, rounded);
  }
  const terminalClampActive = getEntryFieldNumber(entry, "terminalClamp");
  const deniedReason = getEntryFieldString(entry, "deniedReason");
  const blockedReason = getEntryFieldString(entry, "blockedReason");
  if (terminalClampActive === 1 || deniedReason === "terminal_clamp" || deniedReason === "terminal_near_end" || blockedReason === "terminal_clamp") {
    summary.terminalClampCount += 1;
  }
  const clampReason = getEntryFieldString(entry, "clampReason") ?? getEntryFieldString(entry, "blockedReason");
  if (entry.tag === "ASR_VISUAL_ACTUATOR_APPLIED" || entry.tag === "ASR_VISUAL_DEBT_CATCHUP_BLOCKED") {
    incrementMapCount(summary.visualActuatorClampReasons, clampReason);
  }
  const actualMovedPx = getEntryFieldNumber(entry, "actualMovedPx") ?? getEntryFieldNumber(entry, "appliedDeltaPx") ?? getEntryFieldNumber(entry, "movedPx");
  if (actualMovedPx != null) {
    summary.actualMovedPxSum += actualMovedPx;
    summary.actualMovedPxCount += 1;
  }
}
function finalizeRunPhaseSummaries(summaries) {
  const ordered = Array.from(summaries.values()).sort((a, b) => a.lineStart - b.lineStart);
  return ordered.map((summary) => {
    const belowPocketSamples = summary.belowPocketSamples.slice().sort((a, b) => a - b);
    let medianBelowPocketPx = 0;
    if (belowPocketSamples.length > 0) {
      const mid = Math.floor(belowPocketSamples.length / 2);
      medianBelowPocketPx = belowPocketSamples.length % 2 === 0 ? Math.round((belowPocketSamples[mid - 1] + belowPocketSamples[mid]) / 2) : belowPocketSamples[mid];
    }
    return {
      tag: "ASR_RUN_PHASE_SUMMARY",
      lineStart: summary.lineStart,
      lineEnd: summary.lineEnd,
      lineRange: `${summary.lineStart}-${summary.lineEnd}`,
      bucketSize: DEFAULT_LINE_BUCKET_SIZE,
      entryCount: summary.entryCount,
      commitCount: summary.commitCount,
      averageCommitDelta: summary.commitDeltaCount > 0 ? Number((summary.commitDeltaSum / summary.commitDeltaCount).toFixed(3)) : 0,
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
      averageActualMovedPx: summary.actualMovedPxCount > 0 ? Number((summary.actualMovedPxSum / summary.actualMovedPxCount).toFixed(3)) : 0
    };
  });
}
function computeInterestScore(entry) {
  const targetDebtPx = getEntryFieldNumber(entry, "targetDebtPx");
  if (targetDebtPx != null) return Math.abs(targetDebtPx);
  const visualErrorPx = getEntryFieldNumber(entry, "visualErrorPx");
  if (visualErrorPx != null) return Math.abs(visualErrorPx);
  const deltaPx = getEntryFieldNumber(entry, "deltaPx");
  if (deltaPx != null) return Math.abs(deltaPx);
  if (entry.targetScrollTop != null && entry.scrollTop != null) {
    return Math.abs(entry.targetScrollTop - entry.scrollTop);
  }
  return 0;
}
function buildTagCounts(entries) {
  const tagCounts = {};
  for (const entry of entries) {
    tagCounts[entry.tag] = (tagCounts[entry.tag] || 0) + 1;
  }
  return tagCounts;
}
function buildTagSummaries(entries) {
  const summaries = {};
  const maxInterestScores = /* @__PURE__ */ new Map();
  const minStepStreaks = /* @__PURE__ */ new Map();
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
        lastMinStepSample: null
      };
      maxInterestScores.set(family, Number.NEGATIVE_INFINITY);
      minStepStreaks.set(family, 0);
    }
    const summary = summaries[family];
    summary.count += 1;
    summary.firstTs = summary.firstTs ?? entry.ts;
    summary.lastTs = entry.ts;
    summary.lastSample = entry;
    const targetDebtPx = getEntryFieldNumber(entry, "targetDebtPx");
    if (targetDebtPx != null && (summary.maxTargetDebtPx == null || targetDebtPx > summary.maxTargetDebtPx)) {
      summary.maxTargetDebtPx = targetDebtPx;
    }
    const interestScore = computeInterestScore(entry);
    if (interestScore >= (maxInterestScores.get(family) ?? Number.NEGATIVE_INFINITY)) {
      maxInterestScores.set(family, interestScore);
      summary.maxInterestSample = entry;
    }
    const appliedDeltaPx = getEntryFieldNumber(entry, "appliedDeltaPx");
    const clampReason = getEntryFieldString(entry, "clampReason");
    const isMinStepFloor = Math.round(appliedDeltaPx ?? Number.NaN) === DEFAULT_MIN_STEP_PX && clampReason === "min_step_floor";
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
function isAsrDiagnosticLine(line) {
  if (!line) return false;
  if (line.includes("[ASR_LOG_PROGRESS]")) return false;
  if (/^\s*\[ASR[^\]]*\]/.test(line)) return true;
  if (/\bASR_[A-Z0-9_]+\b/.test(line)) return true;
  return /^\s*\[ASR\]/.test(line);
}
function createAsrLogBuffer(options = {}) {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  const progressEvery = Math.max(1, Math.floor(options.progressEvery ?? DEFAULT_PROGRESS_EVERY));
  const entries = [];
  const runPhaseSummaries = /* @__PURE__ */ new Map();
  let lastKnownSummaryLineIdx = null;
  let droppedCount = 0;
  let writeIndex = 0;
  let capturedCount = 0;
  const noisyTagState = /* @__PURE__ */ new Map();
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const performanceNow = options.performanceNow ?? (() => {
    try {
      return performance.now();
    } catch {
      return -1;
    }
  });
  const href = options.href ?? (() => {
    try {
      return window.location.href;
    } catch {
      return "";
    }
  });
  const userAgent = options.userAgent ?? (() => {
    try {
      return navigator.userAgent;
    } catch {
      return "";
    }
  });
  function getOrderedEntries() {
    if (entries.length < maxEntries || writeIndex === 0) return entries.slice();
    return entries.slice(writeIndex).concat(entries.slice(0, writeIndex));
  }
  function append(entry) {
    let lineIdx = resolveSummaryLineIdx(entry);
    if (lineIdx != null) {
      lastKnownSummaryLineIdx = lineIdx;
    } else if (entry.tag === "ASR_STARVATION_DETECTED" && lastKnownSummaryLineIdx != null) {
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
      try {
        options.progressConsole?.(`[ASR_LOG_PROGRESS] ${capturedCount} entries captured`);
      } catch {
      }
    }
  }
  function buildNoisyCoalesceKey(tag, line) {
    const reason = parseFieldString(line, "reason") || "none";
    const authority = parseFieldString(line, "authority") || "none";
    const callsiteReason = parseFieldString(line, "callsiteReason") || "none";
    const blockedReason = parseFieldString(line, "blockedReason") || "none";
    const finalDecision = parseFieldString(line, "finalDecision") || "none";
    const decisionReason = parseFieldString(line, "decisionReason") || "none";
    const leadState = parseFieldString(line, "leadState") || "none";
    const idx = parseFieldNumber(line, "currentLineIdx") ?? parseFieldNumber(line, "current") ?? -1;
    const debtBucketRaw = parseFieldNumber(line, "targetDebtPx") ?? parseFieldNumber(line, "debtPx") ?? -1;
    const debtBucket = debtBucketRaw >= 0 ? Math.round(debtBucketRaw / 25) : -1;
    return [tag, reason, authority, callsiteReason, blockedReason, finalDecision, decisionReason, leadState, idx, debtBucket].join("|");
  }
  function shouldCoalesceNoisyTag(tag, line) {
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
  function captureConsoleCall(method, args) {
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
      runKey: parseFieldString(line, "runKey") ?? (payload && typeof payload === "object" ? String(payload.runKey ?? "") || null : null),
      runGeneration: parseFieldNumber(line, "runGeneration") ?? (payload && typeof payload === "object" ? Number(payload.runGeneration ?? NaN) || null : null),
      currentLineIdx: parseFieldNumber(line, "currentLineIdx") ?? parseFieldNumber(line, "current") ?? parsePayloadNumber(payload, "currentLineIdx") ?? parsePayloadNumber(payload, "current") ?? null,
      committedLineIdx: parseFieldNumber(line, "committedLineIdx") ?? parseFieldNumber(line, "commitIndex") ?? parsePayloadNumber(payload, "committedLineIdx") ?? parsePayloadNumber(payload, "commitIndex") ?? null,
      nextSpeakableLineIdx: parseFieldNumber(line, "nextSpeakableLineIdx") ?? parsePayloadNumber(payload, "nextSpeakableLineIdx") ?? null,
      scrollTop: parseFieldNumber(line, "scrollTop") ?? parseFieldNumber(line, "currentScrollTop") ?? parseFieldNumber(line, "beforeScrollTop") ?? null,
      targetScrollTop: parseFieldNumber(line, "targetScrollTop") ?? null
    });
    return true;
  }
  function clear() {
    entries.length = 0;
    runPhaseSummaries.clear();
    lastKnownSummaryLineIdx = null;
    droppedCount = 0;
    writeIndex = 0;
    capturedCount = 0;
  }
  function exportObject() {
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
      entries: orderedEntries
    };
  }
  async function copy() {
    const exported = exportObject();
    const text = JSON.stringify(exported, null, 2);
    if (options.copyText) {
      await options.copyText(text);
    } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    return exported;
  }
  function download() {
    const exported = exportObject();
    const text = JSON.stringify(exported, null, 2);
    const stamp = exported.exportedAt.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const filename = `asr-log-${stamp}.json`;
    if (options.downloadText) {
      options.downloadText(filename, text);
      return exported;
    }
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
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
  function summary() {
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
      runPhaseSummaries: finalizeRunPhaseSummaries(runPhaseSummaries)
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
    }
  };
}
function installAsrLogBuffer(win = window) {
  if (typeof win === "undefined") return;
  if (!detectEnabled(win)) return;
  const bindHelpers = (host, buffer2) => {
    host.__ASR_LOG_BUFFER__ = buffer2;
    host.__copyAsrLog = () => buffer2.copy();
    host.__downloadAsrLog = () => buffer2.download();
    host.__clearAsrLog = () => buffer2.clear();
    host.__getAsrLogSummary = () => buffer2.summary();
  };
  const globalHost = typeof globalThis === "object" && globalThis ? globalThis : null;
  const existingBuffer = win.__ASR_LOG_BUFFER__ || globalHost?.__ASR_LOG_BUFFER__;
  if (win.__asrLogBufferInstalled && existingBuffer) {
    bindHelpers(win, existingBuffer);
    if (globalHost && globalHost !== win) {
      bindHelpers(globalHost, existingBuffer);
    }
    return;
  }
  win.__asrLogBufferInstalled = true;
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    debug: console.debug.bind(console)
  };
  const buffer = createAsrLogBuffer({
    progressConsole: (line) => orig.info(line)
  });
  const wrap = (method) => (...args) => {
    if (buffer.captureConsoleCall(method, args)) return;
    orig[method](...args);
  };
  console.log = wrap("log");
  console.info = wrap("info");
  console.warn = wrap("warn");
  console.debug = wrap("debug");
  bindHelpers(win, buffer);
  if (globalHost && globalHost !== win) {
    bindHelpers(globalHost, buffer);
  }
}

// src/features/asr/asr-diagnostics.ts
function buildAsrChairpersonFlagProofDiagnostic(args) {
  return `[ASR_CHAIRPERSON_FLAG_PROOF] rawHref=${args.rawHref || "none"} rawSearch=${args.rawSearch || "none"} parsedQueryParams=${args.parsedQueryParams || "[]"} asrVisualChairpersonRaw=${args.rawChairpersonValue || "none"} asrVisualChairpersonOwnerRaw=${args.rawOwnerValue || "none"} resolvedShadowEnabled=${args.resolvedShadowEnabled ? 1 : 0} resolvedOwnerEnabled=${args.resolvedOwnerEnabled ? 1 : 0} ownerFlagSource=${args.ownerFlagSource || "default"} ownerDisabledReason=${args.ownerDisabledReason || "none"} devFlagReaderAvailable=${args.devFlagReaderAvailable ? 1 : 0} flagEvaluationLocation=${args.flagEvaluationLocation || "unknown"} driverCreationTimeFlagState=${args.driverCreationTimeFlagState || "unknown"} liveTickFlagState=${args.liveTickFlagState || "unknown"} importMetaDev=${args.importMetaDev || "unavailable"} importMetaMode=${args.importMetaMode || "unavailable"} ownerFlagReadFrom=${args.ownerFlagReadFrom || "default"}`;
}
var ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION = "2026-05-18a";
var ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION = "2026-05-18a";

// src/features/asr/asr-chairperson-flags.ts
function normalizeChairpersonFlagValue(value) {
  if (value == null) return "";
  return String(value).trim();
}
function isTruthyFlagValue(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes" || normalized === "enabled";
}
function isFalsyFlagValue(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no" || normalized === "disabled";
}
function collectRuntimeConfig(globalScope) {
  const direct = globalScope.__TP_RUNTIME_CONFIG__;
  if (direct && typeof direct === "object") return direct;
  const forgeConfig = globalScope.__forgeRuntimeConfig;
  if (forgeConfig && typeof forgeConfig === "object") return forgeConfig;
  const fallback = globalScope.__forgeConfig;
  if (fallback && typeof fallback === "object") return fallback;
  return {
    asr_visual_chairperson: globalScope.__tpAsrVisualChairperson,
    asr_visual_chairperson_owner: globalScope.__tpAsrVisualChairpersonOwner,
    asr_visual_chairperson_shadow: globalScope.__tpAsrVisualChairpersonShadow
  };
}
function readAsrChairpersonImportMetaEnvSnapshot() {
  try {
    const env = (0, eval)("import.meta.env");
    if (env && typeof env === "object") {
      return {
        dev: normalizeChairpersonFlagValue(env.DEV) || "unavailable",
        mode: normalizeChairpersonFlagValue(env.MODE) || "unavailable"
      };
    }
  } catch {
  }
  return { dev: "unavailable", mode: "unavailable" };
}
function stringifyQueryParams(params) {
  const pairs = [];
  params.forEach((value, key) => {
    pairs.push(`${key}:${value}`);
  });
  return JSON.stringify(pairs);
}
function summarizeChairpersonFlagState(state2) {
  return [
    `shadow=${state2.resolvedShadowEnabled ? 1 : 0}`,
    `owner=${state2.resolvedOwnerEnabled ? 1 : 0}`,
    `source=${state2.ownerFlagSource || "default"}`,
    `disabled=${state2.ownerDisabledReason || "none"}`
  ].join("|");
}
function resolveAsrChairpersonFlagState(args) {
  const globalScope = args?.globalScope || (typeof window !== "undefined" ? window : null) || {};
  const rawHref = typeof args?.href === "string" ? args.href : typeof location !== "undefined" ? String(location.href || "") : "";
  const rawSearch = typeof args?.search === "string" ? args.search : typeof location !== "undefined" ? String(location.search || "") : "";
  const params = new URLSearchParams(rawSearch || "");
  const parsedQueryParams = stringifyQueryParams(params);
  const rawChairpersonValue = normalizeChairpersonFlagValue(params.get("asr_visual_chairperson"));
  const rawOwnerValue = normalizeChairpersonFlagValue(params.get("asr_visual_chairperson_owner"));
  const rawShadowValue = normalizeChairpersonFlagValue(params.get("asr_visual_chairperson_shadow"));
  const rawDevValue = normalizeChairpersonFlagValue(params.get("dev"));
  const rawOpenValue = normalizeChairpersonFlagValue(params.get("open"));
  const localStorageRef = args?.localStorage === void 0 ? typeof window !== "undefined" ? window.localStorage : null : args.localStorage;
  const localStorageChairpersonValue = normalizeChairpersonFlagValue(localStorageRef?.getItem("asr_visual_chairperson"));
  const localStorageOwnerValue = normalizeChairpersonFlagValue(localStorageRef?.getItem("asr_visual_chairperson_owner"));
  const runtimeConfig = collectRuntimeConfig(globalScope);
  const runtimeChairpersonValue = normalizeChairpersonFlagValue(runtimeConfig.asr_visual_chairperson);
  const runtimeOwnerValue = normalizeChairpersonFlagValue(runtimeConfig.asr_visual_chairperson_owner);
  let resolvedOwnerEnabled = false;
  let ownerFlagSource = "default";
  let ownerFlagReadFrom = "default";
  let ownerDisabledReason = "no_owner_flag_present";
  const evaluateOwnerSource = (source, value, readFrom) => {
    if (!value) return false;
    ownerFlagSource = `${source}=${value}`;
    ownerFlagReadFrom = readFrom;
    if (isTruthyFlagValue(value)) {
      resolvedOwnerEnabled = true;
      ownerDisabledReason = "none";
      return true;
    }
    if (isFalsyFlagValue(value)) {
      ownerDisabledReason = `${source}_explicit_false`;
      return true;
    }
    ownerDisabledReason = `${source}_unrecognized_value`;
    return true;
  };
  evaluateOwnerSource("url:asr_visual_chairperson", rawChairpersonValue, "url") || evaluateOwnerSource("url:asr_visual_chairperson_owner", rawOwnerValue, "url") || evaluateOwnerSource("localStorage:asr_visual_chairperson", localStorageChairpersonValue, "localStorage") || evaluateOwnerSource("localStorage:asr_visual_chairperson_owner", localStorageOwnerValue, "localStorage") || evaluateOwnerSource("runtime_config:asr_visual_chairperson", runtimeChairpersonValue, "runtime_config") || evaluateOwnerSource("runtime_config:asr_visual_chairperson_owner", runtimeOwnerValue, "runtime_config");
  const devTeleprompterScriptRun = isTruthyFlagValue(rawDevValue) && rawOpenValue.trim().toLowerCase() === "script";
  if (!resolvedOwnerEnabled && ownerFlagSource === "default" && devTeleprompterScriptRun) {
    resolvedOwnerEnabled = true;
    ownerFlagSource = "default:dev_open_script_auto_owner";
    ownerDisabledReason = "none";
    ownerFlagReadFrom = "default";
  }
  let resolvedShadowEnabled = true;
  if (rawShadowValue) {
    if (isFalsyFlagValue(rawShadowValue)) resolvedShadowEnabled = false;
    else if (isTruthyFlagValue(rawShadowValue)) resolvedShadowEnabled = true;
  }
  return {
    rawHref,
    rawSearch,
    parsedQueryParams,
    rawChairpersonValue,
    rawOwnerValue,
    resolvedShadowEnabled,
    resolvedOwnerEnabled,
    ownerFlagSource,
    ownerFlagReadFrom,
    ownerDisabledReason,
    devFlagReaderAvailable: typeof URLSearchParams === "function" && (!!localStorageRef || Object.keys(globalScope).length >= 0)
  };
}

// src/state/appStore.ts
function getAppStore() {
  if (typeof window === "undefined") return null;
  try {
    const store2 = window.__tpStore;
    return store2 || null;
  } catch {
    return null;
  }
}

// src/state/speech-store.ts
var STORE_KEYS = {
  engine: "asr.engine",
  engineExplicit: "asr.engineExplicit",
  lang: "asr.language",
  interim: "asr.useInterimResults",
  threshold: "asr.threshold",
  endpointingMs: "asr.endpointMs",
  fillerFilter: "asr.filterFillers",
  manualAnchorAdoptEnabled: "asr.manualAnchorAdoptEnabled",
  calmModeEnabled: "asrCalmModeEnabled"
};
var DEFAULT_STATE = {
  engine: "whisper",
  engineExplicit: false,
  lang: "en-US",
  interim: true,
  threshold: 0.6,
  endpointingMs: 700,
  fillerFilter: true,
  manualAnchorAdoptEnabled: true,
  calmModeEnabled: false
};
var watchedKeys = Object.values(STORE_KEYS);
var subs = /* @__PURE__ */ new Set();
var fallbackState = { ...DEFAULT_STATE };
var subscribedStore = null;
var unsubscribeStoreFns = [];
var suppressStoreNotifications = 0;
function getStore() {
  return getAppStore();
}
function notify(snapshot) {
  for (const fn of subs) {
    try {
      fn(snapshot);
    } catch {
    }
  }
}
function readStateFromStore() {
  const store2 = getStore();
  if (!store2 || typeof store2.get !== "function") {
    return { ...fallbackState };
  }
  return {
    engine: store2.get(STORE_KEYS.engine) ?? fallbackState.engine,
    engineExplicit: !!store2.get(STORE_KEYS.engineExplicit),
    lang: store2.get(STORE_KEYS.lang) ?? fallbackState.lang,
    interim: store2.get(STORE_KEYS.interim) ?? fallbackState.interim,
    threshold: store2.get(STORE_KEYS.threshold) ?? fallbackState.threshold,
    endpointingMs: store2.get(STORE_KEYS.endpointingMs) ?? fallbackState.endpointingMs,
    fillerFilter: store2.get(STORE_KEYS.fillerFilter) ?? fallbackState.fillerFilter,
    manualAnchorAdoptEnabled: store2.get(STORE_KEYS.manualAnchorAdoptEnabled) ?? fallbackState.manualAnchorAdoptEnabled,
    calmModeEnabled: store2.get(STORE_KEYS.calmModeEnabled) ?? fallbackState.calmModeEnabled
  };
}
function ensureStoreSubscriptions() {
  const store2 = getStore();
  if (store2 === subscribedStore) return;
  unsubscribeStoreFns.forEach((unsub) => {
    try {
      unsub();
    } catch {
    }
  });
  unsubscribeStoreFns = [];
  subscribedStore = store2;
  if (!store2 || typeof store2.subscribe !== "function") {
    fallbackState = readStateFromStore();
    return;
  }
  let pendingInitial = watchedKeys.length;
  const handleChange = () => {
    fallbackState = readStateFromStore();
    if (pendingInitial > 0) {
      pendingInitial -= 1;
      return;
    }
    if (suppressStoreNotifications > 0) return;
    notify({ ...fallbackState });
  };
  unsubscribeStoreFns = watchedKeys.map((key) => {
    const unsub = store2.subscribe?.(key, handleChange);
    return typeof unsub === "function" ? unsub : () => {
    };
  });
  fallbackState = readStateFromStore();
}
var speechStore = {
  get() {
    ensureStoreSubscriptions();
    fallbackState = readStateFromStore();
    return { ...fallbackState };
  },
  getState() {
    return this.get();
  },
  set(patch) {
    ensureStoreSubscriptions();
    const store2 = getStore();
    if (!store2 || typeof store2.set !== "function") {
      fallbackState = { ...fallbackState, ...patch };
      notify({ ...fallbackState });
      return;
    }
    suppressStoreNotifications += 1;
    try {
      if (Object.prototype.hasOwnProperty.call(patch, "engine")) {
        store2.set(STORE_KEYS.engine, patch.engine);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "engineExplicit")) {
        store2.set(STORE_KEYS.engineExplicit, !!patch.engineExplicit);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "lang")) {
        store2.set(STORE_KEYS.lang, patch.lang);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "interim")) {
        store2.set(STORE_KEYS.interim, !!patch.interim);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "threshold")) {
        store2.set(STORE_KEYS.threshold, patch.threshold);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "endpointingMs")) {
        store2.set(STORE_KEYS.endpointingMs, patch.endpointingMs);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "fillerFilter")) {
        store2.set(STORE_KEYS.fillerFilter, !!patch.fillerFilter);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "manualAnchorAdoptEnabled")) {
        store2.set(STORE_KEYS.manualAnchorAdoptEnabled, !!patch.manualAnchorAdoptEnabled);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "calmModeEnabled")) {
        store2.set(STORE_KEYS.calmModeEnabled, !!patch.calmModeEnabled);
      }
    } finally {
      suppressStoreNotifications = Math.max(0, suppressStoreNotifications - 1);
    }
    fallbackState = readStateFromStore();
    notify({ ...fallbackState });
  },
  subscribe(fn) {
    ensureStoreSubscriptions();
    subs.add(fn);
    return () => subs.delete(fn);
  }
};

// src/hotkeys/asr-hotkeys.ts
function installAsrHotkeys() {
  let armed = false;
  const onKey = (e) => {
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === "l" || e.key === "L")) {
      armed = !armed;
      if (armed) {
        try {
          const body = document.body;
          const speechOn = !!(body && (body.classList.contains("speech-listening") || body.classList.contains("listening"))) || window.speechOn === true;
          if (!speechOn) document.getElementById("recBtn")?.click();
        } catch {
        }
      }
      window.dispatchEvent(new CustomEvent("asr:toggle", { detail: { armed } }));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === "Escape") {
      armed = false;
      window.dispatchEvent(new CustomEvent("asr:stop"));
    }
  };
  window.addEventListener("keydown", onKey, { passive: false });
  speechStore.subscribe((_s) => {
  });
  return () => window.removeEventListener("keydown", onKey);
}

// src/features/asr/engine-selection.ts
var ASR_ENGINE_EXPLICIT_KEY = "tp_asr_engine_explicit_v1";
function normalizeAsrEngine(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "web-speech") return "webspeech";
  if (normalized === "offline") return "vosk";
  return normalized;
}
function isAsrEngineExplicit(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}
function readLocalAsrEngineExplicit() {
  try {
    const store2 = window?.__tpStore;
    if (store2 && typeof store2.get === "function") {
      return isAsrEngineExplicit(store2.get("asr.engineExplicit"));
    }
  } catch {
  }
  try {
    return localStorage.getItem(ASR_ENGINE_EXPLICIT_KEY) === "1";
  } catch {
    return false;
  }
}

// src/scroll/audit.ts
var EXPECTED_WRITERS = /* @__PURE__ */ new Set([
  "ui/applyUiScrollMode",
  "features/scroll/mode-router",
  "scroll/mode-router",
  "state/app-store"
]);
var CONTINUOUS_MODES = /* @__PURE__ */ new Set(["timed", "wpm", "hybrid", "asr"]);
var FORBIDDEN_PHASES = /* @__PURE__ */ new Set(["idle", "preroll"]);
var RACE_WINDOW_MS = 150;
var writerStack = [];
var lastWriteAt = 0;
var lastWriter = "";
var lastMode = "";
var lastPhase = "";
var asrModeEntryGuardBuildProofEmitted = false;
var scrollAuditRuntimeProofEmitted = false;
function auditEnabled() {
  try {
    const w = window;
    if (w?.__TP_DEV || w?.__TP_DEV1 || w?.__tpDevMode) return true;
    if (w?.localStorage?.getItem?.("tp_dev_mode") === "1") return true;
    if (typeof location !== "undefined" && location.search.includes("dev=1")) return true;
  } catch {
  }
  return false;
}
function getScrollModeAuditContext() {
  if (!auditEnabled()) return null;
  return writerStack.length ? writerStack[writerStack.length - 1] : null;
}
function isContinuousMode(mode) {
  return CONTINUOUS_MODES.has(mode);
}
function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
function emitUnexpected(label, payload) {
  try {
    console.warn(`[scroll-audit] UNEXPECTED ${label}`, payload);
  } catch {
  }
}
function emitAsrModeEntryGuard(payload) {
  try {
    console.warn("[ASR_MODE_ENTRY_GUARD]", payload);
  } catch {
  }
}
function emitAsrModeEntryGuardBuildProof() {
  if (asrModeEntryGuardBuildProofEmitted) return;
  asrModeEntryGuardBuildProofEmitted = true;
  try {
    console.warn("[ASR_MODE_ENTRY_GUARD_BUILD_PROOF]", {
      module: "scroll-audit",
      stamp: "asr-mode-entry-guard-v2",
      loaded: true
    });
  } catch {
  }
}
function emitScrollAuditRuntimeProof() {
  if (scrollAuditRuntimeProofEmitted) return;
  scrollAuditRuntimeProofEmitted = true;
  try {
    console.warn("[SCROLL_AUDIT_RUNTIME_PROOF]", {
      source: "active-recordScrollModeWrite-path",
      loaded: true
    });
  } catch {
  }
}
function isAllowedIdleAsrUiSelection(writer, from, to, phase) {
  return writer === "ui/applyUiScrollMode" && from === "hybrid" && to === "asr" && phase === "idle";
}
function recordScrollModeWrite(event) {
  if (!auditEnabled()) return;
  emitAsrModeEntryGuardBuildProof();
  const now = Date.now();
  const writer = event.writer || "unknown";
  const from = normalize(event.from);
  const to = normalize(event.to);
  if (!to || to === from) return;
  const phase = normalize(event.phase);
  const allowIdleAsrUiSelection = isAllowedIdleAsrUiSelection(writer, from, to, phase);
  if (allowIdleAsrUiSelection) {
    const payload = {
      fromMode: from,
      toMode: to,
      phase,
      writer,
      userInitiated: true,
      action: "idle_ui_selection_recorded",
      runtimeAction: "runtime_arm_not_allowed_idle",
      auditClassification: "expected_ui_selection"
    };
    if (event.source) payload.source = event.source;
    if (event.via) payload.via = event.via;
    emitAsrModeEntryGuard(payload);
  }
  const reasons = [];
  if (!EXPECTED_WRITERS.has(writer)) reasons.push("unexpected-writer");
  if (FORBIDDEN_PHASES.has(phase) && isContinuousMode(to) && !allowIdleAsrUiSelection) {
    reasons.push("forbidden-phase");
  }
  const deltaMs = lastWriteAt ? now - lastWriteAt : 0;
  if (lastWriteAt && deltaMs < RACE_WINDOW_MS) reasons.push("rapid-write");
  if (reasons.length > 0) {
    emitScrollAuditRuntimeProof();
    const payload = {
      reasons,
      writer,
      from,
      to,
      phase: phase || "unknown",
      deltaMs: lastWriteAt ? deltaMs : null,
      lastWriter: lastWriter || null,
      lastMode: lastMode || null,
      lastPhase: lastPhase || null
    };
    if (event.source) payload.source = event.source;
    if (event.via) payload.via = event.via;
    if (event.stack) {
      try {
        payload.stack = new Error().stack;
      } catch {
      }
    }
    emitUnexpected("scrollMode-write", payload);
  }
  lastWriteAt = now;
  lastWriter = writer;
  lastMode = to;
  lastPhase = phase;
}

// src/features/scroll/scroll-prefs.ts
var CANONICAL_KEY = "scrollMode";
var LEGACY_KEYS = ["tp_scroll_prefs_v1", "tp_scroll_mode_v1", "tp_scroll_mode"];
function normalizeMode(mode) {
  const v = String(mode || "").toLowerCase();
  if (v === "manual") return "step";
  const allowed = ["hybrid", "timed", "wpm", "asr", "step", "rehearsal"];
  return allowed.includes(v) ? v : null;
}
function safeParse(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const normalized = normalizeMode(parsed.mode);
    if (!normalized) return null;
    return { mode: normalized };
  } catch {
    return null;
  }
}
function readLegacyMode(key, raw) {
  if (!raw) return null;
  if (key === "tp_scroll_prefs_v1") {
    return safeParse(raw)?.mode ?? null;
  }
  return normalizeMode(raw);
}
function cleanLegacyKeys(storage) {
  LEGACY_KEYS.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
    }
  });
}
function migrateLegacyScrollMode() {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const canonical = normalizeMode(storage.getItem(CANONICAL_KEY));
    if (canonical) {
      cleanLegacyKeys(storage);
      return canonical;
    }
    for (const key of LEGACY_KEYS) {
      const legacy = readLegacyMode(key, storage.getItem(key));
      if (legacy) {
        storage.setItem(CANONICAL_KEY, legacy);
        cleanLegacyKeys(storage);
        return legacy;
      }
    }
    cleanLegacyKeys(storage);
  } catch {
  }
  return null;
}
function loadScrollPrefs() {
  try {
    if (typeof window === "undefined") return null;
    const mode = migrateLegacyScrollMode();
    if (!mode) return null;
    return { mode };
  } catch {
    return null;
  }
}
function saveScrollPrefs(next) {
  try {
    if (typeof window === "undefined") return;
    const normalized = normalizeMode(next?.mode || null);
    if (!normalized) return;
    window.localStorage.setItem(CANONICAL_KEY, normalized);
    cleanLegacyKeys(window.localStorage);
  } catch {
  }
}

// src/state/app-store.ts
var IS_TEST = typeof process !== "undefined" && process.env && false;
var DEVICE_KEY = "tp_mic_device_v1";
var OBS_ENABLED_KEY = "tp_obs_enabled";
var OBS_HOST_KEY = "tp_obs_host";
var OBS_PASSWORD_KEY = "tp_obs_password";
var OBS_SCENE_KEY = "tp_obs_scene";
var OBS_RECONNECT_KEY = "tp_obs_reconnect";
var AUTO_RECORD_KEY = "tp_auto_record_on_start_v1";
var LEGACY_AUTO_RECORD_KEY = "tp_auto_record";
var PREROLL_SEC_KEY = "tp_preroll_seconds";
var DEV_HUD_KEY = "tp_dev_hud";
var SETTINGS_TAB_KEY = "tp_settings_tab";
var LEGACY_ASR_SETTINGS_KEY = "tp_asr_settings_v1";
var ASR_ENGINE_KEY = "tp_asr_engine_v1";
var ASR_LANG_KEY = "tp_asr_language_v1";
var ASR_INTERIM_KEY = "tp_asr_interim_v1";
var ASR_FILTER_KEY = "tp_asr_filter_v1";
var ASR_THRESHOLD_KEY = "tp_asr_threshold_v1";
var ASR_ENDPOINT_KEY = "tp_asr_endpoint_v1";
var ASR_MANUAL_ANCHOR_KEY = "tp_asr_manual_anchor_v1";
var ASR_PROFILES_KEY = "tp_asr_profiles_v1";
var ASR_ACTIVE_PROFILE_KEY = "tp_asr_active_profile_v1";
var SINGLE_MONITOR_READ_KEY = "tp_single_monitor_read_v1";
var ASR_CALM_MODE_KEY = "tp_asr_calm_mode_v1";
var ASR_TUNING_PROFILES_KEY = "tp_asr_tuning_profiles_v1";
var ASR_TUNING_ACTIVE_PROFILE_KEY = "tp_asr_tuning_active_profile_v1";
var SCROLL_MODE_KEY = "scrollMode";
var TIMED_SPEED_KEY = "tp_scroll_timed_speed_v1";
var WPM_TARGET_KEY = "tp_scroll_wpm_target_v1";
var WPM_BASEPX_KEY = "tp_scroll_wpm_basepx_v1";
var WPM_MINPX_KEY = "tp_scroll_wpm_minpx_v1";
var WPM_MAXPX_KEY = "tp_scroll_wpm_maxpx_v1";
var WPM_EWMA_KEY = "tp_scroll_wpm_ewma_v1";
var HYB_ATTACK_KEY = "tp_scroll_hybrid_attack_v1";
var HYB_RELEASE_KEY = "tp_scroll_hybrid_release_v1";
var HYB_IDLE_KEY = "tp_scroll_hybrid_idle_v1";
var STEP_PX_KEY = "tp_scroll_step_px_v1";
var REH_PUNCT_KEY = "tp_scroll_reh_punct_v1";
var REH_RESUME_KEY = "tp_scroll_reh_resume_v1";
var ALLOWED_PAGES = /* @__PURE__ */ new Set(["scripts"]);
var ALLOWED_OVERLAYS = /* @__PURE__ */ new Set(["none", "settings", "help", "shortcuts"]);
var HUD_ENABLED_KEY = "tp_hud_enabled_v1";
var HUD_SPEECH_NOTES_KEY = "tp_hud_speech_notes_v1";
var OVERLAY_KEY = "tp_overlay_v1";
var CAMERA_KEY = "tp_camera_enabled_v1";
var persistMap = {
  settingsTab: SETTINGS_TAB_KEY,
  micDevice: DEVICE_KEY,
  obsEnabled: OBS_ENABLED_KEY,
  obsScene: OBS_SCENE_KEY,
  obsReconnect: OBS_RECONNECT_KEY,
  obsHost: OBS_HOST_KEY,
  obsPassword: OBS_PASSWORD_KEY,
  autoRecord: AUTO_RECORD_KEY,
  prerollSeconds: PREROLL_SEC_KEY,
  devHud: DEV_HUD_KEY,
  hudEnabledByUser: HUD_ENABLED_KEY,
  hudSpeechNotesEnabledByUser: HUD_SPEECH_NOTES_KEY,
  overlay: OVERLAY_KEY,
  cameraEnabled: CAMERA_KEY,
  singleMonitorReadEnabled: SINGLE_MONITOR_READ_KEY,
  // Scroll router persistence
  scrollMode: SCROLL_MODE_KEY,
  timedSpeed: TIMED_SPEED_KEY,
  wpmTarget: WPM_TARGET_KEY,
  wpmBasePx: WPM_BASEPX_KEY,
  wpmMinPx: WPM_MINPX_KEY,
  wpmMaxPx: WPM_MAXPX_KEY,
  wpmEwmaSec: WPM_EWMA_KEY,
  hybridAttackMs: HYB_ATTACK_KEY,
  hybridReleaseMs: HYB_RELEASE_KEY,
  hybridIdleMs: HYB_IDLE_KEY,
  stepPx: STEP_PX_KEY,
  rehearsalPunct: REH_PUNCT_KEY,
  rehearsalResumeMs: REH_RESUME_KEY,
  "asr.engine": ASR_ENGINE_KEY,
  "asr.engineExplicit": ASR_ENGINE_EXPLICIT_KEY,
  "asr.language": ASR_LANG_KEY,
  "asr.useInterimResults": ASR_INTERIM_KEY,
  "asr.threshold": ASR_THRESHOLD_KEY,
  "asr.endpointMs": ASR_ENDPOINT_KEY,
  "asr.manualAnchorAdoptEnabled": ASR_MANUAL_ANCHOR_KEY,
  "asr.filterFillers": ASR_FILTER_KEY,
  asrCalmModeEnabled: ASR_CALM_MODE_KEY,
  asrProfiles: ASR_PROFILES_KEY,
  asrActiveProfileId: ASR_ACTIVE_PROFILE_KEY,
  asrTuningProfiles: ASR_TUNING_PROFILES_KEY,
  asrTuningActiveProfileId: ASR_TUNING_ACTIVE_PROFILE_KEY
};
function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function loadLegacyAsrSettings() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LEGACY_ASR_SETTINGS_KEY);
    return parseJson(raw);
  } catch {
    return null;
  }
}
function readLegacyAsrBoolean(legacyAsrSettings, ...keys) {
  for (const key of keys) {
    const value = legacyAsrSettings?.[key];
    if (value !== void 0) return !!value;
  }
  return null;
}
function readLegacyAsrNumber(legacyAsrSettings, ...keys) {
  for (const key of keys) {
    const value = legacyAsrSettings?.[key];
    if (value === void 0) continue;
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}
function migrateLegacyAsrSettings(legacyAsrSettings) {
  if (!legacyAsrSettings || typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    const setIfMissing = (key, value) => {
      if (!key || value == null || value === "") return;
      if (ls.getItem(key) !== null) return;
      ls.setItem(key, value);
    };
    setIfMissing(ASR_ENGINE_KEY, readInitialAsrEngine(legacyAsrSettings));
    setIfMissing(ASR_LANG_KEY, typeof legacyAsrSettings.lang === "string" ? legacyAsrSettings.lang : null);
    const interim = readLegacyAsrBoolean(legacyAsrSettings, "interim");
    setIfMissing(ASR_INTERIM_KEY, interim == null ? null : interim ? "1" : "0");
    const filter = readLegacyAsrBoolean(legacyAsrSettings, "filterFillers", "fillerFilter");
    setIfMissing(ASR_FILTER_KEY, filter == null ? null : filter ? "1" : "0");
    const threshold = readLegacyAsrNumber(legacyAsrSettings, "threshold");
    setIfMissing(ASR_THRESHOLD_KEY, threshold == null ? null : String(threshold));
    const endpointMs = readLegacyAsrNumber(legacyAsrSettings, "endpointMs", "endpointingMs");
    setIfMissing(ASR_ENDPOINT_KEY, endpointMs == null ? null : String(endpointMs));
    const manualAnchor = readLegacyAsrBoolean(legacyAsrSettings, "manualAnchorAdoptEnabled");
    setIfMissing(ASR_MANUAL_ANCHOR_KEY, manualAnchor == null ? null : manualAnchor ? "1" : "0");
    const calmMode = readLegacyAsrBoolean(legacyAsrSettings, "calmModeEnabled");
    setIfMissing(ASR_CALM_MODE_KEY, calmMode == null ? null : calmMode ? "1" : "0");
    ls.removeItem(LEGACY_ASR_SETTINGS_KEY);
  } catch {
  }
}
function readInitialAsrEngine(legacyAsrSettings) {
  try {
    const explicit = readLocalAsrEngineExplicit();
    const stored = normalizeAsrEngine(localStorage.getItem(ASR_ENGINE_KEY));
    const legacy = normalizeAsrEngine(
      legacyAsrSettings?.engine && typeof legacyAsrSettings.engine === "string" ? legacyAsrSettings.engine : ""
    );
    const selected = stored || legacy;
    if (explicit) return selected || "whisper";
    if (!selected || selected === "webspeech") return "whisper";
    return selected;
  } catch {
  }
  return "whisper";
}
function migrateAutoRecordFlag() {
  try {
    const current = localStorage.getItem(AUTO_RECORD_KEY);
    if (current !== null && typeof current !== "undefined") {
      if (localStorage.getItem(LEGACY_AUTO_RECORD_KEY) !== null) {
        try {
          localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
        } catch {
        }
      }
      return;
    }
    const legacy = localStorage.getItem(LEGACY_AUTO_RECORD_KEY);
    if (legacy !== null && typeof legacy !== "undefined") {
      localStorage.setItem(AUTO_RECORD_KEY, legacy === "1" ? "1" : "0");
      try {
        localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
      } catch {
      }
    }
  } catch {
  }
}
migrateAutoRecordFlag();
function normalizeScrollMode(mode) {
  const v = String(mode || "").trim().toLowerCase();
  if (!v) return "hybrid";
  if (v === "manual") return "step";
  return v;
}
function readAndMigrateScrollMode() {
  const legacyKeys = ["tp_scroll_mode", "tp_scroll_mode_v1", "tp_scroll_mode_v2", "tp_scroll_mode_backup"];
  try {
    const canonical = localStorage.getItem(SCROLL_MODE_KEY);
    if (canonical) {
      const norm = normalizeScrollMode(canonical);
      if (norm === "asr") {
        localStorage.setItem(SCROLL_MODE_KEY, "hybrid");
        try {
          localStorage.setItem("tp_asr_boot_fallback", "1");
        } catch {
        }
        legacyKeys.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {
          }
        });
        return "hybrid";
      }
      if (norm !== canonical) localStorage.setItem(SCROLL_MODE_KEY, norm);
      legacyKeys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {
        }
      });
      return norm;
    }
    for (const k of legacyKeys) {
      const legacy = localStorage.getItem(k);
      if (legacy) {
        const norm = normalizeScrollMode(legacy);
        if (norm === "asr") {
          localStorage.setItem(SCROLL_MODE_KEY, "hybrid");
          try {
            localStorage.setItem("tp_asr_boot_fallback", "1");
          } catch {
          }
          try {
            localStorage.removeItem(k);
          } catch {
          }
          return "hybrid";
        }
        localStorage.setItem(SCROLL_MODE_KEY, norm);
        try {
          localStorage.removeItem(k);
        } catch {
        }
        return norm;
      }
    }
  } catch {
  }
  return "hybrid";
}
function buildInitialState() {
  const legacyAsrSettings = loadLegacyAsrSettings();
  return {
    // UI / Settings
    settingsTab: (() => {
      try {
        return localStorage.getItem(SETTINGS_TAB_KEY) || "general";
      } catch {
        return "general";
      }
    })(),
    micDevice: (() => {
      try {
        return localStorage.getItem(DEVICE_KEY) || "";
      } catch {
        return "";
      }
    })(),
    cameraEnabled: (() => {
      try {
        const raw = localStorage.getItem(CAMERA_KEY);
        if (raw == null) return false;
        return raw === "1";
      } catch {
        return false;
      }
    })(),
    cameraAvailable: false,
    micGranted: false,
    obsEnabled: (() => {
      try {
        return localStorage.getItem(OBS_ENABLED_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    obsScene: (() => {
      try {
        return localStorage.getItem(OBS_SCENE_KEY) || "";
      } catch {
        return "";
      }
    })(),
    obsReconnect: (() => {
      try {
        return localStorage.getItem(OBS_RECONNECT_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    autoRecord: (() => {
      try {
        return localStorage.getItem(AUTO_RECORD_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    prerollSeconds: (() => {
      try {
        const n = parseInt(localStorage.getItem(PREROLL_SEC_KEY) || "3", 10);
        return isFinite(n) ? Math.max(0, Math.min(10, n)) : 3;
      } catch {
        return 3;
      }
    })(),
    devHud: (() => {
      try {
        return localStorage.getItem(DEV_HUD_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    hudSupported: true,
    hudEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_ENABLED_KEY) !== "0";
      } catch {
        return true;
      }
    })(),
    hudSpeechNotesEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_SPEECH_NOTES_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    singleMonitorReadEnabled: (() => {
      try {
        return localStorage.getItem(SINGLE_MONITOR_READ_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    asrLive: false,
    "asr.engine": readInitialAsrEngine(legacyAsrSettings),
    "asr.engineExplicit": readLocalAsrEngineExplicit(),
    "asr.language": (() => {
      try {
        const raw = localStorage.getItem(ASR_LANG_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.lang && typeof legacyAsrSettings.lang === "string") {
          return legacyAsrSettings.lang;
        }
      } catch {
      }
      return "en-US";
    })(),
    "asr.useInterimResults": (() => {
      try {
        const raw = localStorage.getItem(ASR_INTERIM_KEY);
        if (raw !== null) return raw === "1";
        if (legacyAsrSettings?.interim !== void 0) return !!legacyAsrSettings.interim;
      } catch {
      }
      return true;
    })(),
    "asr.filterFillers": (() => {
      try {
        const raw = localStorage.getItem(ASR_FILTER_KEY);
        if (raw !== null) return raw === "1";
        const legacy = readLegacyAsrBoolean(legacyAsrSettings, "filterFillers", "fillerFilter");
        if (legacy !== null) return legacy;
      } catch {
      }
      return true;
    })(),
    "asr.threshold": (() => {
      try {
        const raw = localStorage.getItem(ASR_THRESHOLD_KEY);
        const num = Number(raw);
        if (raw !== null && !Number.isNaN(num)) return num;
        if (legacyAsrSettings?.threshold !== void 0) return Number(legacyAsrSettings.threshold) || 0.6;
      } catch {
      }
      return 0.6;
    })(),
    "asr.endpointMs": (() => {
      try {
        const raw = localStorage.getItem(ASR_ENDPOINT_KEY);
        const num = Number(raw);
        if (raw !== null && !Number.isNaN(num)) return num;
        const legacy = readLegacyAsrNumber(legacyAsrSettings, "endpointMs", "endpointingMs");
        if (legacy !== null) return legacy;
      } catch {
      }
      return 700;
    })(),
    "asr.manualAnchorAdoptEnabled": (() => {
      try {
        const raw = localStorage.getItem(ASR_MANUAL_ANCHOR_KEY);
        if (raw !== null) return raw === "1";
        if (legacyAsrSettings?.manualAnchorAdoptEnabled !== void 0) {
          return legacyAsrSettings.manualAnchorAdoptEnabled !== false;
        }
      } catch {
      }
      return true;
    })(),
    asrCalmModeEnabled: (() => {
      try {
        const raw = localStorage.getItem(ASR_CALM_MODE_KEY);
        if (raw !== null) return raw === "1";
        const legacy = readLegacyAsrBoolean(legacyAsrSettings, "calmModeEnabled");
        if (legacy !== null) return legacy;
      } catch {
      }
      return false;
    })(),
    asrProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_PROFILES_KEY);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return {};
    })(),
    asrActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {
      }
      return null;
    })(),
    asrTuningProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_PROFILES_KEY);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return {};
    })(),
    asrTuningActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {
      }
      return null;
    })(),
    asrLastAppliedAt: 0,
    asrLastAppliedSummary: {},
    asrLastApplyOk: false,
    settingsSaveStatus: { state: "idle", at: 0 },
    overlay: (() => {
      try {
        const v = localStorage.getItem(OVERLAY_KEY) || "none";
        if (!ALLOWED_OVERLAYS.has(v)) {
          try {
            localStorage.removeItem(OVERLAY_KEY);
          } catch {
          }
          return "none";
        }
        return v;
      } catch {
        return "none";
      }
    })(),
    page: (() => {
      try {
        const v = "scripts";
        if (!ALLOWED_PAGES.has(v)) {
          return "scripts";
        }
        return v;
      } catch {
        return "scripts";
      }
    })(),
    obsHost: (() => {
      try {
        return localStorage.getItem(OBS_HOST_KEY) || "";
      } catch {
        return "";
      }
    })(),
    obsPassword: (() => {
      try {
        return localStorage.getItem(OBS_PASSWORD_KEY) || "";
      } catch {
        return "";
      }
    })(),
    // Scroll router (persisted)
    scrollMode: (() => {
      const fromPrefs = (() => {
        try {
          const prefs = loadScrollPrefs();
          if (prefs?.mode) return normalizeScrollMode(prefs.mode);
        } catch {
        }
        return null;
      })();
      if (fromPrefs === "asr") {
        try {
          localStorage.setItem("tp_asr_boot_fallback", "1");
        } catch {
        }
      }
      const migrated = readAndMigrateScrollMode();
      const chosen = normalizeScrollMode((fromPrefs === "asr" ? null : fromPrefs) || migrated);
      try {
        localStorage.setItem(SCROLL_MODE_KEY, chosen);
      } catch {
      }
      return chosen;
    })(),
    timedSpeed: (() => {
      try {
        const v = parseFloat(localStorage.getItem(TIMED_SPEED_KEY) || "");
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmTarget: (() => {
      try {
        const v = parseInt(localStorage.getItem(WPM_TARGET_KEY) || "");
        return isFinite(v) && v >= 60 ? v : 180;
      } catch {
        return 180;
      }
    })(),
    wpmBasePx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_BASEPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmMinPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MINPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 6;
      } catch {
        return 6;
      }
    })(),
    wpmMaxPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MAXPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 200;
      } catch {
        return 200;
      }
    })(),
    wpmEwmaSec: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_EWMA_KEY) || "");
        return isFinite(v) && v > 0 ? v : 1;
      } catch {
        return 1;
      }
    })(),
    hybridAttackMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_ATTACK_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    hybridReleaseMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_RELEASE_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 250;
      } catch {
        return 250;
      }
    })(),
    hybridIdleMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_IDLE_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 1500;
      } catch {
        return 1500;
      }
    })(),
    stepPx: (() => {
      try {
        const v = parseInt(localStorage.getItem(STEP_PX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    rehearsalPunct: (() => {
      try {
        const v = localStorage.getItem(REH_PUNCT_KEY);
        return v != null && v !== "" ? v : ".,;:?!";
      } catch {
        return ".,;:?!";
      }
    })(),
    rehearsalResumeMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(REH_RESUME_KEY) || "");
        return isFinite(v) && v >= 100 ? v : 1e3;
      } catch {
        return 1e3;
      }
    })(),
    // transient session state (not persisted)
    obsUrl: "",
    obsPort: "",
    obsSecure: false
  };
}
function ensureExistingState() {
  if (IS_TEST) {
    try {
      delete window.__tpStore;
    } catch {
    }
    return {};
  }
  try {
    const existing = window.__tpStore;
    if (!existing || typeof existing !== "object") return {};
    const snapshot = typeof existing.getSnapshot === "function" ? existing.getSnapshot() : existing.state;
    if (snapshot && typeof snapshot === "object") return snapshot;
  } catch {
  }
  return {};
}
function sanitizeState(state2) {
  if (!ALLOWED_PAGES.has(state2.page)) {
    state2.page = "scripts";
  }
  if (!ALLOWED_OVERLAYS.has(state2.overlay)) {
    state2.overlay = "none";
    try {
      localStorage.removeItem(OVERLAY_KEY);
    } catch {
    }
  }
  if (typeof state2["asr.engineExplicit"] !== "boolean") {
    state2["asr.engineExplicit"] = !!state2["asr.engineExplicit"];
  }
  if (state2.scrollMode === "manual") {
    state2.scrollMode = "step";
  }
  if (!state2.asrProfiles || typeof state2.asrProfiles !== "object") {
    state2.asrProfiles = {};
  }
  if (state2.asrActiveProfileId && typeof state2.asrActiveProfileId !== "string") {
    state2.asrActiveProfileId = null;
  }
  if (!state2.asrTuningProfiles || typeof state2.asrTuningProfiles !== "object") {
    state2.asrTuningProfiles = {};
  }
  if (state2.asrTuningActiveProfileId && typeof state2.asrTuningActiveProfileId !== "string") {
    state2.asrTuningActiveProfileId = null;
  }
  if (typeof state2.asrLastAppliedAt !== "number") {
    state2.asrLastAppliedAt = 0;
  }
  if (!state2.asrLastAppliedSummary || typeof state2.asrLastAppliedSummary !== "object") {
    state2.asrLastAppliedSummary = {};
  }
  if (typeof state2.asrLastApplyOk !== "boolean") {
    state2.asrLastApplyOk = false;
  }
  if (!state2.settingsSaveStatus || typeof state2.settingsSaveStatus !== "object") {
    state2.settingsSaveStatus = { state: "idle", at: 0 };
  }
  return state2;
}
function createAppStore(initial) {
  const subs3 = /* @__PURE__ */ Object.create(null);
  const baseState = buildInitialState();
  migrateLegacyAsrSettings(loadLegacyAsrSettings());
  const state2 = sanitizeState(
    Object.assign(
      {},
      baseState,
      ensureExistingState(),
      initial || {}
    )
  );
  function notify2(key, value) {
    try {
      const k = String(key);
      const fns = subs3[k] || [];
      for (let i = 0; i < fns.length; i++) {
        try {
          fns[i](value);
        } catch {
        }
      }
    } catch {
    }
  }
  function get(key) {
    try {
      return state2[key];
    } catch {
      return void 0;
    }
  }
  function set(key, value) {
    try {
      if (key === "page") {
        value = ALLOWED_PAGES.has(value) ? value : "scripts";
      }
      if (key === "overlay") {
        value = ALLOWED_OVERLAYS.has(value) ? value : "none";
      }
      const prev = state2[key];
      if (prev === value) return value;
      state2[key] = value;
      if (key === "scrollMode") {
        try {
          const ctx = getScrollModeAuditContext();
          recordScrollModeWrite({
            writer: ctx?.writer || "unknown",
            from: prev,
            to: value,
            phase: state2["session.phase"],
            source: ctx?.meta?.source,
            via: ctx?.meta?.via,
            stack: !!ctx?.meta?.stack
          });
        } catch {
        }
      }
      try {
        const storageKey = persistMap[key];
        if (storageKey) {
          if (value === null || typeof value === "undefined") {
            localStorage.removeItem(storageKey);
          } else if (typeof value === "boolean") {
            localStorage.setItem(storageKey, value ? "1" : "0");
          } else if (typeof value === "object") {
            try {
              localStorage.setItem(storageKey, JSON.stringify(value));
            } catch {
            }
          } else {
            localStorage.setItem(storageKey, String(value));
          }
          if (key === "autoRecord") {
            try {
              localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
            } catch {
            }
          }
          if (key === "scrollMode") {
            saveScrollPrefs({ mode: String(value) });
          }
        }
      } catch {
      }
      notify2(key, value);
      return value;
    } catch {
      return value;
    }
  }
  function subscribe(key, fn) {
    if (typeof fn !== "function") return () => {
    };
    const k = String(key);
    subs3[k] = subs3[k] || [];
    subs3[k].push(fn);
    try {
      fn(state2[key]);
    } catch {
    }
    return function unsubscribe() {
      try {
        subs3[k] = (subs3[k] || []).filter((x) => x !== fn);
      } catch {
      }
    };
  }
  function subscribeAll(map) {
    const unsubs = [];
    try {
      for (const k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          const key = k;
          const fn = map[key];
          if (fn) unsubs.push(subscribe(key, fn));
        }
      }
    } catch {
    }
    return function unsubscribeAll() {
      unsubs.forEach((u) => u && u());
    };
  }
  const appStore = {
    __tsOwned: true,
    get,
    set,
    subscribe,
    subscribeAll,
    state: state2,
    getSnapshot: () => ({ ...state2 })
  };
  try {
    if (!IS_TEST) {
      const w = window;
      const existing = w.__tpStore;
      if (!existing || !existing.__tsOwned) {
        try {
          Object.defineProperty(w, "__tpStore", {
            value: appStore,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch {
          w.__tpStore = appStore;
        }
      }
    }
  } catch {
  }
  return appStore;
}
var appStoreSingleton = createAppStore();

// src/scroll/asr-block-store.ts
var blockEls = [];
var blockMeta = null;
function getAsrBlockElements() {
  return blockEls;
}
function getAsrBlockIndex() {
  return blockMeta;
}

// src/speech/matcher-input.ts
var MATCH_TOKEN_WINDOW = 18;
var META_PHRASES = [
  /\bit(?:'s| is) not keeping up\b/gi,
  /\bit(?:'s| is) not moving\b/gi,
  /\bit(?:'s| is) not scrolling\b/gi,
  /\bhas(?:n't| not) moved\b/gi,
  /\bokay so\b/gi,
  /\byou know\b/gi,
  /\bi think\b/gi,
  /\blet(?:'s| us) see\b/gi,
  /\bi(?:'m| am) going to\b/gi,
  /\bim going to\b/gi,
  /\bgoing to have to\b/gi,
  /\bsend (?:you|u)\b/gi,
  /\bscreenshots?\b/gi,
  /\bchatgpt\b/gi,
  /\bdev\b/gi,
  /\blogs?\b/gi,
  /\bdebug\b/gi
];
function stripMatcherMetaPhrases(text) {
  let out = String(text || "");
  for (const rx of META_PHRASES) {
    rx.lastIndex = 0;
    out = out.replace(rx, " ");
  }
  return out;
}
function prepareMatcherInput(text, tokenize) {
  const scrubbed = stripMatcherMetaPhrases(text || "");
  const spokenTokens = tokenize(scrubbed);
  return {
    scrubbed,
    spokenTokens,
    matchTokens: spokenTokens.slice(-MATCH_TOKEN_WINDOW)
  };
}

// src/speech/matcher-runtime-state.ts
function getMatcherRuntimeState(opts) {
  if (typeof window === "undefined") return null;
  const w = window;
  const scriptWords = Array.isArray(w.scriptWords) ? w.scriptWords : [];
  const paraIndex = Array.isArray(w.paraIndex) ? w.paraIndex : [];
  const vParaIndex = Array.isArray(w.__vParaIndex) ? w.__vParaIndex : null;
  const currentIndexRaw = typeof opts?.currentIndex === "number" ? opts.currentIndex : typeof w.currentIndex === "number" ? w.currentIndex : 0;
  const currentIndex = Number.isFinite(Number(currentIndexRaw)) ? Math.max(0, Math.floor(Number(currentIndexRaw))) : 0;
  const rawViterbiState = w.__viterbiIPred;
  const viterbiState = rawViterbiState && typeof rawViterbiState === "object" && Array.isArray(rawViterbiState.path) ? {
    path: rawViterbiState.path.map((value) => Number(value)).filter((value) => Number.isFinite(value)),
    pred: Number.isFinite(Number(rawViterbiState.pred)) ? Number(rawViterbiState.pred) : void 0
  } : null;
  return {
    scriptWords,
    paraIndex,
    vParaIndex,
    cfg: {
      MATCH_WINDOW_AHEAD: typeof opts?.windowAhead === "number" ? opts.windowAhead : typeof w.MATCH_WINDOW_AHEAD === "number" ? w.MATCH_WINDOW_AHEAD : 240,
      MATCH_WINDOW_BACK: typeof opts?.windowBack === "number" ? opts.windowBack : typeof w.MATCH_WINDOW_BACK === "number" ? w.MATCH_WINDOW_BACK : 40,
      SIM_THRESHOLD: typeof w.SIM_THRESHOLD === "number" ? w.SIM_THRESHOLD : 0.46,
      MAX_JUMP_AHEAD_WORDS: typeof w.MAX_JUMP_AHEAD_WORDS === "number" ? w.MAX_JUMP_AHEAD_WORDS : 18
    },
    currentIndex,
    viterbiState
  };
}

// src/speech/matcher.ts
var NUMBER_TOKENS = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90"
};
var FILLER_TOKENS = /* @__PURE__ */ new Set([
  "um",
  "uh",
  "erm",
  "er",
  "ah",
  "hmm",
  "mm",
  "mmm",
  "uhh",
  "uhm"
]);
var TENS_TOKENS = /* @__PURE__ */ new Set(["20", "30", "40", "50", "60", "70", "80", "90"]);
var ONES_TOKEN_RE = /^[0-9]$/;
function combineTensAndOnes(tokens) {
  if (!tokens.length) return tokens;
  const combined = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const next = tokens[i + 1];
    if (TENS_TOKENS.has(current) && typeof next === "string" && ONES_TOKEN_RE.test(next)) {
      combined.push(String(Number(current) + Number(next)));
      i += 1;
      continue;
    }
    combined.push(current);
  }
  return combined;
}
function normTokens(s) {
  const normalized = String(s || "").toLowerCase().replace(/\[[^\]]+]/g, " ").replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/%/g, " percent ").replace(/[\u2018\u2019\u201B\u2032]/g, "'").replace(/[\u201C\u201D\u201F\u2033]/g, '"').replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9\s'-]/g, " ").replace(/'/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const mappedTokens = normalized.split(" ").filter(Boolean).map((token) => NUMBER_TOKENS[token] ?? token).filter((token) => !FILLER_TOKENS.has(token));
  return combineTensAndOnes(mappedTokens);
}
function getNgrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}
function cosineSimilarity(vec1, vec2) {
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    n1 += vec1[i] * vec1[i];
    n2 += vec2[i] * vec2[i];
  }
  return n1 && n2 ? dot / (Math.sqrt(n1) * Math.sqrt(n2)) : 0;
}
function computeTFIDFSimilarity(tokens1, tokens2) {
  const ngrams1 = getNgrams(tokens1, 2).concat(getNgrams(tokens1, 3));
  const ngrams2 = getNgrams(tokens2, 2).concat(getNgrams(tokens2, 3));
  const all = Array.from(/* @__PURE__ */ new Set([...ngrams1, ...ngrams2]));
  const v1 = all.map((ng) => ngrams1.filter((x) => x === ng).length);
  const v2 = all.map((ng) => ngrams2.filter((x) => x === ng).length);
  return cosineSimilarity(v1, v2);
}
function computeJaccardSimilarity(tokens1, tokens2) {
  const s1 = new Set(tokens1.map((t) => t.toLowerCase()));
  const s2 = new Set(tokens2.map((t) => t.toLowerCase()));
  const inter = new Set([...s1].filter((x) => s2.has(x)));
  const union = /* @__PURE__ */ new Set([...s1, ...s2]);
  return union.size ? inter.size / union.size : 0;
}
function computeLineSimilarityFromTokens(spokenTokens, scriptTokens) {
  const tfidf = computeTFIDFSimilarity(spokenTokens, scriptTokens);
  const jacc = computeJaccardSimilarity(spokenTokens, scriptTokens);
  const containment = (() => {
    if (!spokenTokens.length) return 0;
    const s1 = new Set(spokenTokens);
    const s2 = new Set(scriptTokens);
    let hit = 0;
    for (const tok of s1) {
      if (s2.has(tok)) hit += 1;
    }
    return s1.size ? hit / s1.size : 0;
  })();
  const charsA = spokenTokens.join(" ");
  const charsB = scriptTokens.join(" ");
  const charF1 = (() => {
    const setA = new Set(charsA.split(""));
    const setB = new Set(charsB.split(""));
    const inter = new Set([...setA].filter((x) => setB.has(x)));
    const p = setA.size ? inter.size / setA.size : 0;
    const r = setB.size ? inter.size / setB.size : 0;
    return p + r > 0 ? 2 * p * r / (p + r) : 0;
  })();
  let score = 0.45 * tfidf + 0.25 * charF1 + 0.1 * jacc + 0.2 * containment;
  if (scriptTokens.length < 5) score -= 0.12;
  return Math.max(0, Math.min(1, score));
}
function matchBatch(spokenTokens, _scriptWords, paraIndex, vParaIndex, cfg, currentIndex, _viterbiState, opts) {
  const batch = spokenTokens.slice(-Math.max(3, spokenTokens.length));
  const scores = {};
  const spanByIdx = {};
  const overlapByIdx = {};
  const overlapRatioByIdx = {};
  const windowAhead = cfg.MATCH_WINDOW_AHEAD;
  const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
  const lastEntry = paraIndex.length ? paraIndex[paraIndex.length - 1] : null;
  const lineCount = vParaIndex ? vParaIndex.length : typeof lastEntry?.line === "number" ? lastEntry.line + 1 : paraIndex.length;
  const safeLineCount = Math.max(0, lineCount);
  if (!safeLineCount) {
    return {
      bestIdx: -1,
      bestSim: 0,
      topScores: [],
      bandStart: 0,
      bandEnd: 0,
      inBand: false
    };
  }
  const bandStart = Math.max(0, curIdx - cfg.MATCH_WINDOW_BACK);
  const bandEnd = Math.min(safeLineCount - 1, curIdx + windowAhead);
  if (bandEnd < bandStart) {
    return {
      bestIdx: -1,
      bestSim: 0,
      topScores: [],
      bandStart,
      bandEnd,
      inBand: false
    };
  }
  const lineText = new Array(safeLineCount).fill(null);
  const lineMeta = new Array(safeLineCount).fill(false);
  const lineNonSpoken = new Array(safeLineCount).fill(false);
  if (vParaIndex) {
    for (let i = 0; i < safeLineCount; i++) {
      const text = vParaIndex[i];
      if (typeof text === "string" && text) lineText[i] = text;
    }
  }
  for (let i = 0; i < paraIndex.length; i++) {
    const entry = paraIndex[i];
    const lineIdx = typeof entry?.line === "number" ? entry.line : i;
    if (!Number.isFinite(lineIdx) || lineIdx < 0 || lineIdx >= safeLineCount) continue;
    if (!lineText[lineIdx]) {
      const text = entry?.key;
      if (typeof text === "string" && text) lineText[lineIdx] = text;
    }
    if (entry?.isMeta) lineMeta[lineIdx] = true;
    if (entry?.isNonSpoken) lineNonSpoken[lineIdx] = true;
  }
  const minTokenOverlap = Number.isFinite(opts?.minTokenOverlap) ? Math.max(0, Math.floor(Number(opts?.minTokenOverlap))) : 0;
  const minTokenLen = Number.isFinite(opts?.minTokenLen) ? Math.max(1, Math.floor(Number(opts?.minTokenLen))) : 4;
  const overlapTokens = minTokenOverlap ? batch.filter((token) => token.length >= minTokenLen) : null;
  if (minTokenOverlap > 0 && (!overlapTokens || overlapTokens.length < minTokenOverlap)) {
    return {
      bestIdx: -1,
      bestSim: 0,
      topScores: [],
      bandStart,
      bandEnd,
      inBand: false
    };
  }
  const multiLineMax = Number.isFinite(opts?.multiLineMaxLines) ? Math.max(1, Math.floor(Number(opts?.multiLineMaxLines))) : 1;
  const multiLineMin = Number.isFinite(opts?.multiLineMinLines) ? Math.max(1, Math.floor(Number(opts?.multiLineMinLines))) : 2;
  const allowMultiLine = multiLineMax > 1 && multiLineMin <= multiLineMax;
  for (let lineIdx = bandStart; lineIdx <= bandEnd; lineIdx++) {
    const baseText = lineText[lineIdx];
    if (!baseText) continue;
    const baseTokens = normTokens(baseText);
    if (!baseTokens.length) continue;
    const baseMeta = lineMeta[lineIdx];
    const baseNonSpoken = lineNonSpoken[lineIdx];
    const updateScore = (scriptTokens, span, hasMeta, hasNonSpoken) => {
      if (overlapTokens && overlapTokens.length) {
        const scriptSet = new Set(scriptTokens);
        let hits = 0;
        for (const tok of overlapTokens) {
          if (scriptSet.has(tok)) hits += 1;
        }
        if (hits < minTokenOverlap) return;
        let sc2 = computeLineSimilarityFromTokens(batch, scriptTokens);
        if (hasNonSpoken) sc2 = sc2 - 0.6;
        else if (hasMeta) sc2 = sc2 * 0.5 - 0.2;
        const prev2 = scores[lineIdx];
        const ratio = overlapTokens.length ? hits / overlapTokens.length : 0;
        if (!Number.isFinite(prev2) || sc2 > prev2) {
          scores[lineIdx] = sc2;
          spanByIdx[lineIdx] = span;
          overlapByIdx[lineIdx] = hits;
          overlapRatioByIdx[lineIdx] = ratio;
        }
        return;
      }
      let sc = computeLineSimilarityFromTokens(batch, scriptTokens);
      if (hasNonSpoken) sc = sc - 0.6;
      else if (hasMeta) sc = sc * 0.5 - 0.2;
      const prev = scores[lineIdx];
      if (!Number.isFinite(prev) || sc > prev) {
        scores[lineIdx] = sc;
        spanByIdx[lineIdx] = span;
      }
    };
    updateScore(baseTokens, 1, baseMeta, baseNonSpoken);
    if (!allowMultiLine) continue;
    for (let span = Math.max(2, multiLineMin); span <= multiLineMax; span++) {
      const end = lineIdx + span - 1;
      if (end > bandEnd) break;
      const parts = [];
      let hasMeta = baseMeta;
      let hasNonSpoken = baseNonSpoken;
      for (let i = lineIdx; i <= end; i++) {
        const text = lineText[i];
        if (!text) {
          parts.length = 0;
          break;
        }
        parts.push(text);
        if (lineMeta[i]) hasMeta = true;
        if (lineNonSpoken[i]) hasNonSpoken = true;
      }
      if (!parts.length) continue;
      const scriptTokens = normTokens(parts.join(" "));
      if (!scriptTokens.length) continue;
      updateScore(scriptTokens, span, hasMeta, hasNonSpoken);
    }
  }
  const top = Object.entries(scores).sort(([, a], [, b]) => b - a).slice(0, 3).map(([idx, score]) => ({ idx: Number(idx), score: Number(score.toFixed(3)) }));
  const best = top[0] || { idx: -1, score: 0 };
  const inBand = best.idx >= bandStart && best.idx <= bandEnd;
  const resolved = inBand ? best : { idx: -1, score: 0 };
  return {
    bestIdx: resolved.idx,
    bestSim: resolved.score,
    topScores: top,
    bandStart,
    bandEnd,
    inBand,
    bestSpan: resolved.idx >= 0 ? spanByIdx[resolved.idx] || 1 : void 0,
    bestOverlap: resolved.idx >= 0 ? overlapByIdx[resolved.idx] : void 0,
    bestOverlapRatio: resolved.idx >= 0 ? overlapRatioByIdx[resolved.idx] : void 0
  };
}

// src/speech/ts-primary-matcher-provider.ts
var PROVIDER_ID = "ts_primary_runtime";
var PROVIDER_SOURCE = "ts_primary_matcher_provider";
var OVERWRITE_DIAGNOSTIC_TAG = "[TS_PRIMARY_MATCHER_PROVIDER_OVERWRITTEN]";
var STATUS_DIAGNOSTIC_TAG = "[TS_PRIMARY_MATCHER_PROVIDER_STATUS]";
var DIRECT_MATCHER_MULTI_LINE_MIN_LINES = 2;
var DIRECT_MATCHER_MULTI_LINE_MAX_LINES = 5;
var DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES = 3;
var DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD = 10;
function getRuntimeState() {
  if (typeof window === "undefined") return null;
  const win = window;
  if (!win.__tpTsPrimaryMatcherProviderRuntime) {
    win.__tpTsPrimaryMatcherProviderRuntime = {
      installAttempted: false,
      installSucceeded: false,
      installSkippedReason: null,
      overwrittenAfterInstall: false,
      overwriteLogged: false,
      installedMatchBatch: null,
      installedMatchOne: null,
      currentProviderSource: null,
      emittedStages: {},
      lastStatus: null
    };
  }
  return win.__tpTsPrimaryMatcherProviderRuntime;
}
function getTpSpeechNamespace() {
  if (typeof window === "undefined") return null;
  const win = window;
  if (!win.__tpSpeech || typeof win.__tpSpeech !== "object") return null;
  return win.__tpSpeech;
}
function isBackendGuardStubFn(fn) {
  return typeof fn === "function" && fn.__tpMatcherUnavailableStub === true;
}
function readScriptHash() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.__TP_LAST_APPLIED_HASH;
    return typeof raw === "string" && raw ? raw : null;
  } catch {
    return null;
  }
}
function getBlockSnapshot() {
  const blockEls2 = getAsrBlockElements();
  const blockMeta2 = getAsrBlockIndex();
  const blockCount = Array.isArray(blockEls2) ? blockEls2.length : 0;
  return {
    blocksReady: !!blockMeta2 && blockCount > 0,
    blockCount
  };
}
function getMatcherProviderKind(ns) {
  if (!ns || typeof ns !== "object") return "missing_namespace";
  if (typeof ns.__tpMatcherProvider === "string" && ns.__tpMatcherProvider) {
    return ns.__tpMatcherProvider;
  }
  if (isBackendGuardStubFn(ns.matchBatch) || isBackendGuardStubFn(ns.matchOne)) {
    return "matcher_unavailable_stub";
  }
  if (typeof ns.matchBatch === "function" || typeof ns.matchOne === "function") {
    return "custom_or_legacy";
  }
  return "missing_matcher";
}
function computeCurrentProviderSource(ns, runtime) {
  if (!ns || typeof ns !== "object") return null;
  if (typeof ns.__tpMatcherProviderSource === "string" && ns.__tpMatcherProviderSource) {
    return ns.__tpMatcherProviderSource;
  }
  if (runtime?.installedMatchBatch && ns.matchBatch === runtime.installedMatchBatch) {
    return PROVIDER_SOURCE;
  }
  if (isBackendGuardStubFn(ns.matchBatch) || isBackendGuardStubFn(ns.matchOne)) {
    return "backend_guard_stub";
  }
  return null;
}
function hasProviderBeenOverwritten(ns, runtime) {
  if (!ns || !runtime?.installSucceeded) return false;
  if (runtime.installedMatchBatch && ns.matchBatch !== runtime.installedMatchBatch) return true;
  if (runtime.installedMatchOne && ns.matchOne !== runtime.installedMatchOne) return true;
  return false;
}
function buildStatus(stage) {
  const runtime = getRuntimeState();
  const ns = getTpSpeechNamespace();
  const { blocksReady, blockCount } = getBlockSnapshot();
  const overwrittenAfterInstall = Boolean(runtime?.overwrittenAfterInstall) || hasProviderBeenOverwritten(ns, runtime);
  const status = {
    stage,
    hasWindowTpSpeech: !!ns,
    hasMatchOne: typeof ns?.matchOne === "function",
    hasMatchBatch: typeof ns?.matchBatch === "function",
    matcherProviderKind: getMatcherProviderKind(ns),
    isBackendGuardStub: isBackendGuardStubFn(ns?.matchBatch) || isBackendGuardStubFn(ns?.matchOne),
    blocksReady,
    blockCount,
    scriptHash: readScriptHash(),
    installAttempted: !!runtime?.installAttempted,
    installSucceeded: !!runtime?.installSucceeded,
    installSkippedReason: runtime?.installSkippedReason ?? null,
    overwrittenAfterInstall,
    currentProviderSource: computeCurrentProviderSource(ns, runtime)
  };
  if (runtime) {
    runtime.lastStatus = status;
    runtime.currentProviderSource = status.currentProviderSource;
    if (overwrittenAfterInstall) runtime.overwrittenAfterInstall = true;
  }
  return status;
}
function maybeEmitOverwriteDiagnostic(stage) {
  const runtime = getRuntimeState();
  const ns = getTpSpeechNamespace();
  if (!runtime || !hasProviderBeenOverwritten(ns, runtime)) return;
  runtime.overwrittenAfterInstall = true;
  if (runtime.overwriteLogged) return;
  runtime.overwriteLogged = true;
  try {
    console.warn(OVERWRITE_DIAGNOSTIC_TAG, buildStatus(stage));
  } catch {
  }
}
function isTsPrimaryBoot() {
  if (typeof window === "undefined") return false;
  try {
    return window.__TP_TS_PRIMARY__ === true;
  } catch {
    return false;
  }
}
function createUnavailableResult(diagnostic) {
  return {
    noMatch: true,
    bestIdx: -1,
    idx: -1,
    topScores: [],
    reason: "matcher_unavailable",
    provider: PROVIDER_ID,
    diagnostic
  };
}
function normalizeTextInput(input) {
  if (Array.isArray(input)) {
    return input.map((part) => String(part ?? "")).join(" ").trim();
  }
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const text = input.text ?? input.transcript;
    if (typeof text === "string") return text;
  }
  return String(input ?? "");
}
function normalizeMatchArgs(arg1, arg2) {
  if (typeof arg1 === "boolean") {
    return {
      isFinal: arg1,
      opts: arg2 && typeof arg2 === "object" ? arg2 : void 0
    };
  }
  const opts = arg1 && typeof arg1 === "object" ? arg1 : void 0;
  const isFinal = typeof opts?.isFinal === "boolean" ? Boolean(opts.isFinal) : false;
  return { isFinal, opts };
}
function normalizeMatchResult(input) {
  if (!input || typeof input !== "object") {
    return createUnavailableResult("ts_primary_matcher_invalid_result");
  }
  const bestIdxRaw = input.bestIdx ?? input.idx;
  const bestSimRaw = input.bestSim ?? input.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const noMatch = input.noMatch === true || bestIdx < 0;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : void 0;
  return {
    ...input,
    bestIdx: noMatch ? -1 : bestIdx,
    idx: noMatch ? -1 : bestIdx,
    bestSim,
    sim: bestSim,
    topScores: Array.isArray(input.topScores) ? input.topScores : Array.isArray(input.candidates) ? input.candidates : [],
    noMatch
  };
}
function resolveMatcherAvailability(currentIndexOverride) {
  const blockEls2 = getAsrBlockElements();
  const blockMeta2 = getAsrBlockIndex();
  const blockCount = Array.isArray(blockEls2) ? blockEls2.length : 0;
  if (blockCount <= 0) {
    return { ok: false, diagnostic: "ts_primary_matcher_not_ready:block_elements_empty", runtime: null };
  }
  if (!blockMeta2) {
    return { ok: false, diagnostic: "ts_primary_matcher_not_ready:block_index_missing", runtime: null };
  }
  const runtime = getMatcherRuntimeState({ currentIndex: currentIndexOverride });
  if (!runtime) {
    return { ok: false, diagnostic: "ts_primary_matcher_not_ready:runtime_missing", runtime: null };
  }
  if (!Array.isArray(runtime.scriptWords) || runtime.scriptWords.length === 0) {
    return { ok: false, diagnostic: "ts_primary_matcher_not_ready:script_words_missing", runtime };
  }
  if (!runtime.paraIndex.length && !(Array.isArray(runtime.vParaIndex) && runtime.vParaIndex.length > 0)) {
    return { ok: false, diagnostic: "ts_primary_matcher_not_ready:line_index_missing", runtime };
  }
  return { ok: true, diagnostic: "ready", runtime };
}
function runTsPrimaryMatch(textInput, arg1, arg2) {
  const text = normalizeTextInput(textInput);
  const { opts } = normalizeMatchArgs(arg1, arg2);
  const currentIndexOverride = Number.isFinite(Number(opts?.currentIdx ?? opts?.currentIndex)) ? Number(opts?.currentIdx ?? opts?.currentIndex) : null;
  const availability = resolveMatcherAvailability(currentIndexOverride);
  if (!availability.ok || !availability.runtime) {
    return createUnavailableResult(availability.diagnostic);
  }
  const { matchTokens } = prepareMatcherInput(text, normTokens);
  if (!matchTokens.length) {
    return {
      noMatch: true,
      bestIdx: -1,
      idx: -1,
      topScores: [],
      reason: "ts_primary_matcher_no_tokens",
      provider: PROVIDER_ID,
      currentIdx: availability.runtime.currentIndex
    };
  }
  const adaptiveMultiLineMax = matchTokens.length <= DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD ? DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES : DIRECT_MATCHER_MULTI_LINE_MAX_LINES;
  try {
    const result = matchBatch(
      matchTokens,
      availability.runtime.scriptWords,
      availability.runtime.paraIndex,
      availability.runtime.vParaIndex,
      availability.runtime.cfg,
      availability.runtime.currentIndex,
      availability.runtime.viterbiState ?? void 0,
      {
        multiLineMinLines: DIRECT_MATCHER_MULTI_LINE_MIN_LINES,
        multiLineMaxLines: adaptiveMultiLineMax
      }
    );
    return normalizeMatchResult({
      ...result,
      currentIdx: availability.runtime.currentIndex,
      reason: "ts_primary_matcher",
      provider: PROVIDER_ID
    });
  } catch {
    return createUnavailableResult("ts_primary_matcher_failed");
  }
}
function createMatchBatchProvider() {
  return (text, arg1, arg2) => runTsPrimaryMatch(text, arg1, arg2);
}
function createMatchOneProvider() {
  return (text, arg1, arg2) => runTsPrimaryMatch(text, arg1, arg2);
}
function applyProvider(ns, stage) {
  if (!ns || typeof ns !== "object") return false;
  const runtime = getRuntimeState();
  maybeEmitOverwriteDiagnostic(`${stage}:preinstall`);
  const matchBatch2 = createMatchBatchProvider();
  const matchOne = createMatchOneProvider();
  ns.matchBatch = matchBatch2;
  ns.matchOne = matchOne;
  ns.__tpMatcherProvider = PROVIDER_ID;
  ns.__tpMatcherProviderSource = PROVIDER_SOURCE;
  ns.__tpMatcherDiagnostics = {
    provider: PROVIDER_ID,
    installMode: "dynamic-runtime",
    installStage: stage
  };
  if (runtime) {
    runtime.installAttempted = true;
    runtime.installSucceeded = true;
    runtime.installSkippedReason = null;
    runtime.installedMatchBatch = matchBatch2;
    runtime.installedMatchOne = matchOne;
    runtime.currentProviderSource = PROVIDER_SOURCE;
  }
  return true;
}
function ensureTsPrimaryMatcherNamespace(stage = "ensure") {
  const runtime = getRuntimeState();
  if (runtime) {
    runtime.installAttempted = true;
    runtime.installSkippedReason = null;
  }
  if (!isTsPrimaryBoot()) {
    if (runtime) runtime.installSkippedReason = "not_ts_primary_boot";
    return false;
  }
  if (typeof window === "undefined") {
    if (runtime) runtime.installSkippedReason = "window_unavailable";
    return false;
  }
  const win = window;
  const ns = win.__tpSpeech = win.__tpSpeech || {};
  return applyProvider(ns, stage);
}
function emitTsPrimaryMatcherProviderDiagnostic(stage) {
  const runtime = getRuntimeState();
  maybeEmitOverwriteDiagnostic(`${stage}:check`);
  const status = buildStatus(stage);
  if (runtime?.emittedStages?.[stage]) return status;
  if (runtime) runtime.emittedStages[stage] = true;
  try {
    console.info(STATUS_DIAGNOSTIC_TAG, status);
  } catch {
  }
  return status;
}

// src/features/speech/speech-store.ts
var MIN_ENDPOINT_MS = 100;
var MAX_ENDPOINT_MS = 9e5;
function clampEndpoint(value) {
  if (value === void 0 || value === null) return void 0;
  const candidate = Math.round(Number(value) || 0);
  if (!Number.isFinite(candidate)) return void 0;
  return Math.max(MIN_ENDPOINT_MS, Math.min(MAX_ENDPOINT_MS, candidate));
}
function getSpeechStore() {
  return speechStore;
}
function getAsrSettings() {
  return speechStore.get();
}
function setAsrSettings(patch) {
  const normalized = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalized, "endpointingMs")) {
    normalized.endpointingMs = clampEndpoint(normalized.endpointingMs) ?? void 0;
  }
  speechStore.set(normalized);
}
function isDevMode() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem("tp_dev_mode") === "1") return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("dev")) return true;
    const hash = (window.location.hash || "").toLowerCase();
    if (hash === "#dev" || hash === "#dev=1" || hash.includes("dev=1")) return true;
  } catch {
    return false;
  }
  return false;
}
function normalizeMatchOneResult(input) {
  const fallback = {
    bestIdx: -1,
    bestSim: 0,
    idx: -1,
    sim: 0,
    topScores: [],
    noMatch: true
  };
  if (!input || typeof input !== "object") return fallback;
  const raw = input;
  const bestIdxRaw = raw.bestIdx ?? raw.idx;
  const bestSimRaw = raw.bestSim ?? raw.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : 0;
  const topScores = Array.isArray(raw.topScores) ? raw.topScores : Array.isArray(raw.candidates) ? raw.candidates : [];
  const idx = Number.isFinite(Number(raw.idx)) ? Math.floor(Number(raw.idx)) : bestIdx;
  const sim = Number.isFinite(Number(raw.sim)) ? Number(raw.sim) : bestSim;
  return {
    ...raw,
    bestIdx,
    bestSim,
    idx,
    sim,
    topScores,
    noMatch: typeof raw.noMatch === "boolean" ? raw.noMatch : bestIdx < 0
  };
}
function installMatchOneCompat(ns) {
  if (!ns || typeof ns !== "object") return;
  if (typeof ns.matchOne === "function") return;
  if (typeof ns.matchBatch !== "function") return;
  ns.matchOne = (text, arg1, arg2) => {
    const source = typeof text === "string" ? text : text == null ? "" : String(text.text ?? text);
    const isFinal = typeof arg1 === "boolean" ? arg1 : typeof arg1?.isFinal === "boolean" ? Boolean(arg1.isFinal) : false;
    const opts = typeof arg1 === "boolean" ? arg2 : arg1;
    try {
      const result = ns.matchBatch(String(source || ""), isFinal, opts);
      return normalizeMatchOneResult(result);
    } catch {
      try {
        const legacyResult = ns.matchBatch([String(source || "")], opts);
        return normalizeMatchOneResult(legacyResult);
      } catch {
        return normalizeMatchOneResult(null);
      }
    }
  };
  if (isDevMode()) {
    try {
      console.info("[speech-store] installed __tpSpeech.matchOne compatibility shim");
    } catch {
    }
  }
}
function shouldInstallTsPrimaryMatcher(ns) {
  if (!ns || typeof ns !== "object") return false;
  const existing = ns.matchBatch;
  if (typeof existing !== "function") return true;
  return existing.__tpMatcherUnavailableStub === true;
}
if (typeof window !== "undefined") {
  const win = window;
  const ns = win.__tpSpeech || {};
  if (shouldInstallTsPrimaryMatcher(ns)) {
    ensureTsPrimaryMatcherNamespace("speech_store_init");
  }
  ns.store = speechStore;
  if (ns.store && typeof ns.store.getState !== "function" && typeof ns.store.get === "function") {
    ns.store.getState = ns.store.get.bind(ns.store);
  }
  installMatchOneCompat(ns);
  ns.getAsrSettings = getAsrSettings;
  ns.setAsrSettings = setAsrSettings;
  win.__tpSpeech = ns;
  if (isDevMode()) {
    win.__tpSpeechStore = speechStore;
  }
  const blocksReadyListenerKey = "__tpTsPrimaryMatcherBlocksReadyListenerInstalled";
  if (!win[blocksReadyListenerKey]) {
    win[blocksReadyListenerKey] = true;
    window.addEventListener("tp:asr:blocks-ready", () => {
      ensureTsPrimaryMatcherNamespace("blocks_ready");
      emitTsPrimaryMatcherProviderDiagnostic("blocks_ready");
    });
  }
}

// src/ui/settings-asr.ts
var asrSettingsObserverStarted = false;
var asrSettingsWarned = false;
var asrSettingsRenderEventFired = false;
var isHydratingAsrSettings = false;
function resolveStore(store2) {
  if (store2) return store2;
  try {
    return window.__tpStore || appStoreSingleton || null;
  } catch {
    return appStoreSingleton;
  }
}
function findAsrCard(root = document) {
  return root?.querySelector?.("#asrSettingsCard") || root?.querySelector?.(".settings-card.asr") || null;
}
function queryAsrInputs(card) {
  const q = (selector) => card.querySelector(selector);
  return {
    eng: q("#asrEngine"),
    lang: q("#asrLang"),
    interim: q("#asrInterim"),
    fillers: q("#asrFillers"),
    thresh: q("#asrThresh"),
    endms: q("#asrEndMs"),
    calm: q("#asrCalmMode")
  };
}
function applyAsrStateToInputs(inputs, state2) {
  const { eng, lang, interim, fillers, thresh, endms } = inputs;
  if (eng && typeof state2.engine === "string") {
    try {
      eng.value = state2.engine;
    } catch {
    }
  }
  if (lang && typeof state2.lang === "string") {
    lang.value = state2.lang;
  }
  if (interim) interim.checked = !!state2.interim;
  if (fillers) fillers.checked = !!state2.fillerFilter;
  if (thresh && typeof state2.threshold === "number") {
    thresh.value = String(state2.threshold);
  }
  if (endms && typeof state2.endpointingMs === "number") {
    endms.value = String(state2.endpointingMs);
  }
  if (inputs.calm) inputs.calm.checked = !!state2.calmModeEnabled;
}
function attachAsrInputListeners(inputs) {
  const { eng, lang, interim, fillers, thresh, endms, calm } = inputs;
  const persist = (patch) => {
    if (isHydratingAsrSettings) return;
    persistAsrPatch(patch);
  };
  const clampThreshold = (value) => {
    const parsed = typeof value === "number" ? value : parseFloat(String(value));
    if (Number.isNaN(parsed)) return;
    persist({ threshold: clamp(parsed, 0, 1) });
  };
  const clampEndpoint2 = (value) => {
    const parsed = typeof value === "number" ? Math.round(value) : Math.round(parseFloat(String(value)));
    if (Number.isNaN(parsed)) return;
    persist({ endpointingMs: Math.max(200, parsed) });
  };
  eng?.addEventListener("change", () => persist({ engine: eng.value }));
  lang?.addEventListener("change", () => persist({ lang: lang.value }));
  interim?.addEventListener("change", () => persist({ interim: interim.checked }));
  fillers?.addEventListener("change", () => persist({ fillerFilter: fillers.checked }));
  thresh?.addEventListener("input", () => clampThreshold(thresh.value));
  thresh?.addEventListener("change", () => clampThreshold(thresh.value));
  endms?.addEventListener("input", () => clampEndpoint2(endms.value));
  endms?.addEventListener("change", () => clampEndpoint2(endms.value));
  calm?.addEventListener("change", () => persist({ calmModeEnabled: calm.checked }));
}
function withAsrHydration(fn) {
  isHydratingAsrSettings = true;
  try {
    fn();
  } finally {
    const scheduleClear = () => {
      isHydratingAsrSettings = false;
    };
    try {
      if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
        window.setTimeout(scheduleClear, 0);
      } else {
        setTimeout(scheduleClear, 0);
      }
    } catch {
      scheduleClear();
    }
  }
}
function persistAsrPatch(patch) {
  if (Object.prototype.hasOwnProperty.call(patch, "engine")) {
    patch.engineExplicit = true;
  }
  setAsrSettings(patch);
}
function formatRelativeTime(timestamp) {
  if (!timestamp || Number.isNaN(timestamp)) return "just now";
  const delta = Date.now() - timestamp;
  if (delta < 1e3) return "just now";
  if (delta < 6e4) return `${Math.round(delta / 1e3)}s ago`;
  if (delta < 36e5) return `${Math.round(delta / 6e4)}m ago`;
  if (delta < 864e5) return `${Math.round(delta / 36e5)}h ago`;
  return `${Math.round(delta / 864e5)}d ago`;
}
function wireAsrSettingsCard(root = document, store2) {
  const card = root.querySelector("#asrSettingsCard") || root.querySelector(".settings-card.asr");
  if (!card) {
    if (!asrSettingsWarned) {
      asrSettingsWarned = true;
      try {
        console.warn("[ASR] settings card not found (skipping wiring)");
      } catch {
      }
    }
    return null;
  }
  if (card.dataset.tpAsrWired === "1") return card;
  card.dataset.tpAsrWired = "1";
  const inputs = queryAsrInputs(card);
  attachAsrInputListeners(inputs);
  wireAsrStatusIndicators(card, store2);
  return card;
}
function hydrateAsrSettingsCard(root = document) {
  const card = findAsrCard(root);
  if (!card) return;
  const inputs = queryAsrInputs(card);
  const state2 = getAsrSettings();
  withAsrHydration(() => applyAsrStateToInputs(inputs, state2));
}
function mountAsrSettings(root = document, store2) {
  const card = wireAsrSettingsCard(root, store2);
  if (!card) return;
  hydrateAsrSettingsCard(root);
}
function wireAsrStatusIndicators(card, store2) {
  const saveEl = card.querySelector("#asrSaveStatus");
  const appliedEl = card.querySelector("#asrAppliedStatus");
  if (!saveEl && !appliedEl) return;
  const resolved = resolveStore(store2);
  const SAVE_STALE_MS = 15e3;
  let saveStatusTimer = null;
  const clearSaveTimer = () => {
    if (saveStatusTimer) {
      try {
        clearTimeout(saveStatusTimer);
      } catch {
      }
      saveStatusTimer = null;
    }
  };
  const isMounted = () => {
    try {
      return card.isConnected && document.contains(card);
    } catch {
      return false;
    }
  };
  const renderSaveStatus = () => {
    if (!isMounted()) {
      clearSaveTimer();
      return;
    }
    if (!saveEl) return;
    const status = resolved?.get?.("settingsSaveStatus");
    if (!status || status.state === "idle") {
      saveEl.textContent = "";
      saveEl.hidden = true;
      clearSaveTimer();
      delete saveEl.dataset.stale;
      return;
    }
    let text = "";
    if (status.state === "saving") {
      text = "Saving to account...";
      clearSaveTimer();
      delete saveEl.dataset.stale;
    } else if (status.state === "saved") {
      const when = formatRelativeTime(status.at);
      const elapsed = Date.now() - status.at;
      const isStale = elapsed >= SAVE_STALE_MS;
      if (isStale) {
        text = "Saved";
        saveEl.dataset.stale = "1";
        clearSaveTimer();
      } else {
        text = `Saved to account [OK]${when ? ` (${when})` : ""}`;
        delete saveEl.dataset.stale;
        clearSaveTimer();
        saveStatusTimer = window.setTimeout(() => {
          try {
            renderSaveStatus();
          } catch {
          }
        }, Math.max(SAVE_STALE_MS - elapsed, 0));
      }
    } else if (status.state === "failed") {
      const errSuffix = status.error ? `: ${status.error}` : "";
      text = `Save failed${errSuffix}`;
      clearSaveTimer();
      delete saveEl.dataset.stale;
    }
    saveEl.textContent = text;
    saveEl.hidden = !text;
  };
  const renderAppliedStatus = () => {
    if (!isMounted()) return;
    if (!appliedEl) return;
    const appliedAt = resolved?.get?.("asrLastAppliedAt") || 0;
    const summary = resolved?.get?.("asrLastAppliedSummary");
    const ok = !!resolved?.get?.("asrLastApplyOk");
    const status = resolved?.get?.("settingsSaveStatus");
    const lastSaveAt = status?.state === "saved" ? status.at : 0;
    const asrRunning = !!resolved?.get?.("asrLive");
    if (!asrRunning && lastSaveAt && lastSaveAt > appliedAt) {
      appliedEl.textContent = "Pending application (ASR not running)";
      appliedEl.hidden = false;
      return;
    }
    if (!appliedAt) {
      appliedEl.textContent = "ASR has not applied any settings yet.";
      appliedEl.hidden = false;
      return;
    }
    const parts = [];
    if (summary) {
      const engine = summary.engine || summary.eng;
      if (engine) parts.push(String(engine));
      if (summary.lang) parts.push(String(summary.lang));
      if (summary.profileName) parts.push(String(summary.profileName));
      if (summary.reason) parts.push(String(summary.reason));
    }
    const base = parts.length ? parts.join(" | ") : "default";
    const symbol = ok ? "[applied]" : "[warn]";
    const relative = formatRelativeTime(appliedAt);
    appliedEl.textContent = `Applied to ASR: ${symbol} ${base}${relative ? ` (${relative})` : ""}`;
    appliedEl.hidden = false;
  };
  renderSaveStatus();
  renderAppliedStatus();
  if (resolved?.subscribe) {
    resolved.subscribe("settingsSaveStatus", renderSaveStatus);
    resolved.subscribe("asrLastAppliedAt", renderAppliedStatus);
    resolved.subscribe("asrLastAppliedSummary", renderAppliedStatus);
    resolved.subscribe("asrLastApplyOk", renderAppliedStatus);
    resolved.subscribe("asrLive", renderAppliedStatus);
  }
}
function ensureAsrSettingsWired(root = document, store2) {
  const tryMount = (warnIfMissing = false) => {
    const card = root?.querySelector?.("#asrSettingsCard") || root?.querySelector?.(".settings-card.asr");
    if (!card) {
      if (warnIfMissing && !asrSettingsWarned) {
        asrSettingsWarned = true;
        try {
          console.warn("[ASR] settings card not found (will retry)");
        } catch {
        }
      }
      return false;
    }
    mountAsrSettings(root, store2);
    return true;
  };
  if (tryMount(false)) return;
  document.addEventListener(
    "tp:settings:rendered",
    () => {
      asrSettingsRenderEventFired = true;
      tryMount(true);
    },
    { once: true }
  );
  if (!asrSettingsObserverStarted) {
    asrSettingsObserverStarted = true;
    const host = root?.querySelector?.("#settingsBody") || document.getElementById("settingsBody") || document.body;
    try {
      const obs = new MutationObserver(() => {
        const wired = tryMount(asrSettingsRenderEventFired);
        if (wired) {
          try {
            obs.disconnect();
          } catch {
          }
        }
      });
      obs.observe(host || document.body, { subtree: true, childList: true });
    } catch {
    }
  }
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// src/ui/topbar-asr.ts
var AsrTopbar = class {
  constructor(_mode) {
    this._mode = _mode;
  }
  chip;
  running = false;
  mount(targetSelector = "#topbarRight, .topbar, header, body") {
    const host = document.querySelector(targetSelector) || document.body;
    const wrap = document.createElement("div");
    wrap.className = "asr-topbar flex items-center gap-2";
    this.chip = document.createElement("span");
    this.chip.className = "rounded-full px-2 py-1 text-xs font-medium bg-gray-700 text-white";
    this.chip.textContent = "ASR: off";
    wrap.appendChild(this.chip);
    host.appendChild(wrap);
    const renderState = (rawState) => {
      const st = String(rawState || "").toLowerCase();
      const map = {
        idle: "off",
        ready: "ready",
        listening: "listening",
        running: "listening",
        error: "error"
      };
      this.chip.textContent = `ASR: ${map[st] ?? st}`;
      if (st === "idle" || st === "error") this.running = false;
      if (st === "running" || st === "listening" || st === "ready") this.running = true;
    };
    const renderRuntime = (detail) => {
      const requested = String(detail?.requestedEngine || "").trim() || "whisper";
      const actual = String(detail?.actualEngine || requested).trim() || requested;
      const lane = String(detail?.activeAsrLane || "ASR1_CURRENT").trim();
      const fallbackReason = String(detail?.fallbackReason || "").trim();
      this.chip.title = fallbackReason ? `Lane: ${lane}  \u2022  Requested: ${requested}  \u2022  Active: ${actual}  \u2022  Fallback: ${fallbackReason}` : `Lane: ${lane}  \u2022  Engine: ${actual}`;
    };
    window.addEventListener("tp:asr:state", (e) => renderState(e?.detail?.state));
    window.addEventListener("asr:state", (e) => renderState(e?.detail?.state));
    window.addEventListener("tp:asr:runtime-status", (e) => renderRuntime(e?.detail));
    renderRuntime(window.__tpAsrRuntimeStatus || null);
  }
  // No toggle UI anymore; ASR start/stop is wired to Speech Sync + mode changes.
};

// src/events.ts
function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

// src/speech/asr-engine.ts
var Emitter = class {
  ls = /* @__PURE__ */ new Set();
  on(fn) {
    this.ls.add(fn);
  }
  off(fn) {
    this.ls.delete(fn);
  }
  emit(e) {
    for (const fn of this.ls) fn(e);
  }
};
function normalizeText(s) {
  return s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
}
var FILLERS = /* @__PURE__ */ new Set([
  "um",
  "uh",
  "like",
  "you",
  "know",
  "er",
  "ah",
  "hmm",
  "mm",
  "okay",
  "ok",
  "right",
  "so",
  "well"
]);
function stripFillers(s) {
  const toks = normalizeText(s).split(" ");
  return toks.filter((t) => !FILLERS.has(t)).join(" ");
}

// src/asr/store.ts
var store = getAppStore();
var stateFromStore = (() => {
  if (!store) return null;
  try {
    const profiles = store.get("asrProfiles") || {};
    const activeProfileId = store.get("asrActiveProfileId") || void 0;
    return { profiles, activeProfileId };
  } catch {
    return null;
  }
})();
var state = (() => {
  if (stateFromStore) {
    return {
      profiles: stateFromStore.profiles || {},
      activeProfileId: stateFromStore.activeProfileId
    };
  }
  return { profiles: {} };
})();
var subs2 = /* @__PURE__ */ new Set();
var storeSyncSuppressed = false;
function syncAppStore() {
  if (!store) return;
  storeSyncSuppressed = true;
  try {
    store.set("asrProfiles", state.profiles);
  } catch {
  }
  try {
    store.set("asrActiveProfileId", state.activeProfileId ?? null);
  } catch {
  }
  storeSyncSuppressed = false;
}
function save(opts) {
  subs2.forEach((fn) => {
    try {
      fn(state);
    } catch {
    }
  });
  if (!opts?.fromStore) {
    syncAppStore();
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:asrChanged", { detail: state }));
  } catch {
  }
}
var getAsrState = () => state;
if (store) {
  try {
    store.subscribe("asrProfiles", (next) => {
      if (storeSyncSuppressed) return;
      const profilesObj = next && typeof next === "object" ? next : {};
      state.profiles = { ...profilesObj };
      save({ fromStore: true });
    });
    store.subscribe("asrActiveProfileId", (next) => {
      if (storeSyncSuppressed) return;
      state.activeProfileId = typeof next === "string" && next ? next : void 0;
      save({ fromStore: true });
    });
  } catch {
  }
  syncAppStore();
}

// src/asr/active-profile.ts
function getActiveAsrProfile() {
  try {
    const state2 = getAsrState();
    const id = state2?.activeProfileId;
    if (!id) return null;
    return state2.profiles?.[id] || null;
  } catch {
    return null;
  }
}

// src/speech/engines/webspeech.ts
var WebSpeechEngine = class {
  name = "webspeech";
  emitter = new Emitter();
  recognition = null;
  lastPartialAt = 0;
  shouldRun = false;
  restartTimer = null;
  restarting = false;
  on(cb) {
    this.emitter.on(cb);
  }
  async start(opts) {
    const activeProfile = getActiveAsrProfile();
    try {
      if (window.__tpMic?.requestMic) {
        await window.__tpMic.requestMic({
          source: "webspeech",
          asrPath: "webspeech",
          profileId: activeProfile?.id || null,
          capture: activeProfile?.capture || null
        });
      }
    } catch {
    }
    const AnyWindow = window;
    const Ctor = AnyWindow.webkitSpeechRecognition || AnyWindow.SpeechRecognition;
    if (!Ctor) {
      this.emitter.emit({ type: "error", code: "unsupported", message: "Web Speech not available" });
      return;
    }
    const rec = new Ctor();
    this.recognition = rec;
    this.shouldRun = true;
    this.restarting = false;
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    rec.continuous = true;
    rec.interimResults = !!opts.interim;
    rec.lang = opts.lang || "en-US";
    try {
      const runtimeDetail = window.__tpCalibrationRuntime;
      const state2 = String(runtimeDetail?.calibrationState || (activeProfile ? "partially_calibrated" : "bypassed"));
      window.dispatchEvent(new CustomEvent("tp:asr:calibration-status", {
        detail: {
          path: "webspeech",
          profileId: activeProfile?.id || null,
          version: activeProfile?.version ?? null,
          state: state2 === "calibrated" ? "partially_calibrated" : state2,
          browserManaged: true,
          runtime: runtimeDetail || null,
          limitation: "Web Speech capture is browser-managed; full constraint enforcement may be unavailable."
        }
      }));
    } catch {
    }
    rec.onstart = () => {
      this.emitter.emit({ type: "ready" });
      this.emitter.emit({ type: "listening" });
    };
    rec.onresult = (ev) => {
      let partial = "";
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += text + " ";
        else partial += text + " ";
      }
      const now = performance.now();
      if (partial && opts.interim && now - this.lastPartialAt > 120) {
        this.emitter.emit({ type: "partial", text: partial.trim(), confidence: 0.5 });
        this.lastPartialAt = now;
      }
      if (finalText) {
        this.emitter.emit({ type: "final", text: finalText.trim(), confidence: 1 });
      }
    };
    rec.onerror = (e) => {
      const code = e?.error || "error";
      const message = e?.message || String(e?.error) || "ASR error";
      this.emitter.emit({ type: "error", code, message });
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        this.shouldRun = false;
      }
    };
    rec.onend = () => {
      if (!this.shouldRun) {
        this.emitter.emit({ type: "stopped" });
        return;
      }
      if (this.restarting) return;
      this.restarting = true;
      if (this.restartTimer != null) {
        window.clearTimeout(this.restartTimer);
      }
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        if (!this.shouldRun || !this.recognition) {
          this.restarting = false;
          return;
        }
        try {
          this.recognition.start();
        } catch (err) {
          this.emitter.emit({
            type: "error",
            code: "restart-failed",
            message: err?.message || String(err)
          });
        } finally {
          this.restarting = false;
        }
      }, 120);
    };
    try {
      rec.start();
    } catch (err) {
      this.emitter.emit({ type: "error", code: "start-failed", message: err?.message || String(err) });
    }
  }
  async stop() {
    this.shouldRun = false;
    this.restarting = false;
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
    }
    this.recognition = null;
  }
};

// src/scroll/scroll-intent-bus.ts
var EVENT = "tp:scroll:intent";
function emitScrollIntent(intent) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: intent }));
}

// src/scroll/scroller.ts
var displayScrollChannel = null;
var scrollEventTrackerInstalled = false;
var lastScrollSyncSignature = "";
var lastScrollSyncEmitAt = 0;
var suppressedScrollSyncCount = 0;
function shouldLogScrollWrite() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__tpScrollDebug === true) return true;
    if (w.__tpScrollWriteDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || "");
    if (qs.has("scrollDebug") || qs.has("scrollWriteDebug")) return true;
  } catch {
  }
  return false;
}
function readLineIndex(el) {
  if (!el) return null;
  const line = el.closest ? el.closest(".line") : null;
  if (!line) return null;
  const raw = line.dataset.i || line.dataset.index || line.dataset.lineIdx || line.dataset.line || line.getAttribute("data-line") || line.getAttribute("data-line-idx");
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const id = line.id || "";
  const m = /^tp-line-(\d+)$/.exec(id);
  if (m) return Math.max(0, Number(m[1]));
  return null;
}
function computeAnchorLineIndex(scroller) {
  if (!scroller) return null;
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const rect = scroller.getBoundingClientRect();
  if (!rect.height || !rect.width) return null;
  const markerPct = typeof window.__TP_MARKER_PCT === "number" ? window.__TP_MARKER_PCT : 0.4;
  const markerY = rect.top + rect.height * markerPct;
  const markerX = rect.left + rect.width * 0.5;
  const hit = document.elementFromPoint(markerX, markerY);
  const hitIdx = readLineIndex(hit);
  if (hitIdx != null) return hitIdx;
  const lines = Array.from(scroller.querySelectorAll(".line"));
  if (!lines.length) return null;
  let bestIdx = null;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const el = lines[i];
    const r = el.getBoundingClientRect();
    const y = r.top + r.height * 0.5;
    const d = Math.abs(y - markerY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = readLineIndex(el) ?? i;
    }
  }
  return bestIdx != null ? Math.max(0, Math.floor(bestIdx)) : null;
}
function isElementLike(node) {
  return !!node && typeof node === "object" && node.nodeType === 1;
}
function getDisplayViewerElement() {
  if (typeof window === "undefined") return null;
  try {
    const w = window;
    const direct = w.__tpDisplayViewerEl;
    if (isElementLike(direct)) return direct;
    const opener = w.opener;
    const viaOpener = opener && !opener.closed ? opener.__tpDisplayViewerEl : null;
    if (isElementLike(viaOpener)) return viaOpener;
  } catch {
  }
  return null;
}
function getScrollerEl(role = "main") {
  if (typeof document === "undefined") return null;
  if (role === "display") {
    return getDisplayViewerElement() || document.getElementById("wrap");
  }
  try {
    return document.querySelector("main#viewer.viewer, #viewer") || document.getElementById("viewer");
  } catch {
    return document.getElementById("viewer");
  }
}
function getScriptRoot() {
  try {
    return document.getElementById("script");
  } catch {
    return null;
  }
}
function getFallbackScroller() {
  try {
    return getScrollerEl("main") || getScrollerEl("display") || getScriptRoot() || document.getElementById("wrap");
  } catch {
    return null;
  }
}
function isScrollable(el) {
  if (!el) return false;
  const scrollHeight = Number(el.scrollHeight || 0);
  const clientHeight = Number(el.clientHeight || 0);
  if (scrollHeight - clientHeight > 2 && clientHeight > 0) return true;
  if (scrollHeight <= 0 && clientHeight <= 0) return false;
  try {
    const st = getComputedStyle(el);
    if (!/(auto|scroll)/.test(st.overflowY || "")) return false;
    const rect = el.getBoundingClientRect();
    return clientHeight > 0 || rect.height > 0;
  } catch {
    return false;
  }
}
function resolveActiveScroller(primary, fallback) {
  const hasLayoutBox = (el) => {
    if (!el) return false;
    const scrollHeight = Number(el.scrollHeight || 0);
    const clientHeight = Number(el.clientHeight || 0);
    if (scrollHeight > 0 || clientHeight > 0) return true;
    try {
      const rect = el.getBoundingClientRect();
      return rect.height > 0 || rect.width > 0;
    } catch {
      return false;
    }
  };
  if (isScrollable(primary)) return primary;
  if (isScrollable(fallback)) return fallback;
  if (!hasLayoutBox(primary) && hasLayoutBox(fallback)) return fallback;
  return primary || fallback;
}
function describeElement(el) {
  if (!el) return "none";
  const id = el.id ? `#${el.id}` : "";
  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : "";
  return `${el.tagName.toLowerCase()}${id}${cls}` || el.tagName.toLowerCase();
}
function getPrimaryScroller() {
  return getScrollerEl("main") || getScrollerEl("display");
}
function isDisplayWindow() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("display") === "1") return true;
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("display")) return true;
    if (window.__TP_FORCE_DISPLAY) return true;
  } catch {
  }
  return false;
}
function isDevScrollSync() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__tpScrollSyncDebug === true || w.__tpScrollDebug === true) return true;
    if (w.localStorage?.getItem("tp_scroll_sync_debug") === "1") return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("scrollSyncDebug") || params.has("scrollDebug")) return true;
  } catch {
  }
  return false;
}
function emitCoalescedScrollSyncLog(payload) {
  if (!isDevScrollSync()) return;
  const signature = `${payload.reason || "none"}|${payload.top}|${payload.scroller}`;
  const now = Date.now();
  if (signature === lastScrollSyncSignature) {
    suppressedScrollSyncCount += 1;
    if (suppressedScrollSyncCount < 120 && now - lastScrollSyncEmitAt < 2e3) {
      return;
    }
    try {
      console.debug("[SCROLL_SYNC]", {
        ...payload,
        suppressedCount: suppressedScrollSyncCount
      });
    } catch {
    }
    suppressedScrollSyncCount = 0;
    lastScrollSyncEmitAt = now;
    return;
  }
  lastScrollSyncSignature = signature;
  suppressedScrollSyncCount = 0;
  lastScrollSyncEmitAt = now;
  try {
    console.debug("[SCROLL_SYNC]", payload);
  } catch {
  }
}
function applyCanonicalScrollTop(topPx, opts = {}) {
  const scroller = opts.scroller || resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
  if (!scroller) return 0;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const target = Math.max(0, Math.min(Number(topPx) || 0, max));
  const before = scroller.scrollTop || 0;
  try {
    scroller.scrollTop = target;
  } catch {
  }
  const after = scroller.scrollTop || target;
  const writerSource = opts.source ?? opts.reason ?? "programmatic";
  try {
    scroller.dataset.tpLastWriter = writerSource;
  } catch {
  }
  if (shouldLogScrollWrite()) {
    try {
      console.info("[SCROLL_WRITE_DETAIL]", {
        source: writerSource,
        reason: opts.reason,
        target: Math.round(target),
        before: Math.round(before),
        after: Math.round(after),
        scroller: describeElement(scroller)
      });
    } catch {
    }
  }
  try {
    let actualTop = target;
    try {
      actualTop = scroller.scrollTop || target;
    } catch {
    }
    const ratio = max > 0 ? actualTop / max : 0;
    const cursorLine = computeAnchorLineIndex(scroller);
    const payload = {
      type: "scroll",
      top: actualTop,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? void 0
    };
    const send = window.sendToDisplay || window.__tpSendToDisplay || window.__tpDisplay?.sendToDisplay;
    if (typeof send === "function") {
      send(payload);
    } else {
      const displayWin = window.__tpDisplayWindow;
      if (displayWin && !displayWin.closed && typeof displayWin.postMessage === "function") {
        displayWin.postMessage(payload, "*");
      } else if (typeof BroadcastChannel !== "undefined") {
        if (!displayScrollChannel) {
          try {
            displayScrollChannel = new BroadcastChannel("tp_display");
          } catch {
          }
        }
        try {
          displayScrollChannel?.postMessage(payload);
        } catch {
        }
      }
    }
  } catch {
  }
  emitCoalescedScrollSyncLog({
    top: Math.round(target),
    scroller: describeElement(scroller),
    reason: opts.reason
  });
  return target;
}
if (typeof window !== "undefined") {
  try {
    const w = window;
    if (!isDisplayWindow()) {
      w.__tpScrollWrite = {
        scrollTo(top) {
          applyCanonicalScrollTop(top, { reason: "writer:scrollTo", source: "scroll-writer" });
        },
        scrollBy(delta) {
          const sc = resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
          const cur = sc ? sc.scrollTop || 0 : 0;
          applyCanonicalScrollTop(cur + (Number(delta) || 0), { reason: "writer:scrollBy", source: "scroll-writer" });
        }
      };
    }
  } catch {
  }
}
if (typeof window !== "undefined") {
  try {
    if (!scrollEventTrackerInstalled) {
      const handler = (event) => {
        if (!shouldLogScrollWrite()) return;
        const target = event.target;
        if (!target) return;
        try {
          console.info("[SCROLL_EVENT]", {
            scrollTop: Math.round(target.scrollTop || 0),
            tpLastWriter: target.dataset.tpLastWriter ?? null,
            isTrusted: event.isTrusted,
            scroller: describeElement(target)
          });
        } catch {
        }
      };
      window.addEventListener("scroll", handler, { capture: true, passive: true });
      scrollEventTrackerInstalled = true;
    }
  } catch {
  }
}

// src/features/asr-mode.ts
var ASR_MAX_VISUAL_LEAP = 3;
var asrDisplayIndex = 0;
var RESCUE_JUMPS_ENABLED = false;
var asrDebugState = { config: null };
var ASR_DEBUG_NOISY_THROTTLE_MS = 750;
var ASR_DEBUG_NOISY_LABELS = /* @__PURE__ */ new Set([
  "[ASR cfg]",
  "[ASR event]",
  "[ASR threshold] (mode-side diagnostic; not driver scorer)"
]);
var asrDebugLastAt = /* @__PURE__ */ new Map();
var ASR_DEBUG_TEXT_PREVIEW_MAX = 96;
function summarizeDebugText(value) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  const preview = text.length > ASR_DEBUG_TEXT_PREVIEW_MAX ? `${text.slice(0, ASR_DEBUG_TEXT_PREVIEW_MAX)}...` : text;
  return {
    length: text.length,
    tokens: text ? text.split(/\s+/).filter(Boolean).length : 0,
    preview
  };
}
function updateAsrDebugConfig(state2) {
  const snapshot = {
    engine: state2.engine,
    lang: state2.lang,
    useInterimResults: state2.interim,
    filterFillers: state2.fillerFilter,
    threshold: state2.threshold,
    endpointingMs: state2.endpointingMs,
    timestamp: Date.now()
  };
  asrDebugState.config = snapshot;
  return snapshot;
}
function dumpAsrDebugConfig() {
  const cfg = asrDebugState.config;
  if (cfg) {
    try {
      console.table(cfg);
    } catch {
    }
  }
  return cfg;
}
if (typeof window !== "undefined") {
  const win = window;
  if (!win.__tpAsrDebug) {
    win.__tpAsrDebug = { dump: dumpAsrDebugConfig };
  }
}
function isTpDevMode() {
  if (typeof window === "undefined") return false;
  try {
    const win = window;
    const params = new URLSearchParams(win.location.search || "");
    if (params.has("dev")) return true;
    const hash = (win.location.hash || "").replace(/^#/, "").toLowerCase();
    if (hash === "dev" || hash === "dev=1" || hash.includes("dev=1")) return true;
    if (win.__TP_DEV || win.__TP_DEV1 || win.__tpDevMode) return true;
    if (win?.localStorage?.getItem("tp_dev_mode") === "1") return true;
  } catch {
    return false;
  }
  return false;
}
function logAsrDebug(label, data) {
  if (!isTpDevMode()) return;
  const key = String(label || "");
  const throttleMs = ASR_DEBUG_NOISY_LABELS.has(key) ? ASR_DEBUG_NOISY_THROTTLE_MS : 0;
  if (throttleMs > 0) {
    const now = Date.now();
    const last = asrDebugLastAt.get(key) ?? 0;
    if (now - last < throttleMs) return;
    asrDebugLastAt.set(key, now);
  }
  try {
    console.log(label, data);
  } catch {
  }
}
function logAsrEndpoint(action, detail) {
  if (!isTpDevMode()) return;
  try {
    const { endpointingMs } = getSpeechStore().get();
    const scrollState = window.__tpAsrScrollState;
    console.log("[ASR endpoint]", { action, endpointMs: endpointingMs, scroll: scrollState, ...detail });
  } catch {
  }
}
var AsrMode = class {
  engine = null;
  state = "idle";
  opts;
  currentIdx = 0;
  rescueCount = 0;
  lastAdvanceAt = 0;
  PROGRESS_TIMEOUT_MS = 8e3;
  progressWatchTimer = null;
  // ASR feed-forward: track reading speed to lead the target
  tokensPerSec = 0;
  lastPartialTs = 0;
  lastPartialTokens = 0;
  // Transcript event throttling
  lastTxAt = 0;
  TX_MIN_INTERVAL_MS = 90;
  // ~10–12 Hz max
  constructor(opts) {
    this.opts = {
      rootSelector: opts?.rootSelector ?? "#script, #scriptRoot, body",
      lineSelector: opts?.lineSelector ?? ".line, p",
      markerOffsetPx: opts?.markerOffsetPx ?? 140,
      windowSize: opts?.windowSize ?? 6
    };
  }
  getState() {
    return this.state;
  }
  async setEnabled(enabled) {
    if (enabled) {
      if (this.state === "idle") await this.start();
    } else {
      if (this.state !== "idle") await this.stop();
    }
  }
  async start() {
    const s = getSpeechStore().get();
    const cfgSnapshot = updateAsrDebugConfig(s);
    logAsrDebug("[ASR session start cfg]", cfgSnapshot);
    this.engine = createEngine(s.engine);
    bindEngine(this.engine, (e) => this.onEngineEvent(e));
    this.currentIdx = clamp2(this.currentIdx, 0, this.getAllLineEls().length - 1);
    asrDisplayIndex = this.currentIdx;
    this.setState("ready");
    const endpointingMs = Math.max(1400, s.endpointingMs);
    const effectiveInterim = true;
    if (effectiveInterim !== s.interim) {
      logAsrDebug("[ASR interim override]", {
        configured: s.interim,
        effective: effectiveInterim,
        reason: "live-responsiveness"
      });
    }
    await this.engine.start({
      lang: s.lang,
      interim: effectiveInterim,
      endpointingMs,
      profanityFilter: false
    });
    logAsrEndpoint("ARM", { state: this.state });
  }
  async stop() {
    logAsrEndpoint("STOP", { state: this.state, reason: "manual-stop", scope: "session-stop" });
    await this.engine?.stop();
    this.setState("idle", "manual-stop");
  }
  onEngineEvent(e) {
    if (e.type === "ready") this.setState("ready");
    if (e.type === "listening") this.setState("listening");
    if (e.type === "partial" || e.type === "final") {
      if (this.state !== "running") this.setState("running");
      const text = this.prepareText(e.text);
      const isFinal = e.type === "final";
      const confidence = e.confidence ?? (isFinal ? 1 : 0.5);
      this.emitTranscript({
        text,
        confidence,
        partial: !isFinal,
        final: isFinal,
        lineIndex: isFinal ? this.currentIdx : void 0
      });
      if (e.type === "partial") {
        const now = performance.now();
        const tokens = text.split(/\s+/).filter(Boolean).length;
        if (this.lastPartialTs) {
          const dtSec = (now - this.lastPartialTs) / 1e3;
          if (dtSec > 0 && tokens > this.lastPartialTokens) {
            const rate = (tokens - this.lastPartialTokens) / dtSec;
            this.tokensPerSec = 0.8 * this.tokensPerSec + 0.2 * rate;
          }
        }
        this.lastPartialTs = now;
        this.lastPartialTokens = tokens;
      }
      this.tryAdvance(text, isFinal, confidence);
    }
    if (e.type === "error") {
      this.setState("error", e.message);
      this.dispatch("asr:error", { code: e.code, message: e.message });
    }
    if (e.type === "stopped") {
      this.setState("idle");
    }
  }
  setState(next, reason) {
    this.state = next;
    this.dispatch("asr:state", { state: next, reason });
    this.emitAsrState(next, reason);
    if (next === "running") {
      this.lastAdvanceAt = performance.now();
      this.startProgressWatchdog();
    } else {
      this.stopProgressWatchdog();
      asrDisplayIndex = 0;
    }
  }
  prepareText(s) {
    const st = getSpeechStore().get();
    const normalized = normalizeText(s);
    const filtered = st.fillerFilter ? stripFillers(s) : normalized;
    if (st.fillerFilter && filtered !== normalized) {
      logAsrDebug("[ASR fillers]", { raw: normalized, filtered });
    }
    return filtered;
  }
  /**
   * Gate: only emit transcript events in dev OR when explicitly enabled in Settings
   */
  shouldEmitTx() {
    return true;
  }
  /**
   * Emit transcript event with throttling for partials
   */
  emitTranscript(detail) {
    if (!this.shouldEmitTx()) return;
    const currentState = getSpeechStore().get();
    const textSummary = summarizeDebugText(detail.text);
    logAsrDebug("[ASR cfg]", { useInterimResults: currentState.interim });
    logAsrDebug("[ASR event]", {
      final: detail.final,
      partial: detail.partial,
      len: textSummary.length,
      tokens: textSummary.tokens,
      preview: textSummary.preview
    });
    const now = performance.now();
    if (now - this.lastTxAt < this.TX_MIN_INTERVAL_MS && !detail.final) return;
    this.lastTxAt = now;
    const payload = { ...detail, timestamp: now };
    emit("tp:captions:transcript", payload);
    emit("tp:speech:transcript", payload);
  }
  /**
   * Emit ASR state change event
   */
  emitAsrState(state2, reason) {
    if (!this.shouldEmitTx()) return;
    const payload = { state: state2, reason, timestamp: performance.now() };
    emit("tp:captions:state", payload);
    emit("tp:speech:state", payload);
  }
  tryAdvance(hyp, isFinal, confidence) {
    const { lines, idx0 } = this.getWindow();
    const threshold = getSpeechStore().get().threshold;
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
      const coverage = coverageScore(lines[i], hyp);
      const score = coverage * confidence;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    logAsrDebug("[ASR threshold] (mode-side diagnostic; not driver scorer)", {
      threshold,
      bestScore,
      bestIdx,
      accepted: bestScore >= threshold,
      idx0,
      isFinal
    });
    if (bestIdx >= 0 && bestScore >= threshold) {
      let newIdx = idx0 + bestIdx;
      const leadLines = this.getReadingLeadLines();
      if (leadLines > 0) {
        newIdx = Math.min(newIdx + leadLines, this.getAllLineEls().length - 1);
      }
      if (newIdx >= this.currentIdx) {
        this.currentIdx = newIdx;
        this.markAdvance();
        const blockIdx = this.resolveBlockIdxFromLine(newIdx);
        if (blockIdx != null) {
          emitScrollIntent({
            source: "asr",
            kind: "seek_block",
            target: { blockIdx, lineIdx: newIdx },
            confidence: bestScore,
            ts: Date.now(),
            reason: isFinal ? "asr_match_final" : "asr_match_interim"
          });
        }
        this.dispatch("asr:advance", { index: newIdx, score: bestScore, lead: leadLines });
      }
    } else if (isFinal) {
      this.rescueCount++;
      if (this.rescueCount <= 2) {
        const rescueIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
        this.dispatch("asr:rescue", { index: rescueIdx, reason: "weak-final" });
        if (RESCUE_JUMPS_ENABLED) {
          this.currentIdx = rescueIdx;
          this.markAdvance();
          const blockIdx = this.resolveBlockIdxFromLine(this.currentIdx);
          if (blockIdx != null) {
            emitScrollIntent({
              source: "asr",
              kind: "seek_block",
              target: { blockIdx, lineIdx: this.currentIdx },
              confidence: 0,
              ts: Date.now(),
              reason: "asr_rescue"
            });
          }
        }
      }
    }
  }
  /**
   * Calculate reading lead in lines based on current token rate
   * @returns Number of lines to lead (0-3)
   */
  getReadingLeadLines() {
    const linesPerSec = this.tokensPerSec / 8;
    return Math.max(0, Math.min(3, Math.round(linesPerSec * 0.6)));
  }
  getWindow() {
    const els = this.getAllLineEls();
    const start = clamp2(this.currentIdx, 0, Math.max(0, els.length - 1));
    const end = clamp2(start + this.opts.windowSize, 0, els.length);
    const texts = els.slice(start, end).map((el) => normalizeText(el.textContent || ""));
    return { lines: texts, idx0: start };
  }
  getAllLineEls() {
    const root = document.querySelector(this.opts.rootSelector) || document.body;
    const list = Array.from(root.querySelectorAll(this.opts.lineSelector));
    return list.length ? list : Array.from(document.querySelectorAll(".line, p"));
  }
  scrollToLine(idx) {
    const els = this.getAllLineEls();
    const target = els[idx];
    if (!target) return;
    try {
      const ov = document.getElementById("countOverlay");
      if (ov) {
        const cs = getComputedStyle(ov);
        const visible = cs.display !== "none" && cs.visibility !== "hidden" && !ov.classList.contains("hidden");
        if (visible) return;
      }
    } catch {
    }
    const scroller = findScroller(target);
    const marker = this.opts.markerOffsetPx;
    const top = elementTopRelativeTo(target, scroller) - marker;
    requestAnimationFrame(() => {
      if (!scroller) return;
      applyCanonicalScrollTop(top, {
        scroller,
        reason: "asr-mode-scroll",
        source: "asr-mode"
      });
      markProgrammaticScroll(scroller);
    });
  }
  markAdvance() {
    this.lastAdvanceAt = performance.now();
  }
  scrollWithClamp(targetIdx) {
    if (!Number.isFinite(targetIdx)) return;
    if (asrDisplayIndex === 0) {
      asrDisplayIndex = targetIdx;
    }
    const diff = targetIdx - asrDisplayIndex;
    const clampedDiff = clamp2(diff, -ASR_MAX_VISUAL_LEAP, ASR_MAX_VISUAL_LEAP);
    asrDisplayIndex += clampedDiff;
    this.scrollToLine(Math.round(asrDisplayIndex));
  }
  resolveBlockIdxFromLine(lineIdx) {
    const els = this.getAllLineEls();
    const target = els[lineIdx];
    if (!target) return null;
    const blockEl = target.closest(".tp-asr-block");
    const raw = blockEl?.dataset?.tpBlock;
    const idx = Number(raw);
    return Number.isFinite(idx) ? idx : null;
  }
  startProgressWatchdog() {
    if (this.progressWatchTimer != null) return;
    const loop = () => {
      if (this.state !== "running") {
        this.progressWatchTimer = null;
        return;
      }
      const idleFor = performance.now() - this.lastAdvanceAt;
      if (idleFor > this.PROGRESS_TIMEOUT_MS) {
        this.progressWatchTimer = null;
        try {
          this.engine?.stop();
        } catch {
        }
        this.dispatch("asr:warning", { type: "no-progress", idleMs: idleFor });
        this.setState("idle", "timeout");
        return;
      }
      this.progressWatchTimer = window.setTimeout(loop, 1e3);
    };
    this.progressWatchTimer = window.setTimeout(loop, 1e3);
  }
  stopProgressWatchdog() {
    if (this.progressWatchTimer != null) {
      window.clearTimeout(this.progressWatchTimer);
      this.progressWatchTimer = null;
    }
  }
  dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
};
function createEngine(name) {
  switch (name) {
    case "webspeech":
      return new WebSpeechEngine();
    case "vosk":
      throw new Error("Vosk WASM engine not implemented yet");
    case "whisper":
      throw new Error("Whisper bridge engine not implemented yet");
  }
}
function bindEngine(engine, fn) {
  try {
    engine.on(fn);
  } catch {
  }
}
function clamp2(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function coverageScore(line, hyp) {
  const A = new Set(line.split(" ").filter(Boolean));
  const B = new Set(hyp.split(" ").filter(Boolean));
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  if (!A.size) return 0;
  return inter / A.size;
}
function findScroller(_el) {
  return getScrollerEl("main") || getScrollerEl("display");
}
function elementTopRelativeTo(el, scroller) {
  if (!scroller) return el.offsetTop || 0;
  const r1 = el.getBoundingClientRect();
  const r2 = scroller.getBoundingClientRect();
  const scrollTop = scroller.scrollTop;
  return r1.top - r2.top + scrollTop;
}
function markProgrammaticScroll(scroller) {
  if (!scroller) return;
  const at = Date.now();
  const y = Number(scroller.scrollTop || 0);
  try {
    scroller.dataset.tpLastWriter = "asr-mode";
  } catch {
  }
  try {
    window.__tpLastWriter = { from: "asr-mode", at, y };
  } catch {
  }
}

// src/index-hooks/asr.ts
var asrFeatureInitialized = false;
var asrTopbarMounted = false;
var legacyShimWarned = false;
var legacyOverrideWarned = false;
var ASR_INIT_IMPL_PROOF_VERSION = "asr.ts 2026-05-18b";
function allowLegacyAsrModeRuntime() {
  if (typeof window === "undefined") return false;
  try {
    if (window.__tpAllowLegacyAsrMode === true) return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("legacyAsrMode") === "1") return true;
  } catch {
  }
  return false;
}
function isSpeechLoaderShim(value) {
  return !!value && typeof value.setEnabled === "function" && value.__tpLegacyShim === true;
}
function shouldEmitAsrInitProof() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.__asrLogBufferInstalled) return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("dev") === "1" || params.get("asr_log_buffer") === "1") return true;
  } catch {
  }
  try {
    if (window.localStorage?.getItem("tp_dev_mode") === "1") return true;
    if (window.localStorage?.getItem("asr_log_buffer") === "1") return true;
  } catch {
  }
  return false;
}
function ensureLegacyAsrModeShim() {
  const existing = window.__tpAsrMode;
  if (isSpeechLoaderShim(existing)) {
    return existing;
  }
  const allowLegacy = allowLegacyAsrModeRuntime();
  if (allowLegacy && existing && typeof existing.setEnabled === "function") {
    return existing;
  }
  if (existing && typeof existing.stop === "function") {
    try {
      void existing.stop();
    } catch {
    }
  }
  const shim = {
    __tpLegacyShim: true,
    async setEnabled(_enabled) {
      if (!window.__tpDevMode || legacyShimWarned) return;
      legacyShimWarned = true;
      try {
        console.info("[ASR] legacy __tpAsrMode shim active; speech-loader owns ASR runtime");
      } catch {
      }
    },
    async start() {
    },
    async stop() {
    }
  };
  if (existing && !allowLegacy && typeof existing.setEnabled === "function" && !legacyOverrideWarned) {
    legacyOverrideWarned = true;
    try {
      console.warn("[ASR] overriding non-shim __tpAsrMode (speech-loader owns runtime). Use ?legacyAsrMode=1 to allow legacy mode runtime.");
    } catch {
    }
  }
  window.__tpAsrMode = shim;
  return shim;
}
function mountAsrTopbarOnce(modeShim) {
  if (asrTopbarMounted) return;
  asrTopbarMounted = true;
  try {
    new AsrTopbar(modeShim).mount("#topbarRight, .topbar, header, body");
  } catch {
  }
}
function initAsrFeature() {
  if (asrFeatureInitialized) return;
  asrFeatureInitialized = true;
  try {
    const flagState = resolveAsrChairpersonFlagState();
    const importMetaEnv = readAsrChairpersonImportMetaEnvSnapshot();
    console.info(
      buildAsrChairpersonFlagProofDiagnostic({
        rawHref: flagState.rawHref,
        rawSearch: flagState.rawSearch,
        parsedQueryParams: flagState.parsedQueryParams,
        rawChairpersonValue: flagState.rawChairpersonValue,
        rawOwnerValue: flagState.rawOwnerValue,
        resolvedShadowEnabled: flagState.resolvedShadowEnabled,
        resolvedOwnerEnabled: flagState.resolvedOwnerEnabled,
        ownerFlagSource: flagState.ownerFlagSource,
        ownerDisabledReason: flagState.ownerDisabledReason,
        devFlagReaderAvailable: flagState.devFlagReaderAvailable,
        flagEvaluationLocation: "app_boot",
        driverCreationTimeFlagState: "not_created",
        liveTickFlagState: summarizeChairpersonFlagState(flagState),
        importMetaDev: importMetaEnv.dev,
        importMetaMode: importMetaEnv.mode,
        ownerFlagReadFrom: flagState.ownerFlagReadFrom
      })
    );
  } catch {
  }
  if (typeof window !== "undefined" && shouldEmitAsrInitProof()) {
    window.__ASR_INIT_IMPL__ = ASR_INIT_IMPL_PROOF_VERSION;
    window.__ASR_DIAGNOSTIC_PROOF__ = {
      buildStamp: String(window.__TP_BUILD_STAMP || "unknown"),
      delayedAutopsyBuilderPresent: true,
      deadScreenAutopsyBuilderPresent: true,
      dumpPathProofPresent: true,
      delayedAutopsyVersion: ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
      deadScreenAutopsyVersion: ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
      initImpl: ASR_INIT_IMPL_PROOF_VERSION
    };
    try {
      console.warn(`[ASR_INIT_IMPL] ${ASR_INIT_IMPL_PROOF_VERSION}`);
    } catch {
    }
  }
  try {
    installAsrLogBuffer();
  } catch {
  }
  try {
    window.__ASR_DIAGNOSTIC_PROOF__ = {
      buildStamp: String(window.__TP_BUILD_STAMP || "unknown"),
      delayedAutopsyBuilderPresent: true,
      deadScreenAutopsyBuilderPresent: true,
      dumpPathProofPresent: true,
      delayedAutopsyVersion: ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
      deadScreenAutopsyVersion: ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
      initImpl: ASR_INIT_IMPL_PROOF_VERSION
    };
  } catch {
  }
  ensureAsrSettingsWired(document.getElementById("settingsBody") || document);
  installAsrHotkeys();
  const modeShim = ensureLegacyAsrModeShim();
  mountAsrTopbarOnce(modeShim);
}
export {
  AsrMode,
  initAsrFeature
};
