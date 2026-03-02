/* GENERATED FROM TypeScript - DO NOT EDIT. Edit adapters/*.ts instead. */

// adapters/obs.ts
function createOBSAdapter() {
  var ws = null;
  var identified = false;
  var _lastErr = null;
  var cfg = { url: "ws://127.0.0.1:4455", password: "" };
  var _candidateList = null;
  var _candidateIndex = 0;
  var _lastAuthSent = null;
  var _lastCandidateIndexUsed = null;
  var _retryingCandidates = false;
  var _backoff = 800;
  var _attempts = 0;
  try {
    if (typeof window !== "undefined") {
      window.__obsLog = window.__obsLog || [];
      window.__obsLogMax = window.__obsLogMax || 500;
      window.logObs = function(ev, data) {
        try {
          if (!window.__TP_DEV) return;
          window.__obsLog.push({ t: Date.now(), ev, data });
          if (window.__obsLog.length > (window.__obsLogMax || 0)) {
            window.__obsLog.splice(0, window.__obsLog.length - (window.__obsLogMax || 0));
          }
        } catch {
        }
      };
    }
  } catch {
  }
  var _enc = function(s) {
    return new TextEncoder().encode(s);
  };
  var _b64 = function(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  };
  const _te = new TextEncoder();
  async function _sha(s) {
    return crypto.subtle.digest("SHA-256", _te.encode(s));
  }
  async function computeObsAuth(password, authInfo) {
    const salt = authInfo && authInfo.salt ? String(authInfo.salt) : "";
    const challenge = authInfo && authInfo.challenge ? String(authInfo.challenge) : "";
    const secretBuf = await _sha(String(password ?? "") + salt);
    const secretB64 = _b64(secretBuf);
    const authBuf = await _sha(secretB64 + challenge);
    return _b64(authBuf);
  }
  function configure(newCfg) {
    cfg = Object.assign({}, cfg, newCfg || {});
  }
  function isAvailable() {
    return Promise.resolve(typeof WebSocket !== "undefined");
  }
  function _connect(opts) {
    opts = opts || {};
    var testOnly = !!opts.testOnly;
    return new Promise(function(resolve, reject) {
      try {
        try {
          if (ws) ws.close(1e3, "reconnect");
        } catch {
        }
        identified = false;
        _lastErr = null;
        var url = cfg.url || "ws://127.0.0.1:4455";
        ws = new WebSocket(url);
        ws.onopen = function() {
          try {
            if (window && window.__TP_DEV) console.debug("[OBS-HS] socket open", url);
          } catch {
          }
          try {
            window.__obsHandshakeLog = window.__obsHandshakeLog || [];
            window.__obsHandshakeLog.push({ t: Date.now(), event: "open", url });
            try {
              _backoff = 800;
              _attempts = 0;
            } catch {
            }
            try {
              cfg.onStatus && cfg.onStatus("connected", true);
              try {
                window.logObs && window.logObs("open", { url });
              } catch {
              }
            } catch {
            }
          } catch {
          }
        };
        ws.onmessage = async function(ev) {
          try {
            var msg = JSON.parse(ev.data);
            try {
              if (window && window.__TP_DEV) console.debug("[OBS-HS] recv op=" + msg.op, msg.d);
            } catch {
            }
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({ t: Date.now(), op: msg.op, data: msg.d });
            } catch {
            }
            if (msg.op === 0) {
              var authInfo = msg.d && msg.d.authentication;
              try {
                window.logObs && window.logObs("hello", { authentication: authInfo });
              } catch {
              }
              var identify = { op: 1, d: { rpcVersion: 1 } };
              if (authInfo) {
                var pass = "";
                try {
                  if (typeof cfg.password !== "undefined" && cfg.password !== null)
                    pass = String(cfg.password);
                  else if (typeof cfg.getPass === "function") pass = String(cfg.getPass());
                } catch {
                  try {
                    pass = String(cfg.password || "");
                  } catch {
                    pass = "";
                  }
                }
                if (!pass) {
                  try {
                    var domPass = "";
                    var setEl = typeof document !== "undefined" ? document.getElementById("settingsObsPass") : null;
                    var mainEl = typeof document !== "undefined" ? document.getElementById("obsPassword") : null;
                    if (setEl && setEl.value) domPass = setEl.value;
                    else if (mainEl && mainEl.value) domPass = mainEl.value;
                    if (domPass) pass = domPass;
                    if (domPass && window && window.__TP_DEV)
                      console.debug("[OBS adapter] using DOM password fallback (settings/main)");
                  } catch {
                  }
                }
                if (!pass) {
                  try {
                    ws?.close(4009, "password-empty");
                  } catch {
                  }
                  _lastErr = new Error("OBS authentication required but no password is set.");
                  return reject(_lastErr);
                }
                try {
                  const authVal = await computeObsAuth(pass, authInfo);
                  identify.d.authentication = authVal;
                  _lastAuthSent = authVal;
                  if (window && window.__TP_DEV)
                    console.debug("[OBS-HS] sending IDENTIFY (authentication present)");
                  try {
                    if (window && window.__TP_DEV)
                      console.debug("[OBS-HS] IDENTIFY payload:", identify);
                  } catch {
                  }
                  try {
                    window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                    var ent = {
                      t: Date.now(),
                      event: "identify-sent",
                      auth: !!identify.d.authentication
                    };
                    if (window && window.__TP_DEV) ent.identifyPayload = identify;
                    window.__obsHandshakeLog.push(ent);
                    window.logObs && window.logObs("identify-sent", { auth: !!identify.d.authentication });
                  } catch {
                  }
                } catch (exAuth) {
                  _lastErr = exAuth;
                  try {
                    ws?.close(4009, "auth-compute-failed");
                  } catch {
                  }
                  return reject(exAuth);
                }
              }
              try {
                ws?.send(JSON.stringify(identify));
              } catch {
              }
            } else if (msg.op === 2) {
              identified = true;
              try {
                if (window && window.__TP_DEV) console.debug("[OBS-HS] IDENTIFIED", msg.d);
              } catch {
              }
              try {
                window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                window.__obsHandshakeLog.push({ t: Date.now(), event: "identified", data: msg.d });
                try {
                  window.logObs && window.logObs("identified", { data: msg.d });
                } catch {
                }
              } catch {
              }
              if (testOnly) {
                try {
                  ws?.close(1e3, "test-ok");
                } catch {
                }
              }
              return resolve(true);
            }
          } catch (e) {
            _lastErr = e;
            try {
              ws?.close(4e3, "msg-parse-error");
            } catch {
            }
            return reject(e);
          }
        };
        ws.onerror = function(ev) {
          try {
            if (window && window.__TP_DEV) console.debug("[OBS-HS] socket error", ev);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({ t: Date.now(), event: "error", data: ev });
              try {
                window.logObs && window.logObs("error", { data: ev });
              } catch {
              }
            } catch {
            }
          } catch {
          }
        };
        ws.onclose = function(e) {
          try {
            if (window && window.__TP_DEV)
              console.debug("[OBS-HS] socket close", e && e.code, e && e.reason);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              var entry = {
                t: Date.now(),
                event: "close",
                code: e && e.code || 0,
                reason: e && e.reason || ""
              };
              if (e && e.code === 4009 && window && window.__TP_DEV) {
                try {
                  entry.debugAuth = _lastAuthSent || null;
                } catch {
                }
              }
              window.__obsHandshakeLog.push(entry);
              try {
                window.logObs && window.logObs("close", {
                  code: e && e.code || 0,
                  reason: e && e.reason || ""
                });
              } catch {
              }
              try {
                _attempts = (_attempts || 0) + 1;
                _backoff = Math.min(Math.floor((_backoff || 800) * 1.6), 8e3);
                cfg.onStatus && cfg.onStatus("closed", false, {
                  code: e && e.code || 0,
                  reason: e && e.reason || "",
                  attempt: _attempts,
                  backoffMs: _backoff
                });
              } catch {
              }
            } catch {
            }
          } catch {
          }
          if (!identified) {
            var err = new Error(
              ("close " + (e && e.code || 0) + " " + (e && e.reason || "")).trim()
            );
            _lastErr = err;
            try {
              if (cfg && typeof cfg.isEnabled === "function" && cfg.isEnabled() && (e && e.code) !== 1e3) {
                try {
                  setTimeout(function() {
                    try {
                      connect();
                    } catch {
                    }
                  }, _backoff);
                } catch {
                }
              }
            } catch {
            }
            return reject(err);
          }
        };
      } catch (outer) {
        _lastErr = outer;
        return reject(outer);
      }
    });
  }
  function connect() {
    return _connect({ testOnly: false });
  }
  async function start() {
    await connect();
  }
  async function stop() {
    identified = false;
    try {
      if (ws) ws.close(1e3, "stop");
    } catch {
    }
    ws = null;
  }
  async function test() {
    return _connect({ testOnly: true });
  }
  async function probePorts(urls) {
    if (!Array.isArray(urls)) throw new Error("urls must be an array");
    const orig = cfg.url;
    const results = [];
    for (let u of urls) {
      try {
        cfg.url = u;
        try {
          const ok = await _connect({ testOnly: true });
          results.push({ url: u, ok: !!ok });
          if (ok) {
            cfg.url = orig;
            return { success: true, url: u, results };
          }
        } catch (err) {
          const msg = err?.message;
          results.push({
            url: u,
            ok: false,
            error: msg ? String(msg) : String(err)
          });
        }
      } catch (outer) {
        const msg = outer?.message;
        results.push({
          url: u,
          ok: false,
          error: msg ? String(msg) : String(outer)
        });
      }
    }
    cfg.url = orig;
    return { success: false, results };
  }
  function getLastError() {
    if (_lastErr == null) return null;
    if (typeof _lastErr === "object" && "message" in _lastErr) {
      return String(_lastErr.message);
    }
    return String(_lastErr);
  }
  function pokeStatusTest() {
    try {
      const meta = { now: Date.now(), note: "poke" };
      try {
        window.logObs && window.logObs("poke", meta);
      } catch {
      }
      cfg.onStatus && cfg.onStatus("poke", true, meta);
      try {
        if (window && window.__TP_DEV) console.info("[OBS adapter] pokeStatusTest fired", meta);
      } catch {
      }
      return true;
    } catch {
      return false;
    }
  }
  try {
    if (typeof window !== "undefined" && window.__TP_DEV) {
      try {
        window.__obsProbePorts = function(urls) {
          try {
            return probePorts(urls);
          } catch (e) {
            return Promise.reject(e);
          }
        };
      } catch {
      }
    }
  } catch {
  }
  return {
    id: "obs",
    label: "OBS (WebSocket)",
    configure,
    isAvailable,
    start,
    stop,
    connect,
    test,
    pokeStatusTest,
    // testCandidate removed; use __obsProbePorts or adapter.test()
    getLastError
  };
}
export {
  createOBSAdapter
};
//# sourceMappingURL=obs.js.map
