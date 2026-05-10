export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlacementZone =
  | "upper_left"
  | "upper_right"
  | "lower_center"
  | "lower_left"
  | "lower_right"
  | "left_gutter"
  | "right_gutter"
  | "background_open";

export type PlacementLayoutMode = "single_person" | "multi_person" | "unknown";

export type MaskAwarePlacementInput = {
  frame: { width: number; height: number };
  overlay: { width: number; height: number };
  speakerMaskBounds: Rect[];
  reservedZones?: Rect[];
  safeMarginPx?: number;
  speakerPaddingPx?: number;
  topK?: number;
  selectionSeed?: number;
  recentPlacements?: Array<{
    zone: PlacementZone;
    rect: Rect;
    usedAtMs?: number;
    count?: number;
  }>;
  allowScaleFallback?: boolean;
  minScale?: number;
  scaleSteps?: number[];
};

export type MaskAwarePlacementResult = {
  rect: Rect;
  zone: PlacementZone;
  score: number;
  compositionScore?: number;
  overlapPenalty?: number;
  facePenalty?: number;
  scalePenalty?: number;
  edgePenalty?: number;
  finalScore?: number;
  whySelected?: string;
  candidateCountConsidered: number;
  reasons: string[];
  scale?: number;
  originalOverlaySize?: { width: number; height: number };
  resolvedOverlaySize?: { width: number; height: number };
  scaleAttempts?: Array<{
    scale: number;
    candidateCount: number;
    rejectedCount: number;
    bestRejectionReason: string | null;
    resolved: boolean;
  }>;
  selectedScale?: number;
  resolvedWithScaleFallback?: boolean;
  layoutMode?: PlacementLayoutMode;
  preferredZoneChosen?: PlacementZone;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
};

export type PlacementCandidate = {
  zone: PlacementZone;
  rect: Rect;
};

export type ScoredPlacementCandidate = PlacementCandidate & {
  score: number;
  compositionScore: number;
  overlapPenalty: number;
  facePenalty: number;
  edgePenalty: number;
  finalScore: number;
  whySelected: string;
  reasons: string[];
};

export type DebugPlacementCandidate = PlacementCandidate & {
  accepted: boolean;
  score: number | null;
  finalScore?: number | null;
  whySelected?: string | null;
  compositionScore?: number | null;
  overlapPenalty?: number | null;
  facePenalty?: number | null;
  edgePenalty?: number | null;
  rejectionReason: string | null;
  reasons: string[];
};
