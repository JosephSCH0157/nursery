import {
  createDefaultVisualAnimation,
  createDefaultVisualGeometry,
} from "./hammerVisualDefaults";
import {
  HAMMER_VISUAL_DEFAULT_MIN_DURATION_SEC,
  HAMMER_VISUAL_TIMELINE_SOURCE_MODE,
  HAMMER_VISUAL_TIMELINE_VERSION,
  type HammerVisualAnchorHint,
  type HammerVisualAnimation,
  type HammerVisualAnimationPreset,
  type HammerVisualGeometry,
  type HammerVisualGeometryAnchor,
  type HammerVisualTimelineState,
} from "./hammerVisualTypes";

const VALID_GEOMETRY_ANCHORS = new Set<HammerVisualGeometryAnchor>(["center", "top_left"]);
const VALID_ANIMATION_PRESETS = new Set<HammerVisualAnimationPreset>([
  "none",
  "fade_in",
  "fade_out",
  "fade_in_out",
  "flip_in",
  "flip_out",
  "shutter_in",
  "shutter_out",
  "shutter_in_fade_out",
]);

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampUnitInterval(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function normalizeSecRange(
  startSec: number,
  endSec: number,
  options?: {
    floorSec?: number;
    ceilSec?: number | null;
    minDurationSec?: number;
  },
): { start_sec: number; end_sec: number } {
  const floorSec = readFiniteNumber(options?.floorSec) ?? 0;
  const ceilSec = readFiniteNumber(options?.ceilSec);
  const minDurationSec = Math.max(
    HAMMER_VISUAL_DEFAULT_MIN_DURATION_SEC,
    readFiniteNumber(options?.minDurationSec) ?? HAMMER_VISUAL_DEFAULT_MIN_DURATION_SEC,
  );

  let normalizedStart = readFiniteNumber(startSec) ?? floorSec;
  let normalizedEnd = readFiniteNumber(endSec) ?? normalizedStart + minDurationSec;

  if (normalizedStart < floorSec) normalizedStart = floorSec;
  if (ceilSec != null && normalizedStart > ceilSec) normalizedStart = ceilSec;
  if (normalizedEnd < normalizedStart + minDurationSec) {
    normalizedEnd = normalizedStart + minDurationSec;
  }
  if (ceilSec != null && normalizedEnd > ceilSec) {
    normalizedEnd = ceilSec;
    if (normalizedEnd < normalizedStart + minDurationSec) {
      normalizedStart = Math.max(floorSec, normalizedEnd - minDurationSec);
    }
  }

  return {
    start_sec: Number(normalizedStart.toFixed(3)),
    end_sec: Number(normalizedEnd.toFixed(3)),
  };
}

export function clampOpacity(value: number | null | undefined, fallback = 1): number {
  return Number(clampUnitInterval(readFiniteNumber(value) ?? fallback, fallback).toFixed(3));
}

export function normalizeZIndex(value: number | null | undefined, fallback = 0): number {
  const normalized = readFiniteNumber(value);
  if (normalized == null) return fallback;
  return Math.trunc(normalized);
}

export function normalizeGeometry(
  value: Partial<HammerVisualGeometry> | null | undefined,
): HammerVisualGeometry {
  const defaults = createDefaultVisualGeometry();
  const x = clampUnitInterval(readFiniteNumber(value?.x) ?? defaults.x, defaults.x);
  const y = clampUnitInterval(readFiniteNumber(value?.y) ?? defaults.y, defaults.y);
  const width = clampUnitInterval(readFiniteNumber(value?.width) ?? defaults.width, defaults.width);
  const height = clampUnitInterval(readFiniteNumber(value?.height) ?? defaults.height, defaults.height);
  const anchor = VALID_GEOMETRY_ANCHORS.has(value?.anchor as HammerVisualGeometryAnchor)
    ? value?.anchor as HammerVisualGeometryAnchor
    : defaults.anchor;

  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    width: Number(Math.max(0.01, width).toFixed(3)),
    height: Number(Math.max(0.01, height).toFixed(3)),
    anchor,
  };
}

export function normalizeAnimation(
  value: Partial<HammerVisualAnimation> | null | undefined,
): HammerVisualAnimation {
  const defaults = createDefaultVisualAnimation();
  const preset = VALID_ANIMATION_PRESETS.has(value?.preset as HammerVisualAnimationPreset)
    ? value?.preset as HammerVisualAnimationPreset
    : defaults.preset;
  return { preset };
}

export function normalizeAnchorHint(
  value: Partial<HammerVisualAnchorHint> | null | undefined,
): HammerVisualAnchorHint {
  return {
    anchor_segment_id: readTrimmedString(value?.anchor_segment_id),
    matched_segment_ids: Array.isArray(value?.matched_segment_ids)
      ? value.matched_segment_ids
        .map((segmentId) => readTrimmedString(segmentId))
        .filter((segmentId): segmentId is string => Boolean(segmentId))
      : [],
    anchor_text: readTrimmedString(value?.anchor_text),
    anchor_label: readTrimmedString(value?.anchor_label),
    detached: value?.detached === true,
  };
}

export function assertValidTimelineState(
  state: HammerVisualTimelineState,
): HammerVisualTimelineState {
  assertCondition(state.version === HAMMER_VISUAL_TIMELINE_VERSION, "Visual timeline version must be 1.");
  assertCondition(state.source_mode === HAMMER_VISUAL_TIMELINE_SOURCE_MODE, "Visual timeline source_mode must be packaging.");
  assertCondition(Number.isInteger(state.revision) && state.revision >= 1, "Visual timeline revision must be a positive integer.");
  assertCondition(Boolean(readTrimmedString(state.updated_at)), "Visual timeline updated_at is required.");
  assertCondition(Array.isArray(state.assets), "Visual timeline assets must be an array.");
  assertCondition(Array.isArray(state.lanes), "Visual timeline lanes must be an array.");
  assertCondition(Array.isArray(state.clips), "Visual timeline clips must be an array.");
  if (state.debug_origin != null) {
    assertCondition(
      state.debug_origin === "canonical_load"
      || state.debug_origin === "legacy_migration"
      || state.debug_origin === "empty_init",
      "Visual timeline debug_origin is invalid.",
    );
  }

  const assetIds = new Set<string>();
  for (const asset of state.assets) {
    assertCondition(Boolean(readTrimmedString(asset.asset_id)), "Visual asset asset_id is required.");
    assertCondition(Boolean(readTrimmedString(asset.asset_ref)), "Visual asset asset_ref is required.");
    assertCondition(Boolean(readTrimmedString(asset.updated_at)), "Visual asset updated_at is required.");
    assertCondition(!assetIds.has(asset.asset_id), `Duplicate visual asset id: ${asset.asset_id}`);
    assetIds.add(asset.asset_id);
  }

  const laneIds = new Set<string>();
  const laneClipIds = new Set<string>();
  for (const lane of state.lanes) {
    assertCondition(Boolean(readTrimmedString(lane.lane_id)), "Visual lane lane_id is required.");
    assertCondition(Boolean(readTrimmedString(lane.label)), "Visual lane label is required.");
    assertCondition(Array.isArray(lane.clip_ids), `Visual lane ${lane.lane_id} clip_ids must be an array.`);
    assertCondition(!laneIds.has(lane.lane_id), `Duplicate visual lane id: ${lane.lane_id}`);
    laneIds.add(lane.lane_id);
    for (const clipId of lane.clip_ids) {
      const normalizedClipId = readTrimmedString(clipId);
      assertCondition(normalizedClipId != null, `Visual lane ${lane.lane_id} contains an empty clip id.`);
      assertCondition(!laneClipIds.has(normalizedClipId), `Visual clip ${normalizedClipId} appears in multiple lane positions.`);
      laneClipIds.add(normalizedClipId);
    }
  }

  const clipIds = new Set<string>();
  for (const clip of state.clips) {
    assertCondition(Boolean(readTrimmedString(clip.clip_id)), "Visual clip clip_id is required.");
    assertCondition(Boolean(readTrimmedString(clip.lane_id)), `Visual clip ${clip.clip_id} lane_id is required.`);
    assertCondition(laneIds.has(clip.lane_id), `Visual clip ${clip.clip_id} references an unknown lane ${clip.lane_id}.`);
    assertCondition(!clipIds.has(clip.clip_id), `Duplicate visual clip id: ${clip.clip_id}`);
    clipIds.add(clip.clip_id);
    assertCondition(Boolean(readTrimmedString(clip.updated_at)), `Visual clip ${clip.clip_id} updated_at is required.`);
    const normalizedRange = normalizeSecRange(clip.start_sec, clip.end_sec);
    assertCondition(
      normalizedRange.start_sec === Number(clip.start_sec.toFixed(3))
      && normalizedRange.end_sec === Number(clip.end_sec.toFixed(3)),
      `Visual clip ${clip.clip_id} has an invalid timing range.`,
    );
    const normalizedGeometry = normalizeGeometry(clip.geometry);
    assertCondition(
      normalizedGeometry.x === clip.geometry.x
      && normalizedGeometry.y === clip.geometry.y
      && normalizedGeometry.width === clip.geometry.width
      && normalizedGeometry.height === clip.geometry.height
      && normalizedGeometry.anchor === clip.geometry.anchor,
      `Visual clip ${clip.clip_id} has invalid geometry.`,
    );
    assertCondition(
      clampOpacity(clip.opacity) === clip.opacity,
      `Visual clip ${clip.clip_id} opacity must be within [0, 1].`,
    );
    assertCondition(
      normalizeZIndex(clip.z_index) === clip.z_index,
      `Visual clip ${clip.clip_id} z_index must be an integer.`,
    );
    const normalizedAnimation = normalizeAnimation(clip.animation);
    assertCondition(
      normalizedAnimation.preset === clip.animation.preset,
      `Visual clip ${clip.clip_id} animation is invalid.`,
    );
    const normalizedAnchor = normalizeAnchorHint(clip.anchor_hint);
    assertCondition(
      normalizedAnchor.anchor_segment_id === clip.anchor_hint.anchor_segment_id
      && normalizedAnchor.anchor_text === clip.anchor_hint.anchor_text
      && normalizedAnchor.anchor_label === clip.anchor_hint.anchor_label
      && normalizedAnchor.detached === clip.anchor_hint.detached
      && normalizedAnchor.matched_segment_ids.length === clip.anchor_hint.matched_segment_ids.length
      && normalizedAnchor.matched_segment_ids.every((segmentId, index) => segmentId === clip.anchor_hint.matched_segment_ids[index]),
      `Visual clip ${clip.clip_id} anchor_hint is invalid.`,
    );
    if (clip.asset_id) {
      assertCondition(assetIds.has(clip.asset_id), `Visual clip ${clip.clip_id} references unknown asset ${clip.asset_id}.`);
    }
    assertCondition(laneClipIds.has(clip.clip_id), `Visual clip ${clip.clip_id} is not mounted in a lane.`);
  }

  for (const clipId of laneClipIds) {
    assertCondition(clipIds.has(clipId), `Lane references unknown visual clip ${clipId}.`);
  }

  if (state.selected_clip_id) {
    assertCondition(clipIds.has(state.selected_clip_id), `Selected visual clip ${state.selected_clip_id} does not exist.`);
  }

  return state;
}
