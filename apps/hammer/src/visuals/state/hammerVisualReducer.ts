import { createDefaultVisualLane, createEmptyVisualTimelineState } from "../model/hammerVisualDefaults";
import {
  assertValidTimelineState,
  clampOpacity,
  normalizeAnchorHint,
  normalizeAnimation,
  normalizeGeometry,
  normalizeFitMode,
  normalizeSecRange,
  normalizeZIndex,
} from "../model/hammerVisualGuards";
import type {
  HammerVisualAsset,
  HammerVisualClip,
  HammerVisualLane,
  HammerVisualTimelineState,
} from "../model/hammerVisualTypes";
import type { HammerVisualTimelineAction } from "./hammerVisualActions";

function readTimestamp(explicit: string | undefined): string {
  return explicit ?? new Date().toISOString();
}

function cloneLane(lane: HammerVisualLane): HammerVisualLane {
  return {
    ...lane,
    clip_ids: [...lane.clip_ids],
  };
}

function cloneClip(clip: HammerVisualClip): HammerVisualClip {
  return {
    ...clip,
    uncertainty_flags: [...clip.uncertainty_flags],
    geometry: { ...clip.geometry },
    animation: { ...clip.animation },
    anchor_hint: {
      ...clip.anchor_hint,
      matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
    },
  };
}

function cloneAsset(asset: HammerVisualAsset): HammerVisualAsset {
  return { ...asset };
}

function ensureLane(
  state: HammerVisualTimelineState,
  laneId: string,
): HammerVisualTimelineState {
  if (state.lanes.some((lane) => lane.lane_id === laneId)) {
    return state;
  }
  return {
    ...state,
    lanes: [
      ...state.lanes.map(cloneLane),
      createDefaultVisualLane({
        lane_id: laneId,
        label: laneId === "lane:primary" ? "Visuals" : laneId,
      }),
    ],
  };
}

function mountClipInLane(
  lanes: HammerVisualLane[],
  laneId: string,
  clipId: string,
  index?: number,
): HammerVisualLane[] {
  return lanes.map((lane) => {
    const nextClipIds = lane.clip_ids.filter((existingId) => existingId !== clipId);
    if (lane.lane_id !== laneId) {
      return {
        ...lane,
        clip_ids: nextClipIds,
      };
    }
    const safeIndex = typeof index === "number"
      ? Math.max(0, Math.min(index, nextClipIds.length))
      : nextClipIds.length;
    nextClipIds.splice(safeIndex, 0, clipId);
    return {
      ...lane,
      clip_ids: nextClipIds,
    };
  });
}

function removeClipFromLanes(lanes: HammerVisualLane[], clipId: string): HammerVisualLane[] {
  return lanes.map((lane) => ({
    ...lane,
    clip_ids: lane.clip_ids.filter((existingId) => existingId !== clipId),
  }));
}

function normalizeClip(clip: HammerVisualClip, updatedAt: string): HammerVisualClip {
  const timing = normalizeSecRange(clip.start_sec, clip.end_sec);
  return {
    ...clip,
    start_sec: timing.start_sec,
    end_sec: timing.end_sec,
    geometry: normalizeGeometry(clip.geometry),
    fit_mode: normalizeFitMode(clip.fit_mode),
    animation: normalizeAnimation(clip.animation),
    opacity: clampOpacity(clip.opacity),
    z_index: normalizeZIndex(clip.z_index),
    enabled: clip.enabled !== false,
    locked: clip.locked === true,
    placement_status: clip.placement_status === "uncertain" ? "uncertain" : "placed",
    ingest_state: clip.ingest_state === "suggested" || clip.ingest_state === "approved" ? clip.ingest_state : null,
    uncertainty_flags: [...clip.uncertainty_flags],
    anchor_hint: normalizeAnchorHint(clip.anchor_hint),
    updated_at: updatedAt,
  };
}

function nextState(
  state: HammerVisualTimelineState,
  updatedAt: string,
  apply: (draft: HammerVisualTimelineState) => HammerVisualTimelineState,
): HammerVisualTimelineState {
  const drafted = apply({
    ...state,
    assets: state.assets.map(cloneAsset),
    lanes: state.lanes.map(cloneLane),
    clips: state.clips.map(cloneClip),
  });

  const next = {
    ...drafted,
    revision: state.revision + 1,
    updated_at: updatedAt,
  };
  return assertValidTimelineState(next);
}

function replaceClip(
  state: HammerVisualTimelineState,
  clipId: string,
  replace: (clip: HammerVisualClip) => HammerVisualClip,
): HammerVisualTimelineState | null {
  let changed = false;
  const clips = state.clips.map((clip) => {
    if (clip.clip_id !== clipId) return clip;
    const nextClip = replace(clip);
    changed = nextClip !== clip;
    return nextClip;
  });
  if (!changed) return null;
  return {
    ...state,
    clips,
  };
}

function findClip(state: HammerVisualTimelineState, clipId: string): HammerVisualClip | null {
  return state.clips.find((clip) => clip.clip_id === clipId) ?? null;
}

function createDuplicateClipId(state: HammerVisualTimelineState, clipId: string): string {
  const base = `${clipId}:copy`;
  let attempt = 1;
  let nextId = `${base}:${attempt}`;
  while (state.clips.some((clip) => clip.clip_id === nextId)) {
    attempt += 1;
    nextId = `${base}:${attempt}`;
  }
  return nextId;
}

export function hammerVisualTimelineReducer(
  state: HammerVisualTimelineState = createEmptyVisualTimelineState(),
  action: HammerVisualTimelineAction,
): HammerVisualTimelineState {
  switch (action.type) {
    case "LOAD_TIMELINE":
      return assertValidTimelineState(createEmptyVisualTimelineState(action.timeline));
    case "SELECT_CLIP":
      return {
        ...state,
        selected_clip_id: action.clip_id,
      };
    case "UPSERT_ASSETS": {
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => {
        const assetsById = new Map(draft.assets.map((asset) => [asset.asset_id, asset]));
        for (const asset of action.assets) {
          assetsById.set(asset.asset_id, {
            ...asset,
            updated_at: asset.updated_at || updatedAt,
          });
        }
        return {
          ...draft,
          assets: [...assetsById.values()],
        };
      });
    }
    case "CREATE_CLIP": {
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => {
        const laneReady = ensureLane(draft, action.clip.lane_id);
        const clip = normalizeClip(action.clip, updatedAt);
        return {
          ...laneReady,
          selected_clip_id: clip.clip_id,
          clips: [...laneReady.clips, clip],
          lanes: mountClipInLane(laneReady.lanes, clip.lane_id, clip.clip_id),
        };
      });
    }
    case "CREATE_CLIPS": {
      if (action.clips.length === 0) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => {
        let nextDraft = draft;
        const createdClips: HammerVisualClip[] = [];
        for (const rawClip of action.clips) {
          nextDraft = ensureLane(nextDraft, rawClip.lane_id);
          const clip = normalizeClip(rawClip, updatedAt);
          createdClips.push(clip);
          nextDraft = {
            ...nextDraft,
            lanes: mountClipInLane(nextDraft.lanes, clip.lane_id, clip.clip_id),
          };
        }
        return {
          ...nextDraft,
          selected_clip_id: createdClips.at(-1)?.clip_id ?? nextDraft.selected_clip_id,
          clips: [...nextDraft.clips, ...createdClips],
        };
      });
    }
    case "UPDATE_CLIP_TIMING": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip || currentClip.locked) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => {
        const replaced = replaceClip(draft, action.clip_id, (clip) => {
          const timing = normalizeSecRange(action.start_sec, action.end_sec);
          return {
            ...clip,
            start_sec: timing.start_sec,
            end_sec: timing.end_sec,
            updated_at: updatedAt,
          };
        });
        return replaced ?? draft;
      });
    }
    case "UPDATE_CLIP_GEOMETRY": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip || currentClip.locked) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          geometry: normalizeGeometry(action.geometry),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "UPDATE_CLIP_FIT_MODE": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip || currentClip.locked) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          fit_mode: normalizeFitMode(action.fit_mode),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "PATCH_CLIP_GEOMETRY": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip || currentClip.locked) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          geometry: normalizeGeometry({
            ...clip.geometry,
            ...action.geometry,
          }),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "UPDATE_CLIP_ANIMATION": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          animation: normalizeAnimation({
            ...clip.animation,
            ...action.animation,
          }),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "UPDATE_CLIP_OPACITY": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          opacity: clampOpacity(action.opacity),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "SET_CLIP_ENABLED": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          enabled: action.enabled,
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "SET_CLIP_LOCKED": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          locked: action.locked,
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "SET_CLIP_Z_INDEX": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          z_index: normalizeZIndex(action.z_index),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "MOVE_CLIP_TO_LANE": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => {
        const laneReady = ensureLane(draft, action.lane_id);
        const replaced = replaceClip(laneReady, action.clip_id, (clip) => ({
          ...clip,
          lane_id: action.lane_id,
          updated_at: updatedAt,
        })) ?? laneReady;
        return {
          ...replaced,
          lanes: mountClipInLane(replaced.lanes, action.lane_id, action.clip_id, action.index),
        };
      });
    }
    case "DELETE_CLIP": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => ({
        ...draft,
        selected_clip_id: draft.selected_clip_id === action.clip_id ? null : draft.selected_clip_id,
        clips: draft.clips.filter((clip) => clip.clip_id !== action.clip_id),
        lanes: removeClipFromLanes(draft.lanes, action.clip_id),
      }));
    }
    case "DUPLICATE_CLIP": {
      const sourceClip = findClip(state, action.clip_id);
      if (!sourceClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => {
        const duplicateId = action.new_clip_id ?? createDuplicateClipId(draft, sourceClip.clip_id);
        const duplicate = normalizeClip({
          ...cloneClip(sourceClip),
          clip_id: duplicateId,
        }, updatedAt);
        return {
          ...draft,
          selected_clip_id: duplicate.clip_id,
          clips: [...draft.clips, duplicate],
          lanes: mountClipInLane(draft.lanes, duplicate.lane_id, duplicate.clip_id),
        };
      });
    }
    case "DETACH_CLIP_ANCHOR": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip || currentClip.anchor_hint.detached) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          anchor_hint: {
            ...clip.anchor_hint,
            detached: true,
          },
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    case "RELABEL_CLIP_ANCHOR": {
      const currentClip = findClip(state, action.clip_id);
      if (!currentClip) return state;
      const updatedAt = readTimestamp(action.updated_at);
      return nextState(state, updatedAt, (draft) => (
        replaceClip(draft, action.clip_id, (clip) => ({
          ...clip,
          anchor_hint: normalizeAnchorHint(action.anchor_hint),
          updated_at: updatedAt,
        })) ?? draft
      ));
    }
    default:
      return state;
  }
}
