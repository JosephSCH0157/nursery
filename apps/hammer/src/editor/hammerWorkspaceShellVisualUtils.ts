import type { HammerVisualPlacementRecord } from "../persistence/hammerPersistenceContract";
import type { HammerVisualGeometry } from "../visuals/model/hammerVisualTypes";
import {
  HAMMER_VISUAL_DEFAULT_GEOMETRY,
  HAMMER_VISUAL_DEFAULT_PERCENT_BOX,
  clampNormalizedGeometry,
  geometryToPercentBox,
  percentBoxToGeometry,
} from "../visuals/model/visualPlacementGeometry";

export const MIN_IMAGE_PLACEMENT_DURATION_SEC = 0.5;
export const IMAGE_PLACEMENT_TIME_PRECISION = 100;
export const IMAGE_PLACEMENT_FINE_STEP_SEC = 0.01;
export const IMAGE_PLACEMENT_COARSE_STEP_SEC = 0.1;

export type HammerVisualFlowStepId = "media_map" | "images" | "broll" | "reference_clips";

export type HammerImagePlacementDraftWindow = {
  startSec: number;
  endSec: number;
};

export type HammerImagePlacementTransform = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export type HammerTimelineImageDragState = {
  placementId: string;
  mode: "move" | "resize_start" | "resize_end";
  pointerStartX: number;
  originStartSec: number;
  originEndSec: number;
  pxToSec: number;
};

export type HammerPreviewCanvasDragState = {
  placementId: string;
  mode: "move" | "resize";
  pointerStartX: number;
  pointerStartY: number;
  origin: HammerImagePlacementTransform;
  originAspectRatio: number;
};

export type HammerImageAnimationPreset =
  | "none"
  | "fade_in"
  | "fade_out"
  | "fade_in_out"
  | "flip_in"
  | "flip_out"
  | "shutter_in"
  | "shutter_out"
  | "shutter_in_fade_out";

export type HammerImageAnimationContextMenuState = {
  placementId: string;
  x: number;
  y: number;
};

export type HammerLogoOverlayPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right";
export type HammerLogoOverlaySize = "small" | "medium" | "large";

export function roundImagePlacementTime(value: number): number {
  return Math.round(value * IMAGE_PLACEMENT_TIME_PRECISION) / IMAGE_PLACEMENT_TIME_PRECISION;
}

export function snapImagePlacementTime(value: number, stepSec: number): number {
  if (!Number.isFinite(stepSec) || stepSec <= 0) return roundImagePlacementTime(value);
  return roundImagePlacementTime(Math.round(value / stepSec) * stepSec);
}

export function createVisualPlacementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `placement:${crypto.randomUUID()}`;
  }
  return `placement:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_IMAGE_PLACEMENT_TRANSFORM: HammerImagePlacementTransform = {
  ...HAMMER_VISUAL_DEFAULT_PERCENT_BOX,
};

export const DEFAULT_VISUAL_PLACEMENT_GEOMETRY: HammerVisualGeometry = {
  ...HAMMER_VISUAL_DEFAULT_GEOMETRY,
};

export function normalizePlacementGeometryCandidate(candidate: Partial<HammerVisualGeometry>): HammerVisualGeometry {
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return DEFAULT_VISUAL_PLACEMENT_GEOMETRY;
  }
  return clampNormalizedGeometry({
    x,
    y,
    width,
    height,
    anchor: candidate.anchor === "center" ? "center" : "top_left",
  });
}

export function geometryToTransform(geometry: HammerVisualGeometry): HammerImagePlacementTransform {
  return geometryToPercentBox(geometry);
}

export function transformToGeometry(transform: HammerImagePlacementTransform): HammerVisualGeometry {
  return percentBoxToGeometry(transform, "top_left");
}

export function resolvePlacementGeometry(
  placement: Pick<HammerVisualPlacementRecord, "overlay_geometry"> | null | undefined,
): HammerVisualGeometry {
  return normalizePlacementGeometryCandidate(placement?.overlay_geometry ?? DEFAULT_VISUAL_PLACEMENT_GEOMETRY);
}

export function clampImagePlacementTransform(transform: HammerImagePlacementTransform): HammerImagePlacementTransform {
  return geometryToTransform(clampNormalizedGeometry(transformToGeometry(transform)));
}

export function resolvePlacementAnimationPreset(
  placement: HammerVisualPlacementRecord | null | undefined,
): HammerImageAnimationPreset {
  const preset = placement?.animation_preset ?? null;
  return (
    preset === "fade_in"
    || preset === "fade_out"
    || preset === "fade_in_out"
    || preset === "flip_in"
    || preset === "flip_out"
    || preset === "shutter_in"
    || preset === "shutter_out"
    || preset === "shutter_in_fade_out"
    || preset === "none"
  ) ? preset : "none";
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export const IMAGE_ANIMATION_PRESET_OPTIONS: Array<{ id: HammerImageAnimationPreset; label: string }> = [
  { id: "none", label: "None" },
  { id: "fade_in", label: "Fade In" },
  { id: "fade_out", label: "Fade Out" },
  { id: "fade_in_out", label: "Fade In + Out" },
  { id: "flip_in", label: "Flip In" },
  { id: "flip_out", label: "Flip Out" },
  { id: "shutter_in", label: "Shutter In" },
  { id: "shutter_out", label: "Shutter Out" },
  { id: "shutter_in_fade_out", label: "Shutter In + Fade Out" },
];

export const PACKAGING_INTRO_ENTRY_ID = "packaging:intro";
export const PACKAGING_OUTRO_ENTRY_ID = "packaging:outro";
export const PACKAGING_LOGO_ENTRY_ID = "packaging:logo";

export const LOGO_POSITION_OPTIONS: Array<{ id: HammerLogoOverlayPosition; label: string }> = [
  { id: "top_left", label: "Top Left" },
  { id: "top_right", label: "Top Right" },
  { id: "bottom_left", label: "Bottom Left" },
  { id: "bottom_right", label: "Bottom Right" },
];

export const LOGO_SIZE_OPTIONS: Array<{ id: HammerLogoOverlaySize; label: string }> = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

export function positionFromLogoOption(
  position: HammerLogoOverlayPosition,
  size: HammerLogoOverlaySize,
): HammerVisualGeometry {
  const edgePadding = 0.04;
  const sizeValue = size === "small" ? 0.12 : size === "large" ? 0.24 : 0.18;
  const width = sizeValue;
  const height = sizeValue;
  const x = position === "top_right" || position === "bottom_right"
    ? 1 - width - edgePadding
    : edgePadding;
  const y = position === "bottom_left" || position === "bottom_right"
    ? 1 - height - edgePadding
    : edgePadding;
  return clampNormalizedGeometry({
    x,
    y,
    width,
    height,
    anchor: "top_left",
  });
}

export function resolveImageAnimationClass(preset: HammerImageAnimationPreset): string {
  if (preset === "fade_in") return "is-anim-fade-in";
  if (preset === "fade_out") return "is-anim-fade-out";
  if (preset === "fade_in_out") return "is-anim-fade-in-out";
  if (preset === "flip_in") return "is-anim-flip-in";
  if (preset === "flip_out") return "is-anim-flip-out";
  if (preset === "shutter_in") return "is-anim-shutter-in";
  if (preset === "shutter_out") return "is-anim-shutter-out";
  if (preset === "shutter_in_fade_out") return "is-anim-shutter-in-fade-out";
  return "";
}