import type {
  HammerLinkedSelectionTextSelection,
  HammerLinkedSelectionVisualItem,
} from "./hammerLinkedSelection";

export type HammerWorkspaceShellSelectionOrigin = "system" | "transcript" | "timeline" | "playhead";

export type HammerSelectedTranscriptRange = {
  start: number;
  end: number;
  text: string;
};

export type HammerSelectedTranscriptRangeDetail = HammerLinkedSelectionTextSelection;

export type HammerWorkspaceShellSelectionPlacementItem = HammerLinkedSelectionVisualItem & {
  kind: "image" | "broll" | "reference_clip";
};

export function toHammerLinkedSelectionVisualItems(
  items: readonly HammerWorkspaceShellSelectionPlacementItem[],
): HammerLinkedSelectionVisualItem[] {
  return items.map((item) => ({
    id: item.id,
    anchorSegmentId: item.anchorSegmentId,
    startSec: item.startSec,
    endSec: item.endSec,
  }));
}