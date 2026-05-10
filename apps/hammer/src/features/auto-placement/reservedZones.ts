import type { Rect } from "./types";

function toFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeRect(rect: Rect): Rect {
  const width = Math.max(0, toFinite(rect.width));
  const height = Math.max(0, toFinite(rect.height));
  return {
    x: toFinite(rect.x),
    y: toFinite(rect.y),
    width,
    height,
  };
}

export function inflateRect(rect: Rect, paddingPx: number): Rect {
  const safePadding = Math.max(0, toFinite(paddingPx));
  const normalized = normalizeRect(rect);
  return {
    x: normalized.x - safePadding,
    y: normalized.y - safePadding,
    width: normalized.width + (safePadding * 2),
    height: normalized.height + (safePadding * 2),
  };
}

export function clampRectToFrame(rect: Rect, frame: { width: number; height: number }): Rect {
  const safeFrameWidth = Math.max(0, toFinite(frame.width));
  const safeFrameHeight = Math.max(0, toFinite(frame.height));
  const normalized = normalizeRect(rect);
  const x = Math.max(0, Math.min(safeFrameWidth, normalized.x));
  const y = Math.max(0, Math.min(safeFrameHeight, normalized.y));
  const maxWidth = Math.max(0, safeFrameWidth - x);
  const maxHeight = Math.max(0, safeFrameHeight - y);
  return {
    x,
    y,
    width: Math.min(normalized.width, maxWidth),
    height: Math.min(normalized.height, maxHeight),
  };
}

export function isRectInsideFrame(rect: Rect, frame: { width: number; height: number }): boolean {
  const normalized = normalizeRect(rect);
  const safeFrameWidth = Math.max(0, toFinite(frame.width));
  const safeFrameHeight = Math.max(0, toFinite(frame.height));
  return (
    normalized.x >= 0 &&
    normalized.y >= 0 &&
    normalized.width >= 0 &&
    normalized.height >= 0 &&
    normalized.x + normalized.width <= safeFrameWidth &&
    normalized.y + normalized.height <= safeFrameHeight
  );
}

export function intersectionArea(a: Rect, b: Rect): number {
  const ra = normalizeRect(a);
  const rb = normalizeRect(b);
  const left = Math.max(ra.x, rb.x);
  const top = Math.max(ra.y, rb.y);
  const right = Math.min(ra.x + ra.width, rb.x + rb.width);
  const bottom = Math.min(ra.y + ra.height, rb.y + rb.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return width * height;
}

export function overlapRatio(subject: Rect, obstacle: Rect): number {
  const subjectArea = Math.max(1, normalizeRect(subject).width * normalizeRect(subject).height);
  return intersectionArea(subject, obstacle) / subjectArea;
}

export function rectIntersectsAny(rect: Rect, obstacles: Rect[]): boolean {
  return obstacles.some((obstacle) => intersectionArea(rect, obstacle) > 0);
}

function axisGap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (aEnd < bStart) return bStart - aEnd;
  if (bEnd < aStart) return aStart - bEnd;
  return 0;
}

export function rectDistance(a: Rect, b: Rect): number {
  const ra = normalizeRect(a);
  const rb = normalizeRect(b);
  const dx = axisGap(ra.x, ra.x + ra.width, rb.x, rb.x + rb.width);
  const dy = axisGap(ra.y, ra.y + ra.height, rb.y, rb.y + rb.height);
  return Math.sqrt((dx * dx) + (dy * dy));
}

export function deriveDefaultReservedZones(): Rect[] {
  return [];
}

