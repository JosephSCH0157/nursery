export type HammerProposedChangeType =
  | "silence_trim"
  | "retake_removal"
  | "filler_removal"
  | "visual_placement"
  | "chapter_inference"
  | "audio_normalization";

export type HammerProposedChangeStatus =
  | "suggested"
  | "approved"
  | "rejected"
  | "modified";

export type HammerProposedChange = {
  id: string;
  type: HammerProposedChangeType;
  status: HammerProposedChangeStatus;
  label: string;
  reason: string;
  confidence: "low" | "medium" | "high" | null;
  startSec: number;
  endSec: number;
  linkedRowIds: string[];
  linkedSegmentIds: string[];
  linkedTrackId: string;
  linkedAssetId: string | null;
};

type OverlayRowLike = {
  row_id: string;
  start_sec: number;
  end_sec: number;
  anchor_segment_id: string;
  is_deleted: boolean;
  is_trimmed: boolean;
  structure: string;
};

type VisualClipLike = {
  id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  linked_row_id?: string | null;
  linked_segment_id?: string | null;
  status?: string | null;
};

type BuildArgs = {
  overlayRows: OverlayRowLike[];
  visualSuggestionClips: VisualClipLike[];
};

function getPriority(type: HammerProposedChangeType): number {
  switch (type) {
    case "retake_removal":
      return 0;
    case "filler_removal":
      return 1;
    case "visual_placement":
      return 2;
    case "chapter_inference":
      return 3;
    case "silence_trim":
      return 4;
    case "audio_normalization":
      return 5;
    default:
      return 9;
  }
}

export function buildHammerProposedChanges(args: BuildArgs): HammerProposedChange[] {
  const changes: HammerProposedChange[] = [];

  args.overlayRows.forEach((row) => {
    if (row.structure === "merge") {
      changes.push({
        id: `change-retake-${row.row_id}`,
        type: "retake_removal",
        status: "suggested",
        label: "Retake removed",
        reason: "Same-speaker continuation was merged into the current take.",
        confidence: "high",
        startSec: row.start_sec,
        endSec: row.end_sec,
        linkedRowIds: [row.row_id],
        linkedSegmentIds: [row.anchor_segment_id],
        linkedTrackId: "video-main",
        linkedAssetId: null,
      });
    }

    if (row.is_deleted) {
      changes.push({
        id: `change-filler-${row.row_id}`,
        type: "filler_removal",
        status: "suggested",
        label: "Filler removed",
        reason: "This line is staged as removable spoken-content cleanup.",
        confidence: "medium",
        startSec: row.start_sec,
        endSec: row.end_sec,
        linkedRowIds: [row.row_id],
        linkedSegmentIds: [row.anchor_segment_id],
        linkedTrackId: "video-main",
        linkedAssetId: null,
      });
    }

    if (row.is_trimmed) {
      changes.push({
        id: `change-trim-${row.row_id}`,
        type: "silence_trim",
        status: "suggested",
        label: "Silence trimmed",
        reason: "Hammer tightened pacing around this spoken segment.",
        confidence: "high",
        startSec: row.start_sec,
        endSec: row.end_sec,
        linkedRowIds: [row.row_id],
        linkedSegmentIds: [row.anchor_segment_id],
        linkedTrackId: "video-main",
        linkedAssetId: null,
      });
    }
  });

  args.visualSuggestionClips.forEach((clip) => {
    changes.push({
      id: `change-visual-${clip.id}`,
      type: "visual_placement",
      status: clip.status === "uncertain" ? "suggested" : "approved",
      label: "Image placed",
      reason: "A mapped visual was staged for this topic region.",
      confidence: clip.status === "uncertain" ? "medium" : "high",
      startSec: clip.start_sec,
      endSec: clip.end_sec,
      linkedRowIds: clip.linked_row_id ? [clip.linked_row_id] : [],
      linkedSegmentIds: clip.linked_segment_id ? [clip.linked_segment_id] : [],
      linkedTrackId: "visual-suggestions",
      linkedAssetId: clip.id,
    });
  });

  return changes.sort((a, b) => {
    const priorityDelta = getPriority(a.type) - getPriority(b.type);
    if (priorityDelta !== 0) return priorityDelta;
    return a.startSec - b.startSec;
  });
}
