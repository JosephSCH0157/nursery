import type { HammerVisualGeometry } from "./hammerVisualTypes";

export interface HammerVisualPlacementPercentBox {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface HammerVisualFrameSize {
  width: number;
  height: number;
}

export interface HammerVisualPlacementFrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const HAMMER_VISUAL_DEFAULT_PERCENT_BOX: HammerVisualPlacementPercentBox = {
  leftPct: 28,
  topPct: 22,
  widthPct: 44,
  heightPct: 34,
};

export const HAMMER_VISUAL_DEFAULT_GEOMETRY: HammerVisualGeometry = {
  x: 0.28,
  y: 0.22,
  width: 0.44,
  height: 0.34,
  anchor: "top_left",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampPercentBox(
  box: HammerVisualPlacementPercentBox,
): HammerVisualPlacementPercentBox {
  const widthPct = clamp(box.widthPct, 8, 92);
  const heightPct = clamp(box.heightPct, 8, 92);
  const leftPct = clamp(box.leftPct, 0, 100 - widthPct);
  const topPct = clamp(box.topPct, 0, 100 - heightPct);
  return { leftPct, topPct, widthPct, heightPct };
}

export function clampNormalizedGeometry(
  geometry: HammerVisualGeometry,
): HammerVisualGeometry {
  const width = clamp(geometry.width, 0.08, 0.92);
  const height = clamp(geometry.height, 0.08, 0.92);
  const x = clamp(geometry.x, 0, 1 - width);
  const y = clamp(geometry.y, 0, 1 - height);
  return {
    x,
    y,
    width,
    height,
    anchor: geometry.anchor === "center" ? "center" : "top_left",
  };
}

export function geometryToPercentBox(
  geometry: HammerVisualGeometry,
): HammerVisualPlacementPercentBox {
  const normalized = clampNormalizedGeometry(geometry);
  const left = normalized.anchor === "center"
    ? normalized.x - (normalized.width / 2)
    : normalized.x;
  const top = normalized.anchor === "center"
    ? normalized.y - (normalized.height / 2)
    : normalized.y;
  return clampPercentBox({
    leftPct: left * 100,
    topPct: top * 100,
    widthPct: normalized.width * 100,
    heightPct: normalized.height * 100,
  });
}

export function percentBoxToGeometry(
  box: HammerVisualPlacementPercentBox,
  anchor: HammerVisualGeometry["anchor"] = "top_left",
): HammerVisualGeometry {
  const clamped = clampPercentBox(box);
  const width = clamped.widthPct / 100;
  const height = clamped.heightPct / 100;
  const left = clamped.leftPct / 100;
  const top = clamped.topPct / 100;
  return clampNormalizedGeometry({
    x: anchor === "center" ? (left + (width / 2)) : left,
    y: anchor === "center" ? (top + (height / 2)) : top,
    width,
    height,
    anchor,
  });
}

export function geometryToFrameBox(
  geometry: HammerVisualGeometry,
  frame: HammerVisualFrameSize,
): HammerVisualPlacementFrameBox {
  const normalized = clampNormalizedGeometry(geometry);
  const width = normalized.width * Math.max(1, frame.width);
  const height = normalized.height * Math.max(1, frame.height);
  const x = (normalized.anchor === "center"
    ? (normalized.x - (normalized.width / 2))
    : normalized.x) * Math.max(1, frame.width);
  const y = (normalized.anchor === "center"
    ? (normalized.y - (normalized.height / 2))
    : normalized.y) * Math.max(1, frame.height);
  return { x, y, width, height };
}
