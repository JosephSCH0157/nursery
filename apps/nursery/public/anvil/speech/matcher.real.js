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
function computeLineSimilarity(spokenTokens, scriptText) {
  const scriptTokens = normTokens(scriptText);
  return computeLineSimilarityFromTokens(spokenTokens, scriptTokens);
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
export {
  computeJaccardSimilarity,
  computeLineSimilarity,
  computeLineSimilarityFromTokens,
  computeTFIDFSimilarity,
  cosineSimilarity,
  getNgrams,
  matchBatch,
  normTokens
};
//# sourceMappingURL=matcher.real.js.map
