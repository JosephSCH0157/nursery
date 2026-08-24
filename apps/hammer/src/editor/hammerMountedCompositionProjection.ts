import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { deriveAssetKind } from "./hammerWorkspaceShellMediaUtils";
import {
  resolveImageFirstEditablePreviewMoment,
  type HammerImagePlacementDraftWindow,
  type HammerSourceImageItem,
} from "./hammerWorkspaceShellVisualUtils";

export function projectHammerMountedCompositionClips(args: {
  timeline: HammerVisualTimelineState | null;
  assets?: HammerVisualTimelineState["assets"];
  transcriptSegments: HammerPersistedStructuredTranscript["segments"];
  selectedSegmentId?: string | null;
  draftWindows?: Readonly<Record<string, HammerImagePlacementDraftWindow>>;
}): HammerSourceImageItem[] {
  const assetsById = new Map((args.assets ?? args.timeline?.assets ?? []).map((asset) => [asset.asset_id, asset]));
  const draftWindows = args.draftWindows ?? {};
  return (args.timeline?.clips ?? []).map((clip) => {
    const asset = clip.asset_id ? (assetsById.get(clip.asset_id) ?? null) : null;
    const kind = deriveAssetKind({ visualMode: clip.visual_mode, assetPath: asset?.path ?? null });
    if (kind !== "image" && kind !== "broll" && kind !== "reference_clip") return null;
    const startSec = draftWindows[clip.clip_id]?.startSec ?? clip.start_sec;
    const endSec = draftWindows[clip.clip_id]?.endSec ?? clip.end_sec;
    return {
      id: clip.clip_id,
      label: clip.label ?? asset?.label ?? asset?.asset_ref ?? clip.entry_id ?? clip.clip_id,
      kind,
      anchorSegmentId: clip.anchor_hint.anchor_segment_id
        ?? clip.anchor_hint.matched_segment_ids[0]
        ?? args.selectedSegmentId
        ?? args.transcriptSegments[0]?.segment_id
        ?? "segment:unknown",
      anchorText: clip.anchor_hint.anchor_text ?? null,
      anchorLabel: clip.anchor_hint.anchor_label ?? null,
      startSec,
      endSec,
      status: clip.placement_status,
      confidence: clip.confidence,
      visualMode: clip.visual_mode,
      assetPath: asset?.path ?? null,
      firstVisibleEditableSec: kind === "image"
        ? resolveImageFirstEditablePreviewMoment({ startSec, endSec, animationPreset: clip.animation?.preset ?? null })
        : null,
      anchorStatus: clip.semantic_anchor.status,
    } satisfies HammerSourceImageItem;
  }).filter((item): item is HammerSourceImageItem => item !== null);
}
