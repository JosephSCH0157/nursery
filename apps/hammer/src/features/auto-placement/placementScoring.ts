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

function rectCenter(rect: PlacementCandidate["rect"]): { x: number; y: number } {
  return {
    x: rect.x + (rect.width / 2),
    y: rect.y + (rect.height / 2),
  };
}

function estimatePrimaryFaceBounds(speakerBounds: PlacementCandidate["rect"][]): PlacementCandidate["rect"] | null {
  if (speakerBounds.length === 0) return null;
  let best = speakerBounds[0]!;
  let bestArea = best.width * best.height;
  for (let i = 1; i < speakerBounds.length; i += 1) {
    const candidate = speakerBounds[i]!;
    const area = candidate.width * candidate.height;
    if (area > bestArea) {
      best = candidate;
      bestArea = area;
    }
  }
  // Approximate face/head as upper portion of largest foreground component.
  return {
    x: best.x + (best.width * 0.22),
    y: best.y + (best.height * 0.02),
    width: best.width * 0.56,
    height: Math.max(24, best.height * 0.34),
  };
}

function proximityToFacePenalty(args: {
  candidate: PlacementCandidate["rect"];
  paddedSpeakerBounds: PlacementCandidate["rect"][];
  frame: { width: number; height: number };
}): number {
  const face = estimatePrimaryFaceBounds(args.paddedSpeakerBounds);
  if (!face) return 0;
  const c = rectCenter(args.candidate);
  const f = rectCenter(face);
  const d = Math.hypot(c.x - f.x, c.y - f.y);
  const threshold = Math.max(180, Math.min(args.frame.width, args.frame.height) * 0.34);
  const penalty = Math.max(0, 1 - (d / threshold));
  return Math.min(0.42, penalty * 0.42);
}

function upperCenterFocalCompetitionPenalty(args: {
  candidate: PlacementCandidate["rect"];
  frame: { width: number; height: number };
}): number {
  const upperCenter = {
    x: args.frame.width * 0.5,
    y: args.frame.height * 0.3,
  };
  const c = rectCenter(args.candidate);
  const dx = Math.abs(c.x - upperCenter.x) / Math.max(1, args.frame.width * 0.26);
  const dy = Math.abs(c.y - upperCenter.y) / Math.max(1, args.frame.height * 0.2);
  if (dx >= 1 || dy >= 1) return 0;
  const closeness = (1 - dx) * (1 - dy);
  return Math.min(0.28, closeness * 0.28);
}

function eyeLineAdjacencyPenalty(args: {
  candidate: PlacementCandidate["rect"];
  paddedSpeakerBounds: PlacementCandidate["rect"][];
}): number {
  const face = estimatePrimaryFaceBounds(args.paddedSpeakerBounds);
  if (!face) return 0;
  const c = rectCenter(args.candidate);
  const faceEyeLineY = face.y + (face.height * 0.38);
  const yDelta = Math.abs(c.y - faceEyeLineY);
  const xDelta = Math.abs(c.x - (face.x + (face.width / 2)));
  const nearEyeLine = yDelta < Math.max(30, face.height * 0.55);
  const sideAdjacent = xDelta < Math.max(260, face.width * 2.2);
  if (!nearEyeLine || !sideAdjacent) return 0;
  const yFactor = 1 - Math.min(1, yDelta / Math.max(30, face.height * 0.55));
  const xFactor = 1 - Math.min(1, xDelta / Math.max(260, face.width * 2.2));
  return Math.min(0.2, (yFactor * xFactor) * 0.2);
}

function deadSpacePreferenceBonus(args: {
  candidate: PlacementCandidate["rect"];
  paddedSpeakerBounds: PlacementCandidate["rect"][];
  reservedZones: PlacementCandidate["rect"][];
}): number {
  const obstacles = [...args.paddedSpeakerBounds, ...args.reservedZones];
  if (obstacles.length === 0) return 0.08;
  const distance = minDistance(args.candidate, obstacles);
  return Math.min(0.2, (distance / 420) * 0.2);
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
  const faceProximityPenalty = proximityToFacePenalty({
    candidate: candidate.rect,
    paddedSpeakerBounds,
    frame: input.frame,
  });
  const upperCenterPenalty = upperCenterFocalCompetitionPenalty({
    candidate: candidate.rect,
    frame: input.frame,
  });
  const eyeLinePenalty = eyeLineAdjacencyPenalty({
    candidate: candidate.rect,
    paddedSpeakerBounds,
  });
  const deadSpaceBonus = deadSpacePreferenceBonus({
    candidate: candidate.rect,
    paddedSpeakerBounds,
    reservedZones,
  });

  const score = (
    (speakerDistanceScore * 0.45) +
    (reservedDistanceScore * 0.25) +
    (comfortScore * 0.2) +
    zonePrior +
    deadSpaceBonus
  ) - repeatPenalty - faceProximityPenalty - upperCenterPenalty - eyeLinePenalty;

  return {
    ...candidate,
    score,
    reasons: [
      `speaker_distance=${speakerDistance.toFixed(1)}`,
      `reserved_distance=${reservedDistance.toFixed(1)}`,
      `comfort=${comfortScore.toFixed(2)}`,
      `zone_prior=${zonePrior.toFixed(2)}`,
      `dead_space_bonus=${deadSpaceBonus.toFixed(2)}`,
      `face_proximity_penalty=${faceProximityPenalty.toFixed(2)}`,
      `upper_center_penalty=${upperCenterPenalty.toFixed(2)}`,
      `eye_line_penalty=${eyeLinePenalty.toFixed(2)}`,
      `repeat_penalty=${repeatPenalty.toFixed(2)}`,
    ],
  };
}

export function buildPaddedSpeakerBounds(input: MaskAwarePlacementInput): PlacementCandidate["rect"][] {
  const pad = input.speakerPaddingPx ?? 20;
  return input.speakerMaskBounds.map((rect) => inflateRect(rect, pad));
}
