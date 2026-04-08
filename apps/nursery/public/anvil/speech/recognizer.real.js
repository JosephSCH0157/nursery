var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
export {
  Recognizer,
  createRecognizer
};
