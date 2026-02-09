import { requestWrite } from '../boot/scheduler';

export type ScrollerGetter = () => HTMLElement | null | undefined;

export function createScrollerHelpers(getScroller: ScrollerGetter) {
  let _pendingTop: number | null = null;
  let _rafId = 0;

  function clampScrollTop(y: any) {
    const sc = getScroller();
    if (!sc) return 0;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return Math.max(0, Math.min(Number(y) || 0, max));
  }

  function requestScroll(top: number) {
    const sc = getScroller();
    if (!sc) return;
    const t = clampScrollTop(top);
    try {
      if (typeof (window as any).__tpClampGuard === 'function') {
        if (!(window as any).__tpClampGuard(t, Math.max(0, sc.scrollHeight - sc.clientHeight))) return;
      }
    } catch {}
    _pendingTop = t;
    try {
      (window as any).__lastScrollTarget = _pendingTop;
    } catch {}
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      const t2 = _pendingTop;
      _pendingTop = null;
      _rafId = 0;
      // Use scheduler to perform DOM write in a single-writer queue
      requestWrite(() => {
        try {
          sc.scrollTo({ top: t2 as number, behavior: 'auto' });
        } catch {
          try {
            (sc as any).scrollTop = t2;
          } catch {}
        }
        try {
          (window as any).__lastScrollTarget = null;
        } catch {}
      });
    });
  }

  function scrollByPx(px: number) {
    const sc = getScroller();
    if (!sc) return;
    const target = clampScrollTop((sc.scrollTop || 0) + (Number(px) || 0));
    requestScroll(target);
  }

  function scrollToY(y: number) {
    const sc = getScroller();
    if (!sc) return;
    requestScroll(clampScrollTop(Number(y) || 0));
  }

  function scrollToEl(el: HTMLElement | null, offset = 0) {
    const sc = getScroller();
    if (!sc || !el) return;
    const y = (el.offsetTop || 0) - (Number(offset) || 0);
    const t = clampScrollTop(y);
    try {
      if (typeof (window as any).__tpClampGuard === 'function') {
        if (!(window as any).__tpClampGuard(t, Math.max(0, sc.scrollHeight - sc.clientHeight))) return;
      }
    } catch {}
    requestScroll(t);
  }

  return { getScroller, clampScrollTop, scrollByPx, scrollToY, scrollToEl, requestScroll };
}

// --- Compatibility exports (expected by scroller/router/step-scroll) ---

type ViewportMetrics = {
  viewportHeight: number;
  height: number;
  scrollTop: number;
  scrollHeight: number;
};

// Try to locate a scroller element if caller doesn't supply one.
function resolveScroller(getEl?: () => HTMLElement | undefined | null): HTMLElement | undefined {
  if (getEl) return (getEl() ?? undefined) as any;

  // Common candidates (safe fallbacks)
  return (
    (document.getElementById('scroller') as HTMLElement | null) ??
    (document.querySelector('[data-scroller]') as HTMLElement | null) ??
    (document.querySelector('.scroller') as HTMLElement | null) ??
    (document.querySelector('.script-scroller') as HTMLElement | null) ??
    undefined
  ) as any;
}

export function getViewportMetrics(getScroller?: () => HTMLElement | undefined | null): ViewportMetrics {
  const el = resolveScroller(getScroller);
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  if (!el) {
    return { viewportHeight, height: 0, scrollTop: 0, scrollHeight: 0 };
  }

  // height = visible client area of the scroller
  const height = (el as any).clientHeight ?? el.getBoundingClientRect().height ?? 0;
  const scrollTop = (el as any).scrollTop ?? 0;
  const scrollHeight = (el as any).scrollHeight ?? 0;

  return { viewportHeight, height, scrollTop, scrollHeight };
}

// Anchor line = which "line" is closest to the marker/anchor Y.
// Works with elements that have data-line-index / data-line-idx / data-line.
export function computeAnchorLineIndex(scrollerEl?: HTMLElement): number {
  const el =
    scrollerEl ??
    resolveScroller() ??
    (document.scrollingElement as unknown as HTMLElement | null) ??
    undefined;

  if (!el) return 0;

  // Where is the "anchor line" on screen? Use marker element if present, else 35% viewport.
  const marker =
    (document.getElementById('marker-line') as HTMLElement | null) ??
    (document.querySelector('[data-marker-line]') as HTMLElement | null) ??
    null;

  const anchorY = marker
    ? marker.getBoundingClientRect().top
    : (window.innerHeight || 0) * 0.35;

  // Grab candidate line elements.
  const candidates = Array.from(
    el.querySelectorAll<HTMLElement>('[data-line-index],[data-line-idx],[data-line]')
  );

  if (candidates.length === 0) return 0;

  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const node of candidates) {
    const r = node.getBoundingClientRect();
    const y = r.top; // compare top edge to anchor
    const dist = Math.abs(y - anchorY);

    if (dist < bestDist) {
      bestDist = dist;

      const raw =
        node.getAttribute('data-line-index') ??
        node.getAttribute('data-line-idx') ??
        node.getAttribute('data-line') ??
        '0';

      const parsed = parseInt(raw, 10);
      bestIdx = Number.isFinite(parsed) ? parsed : bestIdx;
    }
  }

  return bestIdx;
}

// Use dev mode as the gate. If you want a dedicated toggle later, wire it here.
export function shouldLogScrollWrite(): boolean {
  try {
    // Your established dev toggle convention:
    // ?dev=1, #dev, or localStorage tp_dev_mode=1
    const ls = localStorage.getItem('tp_dev_mode');
    if (ls === '1') return true;

    const href = String(window.location.href || '');
    if (href.includes('dev=1') || href.includes('#dev')) return true;
  } catch {
    // ignore
  }
  return false;
}
