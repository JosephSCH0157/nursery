import type {
  MaskAwarePlacementInput,
  PlacementCandidate,
  ScoredPlacementCandidate,
} from "./types";
import {
  inflateRect,
  isRectInsideFrame,
  rectDistance,
  rectIntersectsAny,
} from "./reservedZones";

const ZONE_PRIOR: Record<PlacementCandidate["zone"], number> = {
  upper_left: 0.16,
  upper_right: 0.16,
  lower_left: 0.08,
  lower_right: 0.08,
  left_gutter: 0.12,
  right_gutter: 0.12,
  background_open: 0.1,
};

function minDistance(rect: PlacementCandidate["rect"], obstacles: PlacementCandidate["rect"][]): number {
  if (obstacles.length === 0) return 240;
  let min = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    min = Math.min(min, rectDistance(rect, obstacle));
  }
  return Number.isFinite(min) ? min : 0;
}

function edgeComfort(rect: PlacementCandidate["rect"], frame: { width: number; height: number }): number {
  const left = rect.x;
  const top = rect.y;
  const right = Math.max(0, frame.width - (rect.x + rect.width));
  const bottom = Math.max(0, frame.height - (rect.y + rect.height));
  const minEdgeGap = Math.max(0, Math.min(left, top, right, bottom));
  return Math.min(1, minEdgeGap / 120);
}

function overlapPenalty(a: PlacementCandidate["rect"], b: PlacementCandidate["rect"]): number {
  const dx = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const dy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = dx * dy;
  const base = Math.max(1, a.width * a.height);
  return Math.min(1, intersection / base);
}

function repeatedPlacementPenalty(input: MaskAwarePlacementInput, candidate: PlacementCandidate): number {
  const recent = input.recentPlacements ?? [];
  let penalty = 0;
  for (const placement of recent) {
    if (placement.zone === candidate.zone) {
      penalty += 0.2 * Math.max(1, placement.count ?? 1);
    }
    penalty += overlapPenalty(candidate.rect, placement.rect) * 0.4;
  }
  return Math.min(0.85, penalty);
}

export function scoreCandidate(args: {
  input: MaskAwarePlacementInput;
  candidate: PlacementCandidate;
  paddedSpeakerBounds: PlacementCandidate["rect"][];
  reservedZones: PlacementCandidate["rect"][];
}): ScoredPlacementCandidate | null {
  const { input, candidate, paddedSpeakerBounds, reservedZones } = args;
  if (!isRectInsideFrame(candidate.rect, input.frame)) return null;
  if (rectIntersectsAny(candidate.rect, paddedSpeakerBounds)) return null;
  if (rectIntersectsAny(candidate.rect, reservedZones)) return null;

  const speakerDistance = minDistance(candidate.rect, paddedSpeakerBounds);
  const reservedDistance = minDistance(candidate.rect, reservedZones);
  const speakerDistanceScore = Math.min(1, speakerDistance / 300);
  const reservedDistanceScore = Math.min(1, reservedDistance / 300);
  const comfortScore = edgeComfort(candidate.rect, input.frame);
  const zonePrior = ZONE_PRIOR[candidate.zone];
  const repeatPenalty = repeatedPlacementPenalty(input, candidate);

  const score = (
    (speakerDistanceScore * 0.45) +
    (reservedDistanceScore * 0.25) +
    (comfortScore * 0.2) +
    zonePrior
  ) - repeatPenalty;

  return {
    ...candidate,
    score,
    reasons: [
      `speaker_distance=${speakerDistance.toFixed(1)}`,
      `reserved_distance=${reservedDistance.toFixed(1)}`,
      `comfort=${comfortScore.toFixed(2)}`,
      `zone_prior=${zonePrior.toFixed(2)}`,
      `repeat_penalty=${repeatPenalty.toFixed(2)}`,
    ],
  };
}

export function buildPaddedSpeakerBounds(input: MaskAwarePlacementInput): PlacementCandidate["rect"][] {
  const pad = input.speakerPaddingPx ?? 20;
  return input.speakerMaskBounds.map((rect) => inflateRect(rect, pad));
}

