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

// src/speech/engines/webspeech.ts
var WebSpeechEngine = class {
  name = "webspeech";
  emitter = new Emitter();
  recognition = null;
  lastPartialAt = 0;
  on(cb) {
    this.emitter.on(cb);
  }
  async start(opts) {
    const AnyWindow = window;
    const Ctor = AnyWindow.webkitSpeechRecognition || AnyWindow.SpeechRecognition;
    if (!Ctor) {
      this.emitter.emit({ type: "error", code: "unsupported", message: "Web Speech not available" });
      return;
    }
    const rec = new Ctor();
    this.recognition = rec;
    rec.continuous = true;
    rec.interimResults = !!opts.interim;
    rec.lang = opts.lang || "en-US";
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
    };
    rec.onend = () => {
      this.emitter.emit({ type: "stopped" });
    };
    try {
      rec.start();
    } catch (err) {
      this.emitter.emit({ type: "error", code: "start-failed", message: err?.message || String(err) });
    }
  }
  async stop() {
    try {
      this.recognition?.stop();
    } catch {
    }
    this.recognition = null;
  }
};

// src/state/speech-store.ts
var state = {
  engine: "webspeech",
  lang: "en-US",
  interim: true,
  threshold: 0.6,
  endpointingMs: 700,
  fillerFilter: true
};
var subs = /* @__PURE__ */ new Set();
var speechStore = {
  get() {
    return { ...state };
  },
  set(patch) {
    Object.assign(state, patch);
    for (const fn of subs) fn({ ...state });
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }
};

// src/features/asr-mode.ts
var AsrMode = class {
  engine = null;
  state = "idle";
  opts;
  currentIdx = 0;
  rescueCount = 0;
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
    const s = speechStore.get();
    this.engine = createEngine(s.engine);
    bindEngine(this.engine, (e) => this.onEngineEvent(e));
    this.setState("ready");
    await this.engine.start({
      lang: s.lang,
      interim: s.interim,
      endpointingMs: s.endpointingMs,
      profanityFilter: false
    });
  }
  async stop() {
    await this.engine?.stop();
    this.setState("idle");
    this.dispatch("asr:state", { state: this.state });
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
      this.setState("error");
      this.emitAsrState("error", e.message);
      this.dispatch("asr:error", { code: e.code, message: e.message });
    }
    if (e.type === "stopped") {
      this.setState("idle");
    }
  }
  setState(next) {
    this.state = next;
    this.dispatch("asr:state", { state: next });
    this.emitAsrState(next);
  }
  prepareText(s) {
    const st = speechStore.get();
    return st.fillerFilter ? stripFillers(s) : normalizeText(s);
  }
  /**
   * Gate: only emit transcript events in dev OR when explicitly enabled in Settings
   */
  shouldEmitTx() {
    try {
      return localStorage.getItem("tp_dev_mode") === "1" || localStorage.getItem("tp_hud_prod") === "1" || window.__TP_DEV === true;
    } catch {
      return false;
    }
  }
  /**
   * Emit transcript event with throttling for partials
   */
  emitTranscript(detail) {
    if (!this.shouldEmitTx()) return;
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
    const threshold = speechStore.get().threshold;
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
    if (bestIdx >= 0 && bestScore >= threshold) {
      let newIdx = idx0 + bestIdx;
      const leadLines = this.getReadingLeadLines();
      if (leadLines > 0) {
        newIdx = Math.min(newIdx + leadLines, this.getAllLineEls().length - 1);
      }
      if (newIdx >= this.currentIdx) {
        this.currentIdx = newIdx;
        this.scrollToLine(newIdx);
        this.dispatch("asr:advance", { index: newIdx, score: bestScore, lead: leadLines });
      }
    } else if (isFinal) {
      this.rescueCount++;
      if (this.rescueCount <= 2) {
        this.currentIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
        this.scrollToLine(this.currentIdx);
        this.dispatch("asr:rescue", { index: this.currentIdx, reason: "weak-final" });
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
    const start = clamp(this.currentIdx, 0, Math.max(0, els.length - 1));
    const end = clamp(start + this.opts.windowSize, 0, els.length);
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
      if (scroller === document.scrollingElement || scroller === document.body) {
        window.scrollTo({ top, behavior: "smooth" });
      } else {
        scroller.scrollTo({ top, behavior: "smooth" });
      }
    });
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
function clamp(n, lo, hi) {
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
function findScroller(el) {
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY || "")) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.body;
}
function elementTopRelativeTo(el, scroller) {
  const r1 = el.getBoundingClientRect();
  const r2 = scroller === document.scrollingElement || scroller === document.body ? { top: 0 } : scroller.getBoundingClientRect();
  const scrollTop = scroller === document.scrollingElement || scroller === document.body ? window.pageYOffset : scroller.scrollTop;
  return r1.top - r2.top + scrollTop;
}

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

// src/ui/settings-asr.ts
function mountAsrSettings(containerSelector = "#settingsSpeech, #settings, body") {
  const host = document.querySelector(containerSelector) || document.body;
  const box = document.createElement("section");
  box.className = "settings-card asr";
  box.innerHTML = `
    <h3>ASR</h3>
    <div class="grid" style="gap:8px;grid-template-columns: repeat(auto-fit,minmax(160px,1fr));">
      <label>Engine
        <select id="asrEngine">
          <option value="webspeech">Web Speech (browser)</option>
          <option value="vosk">Offline (WASM)</option>
          <option value="whisper">Server (Whisper bridge)</option>
        </select>
      </label>
      <label>Language
        <input id="asrLang" type="text" placeholder="en-US" />
      </label>
      <label><input id="asrInterim" type="checkbox" /> Use interim results</label>
      <label><input id="asrFillers" type="checkbox" /> Filter filler words</label>
      <label>Threshold
        <input id="asrThresh" type="number" step="0.01" min="0" max="1" />
      </label>
      <label>Endpointing (ms)
        <input id="asrEndMs" type="number" min="200" step="50" />
      </label>
    </div>
  `;
  host.appendChild(box);
  const $ = (id) => box.querySelector(id);
  const eng = $("#asrEngine");
  const lang = $("#asrLang");
  const interim = $("#asrInterim");
  const fillers = $("#asrFillers");
  const thresh = $("#asrThresh");
  const endms = $("#asrEndMs");
  const s = speechStore.get();
  eng.value = s.engine;
  lang.value = s.lang;
  interim.checked = s.interim;
  fillers.checked = s.fillerFilter;
  thresh.value = String(s.threshold);
  endms.value = String(s.endpointingMs);
  eng.addEventListener("change", () => speechStore.set({ engine: eng.value }));
  lang.addEventListener("change", () => speechStore.set({ lang: lang.value }));
  interim.addEventListener("change", () => speechStore.set({ interim: interim.checked }));
  fillers.addEventListener("change", () => speechStore.set({ fillerFilter: fillers.checked }));
  thresh.addEventListener("change", () => speechStore.set({ threshold: clamp2(+thresh.value, 0, 1) }));
  endms.addEventListener("change", () => speechStore.set({ endpointingMs: Math.max(200, Math.round(+endms.value)) }));
}
function clamp2(n, lo, hi) {
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
    window.addEventListener("asr:state", (e) => {
      const st = e.detail?.state;
      const map = { idle: "off", ready: "ready", listening: "listening", running: "listening", error: "error" };
      this.chip.textContent = `ASR: ${map[st] ?? st}`;
      if (st === "idle" || st === "error") {
        this.running = false;
      }
      if (st === "running" || st === "listening" || st === "ready") {
        this.running = true;
      }
    });
    this.chip.title = (() => {
      const s = speechStore.get();
      return `Engine: ${s.engine}  \u2022  Lang: ${s.lang}`;
    })();
  }
  // No toggle UI anymore; ASR start/stop is wired to Speech Sync + mode changes.
};

// src/index-hooks/asr.ts
function initAsrFeature() {
  mountAsrSettings("#settingsSpeech, #settings, body");
  installAsrHotkeys();
  let asrMode = null;
  let speechActive = false;
  let asrActive = false;
  let autoHeld = false;
  const wantASR = () => {
    try {
      return (document.getElementById("scrollMode")?.value || "").toLowerCase() === "asr";
    } catch {
      return false;
    }
  };
  const holdAuto = () => {
    if (autoHeld) return;
    autoHeld = true;
    try {
      window.__tpAuto?.set?.(false);
      window.dispatchEvent(new CustomEvent("autoscroll:disable", { detail: "asr" }));
    } catch {
    }
  };
  const releaseAuto = () => {
    if (!autoHeld) return;
    autoHeld = false;
    try {
      window.__tpAuto?.set?.(true);
      window.dispatchEvent(new CustomEvent("autoscroll:enable", { detail: "asr" }));
    } catch {
    }
  };
  const ensureMode = async () => {
    if (!asrMode) {
      asrMode = new AsrMode({ rootSelector: "#scriptRoot, #script, body", lineSelector: ".line, p", markerOffsetPx: 140, windowSize: 6 });
      window.__tpAsrMode = asrMode;
      try {
        new AsrTopbar(asrMode).mount("#topbarRight, .topbar, header, body");
      } catch {
      }
    }
    return asrMode;
  };
  const start = async () => {
    if (asrActive) return;
    const m = await ensureMode();
    try {
      holdAuto();
      await m.start();
      asrActive = true;
    } catch (err) {
      asrActive = false;
      releaseAuto();
      try {
        console.warn("[ASR] start failed, staying on non-ASR sync", err);
      } catch {
      }
    }
  };
  const stop = async () => {
    if (!asrActive) return;
    try {
      await asrMode?.stop?.();
    } finally {
      asrActive = false;
      releaseAuto();
    }
  };
  window.addEventListener("tp:speech-state", (ev) => {
    try {
      const d = ev?.detail || {};
      const on = d.running === true || typeof d.state === "string" && (d.state === "active" || d.state === "running");
      speechActive = !!on;
      if (speechActive && wantASR()) void start();
      else void stop();
    } catch {
    }
  });
  document.addEventListener("change", (ev) => {
    try {
      if (ev?.target?.id !== "scrollMode") return;
      if (!speechActive) return;
      wantASR() ? void start() : void stop();
    } catch {
    }
  });
  window.addEventListener("asr:toggle", (e) => {
    const armed = !!e?.detail?.armed;
    armed ? void start() : void stop();
  });
  window.addEventListener("asr:stop", () => {
    void stop();
  });
  try {
    const body = document.body;
    speechActive = !!(body && (body.classList.contains("speech-listening") || body.classList.contains("listening"))) || window.speechOn === true;
    if (speechActive && wantASR()) void start();
  } catch {
  }
}
export {
  AsrMode,
  initAsrFeature
};
//# sourceMappingURL=asr.js.map
