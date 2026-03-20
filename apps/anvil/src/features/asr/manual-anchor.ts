export const ASR_MANUAL_ANCHOR_EVENT = 'tp:asr:manual-anchor';

export type AsrManualAnchorDetail = {
  targetIndex?: number | null;
  source?: string;
  reason?: string;
  targetBlockIdx?: number | null;
};

export function normalizeManualAnchorTargetIndex(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

export function dispatchAsrManualAnchor(detail: AsrManualAnchorDetail): number | null {
  if (typeof window === 'undefined') return null;
  const targetIndex = normalizeManualAnchorTargetIndex(detail?.targetIndex);
  if (targetIndex == null) return null;
  const payload = {
    ...detail,
    targetIndex,
  };
  try { window.dispatchEvent(new CustomEvent(ASR_MANUAL_ANCHOR_EVENT, { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent(ASR_MANUAL_ANCHOR_EVENT, { detail: payload })); } catch {}
  return targetIndex;
}
