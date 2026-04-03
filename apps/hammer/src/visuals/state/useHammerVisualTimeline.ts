import { useMemo, useReducer } from "react";
import { createEmptyVisualTimelineState } from "../model/hammerVisualDefaults";
import type {
  HammerVisualAnchorHint,
  HammerVisualAnimation,
  HammerVisualAsset,
  HammerVisualClip,
  HammerVisualGeometry,
  HammerVisualTimelineState,
} from "../model/hammerVisualTypes";
import {
  selectEnabledClipsAtTimeSorted,
  selectRenderModelAtPlayhead,
  selectSelectedAsset,
  selectSelectedClip,
} from "./hammerVisualSelectors";
import { hammerVisualTimelineReducer } from "./hammerVisualReducer";

export interface UseHammerVisualTimelineOptions {
  initialState?: HammerVisualTimelineState;
  playheadSec?: number;
  clock?: () => string;
}

export function useHammerVisualTimeline(options?: UseHammerVisualTimelineOptions) {
  const clock = options?.clock ?? (() => new Date().toISOString());
  const [state, dispatch] = useReducer(
    hammerVisualTimelineReducer,
    options?.initialState ?? createEmptyVisualTimelineState(),
  );

  const playheadSec = options?.playheadSec ?? 0;
  const selectedClip = selectSelectedClip(state);
  const selectedAsset = selectSelectedAsset(state);
  const activeClips = selectEnabledClipsAtTimeSorted(state, playheadSec);
  const renderModel = selectRenderModelAtPlayhead(state, playheadSec);

  const actions = useMemo(() => ({
    loadTimeline: (timeline: HammerVisualTimelineState) => {
      dispatch({ type: "LOAD_TIMELINE", timeline });
    },
    upsertAssets: (assets: HammerVisualAsset[]) => {
      dispatch({ type: "UPSERT_ASSETS", assets, updated_at: clock() });
    },
    createClip: (clip: HammerVisualClip) => {
      dispatch({ type: "CREATE_CLIP", clip, updated_at: clock() });
    },
    createClips: (clips: HammerVisualClip[]) => {
      dispatch({ type: "CREATE_CLIPS", clips, updated_at: clock() });
    },
    updateClipTiming: (clipId: string, startSec: number, endSec: number) => {
      dispatch({ type: "UPDATE_CLIP_TIMING", clip_id: clipId, start_sec: startSec, end_sec: endSec, updated_at: clock() });
    },
    updateClipGeometry: (clipId: string, geometry: HammerVisualGeometry) => {
      dispatch({ type: "UPDATE_CLIP_GEOMETRY", clip_id: clipId, geometry, updated_at: clock() });
    },
    patchClipGeometry: (clipId: string, geometry: Partial<HammerVisualGeometry>) => {
      dispatch({ type: "PATCH_CLIP_GEOMETRY", clip_id: clipId, geometry, updated_at: clock() });
    },
    updateClipAnimation: (clipId: string, animation: Partial<HammerVisualAnimation>) => {
      dispatch({ type: "UPDATE_CLIP_ANIMATION", clip_id: clipId, animation, updated_at: clock() });
    },
    updateClipOpacity: (clipId: string, opacity: number) => {
      dispatch({ type: "UPDATE_CLIP_OPACITY", clip_id: clipId, opacity, updated_at: clock() });
    },
    setClipEnabled: (clipId: string, enabled: boolean) => {
      dispatch({ type: "SET_CLIP_ENABLED", clip_id: clipId, enabled, updated_at: clock() });
    },
    setClipLocked: (clipId: string, locked: boolean) => {
      dispatch({ type: "SET_CLIP_LOCKED", clip_id: clipId, locked, updated_at: clock() });
    },
    setClipZIndex: (clipId: string, zIndex: number) => {
      dispatch({ type: "SET_CLIP_Z_INDEX", clip_id: clipId, z_index: zIndex, updated_at: clock() });
    },
    moveClipToLane: (clipId: string, laneId: string, index?: number) => {
      dispatch({ type: "MOVE_CLIP_TO_LANE", clip_id: clipId, lane_id: laneId, index, updated_at: clock() });
    },
    deleteClip: (clipId: string) => {
      dispatch({ type: "DELETE_CLIP", clip_id: clipId, updated_at: clock() });
    },
    duplicateClip: (clipId: string, newClipId?: string) => {
      dispatch({ type: "DUPLICATE_CLIP", clip_id: clipId, new_clip_id: newClipId, updated_at: clock() });
    },
    selectClip: (clipId: string | null) => {
      dispatch({ type: "SELECT_CLIP", clip_id: clipId });
    },
    detachClipAnchor: (clipId: string) => {
      dispatch({ type: "DETACH_CLIP_ANCHOR", clip_id: clipId, updated_at: clock() });
    },
    relabelClipAnchor: (clipId: string, anchorHint: HammerVisualAnchorHint) => {
      dispatch({ type: "RELABEL_CLIP_ANCHOR", clip_id: clipId, anchor_hint: anchorHint, updated_at: clock() });
    },
  }), [clock]);

  return {
    state,
    dispatch,
    actions,
    selectedClip,
    selectedAsset,
    activeClips,
    renderModel,
  };
}
