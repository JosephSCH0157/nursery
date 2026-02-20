import { DEFAULTS, type DisplayId, type Typography } from './schema';

const KEY = 'tp_typography_v1';
const META_KEY = 'tp_typography_meta_v1';
type State = Record<DisplayId, Typography>;
type MetaState = Record<DisplayId, { maxChManual?: boolean }>;

const DISPLAYS: DisplayId[] = ['main', 'display'];

function readNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (!v || v === 'undefined' || v === 'null') return fallback;
  return v;
}

function normalizeTypography(input: unknown, fallback: Typography): Typography {
  const src = input && typeof input === 'object' ? (input as Partial<Typography>) : {};
  return clampTypography({
    fontFamily: readString(src.fontFamily, fallback.fontFamily),
    fontSizePx: readNumber(src.fontSizePx, fallback.fontSizePx),
    lineHeight: readNumber(src.lineHeight, fallback.lineHeight),
    weight: readNumber(src.weight, fallback.weight),
    letterSpacingEm: readNumber(src.letterSpacingEm, fallback.letterSpacingEm),
    wordSpacingEm: readNumber(src.wordSpacingEm, fallback.wordSpacingEm),
    color: readString(src.color, fallback.color),
    background: readString(src.background, fallback.background),
    maxLineWidthCh: readNumber(src.maxLineWidthCh, fallback.maxLineWidthCh),
    dimOthers: readNumber(src.dimOthers, fallback.dimOthers),
  });
}

function normalizeState(raw: unknown, previous?: State): State {
  const out = {} as State;
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  DISPLAYS.forEach((display) => {
    const fallback = previous?.[display] ?? DEFAULTS[display];
    out[display] = normalizeTypography(src[display], fallback);
  });
  return out;
}

let state: State = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    const normalized = normalizeState(parsed);
    try { localStorage.setItem(KEY, JSON.stringify(normalized)); } catch {}
    return normalized;
  } catch {
    return normalizeState({});
  }
})();

let meta: MetaState = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '{}') as Partial<MetaState>;
    return { main: {}, display: {}, ...raw } as MetaState;
  } catch {
    return { main: {}, display: {} } as MetaState;
  }
})();

const subs = new Set<(_d: DisplayId, _t: Typography)=>void>();

export function getTypography(d: DisplayId) { return state[d]; }
export function isMaxChManual(d: DisplayId) { return !!meta?.[d]?.maxChManual; }
export function setTypography(d: DisplayId, t: Partial<Typography>) {
  if (Object.prototype.hasOwnProperty.call(t, 'maxLineWidthCh')) {
    const next = { ...(meta[d] || {}), maxChManual: true };
    meta = { ...meta, [d]: next };
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
  }
  state = { ...state, [d]: normalizeTypography({ ...state[d], ...t }, state[d] || DEFAULTS[d]) };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach(fn => { try { fn(d, state[d]); } catch {} });
  try { window.dispatchEvent(new CustomEvent('tp:typographyChanged', { detail: { display: d, settings: state[d] }})); } catch {}
}
export function onTypography(fn: (_d: DisplayId, _t: Typography)=>void) { subs.add(fn as any); return () => subs.delete(fn as any); }

// Cross-window sync: reflect updates from other tabs/windows
try {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === KEY) {
      try {
        const next = JSON.parse(e.newValue || '{}');
        state = normalizeState(next, state);
        DISPLAYS.forEach((d) => {
          subs.forEach(fn => { try { (fn as any)(d, state[d]); } catch {} });
        });
        try { window.dispatchEvent(new CustomEvent('tp:typographyChanged', { detail: { broadcast: true } })); } catch {}
      } catch {}
      return;
    }
    if (e.key === META_KEY) {
      try {
        const next = JSON.parse(e.newValue || '{}') as Partial<MetaState>;
        meta = { main: {}, display: {}, ...next } as MetaState;
      } catch {}
    }
  });
} catch {}

// Helper: clamp values to sane ranges
export function clampTypography(t: Typography): Typography {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  return {
    ...t,
    fontSizePx: clamp(t.fontSizePx, 24, 120),
    lineHeight: clamp(t.lineHeight, 1.2, 1.8),
    weight: clamp(t.weight, 300, 900),
    letterSpacingEm: clamp(t.letterSpacingEm, -0.03, 0.15),
    wordSpacingEm: clamp(t.wordSpacingEm, 0, 0.4),
    maxLineWidthCh: clamp(t.maxLineWidthCh, 24, 90),
    dimOthers: clamp(t.dimOthers, 0, 0.7),
  };
}
