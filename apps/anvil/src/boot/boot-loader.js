// Legacy compatibility boot loader.
// Canonical runtime ownership belongs to ../../dist/index.js.
// This file exists only so stale references cannot revive the monolith.

(function (g) {
  if (!g) return;
  if (g.__TP_LOADER_RAN__) {
    try { (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), tag: 'boot-loader', msg: 'dup-loader' }); } catch {}
    return;
  }
  g.__TP_LOADER_RAN__ = true;

  const push = (entry) => {
    try {
      (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), ...entry });
    } catch {}
  };

  const isExplicitLegacyRequested = () => {
    try {
      if (g.__TP_ALLOW_LEGACY_BOOT === true || g.__tpAllowLegacyBoot === true) return true;
      const params = new URLSearchParams(location.search || '');
      if (params.get('legacy') === '1') return true;
      if (String(location.hash || '').toLowerCase().includes('legacy=1')) return true;
      return localStorage.getItem('tp_legacy') === '1';
    } catch {
      return false;
    }
  };

  const isCanonicalBootActive = () => {
    try {
      return (
        g.__TP_TS_PRIMARY__ === true ||
        g.__TP_BOOT_OWNER === 'ts:index' ||
        g.__tpBootPath === 'ts:index' ||
        g.__tpTsBooted === 1
      );
    } catch {
      return false;
    }
  };

  const isDev = /\bdev=1\b/.test(location.search) ||
    /\bdev\b/.test(location.hash) ||
    (function () {
      try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; }
    })();

  g.__TP_BOOT_INFO = Object.assign(g.__TP_BOOT_INFO || {}, { isDev, path: isDev ? 'dev' : 'prod' });
  push({ tag: 'boot-loader', msg: 'start', isDev });

  if (isCanonicalBootActive()) {
    push({ tag: 'boot-loader', msg: 'canonical-already-active', ok: true });
    return;
  }

  const entryUrl = isExplicitLegacyRequested()
    ? '../index.js'
    : '../../dist/index.js';

  (async () => {
    try {
      const v = encodeURIComponent(g.__TP_ADDV || 'dev');
      push({ tag: 'boot-loader', msg: `import ${entryUrl} → start` });
      await import(`${entryUrl}?v=${v}`);
      g.__TP_BOOT_INFO.imported = true;
      push({ tag: 'boot-loader', msg: `import ${entryUrl} → done`, ok: true });
    } catch (err) {
      g.__TP_BOOT_INFO.imported = false;
      push({ tag: 'boot-loader', msg: 'import failed', ok: false, err: String(err), entryUrl });
      try { console.error('[boot-loader] compatibility loader failed', err); } catch {}
    }
  })();
})(window);
