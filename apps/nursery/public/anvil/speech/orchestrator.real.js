var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/ui/typography-ssot.ts
var DEFAULT_SCRIPT_FONT_PX = 40;

// src/speech/asrSync.ts
var MAX_ERR_ABS = 2400;
var cachedPxPerLine = 0;
var cachedAt = 0;
var CACHE_TTL_MS = 5e3;
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
function measurePxPerLine() {
  if (typeof window === "undefined") return DEFAULT_SCRIPT_FONT_PX * 1.4;
  try {
    const doc = document.documentElement;
    const cs = getComputedStyle(doc);
    const fs = parseFloat(cs.getPropertyValue("--tp-font-size")) || DEFAULT_SCRIPT_FONT_PX;
    const lh = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
    return fs * lh;
  } catch {
    return DEFAULT_SCRIPT_FONT_PX * 1.4;
  }
}
function pxPerLine() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!cachedPxPerLine || now - cachedAt > CACHE_TTL_MS) {
    cachedPxPerLine = measurePxPerLine();
    cachedAt = now;
  }
  return cachedPxPerLine;
}
function emitAsrSync(errPx, confidence) {
  if (typeof window === "undefined") return;
  const value = Number(errPx);
  if (!Number.isFinite(value) || value === 0) return;
  const detail = {
    errPx: clamp(value, -MAX_ERR_ABS, MAX_ERR_ABS),
    conf: clamp(Number.isFinite(confidence ?? 1) ? Number(confidence) : 1, 0, 1)
  };
  try {
    window.dispatchEvent(new CustomEvent("tp:asr:sync", { detail }));
  } catch {
  }
}
function emitAsrSyncFromLineDelta(deltaLines, confidence) {
  const px = Number(deltaLines) * pxPerLine();
  if (!Number.isFinite(px)) return;
  emitAsrSync(px, confidence);
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

// src/speech/matcher-input.ts
var MATCH_TOKEN_WINDOW = 28;
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

// src/speech/recognizer.ts
var IS_DEV_MODE = (() => {
  try {
    const win = typeof window !== "undefined" ? window : void 0;
    const loc = win?.location;
    if (loc) {
      const params = new URLSearchParams(loc.search || "");
      if (params.has("dev")) return true;
      const hash = (loc.hash || "").replace(/^#/, "").toLowerCase();
      if (hash === "dev" || hash === "dev=1" || hash.includes("dev=1")) return true;
    }
    if (win && win.__TP_DEV) return true;
    if (win?.localStorage?.getItem("tp_dev_mode") === "1") return true;
  } catch {
  }
  return false;
})();
var Recognizer = class {
  constructor(opts = {}) {
    __publicField(this, "recog", null);
    __publicField(this, "cb", null);
    __publicField(this, "opts");
    __publicField(this, "_lastInterimAt", 0);
    __publicField(this, "shouldRun", false);
    __publicField(this, "acceptEvents", false);
    __publicField(this, "generation", 0);
    __publicField(this, "restartTimer", null);
    __publicField(this, "restartBackoffMs", 250);
    __publicField(this, "restartBackoffMaxMs", 1e3);
    this.opts = Object.assign({ lang: "en-US", interimIntervalMs: 150, maxAlternatives: 2 }, opts);
  }
  logSpeechError(ev) {
    if (!IS_DEV_MODE) return;
    try {
      console.log("[speech] error", ev);
    } catch {
    }
  }
  clearRestartTimer() {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
  bumpRestartBackoff() {
    this.restartBackoffMs = Math.min(this.restartBackoffMaxMs, this.restartBackoffMs * 2);
  }
  resetRestartBackoff() {
    this.restartBackoffMs = 250;
  }
  scheduleRestart(delayMs, opts = {}) {
    if (!this.shouldRun) return;
    if (!this.recog || typeof this.recog.start !== "function") return;
    const recognition = this.recog;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.shouldRun) return;
      if (opts.stopFirst) {
        try {
          recognition.stop?.();
        } catch {
        }
      }
      try {
        recognition.start?.();
      } catch (err) {
        try {
          console.warn("[speech] restart failed", err);
        } catch {
        }
      }
    }, delayMs);
  }
  available() {
    return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  }
  start(cb) {
    this.cb = cb;
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SR) throw new Error("SpeechRecognition not available");
    try {
      this.recog = new SR();
      try {
        if (typeof window !== "undefined") {
          window.recog = this.recog;
          window.__tpRecognizer = this.recog;
        }
      } catch {
      }
      this.shouldRun = true;
      this.acceptEvents = true;
      const runGeneration = ++this.generation;
      this.clearRestartTimer();
      this.recog.continuous = true;
      this.recog.interimResults = true;
      this.recog.lang = this.opts.lang;
      try {
        this.recog.maxAlternatives = Math.max(2, this.recog.maxAlternatives || 0, this.opts.maxAlternatives || 2);
      } catch {
      }
      const shouldHandle = () => this.acceptEvents && runGeneration === this.generation;
      this.recog.onstart = () => {
        if (IS_DEV_MODE) {
          try {
            console.debug("[speech] onstart");
          } catch {
          }
        }
        this.resetRestartBackoff();
      };
      this.recog.onerror = (ev) => {
        if (!shouldHandle()) return;
        this.logSpeechError(ev);
        if (!this.shouldRun) return;
        const code = ev?.error;
        const restartable = code === "network" || code === "no-speech" || code === "audio-capture" || code === "aborted";
        if (!restartable) return;
        this.clearRestartTimer();
        const delay = this.restartBackoffMs;
        this.scheduleRestart(delay, { stopFirst: true });
        this.bumpRestartBackoff();
      };
      this.recog.onend = () => {
        if (!shouldHandle()) return;
        if (IS_DEV_MODE) {
          try {
            console.debug("[speech] onend");
          } catch {
          }
        }
        if (!this.shouldRun) return;
        if (this.restartTimer !== null) return;
        const delay = this.restartBackoffMs;
        this.scheduleRestart(delay);
        this.bumpRestartBackoff();
      };
      this.recog.onresult = (e) => {
        if (!shouldHandle()) return;
        if (IS_DEV_MODE) {
          try {
            const first = e?.results?.[e.resultIndex]?.[0]?.transcript || "";
            const finals2 = Array.from(e?.results || []).filter((res) => res.isFinal).map((res) => res[0]?.transcript || "").join(" ");
            const interim2 = Array.from(e?.results || []).filter((res) => !res.isFinal).map((res) => res[0]?.transcript || "").join(" ");
            console.debug("[speech] onresult", { interim: interim2.trim(), finals: finals2.trim(), first: (first || "").trim() });
          } catch {
          }
        }
        let interim = "";
        let finals = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals += (r[0]?.transcript || "") + " ";
          else interim += (r[0]?.transcript || "") + " ";
        }
        if (finals && this.cb) this.cb(finals.trim(), true);
        const now = performance.now();
        if (interim && now - this._lastInterimAt > (this.opts.interimIntervalMs || 150)) {
          this._lastInterimAt = now;
          if (this.cb) this.cb(interim.trim(), false);
        }
        this.resetRestartBackoff();
      };
      try {
        console.debug("[ASR] recognizer.start() about to run");
        this.recog.start();
        console.debug("[ASR] recognizer.start() returned");
      } catch (e) {
        console.error("[ASR] recognizer.start() threw", e);
        this.logSpeechError(e);
      }
    } catch (err) {
      this.shouldRun = false;
      this.clearRestartTimer();
      this.acceptEvents = false;
      this.generation++;
      this.recog = null;
      throw err;
    }
  }
  stop() {
    try {
      this.shouldRun = false;
      this.acceptEvents = false;
      this.generation++;
      this.clearRestartTimer();
      if (this.recog) {
        try {
          this.recog.onresult = null;
          this.recog.onerror = null;
          this.recog.onend = null;
        } catch {
        }
        try {
          this.recog.abort?.();
        } catch {
        }
        try {
          this.recog.stop();
        } catch {
        }
      }
    } finally {
      this.recog = null;
      this.cb = null;
    }
  }
};
function createRecognizer(opts) {
  return new Recognizer(opts);
}

// src/asr/asr-thresholds.ts
var DEFAULT_ASR_THRESHOLDS = {
  candidateMinSim: 0.25,
  commitFinalMinSim: 0.22,
  commitInterimMinSim: 0.18,
  stickinessDelta: 0.08,
  interimStreakNeeded: 2,
  maxJumpsPerSecond: 4,
  tieDelta: 0.05,
  anchorMinSim: 0.7,
  maxAnchorJumpLines: 60,
  anchorStreakNeeded: 2,
  maxLinesPerCommit: 1.4,
  deltaSmoothingFactor: 0.34,
  taperExponent: 2,
  taperMin: 0.2,
  glideMinMs: 120,
  glideMaxMs: 250,
  glideDefaultMs: 180,
  microDeltaLineRatio: 0.8,
  microPursuitMs: 320,
  microPursuitMaxPxPerSec: 60,
  minPursuitPxPerSec: 18
};
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function normalizeThresholds(thresholds) {
  const glideMinMs = Math.max(50, Math.floor(thresholds.glideMinMs || DEFAULT_ASR_THRESHOLDS.glideMinMs));
  const glideMaxMs = Math.max(glideMinMs, Math.floor(thresholds.glideMaxMs || DEFAULT_ASR_THRESHOLDS.glideMaxMs));
  const glideDefaultMs = Math.max(
    glideMinMs,
    Math.min(
      glideMaxMs,
      Math.floor(thresholds.glideDefaultMs || DEFAULT_ASR_THRESHOLDS.glideDefaultMs)
    )
  );
  return {
    ...thresholds,
    candidateMinSim: clamp01(thresholds.candidateMinSim),
    commitFinalMinSim: clamp01(thresholds.commitFinalMinSim),
    commitInterimMinSim: clamp01(thresholds.commitInterimMinSim),
    stickinessDelta: clamp01(thresholds.stickinessDelta),
    interimStreakNeeded: Math.max(1, Math.floor(thresholds.interimStreakNeeded || 1)),
    maxJumpsPerSecond: Math.max(1, Math.floor(thresholds.maxJumpsPerSecond || 1)),
    tieDelta: clamp01(thresholds.tieDelta),
    anchorMinSim: clamp01(thresholds.anchorMinSim),
    maxAnchorJumpLines: Math.max(1, Math.floor(thresholds.maxAnchorJumpLines || 1)),
    anchorStreakNeeded: Math.max(1, Math.floor(thresholds.anchorStreakNeeded || 1)),
    maxLinesPerCommit: Math.max(0.1, Number(thresholds.maxLinesPerCommit || DEFAULT_ASR_THRESHOLDS.maxLinesPerCommit)),
    deltaSmoothingFactor: clamp01(thresholds.deltaSmoothingFactor),
    taperExponent: Math.max(0.5, Math.min(5, Number(thresholds.taperExponent || DEFAULT_ASR_THRESHOLDS.taperExponent))),
    taperMin: clamp01(thresholds.taperMin),
    glideMinMs,
    glideMaxMs,
    glideDefaultMs,
    microDeltaLineRatio: Math.max(0.1, Math.min(2, Number(thresholds.microDeltaLineRatio || DEFAULT_ASR_THRESHOLDS.microDeltaLineRatio))),
    microPursuitMs: Math.max(100, Math.min(800, Math.floor(thresholds.microPursuitMs || DEFAULT_ASR_THRESHOLDS.microPursuitMs))),
    microPursuitMaxPxPerSec: Math.max(5, Math.min(400, Number(thresholds.microPursuitMaxPxPerSec || DEFAULT_ASR_THRESHOLDS.microPursuitMaxPxPerSec))),
    minPursuitPxPerSec: Math.max(0, Math.min(200, Number(thresholds.minPursuitPxPerSec || DEFAULT_ASR_THRESHOLDS.minPursuitPxPerSec)))
  };
}

// src/dev/dev-thresholds.ts
var STORAGE_KEY = "tp_asr_thresholds_v1";
function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function loadDevAsrThresholds() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return normalizeThresholds({ ...DEFAULT_ASR_THRESHOLDS, ...parsed });
  } catch {
    return null;
  }
}

// src/asr/asr-threshold-store.ts
var THRESHOLD_EVENT = "tp:asr:thresholds";
var baseThresholds = normalizeThresholds({ ...DEFAULT_ASR_THRESHOLDS });
var driverThresholds = baseThresholds;
var thresholdsDirty = false;
function broadcastThresholdUpdate() {
  if (typeof window === "undefined") return;
  try {
    const payload = driverThresholds;
    window.dispatchEvent(new CustomEvent(THRESHOLD_EVENT, { detail: payload }));
  } catch {
  }
}
function computeEffectiveThresholds() {
  return normalizeThresholds({ ...baseThresholds });
}
function refreshEffectiveThresholds(force = false) {
  if (!force && thresholdsDirty) return;
  driverThresholds = computeEffectiveThresholds();
  broadcastThresholdUpdate();
}
function applyDevOverrides() {
  const overrides = loadDevAsrThresholds();
  if (!overrides) return;
  baseThresholds = normalizeThresholds({ ...baseThresholds, ...overrides });
}
applyDevOverrides();
refreshEffectiveThresholds();
function getAsrDriverThresholds() {
  return driverThresholds;
}

// src/ui/speaker-profiles-store.ts
var STORAGE_KEY2 = "tp_speaker_profiles_v1";
var BINDING_EVENT = "tp:speaker:bindings";
var ACTIVE_SPEAKER_EVENT = "tp:speaker:active";
var DEFAULT_PROFILES = [
  { id: "default-s1", name: "Default S1", system: true },
  { id: "default-s2", name: "Default S2", system: true }
];
var DEFAULT_BINDINGS = {
  s1: "default-s1",
  s2: "default-s2",
  g1: null,
  g2: null
};
var DEFAULT_ACTIVE_SLOT = "s1";
var VALID_SLOTS = ["s1", "s2", "g1", "g2"];
var subscribers = /* @__PURE__ */ new Set();
var activeSubscribers = /* @__PURE__ */ new Set();
function normalizeSlot(slot) {
  if (typeof slot !== "string") return DEFAULT_ACTIVE_SLOT;
  if (VALID_SLOTS.includes(slot)) return slot;
  return DEFAULT_ACTIVE_SLOT;
}
function normalizeBindings(raw) {
  const out = { ...DEFAULT_BINDINGS };
  if (!raw || typeof raw !== "object") return out;
  for (const slot of VALID_SLOTS) {
    if (Object.prototype.hasOwnProperty.call(raw, slot)) {
      out[slot] = raw[slot] ?? null;
    }
  }
  return out;
}
function readStorage() {
  if (typeof window === "undefined") {
    return {
      profiles: [...DEFAULT_PROFILES],
      bindings: { ...DEFAULT_BINDINGS },
      activeSlot: DEFAULT_ACTIVE_SLOT
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY2);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    const bindings = normalizeBindings(parsed?.bindings);
    const activeSlot = normalizeSlot(parsed?.activeSlot);
    return {
      profiles,
      bindings: {
        ...DEFAULT_BINDINGS,
        ...bindings
      },
      activeSlot
    };
  } catch {
    return {
      profiles: [...DEFAULT_PROFILES],
      bindings: { ...DEFAULT_BINDINGS },
      activeSlot: DEFAULT_ACTIVE_SLOT
    };
  }
}
function writeStorage(state2) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY2, JSON.stringify(state2));
  } catch {
  }
}
function getProfileSummaries() {
  return state.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name
  }));
}
function notifyBindings() {
  const bindings = getSpeakerBindings();
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(BINDING_EVENT, { detail: { bindings, profiles: getProfileSummaries() } })
      );
    }
  } catch {
  }
  try {
    window?.sendToDisplay?.({
      type: "speaker-bindings",
      bindings,
      profiles: getProfileSummaries(),
      activeSlot: state.activeSlot
    });
  } catch {
  }
  subscribers.forEach((cb) => {
    try {
      cb(bindings);
    } catch {
    }
  });
}
function notifyActiveSpeaker() {
  const slot = getActiveSpeakerSlot();
  const bindings = getSpeakerBindings();
  const profile = getProfileById(bindings[slot] || null);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ACTIVE_SPEAKER_EVENT, {
        detail: {
          slot,
          profileId: profile?.id ?? null,
          profileName: profile?.name ?? ""
        }
      }));
    }
  } catch {
  }
  try {
    window?.sendToDisplay?.({
      type: "speaker-active",
      slot,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? ""
    });
  } catch {
  }
  activeSubscribers.forEach((cb) => {
    try {
      cb(slot);
    } catch {
    }
  });
}
var state = readStorage();
writeStorage(state);
notifyBindings();
notifyActiveSpeaker();
function getSpeakerBindings() {
  return { ...state.bindings };
}
function getActiveSpeakerSlot() {
  return state.activeSlot;
}
function getProfileById(id) {
  if (!id) return void 0;
  return state.profiles.find((profile) => profile.id === id);
}
function subscribeSpeakerBindings(fn) {
  subscribers.add(fn);
  fn(getSpeakerBindings());
  return () => subscribers.delete(fn);
}

// src/speech/orchestrator.ts
console.info("[ASR_ORCH] LIVE envelope v2025-12-30b");
var __tpSpeakerBindings = getSpeakerBindings();
subscribeSpeakerBindings((bindings) => {
  try {
    window.__tpSpeakerBindings = bindings;
  } catch {
  }
});
var SILENCE_HOLD_MS = 1200;
var lastAsrWordTs = 0;
var silenceTimer = null;
var silenceActive = true;
function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
function dispatchAsrSilence(silent, ts) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("tp:asr:silence", { detail: { silent, ts } }));
  } catch {
  }
}
function emitSpeechState(running) {
  if (typeof window === "undefined") return;
  try {
    if (window.__tpAllowLegacySpeechStateEvents !== true) return;
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:speech-state", { detail: { running } }));
  } catch {
  }
}
function allowLegacySpeechOrchestratorShim() {
  if (typeof window === "undefined") return false;
  try {
    if (!window.__TP_TS_PRIMARY__) return true;
    if (window.__tpAllowLegacySpeechOrchestrator === true) return true;
    const params = new URLSearchParams(window.location.search || "");
    return params.get("legacySpeechOrchestrator") === "1" || params.get("legacySpeechNs") === "1";
  } catch {
    return false;
  }
}
function setSilenceState(nextSilent, ts) {
  if (silenceActive === nextSilent) return;
  silenceActive = nextSilent;
  dispatchAsrSilence(silenceActive, ts);
}
function scheduleSilenceCheck() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  silenceTimer = setTimeout(() => {
    silenceTimer = null;
    const now = nowMs();
    if (!silenceActive && now - lastAsrWordTs >= SILENCE_HOLD_MS) {
      setSilenceState(true, now);
    }
  }, SILENCE_HOLD_MS);
}
function noteAsrSpeechActivity(text) {
  if (!text || !text.trim()) return;
  const now = nowMs();
  lastAsrWordTs = now;
  if (silenceActive) {
    setSilenceState(false, now);
  }
  scheduleSilenceCheck();
}
if (typeof window !== "undefined") {
  dispatchAsrSilence(true, nowMs());
}
var _rec = null;
var _cb = null;
var MATCH_LOG_THROTTLE_MS = 250;
var lastMatchLogAt = 0;
var matchIdSeq = 0;
var nextMatchId = () => {
  matchIdSeq += 1;
  return `m${Date.now().toString(36)}-${matchIdSeq}`;
};
function isMetaTranscript(text) {
  const input = String(text || "");
  if (!input) return false;
  return stripMatcherMetaPhrases(input) !== input;
}
function simCosine(a, b) {
  try {
    const tok = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);
    const A = tok(a), B = tok(b);
    if (!A.length || !B.length) return 0;
    const tf = (arr) => arr.reduce((m, w) => (m.set(w, (m.get(w) || 0) + 1), m), /* @__PURE__ */ new Map());
    const TA = tf(A), TB = tf(B);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (const [w, v] of TA) {
      na += v * v;
      if (TB.has(w)) dot += v * (TB.get(w) || 0);
    }
    for (const v of TB.values()) nb += v * v;
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
  } catch {
    return 0;
  }
}
function getExpectedLineText() {
  try {
    return window.__tpScript?.currentExpectedText?.();
  } catch {
    return void 0;
  }
}
function isLogEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem("tp_dev_mode") === "1") return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("dev") || params.has("debug")) return true;
  } catch {
  }
  return false;
}
function buildTranscriptEnvelope(text, final, match, currentIdx) {
  try {
    const expected = getExpectedLineText();
    const sim = expected ? simCosine(text, expected) : void 0;
    const hasMatch = !!match && Number.isFinite(match.bestIdx) && Number(match.bestIdx) >= 0;
    const meta = isMetaTranscript(text);
    const base = {
      text,
      final,
      timestamp: Date.now(),
      source: meta ? "meta" : "orchestrator",
      currentIdx: Number.isFinite(currentIdx) ? Math.max(0, Math.floor(currentIdx)) : null
    };
    const payload = hasMatch ? {
      ...match,
      ...base,
      matchId: nextMatchId(),
      noMatch: false,
      sim: Number.isFinite(match?.bestSim) ? match?.bestSim : typeof sim === "number" ? sim : null,
      meta,
      match,
      line: match?.bestIdx ?? null,
      candidates: Array.isArray(match?.topScores) ? match?.topScores : []
    } : {
      matchId: null,
      noMatch: true,
      ...base
    };
    return payload;
  } catch {
  }
  return {
    text,
    final,
    timestamp: Date.now(),
    source: "orchestrator",
    matchId: null,
    noMatch: true,
    currentIdx: Number.isFinite(currentIdx) ? Math.max(0, Math.floor(currentIdx)) : null
  };
}
function dispatchTranscript(env) {
  try {
    if (env.matchId === void 0) {
      console.error("DISPATCH_MISSING_MATCHID", Object.keys(env));
    }
    if (env.noMatch === void 0) {
      console.error("DISPATCH_MISSING_NOMATCH", Object.keys(env));
    }
    if (isLogEnabled()) {
      try {
        console.debug(
          "[ASR] dispatchTranscript keys=",
          Object.keys(env),
          "matchId=",
          env.matchId,
          "noMatch=",
          env.noMatch
        );
      } catch {
      }
    }
    try {
      if (!env.noMatch && env.matchId) {
        const anyEnv = env;
        console.log("[ASR] dispatchMatch", {
          matchId: env.matchId,
          line: Number.isFinite(anyEnv.bestIdx) ? anyEnv.bestIdx : anyEnv.line,
          sim: Number.isFinite(anyEnv.bestSim) ? anyEnv.bestSim : anyEnv.sim
        });
      }
    } catch {
    }
    try {
      console.log("[ASR] dispatchTranscript", env);
    } catch {
    }
    window.dispatchEvent(new CustomEvent("tp:speech:transcript", { detail: env }));
  } catch {
  }
}
function _getRuntimeScriptState(opts) {
  return getMatcherRuntimeState({
    currentIndex: typeof opts?.currentIndex === "number" ? opts.currentIndex : void 0,
    windowBack: opts?.windowBack,
    windowAhead: opts?.windowAhead
  }) || {
    scriptWords: [],
    paraIndex: [],
    vParaIndex: null,
    cfg: {
      MATCH_WINDOW_AHEAD: 240,
      MATCH_WINDOW_BACK: 40,
      SIM_THRESHOLD: 0.46,
      MAX_JUMP_AHEAD_WORDS: 18
    },
    currentIndex: 0,
    viterbiState: null
  };
}
function formatMatchScore(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "?";
}
function formatTopScores(topScores) {
  if (!topScores.length) return "[]";
  return `[${topScores.map((entry) => {
    const idx = Number.isFinite(entry.idx) ? Math.floor(entry.idx) : "?";
    const score = Number.isFinite(entry.score) ? entry.score.toFixed(2) : "?";
    return `${idx}:${score}`;
  }).join(",")}]`;
}
function compactClue(tokens, maxTokens) {
  if (!tokens.length) return "";
  return tokens.slice(Math.max(0, tokens.length - maxTokens)).join(" ").replace(/\s+/g, " ").replace(/"/g, "").trim();
}
function resolveBandRange(currentIndex, paraIndex, vParaIndex, windowBack, windowAhead) {
  const cur = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
  const lastEntry = paraIndex.length ? paraIndex[paraIndex.length - 1] : null;
  const lineCount = vParaIndex ? vParaIndex.length : typeof lastEntry?.line === "number" ? lastEntry.line + 1 : paraIndex.length;
  const safeCount = Math.max(0, lineCount);
  const bandStart = Math.max(0, cur - windowBack);
  const bandEnd = safeCount ? Math.min(safeCount - 1, cur + windowAhead) : 0;
  return { bandStart, bandEnd };
}
function matchBatch2(text, isFinal, opts) {
  try {
    const { spokenTokens, matchTokens } = prepareMatcherInput(text || "", normTokens);
    if (spokenTokens.length) {
      noteAsrSpeechActivity(text);
    }
    const { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState } = _getRuntimeScriptState(opts);
    const res = matchBatch(matchTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState, {
      minTokenOverlap: opts?.minTokenOverlap,
      minTokenLen: opts?.minTokenLen,
      multiLineMaxLines: opts?.multiLineMaxLines,
      multiLineMinLines: opts?.multiLineMinLines
    });
    try {
      const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
      res.currentIdx = curIdx;
    } catch {
    }
    const now = Date.now();
    if (now - lastMatchLogAt >= MATCH_LOG_THROTTLE_MS) {
      lastMatchLogAt = now;
      const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
      const bestIdx = Number.isFinite(res?.bestIdx) ? Math.floor(res.bestIdx) : -1;
      const deltaLines = bestIdx - curIdx;
      const topScores = Array.isArray(res?.topScores) ? res.topScores : [];
      const clue = compactClue(matchTokens, 6);
      const fallbackBand = resolveBandRange(curIdx, paraIndex, vParaIndex, cfg.MATCH_WINDOW_BACK, cfg.MATCH_WINDOW_AHEAD);
      const bandStart = Number.isFinite(res?.bandStart) ? Math.floor(res.bandStart) : fallbackBand.bandStart;
      const bandEnd = Number.isFinite(res?.bandEnd) ? Math.floor(res.bandEnd) : fallbackBand.bandEnd;
      const inBand = bestIdx >= bandStart && bestIdx <= bandEnd;
      const line = [
        "\u{1F9E0} ASR_MATCH",
        `current=${curIdx}`,
        `best=${bestIdx}`,
        `delta=${deltaLines}`,
        `sim=${formatMatchScore(res?.bestSim)}`,
        `top=${formatTopScores(topScores)}`,
        `winBack=${cfg.MATCH_WINDOW_BACK}`,
        `winAhead=${cfg.MATCH_WINDOW_AHEAD}`,
        `bandStart=${bandStart}`,
        `bandEnd=${bandEnd}`,
        `inBand=${inBand ? 1 : 0}`,
        clue ? `clue="${clue}"` : ""
      ].filter(Boolean).join(" ");
      try {
        console.log(line);
      } catch {
      }
      if (!inBand) {
        try {
          console.warn("[ASR] match out of band", {
            current: curIdx,
            best: bestIdx,
            bandStart,
            bandEnd,
            clue
          });
        } catch {
        }
      }
    }
    try {
      const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
      const fallbackBand = resolveBandRange(curIdx, paraIndex, vParaIndex, cfg.MATCH_WINDOW_BACK, cfg.MATCH_WINDOW_AHEAD);
      const bandStart = Number.isFinite(res?.bandStart) ? Math.floor(res.bandStart) : fallbackBand.bandStart;
      const bandEnd = Number.isFinite(res?.bandEnd) ? Math.floor(res.bandEnd) : fallbackBand.bandEnd;
      const bestIdx = Number.isFinite(res?.bestIdx) ? Math.floor(res.bestIdx) : -1;
      const inBand = bestIdx >= bandStart && bestIdx <= bandEnd;
      res.bandStart = bandStart;
      res.bandEnd = bandEnd;
      res.inBand = inBand;
      res.windowBack = cfg.MATCH_WINDOW_BACK;
      res.windowAhead = cfg.MATCH_WINDOW_AHEAD;
      if (!inBand) {
        res.bestIdx = -1;
        res.bestSim = 0;
      }
    } catch {
    }
    try {
      const deltaLines = Number(res.bestIdx) - Number(currentIndex || 0);
      const simScore = Number(res.bestSim);
      const allowSync = Number.isFinite(simScore) && simScore >= cfg.SIM_THRESHOLD;
      if (deltaLines && allowSync) {
        const conf = Math.max(0, Math.min(1, simScore || 0)) * (isFinal ? 1 : 0.6);
        emitAsrSyncFromLineDelta(deltaLines, conf);
      }
    } catch {
    }
    if (_cb) {
      try {
        _cb({ idx: res.bestIdx, sim: res.bestSim, isFinal });
      } catch (e) {
        try {
          console.warn("[TP] speech callback failed", e);
        } catch {
        }
      }
    }
    return res;
  } catch (err) {
    try {
      console.warn("[TP] matchBatch error", err);
    } catch {
    }
    return { bestIdx: -1, bestSim: 0, topScores: [] };
  }
}
function startRecognizer(cb, opts) {
  try {
    console.log("[ASR] startRecognizer invoked with opts:", opts);
  } catch {
  }
  if (_rec) {
    _cb = cb;
    return;
  }
  try {
    _rec = createRecognizer(opts);
    try {
      console.log("[ASR] createRecognizer returned:", _rec ? "ok" : "null");
    } catch {
    }
    _cb = cb;
    if (!_rec) {
      try {
        console.warn("[ASR] startRecognizer: recognizer is null; createRecognizer probably failed");
      } catch {
      }
      return;
    }
    try {
      try {
        console.debug("[ASR] willStartRecognizer", {
          phase: "startRecognizer",
          mode: window.__tpUiScrollMode,
          hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
        });
      } catch {
      }
      console.log("[ASR] calling recognizer.start()");
      _rec.start((transcript, isFinal) => {
        try {
          console.log("[ASR] raw recognizer result", { transcript, isFinal });
        } catch {
        }
        const text = transcript || "";
        const match = matchBatch2(text, isFinal);
        const thresholds = getAsrDriverThresholds();
        const bestSim = Number.isFinite(match?.bestSim) ? match.bestSim : 0;
        const candidateMatch = bestSim >= thresholds.candidateMinSim ? match : void 0;
        const currentIdx = Number.isFinite(match?.currentIdx) ? Math.floor(match.currentIdx) : typeof window.currentIndex === "number" ? Math.floor(window.currentIndex) : null;
        const payload = buildTranscriptEnvelope(text, isFinal, candidateMatch, currentIdx);
        dispatchTranscript(payload);
      });
      try {
        console.log("[ASR] recognizer.start() returned without throwing");
      } catch {
      }
    } catch (err) {
      try {
        console.error("[ASR] recognizer.start() threw", err);
      } catch {
      }
      throw err;
    }
    emitSpeechState(true);
  } catch (err) {
    try {
      console.error("[ASR] createRecognizer/startRecognizer failed", err);
    } catch {
    }
    _rec = null;
    _cb = null;
    throw err;
  }
}
function stopRecognizer() {
  try {
    if (_rec) {
      try {
        _rec.stop();
      } catch {
      }
      _rec = null;
      emitSpeechState(false);
    }
  } finally {
    _cb = null;
  }
}
(function attachShim() {
  try {
    if (!allowLegacySpeechOrchestratorShim()) return;
    const w = window;
    try {
      console.log("[ASR] orchestrator global shim installing");
    } catch {
    }
    w.__tpSpeech = w.__tpSpeech || {};
    w.__tpSpeech.startRecognizer = startRecognizer;
    w.__tpSpeech.stopRecognizer = stopRecognizer;
    w.__tpSpeech.matchBatch = matchBatch2;
  } catch {
  }
})();
export {
  matchBatch2 as matchBatch,
  startRecognizer,
  stopRecognizer
};
