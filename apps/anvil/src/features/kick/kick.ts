import {
  computeAnchorLineIndex,
  describeElement,
  getRuntimeScroller,
  resolveViewerRole,
} from '../../scroll/scroller';
import { dispatchAsrManualAnchor } from '../asr/manual-anchor';
import { getScrollWriter } from '../../scroll/scroll-writer';

const DEFAULT_KICK_DELTA_PX = 120;

export interface KickOptions {
  deltaPx?: number;
  reason?: string;
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const qs = new URLSearchParams(String(window.location?.search || ''));
    return qs.has('dev') || qs.get('dev') === '1';
  } catch {
    return false;
  }
}

function normalizeDeltaPx(rawDelta: number | undefined): number {
  const next = Number(rawDelta);
  if (!Number.isFinite(next) || next === 0) return DEFAULT_KICK_DELTA_PX;
  return next;
}

function getResolvedScroller(): HTMLElement | null {
  return getRuntimeScroller(resolveViewerRole());
}

function getScrollMode(): string {
  if (typeof window === 'undefined') return '';
  try {
    const store = (window as any).__tpStore;
    if (store && typeof store.get === 'function') {
      const scrollMode = store.get('scrollMode');
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = store.get('mode');
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }
    const router: any = (window as any).__tpScrollMode;
    if (router && typeof router.getMode === 'function') {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }
    if (typeof router === 'string') return String(router).toLowerCase();
  } catch {
    // ignore
  }
  return '';
}

function readScrollTop(scroller: HTMLElement): number {
  return scroller.scrollTop || 0;
}

function writeScrollTop(scroller: HTMLElement, top: number): void {
  const nextTop = Math.max(0, Number(top) || 0);
  try {
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: nextTop, behavior: 'auto' });
      return;
    }
    scroller.scrollTop = nextTop;
  } catch {
    try { scroller.scrollTop = nextTop; } catch {}
  }
}

export function resolveKickScroller(): HTMLElement | null {
  return getResolvedScroller();
}

function getLineElementByIndex(scroller: HTMLElement | null, lineIndex: number): HTMLElement | null {
  const idx = Math.max(0, Math.floor(lineIndex));
  const selectors = [
    `.line[data-line="${idx}"]`,
    `.line[data-line-idx="${idx}"]`,
    `.line[data-i="${idx}"]`,
    `.line[data-index="${idx}"]`,
    `.tp-line[data-line="${idx}"]`,
    `.tp-line[data-line-idx="${idx}"]`,
    `.tp-line[data-i="${idx}"]`,
    `.tp-line[data-index="${idx}"]`,
  ];
  const roots: Array<ParentNode | null> = [
    scroller,
    document.getElementById('script'),
    document,
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const selector of selectors) {
      try {
        const found = root.querySelector<HTMLElement>(selector);
        if (found) return found;
      } catch {
        // ignore selector errors
      }
    }
  }
  return null;
}

function resolveLineTopWithinScroller(scroller: HTMLElement, lineEl: HTMLElement): number {
  try {
    const lineRect = lineEl.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const rectTop = lineRect.top - scrollerRect.top + scroller.scrollTop;
    if (Number.isFinite(rectTop)) return rectTop;
  } catch {
    // ignore
  }
  return lineEl.offsetTop || 0;
}

function resolveLineTargetTop(scroller: HTMLElement, lineIndex: number): number | null {
  const lineEl = getLineElementByIndex(scroller, lineIndex);
  if (!lineEl) return null;
  const lineHeight =
    lineEl.getBoundingClientRect?.().height ||
    lineEl.offsetHeight ||
    lineEl.clientHeight ||
    24;
  const markerRatioRaw =
    typeof (window as any).__TP_MARKER_PCT === 'number'
      ? Number((window as any).__TP_MARKER_PCT)
      : 0.4;
  const markerRatio = Math.max(0.2, Math.min(0.8, markerRatioRaw));
  const markerOffsetPx = scroller.clientHeight * markerRatio - lineHeight * 0.5;
  const lineTop = resolveLineTopWithinScroller(scroller, lineEl);
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const rawTop = lineTop - markerOffsetPx;
  if (!Number.isFinite(rawTop)) return null;
  return Math.max(0, Math.min(rawTop, maxTop));
}

function getCurrentLineIndex(): number | null {
  if (typeof window === 'undefined') return null;
  const current = Number((window as any).currentIndex);
  if (Number.isFinite(current)) return Math.max(0, Math.floor(current));
  try {
    const driver = (window as any).__tpAsrScrollDriver;
    const fromDriver = Number(driver?.getLastLineIndex?.());
    if (Number.isFinite(fromDriver)) return Math.max(0, Math.floor(fromDriver));
  } catch {
    // ignore
  }
  return null;
}

function getVisibleAnchorLineIndex(scroller: HTMLElement | null): number | null {
  const markerIndex = computeAnchorLineIndex(scroller);
  if (!Number.isFinite(markerIndex as number)) return null;
  return Math.max(0, Math.floor(markerIndex as number));
}

function resolveAsrKickBaseLineIndex(scroller: HTMLElement): number | null {
  const anchorIndex = getVisibleAnchorLineIndex(scroller);
  const currentIndex = getCurrentLineIndex();
  if (anchorIndex == null) return currentIndex;
  if (currentIndex != null && currentIndex !== anchorIndex && isDevMode()) {
    try {
      console.info('[kick:anchor-preferred]', {
        anchorIndex,
        currentIndex,
        drift: currentIndex - anchorIndex,
      });
    } catch {}
  }
  return anchorIndex;
}

function resolveManualAnchorTargetIndex(
  scroller: HTMLElement,
  fallbackIndex: number | null = null,
): number | null {
  const markerIndex = getVisibleAnchorLineIndex(scroller);
  if (markerIndex != null) return markerIndex;
  if (Number.isFinite(fallbackIndex as number)) {
    return Math.max(0, Math.floor(fallbackIndex as number));
  }
  return null;
}

type AsrKickResult = {
  moved: boolean;
  targetIndex: number | null;
  targetBlockIdx: number | null;
};

function kickAsrForward(scroller: HTMLElement, deltaPx: number, _reason: string): AsrKickResult {
  const from = readScrollTop(scroller);
  const currentLine = resolveAsrKickBaseLineIndex(scroller);
  const nextLineIndex =
    Number.isFinite(currentLine as number) ? Math.max(0, Math.floor(currentLine as number) + 1) : null;
  if (nextLineIndex != null) {
    const targetTop = resolveLineTargetTop(scroller, nextLineIndex);
    if (targetTop != null) {
      try {
        getScrollWriter().scrollTo(targetTop, { behavior: 'auto' });
      } catch {
        // ignore writer errors; direct write fallback below
      }
      if (Math.abs(readScrollTop(scroller) - from) < 0.5) {
        writeScrollTop(scroller, targetTop);
      }
      const moved = Math.abs(readScrollTop(scroller) - from) >= 0.5;
      if (moved) {
        return {
          moved: true,
          targetIndex: nextLineIndex,
          targetBlockIdx: null,
        };
      }
    }
  }
  writeScrollTop(scroller, from + deltaPx);
  const moved = Math.abs(readScrollTop(scroller) - from) >= 0.5;
  const fallbackTargetIndex =
    Number.isFinite(currentLine as number) ? Math.max(0, Math.floor(currentLine as number) + 1) : null;
  return {
    moved,
    targetIndex: moved ? resolveManualAnchorTargetIndex(scroller, fallbackTargetIndex) : null,
    targetBlockIdx: null,
  };
}

export function kick(options: KickOptions = {}): boolean {
  try {
    const scroller = getResolvedScroller();
    if (!scroller) return false;

    const deltaPx = normalizeDeltaPx(options.deltaPx);
    const reason = options.reason || 'kick';
    const mode = getScrollMode();
    const from = readScrollTop(scroller);

    let moved: boolean;
    let manualAnchorTargetIndex: number | null = null;
    let manualAnchorTargetBlockIdx: number | null = null;
    if (mode === 'asr') {
      const result = kickAsrForward(scroller, deltaPx, reason);
      moved = result.moved;
      manualAnchorTargetIndex = result.targetIndex;
      manualAnchorTargetBlockIdx = result.targetBlockIdx;
    } else {
      try {
        getScrollWriter().scrollBy(deltaPx, { behavior: 'auto' });
      } catch {
        // ignore writer errors, fallback below
      }
      let to = readScrollTop(scroller);
      if (Math.abs(to - from) < 0.5) {
        writeScrollTop(scroller, from + deltaPx);
        to = readScrollTop(scroller);
      }
      moved = Math.abs(to - from) >= 0.5;
    }
    const to = readScrollTop(scroller);

    try { scroller.dataset.tpLastWriter = reason; } catch {}
    if (mode === 'asr' && moved && manualAnchorTargetIndex != null) {
      const targetIndex = dispatchAsrManualAnchor({
        targetIndex: manualAnchorTargetIndex,
        targetBlockIdx: manualAnchorTargetBlockIdx,
        source: 'kick',
        reason,
      });
      if (isDevMode() && targetIndex != null) {
        try {
          console.info('[kick:manual-anchor]', {
            reason,
            targetIndex,
            targetBlockIdx: manualAnchorTargetBlockIdx,
          });
        } catch {}
      }
    }

    if (isDevMode()) {
      try {
        console.info('[kick]', {
          reason,
          mode,
          deltaPx,
          from: Math.round(from),
          to: Math.round(to),
          moved,
          scroller: describeElement(scroller),
        });
      } catch {}
    }

    return moved;
  } catch (error) {
    if (isDevMode()) {
      try {
        console.warn('[kick] error', {
          reason: options.reason || 'kick',
          error: String(error),
        });
      } catch {}
    }
    return false;
  }
}
