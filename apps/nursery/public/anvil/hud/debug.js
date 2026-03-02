// src/hud/debug.ts
function defaultLog(tag, payload) {
  try {
    window.HUD && window.HUD.log(tag, payload);
  } catch {
  }
}
function initDebugHUD(opts) {
  const log = defaultLog;
  try {
    let wrapModule2 = function(name) {
      try {
        const mod = window[name];
        if (!mod || typeof mod !== "object") return;
        if (mod.__hudWrapped) return;
        mod.__hudWrapped = true;
        Object.keys(mod).forEach((k) => {
          const v = mod[k];
          if (typeof v === "function" && !v.__hudWrapped) {
            const orig = v;
            mod[k] = function(...args) {
              log(`wrap:${name}.${k}`, { args: args.slice(0, 3) });
              return orig.apply(this, args);
            };
            mod[k].__hudWrapped = true;
          }
        });
        log("boot:wrapped", name);
      } catch {
      }
    }, wrapKnown2 = function() {
      ["scrollHelpers", "scrollControl", "ioAnchor", "recorders"].forEach(wrapModule2);
    }, interceptCurrentIndex2 = function() {
      try {
        if (!("currentIndex" in window)) return;
        let _ci = window.currentIndex;
        Object.defineProperty(window, "currentIndex", {
          get() {
            return _ci;
          },
          set(v) {
            _ci = v;
            log("match:index", { currentIndex: v });
          },
          configurable: true
        });
        log("boot:index-intercept", "ok");
      } catch {
      }
    }, hookSpeech2 = function() {
      try {
        const tryBind = () => {
          const r = window.recog || window.recognition || window.sr || null;
          if (!r || r.__seedBound) return;
          r.__seedBound = true;
          const bind = (ev) => {
            const k = "on" + ev;
            const prev = r[k];
            r[k] = function(e) {
              if (ev === "result") {
                const res = e && e.results && e.results[e.results.length - 1];
                const tail = res && res[0] && res[0].transcript;
                log("speech:onresult+", { tail });
              } else {
                log("speech:" + k, e && e.type || k);
              }
              return typeof prev === "function" ? prev.apply(this, arguments) : void 0;
            };
          };
          ["start", "end", "error", "audiostart", "audioend", "soundstart", "soundend", "speechstart", "speechend", "result"].forEach(bind);
          log("boot:speech-hook", "ok");
        };
        const t = setInterval(tryBind, 300);
        setTimeout(() => clearInterval(t), 15e3);
      } catch {
      }
    }, installSpeechTranscriptLog2 = function() {
      try {
        const handler = (ev) => {
          try {
            const detail = ev.detail || {};
            const text = String(detail.text || detail.tail || "").trim();
            if (!text) return;
            log("speech:transcript", {
              text: text.slice(0, 280),
              final: !!detail.final,
              conf: detail.confidence ?? detail.conf,
              timestamp: detail.timestamp || Date.now()
            });
          } catch {
          }
        };
        window.addEventListener("tp:captions:transcript", handler);
        window.addEventListener("tp:speech:transcript", handler);
      } catch {
      }
    }, hookPostMessage2 = function() {
      try {
        window.addEventListener("message", (e) => {
          try {
            const data = e && e.data;
            if (!data) return;
            if (data.type) log("display:postMessage", Object.assign({ type: data.type }, data));
          } catch {
          }
        });
      } catch {
      }
    }, installScrollDetectors2 = function() {
      try {
        const viewer = document.getElementById("viewer");
        if (!viewer) return;
        let lastTop = viewer.scrollTop;
        let lastMoveAt = performance.now();
        viewer.addEventListener("scroll", () => {
          try {
            const now = performance.now();
            const dt = now - lastMoveAt;
            const dy = Math.abs(viewer.scrollTop - lastTop);
            const vh = viewer.clientHeight || 1;
            if (dy > Math.max(64, vh * 0.5)) {
              log("scroll:jump", { from: lastTop, to: viewer.scrollTop, dt: Math.round(dt) });
            } else {
              log("scroll:tick", { top: viewer.scrollTop });
            }
            lastTop = viewer.scrollTop;
            lastMoveAt = now;
          } catch {
          }
        }, { passive: true });
        window.addEventListener("tp-speech-chunk", () => {
          setTimeout(() => {
            const idle = performance.now() - lastMoveAt;
            if (idle > 1500) log("scroll:stuck?", { idleMs: Math.round(idle), top: viewer.scrollTop });
          }, 1550);
        });
      } catch {
      }
    }, init2 = function() {
      wrapKnown2();
      interceptCurrentIndex2();
      hookSpeech2();
      installSpeechTranscriptLog2();
      hookPostMessage2();
      installScrollDetectors2();
      log("boot:seed-complete", { aggressive: !!(opts && opts.aggressive) });
    };
    var wrapModule = wrapModule2, wrapKnown = wrapKnown2, interceptCurrentIndex = interceptCurrentIndex2, hookSpeech = hookSpeech2, installSpeechTranscriptLog = installSpeechTranscriptLog2, hookPostMessage = hookPostMessage2, installScrollDetectors = installScrollDetectors2, init = init2;
    const devQuery = /([?#]).*dev=1/.test(location.href);
    const devLocal = (() => {
      try {
        return localStorage.getItem("tp_dev_mode");
      } catch {
        return null;
      }
    })();
    const flags = {
      devQuery,
      devLocal,
      hasViewer: !!document.getElementById("viewer"),
      hasDisplay: typeof window.sendToDisplay === "function",
      version: window.APP_VERSION || "(unknown)"
    };
    log("boot:snapshot", flags);
    if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(init2, 0);
    else document.addEventListener("DOMContentLoaded", init2);
  } catch {
  }
}
var debug_default = initDebugHUD;
export {
  debug_default as default,
  initDebugHUD
};
//# sourceMappingURL=debug.js.map
