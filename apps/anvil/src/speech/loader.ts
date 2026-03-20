// @ts-nocheck
import { ensureSpeechGlobals, isSpeechBackendAllowed } from './backend-guard';
export {};

// Loader for speech recognizer/matcher. Attaches `window.__tpRecognizer` and `window.__tpMatcher`
// factories to allow gradual adoption by the legacy runtime.
ensureSpeechGlobals();

function allowLegacySpeechLoaderInstall(): boolean {
  try {
    if (!(window as any).__TP_TS_PRIMARY__) return true;
    if ((window as any).__tpAllowLegacySpeechOrchestrator === true) return true;
    if ((window as any).__tpAllowLegacySpeechNamespace === true) return true;
    const params = new URLSearchParams(location.search || '');
    return params.get('legacySpeechOrchestrator') === '1' || params.get('legacySpeechNs') === '1';
  } catch {
    return false;
  }
}

(async function () {
  if (!isSpeechBackendAllowed()) return;
  if (!allowLegacySpeechLoaderInstall()) return;

  const isDevMode = (() => {
    try {
      const qs = new URLSearchParams(location.search || '');
      if (qs.get('dev') === '1') return true;

      const hash = (location.hash || '').toLowerCase().replace(/^#/, '');
      if (hash === 'dev') return true;
      if (hash === 'dev=1') return true;
      if (hash.includes('dev=1')) return true;

      if (localStorage?.getItem('tp_dev_mode') === '1') return true;
    } catch {}
    return false;
  })();

  try {
    // Prefer JS builds; never import .ts in-browser
    const tryImport = async (spec) => {
      try {
        return await import(spec);
      } catch (err) {
        if (isDevMode) {
          try { console.error('[TP] speech loader import failed', spec, err); } catch {}
        }
        return null;
      }
    };

    const pick = async (list) => {
      for (const s of list) { const m = await tryImport(s); if (m) return m; }
      return null;
    };

    const recMod = await pick([
      '/dist/speech/recognizer.real.js',
    ]);
    const matchMod = await pick([
      '/dist/speech/matcher.real.js',
    ]);

    if (recMod) {
      try { (window).__tpRecognizer = (opts) => recMod.createRecognizer(opts); } catch {}
    }
    if (matchMod) {
      try {
        (window).__tpMatcher = {
          matchBatch: matchMod.matchBatch,
          normTokens: matchMod.normTokens,
          computeLineSimilarity: matchMod.computeLineSimilarity,
        };
      } catch {}
    }

    // high-level orchestrator (best-effort)
    const orch = await pick([
      '/dist/speech/orchestrator.real.js',
    ]);
    if (orch) {
      (window).__tpSpeech = (window).__tpSpeech || {};
      try { (window).__tpSpeech.startRecognizer = orch.startRecognizer; } catch {}
      try { (window).__tpSpeech.stopRecognizer = orch.stopRecognizer; } catch {}
      try { (window).__tpSpeech.matchBatch = orch.matchBatch; } catch {}
    }
  } catch (e) {
    try { console.warn('[TP] speech loader failed', e); } catch {}
  }
})();
