import type {
  HammerVisualAsset,
  HammerVisualClip,
  HammerVisualLane,
  HammerVisualTimelineState,
} from "../model/hammerVisualTypes";

export interface HammerVisualRenderLaneModel {
  lane: HammerVisualLane;
  clips: HammerVisualClip[];
}

export interface HammerVisualRenderModel {
  playhead_sec: number;
  selected_clip: HammerVisualClip | null;
  selected_asset: HammerVisualAsset | null;
  active_clips: HammerVisualClip[];
  lanes: HammerVisualRenderLaneModel[];
}

export function selectSelectedClip(
  state: HammerVisualTimelineState,
): HammerVisualClip | null {
  if (!state.selected_clip_id) return null;
  return state.clips.find((clip) => clip.clip_id === state.selected_clip_id) ?? null;
}

export function selectSelectedAsset(
  state: HammerVisualTimelineState,
): HammerVisualAsset | null {
  const selectedClip = selectSelectedClip(state);
  if (!selectedClip?.asset_id) return null;
  return state.assets.find((asset) => asset.asset_id === selectedClip.asset_id) ?? null;
}

export function selectClipsByLane(
  state: HammerVisualTimelineState,
  laneId: string,
): HammerVisualClip[] {
  const lane = state.lanes.find((candidate) => candidate.lane_id === laneId);
  if (!lane) return [];
  const clipsById = new Map(state.clips.map((clip) => [clip.clip_id, clip]));
  return lane.clip_ids
    .map((clipId) => clipsById.get(clipId) ?? null)
    .filter((clip): clip is HammerVisualClip => Boolean(clip));
}

export function selectEnabledClipsAtTimeSorted(
  state: HammerVisualTimelineState,
  timeSec: number,
): HammerVisualClip[] {
  return state.clips
    .filter((clip) => clip.enabled && timeSec >= clip.start_sec && timeSec < clip.end_sec)
    .sort((left, right) => {
      if (left.z_index !== right.z_index) return left.z_index - right.z_index;
      if (left.start_sec !== right.start_sec) return left.start_sec - right.start_sec;
      return left.clip_id.localeCompare(right.clip_id);
    });
}

export function selectRenderModelAtPlayhead(
  state: HammerVisualTimelineState,
  playheadSec: number,
): HammerVisualRenderModel {
  return {
    playhead_sec: playheadSec,
    selected_clip: selectSelectedClip(state),
    selected_asset: selectSelectedAsset(state),
    active_clips: selectEnabledClipsAtTimeSorted(state, playheadSec),
    lanes: state.lanes.map((lane) => ({
      lane,
      clips: selectClipsByLane(state, lane.lane_id),
    })),
  };
}
