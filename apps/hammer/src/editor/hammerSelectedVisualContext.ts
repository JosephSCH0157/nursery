import type { HammerVisualAssetKind } from "../visuals/model/hammerVisualTypes";
import { deriveAssetKind } from "./hammerWorkspaceShellMediaUtils";

export type HammerSelectedVisualKind = "image" | "broll" | "reference_clip";

export type HammerSelectedVisualCapabilities = Readonly<{
  remove: boolean;
  retime: boolean;
  anchor: boolean;
  transform: boolean;
  animate: boolean;
  rebind: boolean;
  replace: boolean;
  revert: boolean;
  transition: boolean;
}>;

export type HammerSelectedVisualContext =
  | Readonly<{
      status: "selected";
      placementId: string;
      clipId: string;
      assetId: string | null;
      laneId: string;
      kind: HammerSelectedVisualKind;
      preferredTool: "images" | "broll";
      preferredPass: "image_placement" | "image_animation";
      capabilities: HammerSelectedVisualCapabilities;
    }>
  | Readonly<{ status: "none" }>
  | Readonly<{
      status: "unsupported";
      placementId: string | null;
      reason: string;
    }>;

type SelectedVisualAssetInput = Readonly<{
  asset_id: string;
  kind: HammerVisualAssetKind;
  path: string | null;
}>;

type SelectedVisualClipInput = Readonly<{
  clip_id: string;
  asset_id: string | null;
  lane_id: string;
  visual_mode: string | null;
}>;

type SelectedVisualLaneInput = Readonly<{
  lane_id: string;
  clip_ids: readonly string[];
}>;

export type HammerSelectedVisualContextInput = Readonly<{
  selectedPlacementId: string | null;
  timeline: Readonly<{
    assets: readonly SelectedVisualAssetInput[];
    clips: readonly SelectedVisualClipInput[];
    lanes: readonly SelectedVisualLaneInput[];
  }> | null;
}>;

const IMAGE_CAPABILITIES: HammerSelectedVisualCapabilities = Object.freeze({
  remove: true,
  retime: true,
  anchor: true,
  transform: true,
  animate: true,
  rebind: false,
  replace: false,
  revert: false,
  transition: false,
});

const BROLL_CAPABILITIES: HammerSelectedVisualCapabilities = Object.freeze({
  remove: true,
  retime: true,
  anchor: false,
  transform: false,
  animate: false,
  rebind: true,
  replace: true,
  revert: true,
  transition: true,
});

const NONE_CONTEXT: HammerSelectedVisualContext = Object.freeze({ status: "none" });

function unsupported(placementId: string | null, reason: string): HammerSelectedVisualContext {
  return { status: "unsupported", placementId, reason };
}

function normalizeAssetKind(kind: HammerVisualAssetKind): HammerSelectedVisualKind {
  return kind === "contextual_data_composite" ? "reference_clip" : kind;
}

export function deriveHammerSelectedVisualContext(
  input: HammerSelectedVisualContextInput,
): HammerSelectedVisualContext {
  if (input.selectedPlacementId === null) return NONE_CONTEXT;
  const placementId = input.selectedPlacementId.trim();
  if (!placementId) return unsupported(null, "Selected visual placement identity is missing.");
  if (!input.timeline) return unsupported(placementId, "Canonical visual timeline is unavailable.");

  const clip = input.timeline.clips.find((candidate) => candidate.clip_id === placementId);
  if (!clip) return unsupported(placementId, `Selected visual placement ${placementId} is absent from the canonical timeline.`);
  if (!clip.clip_id.trim()) return unsupported(placementId, "Selected visual clip identity is missing.");
  if (!clip.lane_id.trim()) return unsupported(placementId, "Selected visual lane identity is missing.");

  const containingLanes = input.timeline.lanes.filter((lane) => lane.clip_ids.includes(clip.clip_id));
  const declaredLane = input.timeline.lanes.find((lane) => lane.lane_id === clip.lane_id) ?? null;
  if (!declaredLane || !declaredLane.clip_ids.includes(clip.clip_id) || containingLanes.length !== 1) {
    return unsupported(placementId, `Selected visual placement ${placementId} has contradictory lane membership.`);
  }

  const asset = clip.asset_id === null
    ? null
    : (input.timeline.assets.find((candidate) => candidate.asset_id === clip.asset_id) ?? null);
  if (clip.asset_id !== null && !asset) {
    return unsupported(placementId, `Selected visual asset ${clip.asset_id} is absent from canonical asset metadata.`);
  }

  const derivedKind = deriveAssetKind({ visualMode: clip.visual_mode, assetPath: asset?.path ?? null });
  if (derivedKind !== "image" && derivedKind !== "broll" && derivedKind !== "reference_clip") {
    return unsupported(placementId, `Selected visual placement ${placementId} has unsupported visual kind ${derivedKind}.`);
  }
  if (asset && normalizeAssetKind(asset.kind) !== derivedKind) {
    return unsupported(placementId, `Selected visual placement ${placementId} has contradictory visual mode, path, or asset kind.`);
  }

  const isImage = derivedKind === "image";
  return {
    status: "selected",
    placementId: clip.clip_id,
    clipId: clip.clip_id,
    assetId: clip.asset_id,
    laneId: clip.lane_id,
    kind: derivedKind,
    preferredTool: isImage ? "images" : "broll",
    preferredPass: isImage ? "image_placement" : "image_animation",
    capabilities: isImage ? IMAGE_CAPABILITIES : BROLL_CAPABILITIES,
  };
}
