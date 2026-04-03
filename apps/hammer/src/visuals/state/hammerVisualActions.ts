import type {
  HammerVisualAnchorHint,
  HammerVisualAnimation,
  HammerVisualAsset,
  HammerVisualClip,
  HammerVisualGeometry,
  HammerVisualTimelineState,
} from "../model/hammerVisualTypes";

interface HammerVisualMutationMeta {
  updated_at?: string;
}

export type HammerVisualTimelineAction =
  | {
    type: "LOAD_TIMELINE";
    timeline: HammerVisualTimelineState;
  }
  | ({
    type: "UPSERT_ASSETS";
    assets: HammerVisualAsset[];
  } & HammerVisualMutationMeta)
  | ({
    type: "CREATE_CLIP";
    clip: HammerVisualClip;
  } & HammerVisualMutationMeta)
  | ({
    type: "CREATE_CLIPS";
    clips: HammerVisualClip[];
  } & HammerVisualMutationMeta)
  | ({
    type: "UPDATE_CLIP_TIMING";
    clip_id: string;
    start_sec: number;
    end_sec: number;
  } & HammerVisualMutationMeta)
  | ({
    type: "UPDATE_CLIP_GEOMETRY";
    clip_id: string;
    geometry: HammerVisualGeometry;
  } & HammerVisualMutationMeta)
  | ({
    type: "PATCH_CLIP_GEOMETRY";
    clip_id: string;
    geometry: Partial<HammerVisualGeometry>;
  } & HammerVisualMutationMeta)
  | ({
    type: "UPDATE_CLIP_ANIMATION";
    clip_id: string;
    animation: Partial<HammerVisualAnimation>;
  } & HammerVisualMutationMeta)
  | ({
    type: "UPDATE_CLIP_OPACITY";
    clip_id: string;
    opacity: number;
  } & HammerVisualMutationMeta)
  | ({
    type: "SET_CLIP_ENABLED";
    clip_id: string;
    enabled: boolean;
  } & HammerVisualMutationMeta)
  | ({
    type: "SET_CLIP_LOCKED";
    clip_id: string;
    locked: boolean;
  } & HammerVisualMutationMeta)
  | ({
    type: "SET_CLIP_Z_INDEX";
    clip_id: string;
    z_index: number;
  } & HammerVisualMutationMeta)
  | ({
    type: "MOVE_CLIP_TO_LANE";
    clip_id: string;
    lane_id: string;
    index?: number;
  } & HammerVisualMutationMeta)
  | ({
    type: "DELETE_CLIP";
    clip_id: string;
  } & HammerVisualMutationMeta)
  | ({
    type: "DUPLICATE_CLIP";
    clip_id: string;
    new_clip_id?: string;
  } & HammerVisualMutationMeta)
  | {
    type: "SELECT_CLIP";
    clip_id: string | null;
  }
  | ({
    type: "DETACH_CLIP_ANCHOR";
    clip_id: string;
  } & HammerVisualMutationMeta)
  | ({
    type: "RELABEL_CLIP_ANCHOR";
    clip_id: string;
    anchor_hint: HammerVisualAnchorHint;
  } & HammerVisualMutationMeta);
