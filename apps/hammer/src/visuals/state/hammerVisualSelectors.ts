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

export function selectClipById(
  state: HammerVisualTimelineState,
  clipId: string | null | undefined,
): HammerVisualClip | null {
  if (!clipId) return null;
  return state.clips.find((clip) => clip.clip_id === clipId) ?? null;
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

export function selectPrimaryActiveClipAtTime(
  state: HammerVisualTimelineState,
  timeSec: number,
): HammerVisualClip | null {
  const active = selectEnabledClipsAtTimeSorted(state, timeSec);
  return active.at(-1) ?? null;
}

export function selectPreviewClips(args: {
  state: HammerVisualTimelineState;
  playheadSec: number;
  isPlaybackActive: boolean;
  isScrubbing: boolean;
}): HammerVisualClip[] {
  const assetsById = new Map(args.state.assets.map((asset) => [asset.asset_id, asset]));
  return selectEnabledClipsAtTimeSorted(args.state, args.playheadSec).filter((clip) => {
    if (clip.canonical_asset_state !== "canonical_proven" || !clip.canonical_asset_id || !clip.asset_id) return false;
    const asset = assetsById.get(clip.asset_id);
    return asset?.authority_state === "canonical_proven"
      && asset.canonical_asset_id === clip.canonical_asset_id;
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
