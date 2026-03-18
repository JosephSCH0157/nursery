// Compatibility entrypoint for older dev loaders.
// Canonical runtime ownership belongs to src/index.ts -> dist/index.js.
// This module must never initialize speech/ASR state directly.

const CANONICAL_ENTRY = './index.ts';
const EXPLICIT_LEGACY_ENTRY = '../legacy/index.js';
const LEGACY_QUERY_KEY = 'legacy';
const LEGACY_STORAGE_KEY = 'tp_legacy';

function readSearchParams() {
  try {
    return new URLSearchParams(window.location.search || '');
  } catch {
    return null;
  }
}

function readHash() {
  try {
    return String(window.location.hash || '').toLowerCase();
  } catch {
    return '';
  }
}

function isCanonicalBootActive() {
  try {
    const w = window;
    return (
      w.__TP_TS_PRIMARY__ === true ||
      w.__TP_BOOT_OWNER === 'ts:index' ||
      w.__tpBootPath === 'ts:index' ||
      w.__tpTsBooted === 1
    );
  } catch {
    return false;
  }
}

function isExplicitLegacyRequested() {
  if (typeof window === 'undefined') return false;
  try {
    const w = window;
    if (w.__TP_ALLOW_LEGACY_BOOT === true) return true;
    if (w.__tpAllowLegacyBoot === true) return true;
    const params = readSearchParams();
    if (params?.get(LEGACY_QUERY_KEY) === '1') return true;
    if (readHash().includes('legacy=1')) return true;
    try {
      return w.localStorage?.getItem(LEGACY_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function recordCompatDecision(mode, detail) {
  try {
    const info = (window.__TP_BOOT_INFO = window.__TP_BOOT_INFO || {});
    info.compatEntry = mode;
    if (detail) info.compatDetail = detail;
  } catch {
    // ignore
  }
}

async function bootCompatEntry() {
  if (typeof window === 'undefined') return;
  const w = window;

  if (w.__TP_COMPAT_ENTRY_RAN__) {
    recordCompatDecision('dup-skip');
    try { console.info('[src/index] duplicate compatibility entry ignored'); } catch {}
    return;
  }
  w.__TP_COMPAT_ENTRY_RAN__ = true;

  if (isCanonicalBootActive()) {
    recordCompatDecision('canonical-already-active');
    try { console.info('[src/index] canonical TS runtime already active; compatibility entry skipped'); } catch {}
    return;
  }

  if (isExplicitLegacyRequested()) {
    recordCompatDecision('explicit-legacy');
    try { console.warn('[src/index] explicit legacy boot requested; importing ../legacy/index.js'); } catch {}
    await import(EXPLICIT_LEGACY_ENTRY);
    return;
  }

  recordCompatDecision('forward-to-canonical');
  try { console.info('[src/index] forwarding compatibility entry to ./index.ts'); } catch {}
  await import(CANONICAL_ENTRY);
}

void bootCompatEntry().catch((error) => {
  recordCompatDecision('error', String(error));
  try { console.error('[src/index] compatibility entry failed', error); } catch {}
});
