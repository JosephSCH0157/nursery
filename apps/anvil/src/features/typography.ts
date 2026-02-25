import type { DisplayId } from '../settings/schema';
import { getTypography, onTypography } from '../settings/typographyStore';

export function applyTypographyTo(win: Window, id: DisplayId) {
  const doc = win.document;
  const root = doc.documentElement;
  const t = getTypography(id);
  setVars(root.style, t);

  // live updates
  const off = onTypography((d, s) => {
    if (d !== id) return;
    setVars(root.style, s);
    // notify scroll engine to recompute line metrics
    try { win.dispatchEvent(new Event('tp:lineMetricsDirty')); } catch {}
  });
  return off;

  function setVars(style: CSSStyleDeclaration, x: ReturnType<typeof getTypography>) {
    const setString = (name: string, value: unknown) => {
      if (typeof value === 'string') {
        const v = value.trim();
        if (v && v !== 'undefined' && v !== 'null') {
          style.setProperty(name, v);
          return;
        }
      }
      style.removeProperty(name);
    };
    const setNumber = (name: string, value: unknown, suffix = '') => {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(n)) {
        style.setProperty(name, `${n}${suffix}`);
        return;
      }
      style.removeProperty(name);
    };
    try {
      setString('--tp-font-family', x?.fontFamily);
      setNumber('--tp-font-size', x?.fontSizePx, 'px');
      setNumber('--tp-line-height', x?.lineHeight);
      setNumber('--tp-weight', x?.weight);
      setNumber('--tp-letter-spacing', x?.letterSpacingEm, 'em');
      setNumber('--tp-word-spacing', x?.wordSpacingEm, 'em');
      setString('--tp-fg', x?.color);
      setString('--tp-bg', x?.background);
      setNumber('--tp-maxch', x?.maxLineWidthCh);
      setNumber('--tp-dim', x?.dimOthers);
    } catch {}
  }
}

export default applyTypographyTo;
