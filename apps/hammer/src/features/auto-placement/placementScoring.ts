import type {
  MaskAwarePlacementInput,
  PlacementCandidate,
  Rect,
  ScoredPlacementCandidate,
} from "./types";
import {
  inflateRect,
  intersectionArea,
  isRectInsideFrame,
  overlapRatio,
  rectDistance,
  rectIntersectsAny,
} from "./reservedZones";

const ZONE_PRIOR: Record<PlacementCandidate["zone"], number> = {
  upper_left: 0.16,
  upper_right: 0.16,
  lower_center: 0.06,
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

function derivePrimarySpeaker(speakerBounds: PlacementCandidate["rect"][]): PlacementCandidate["rect"] | null {
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
  return best;
}

function deriveSpeakerRegionRects(speakerBounds: PlacementCandidate["rect"][]): {
  faceHead: PlacementCandidate["rect"] | null;
  upperTorso: PlacementCandidate["rect"] | null;
  lowerBody: PlacementCandidate["rect"] | null;
} {
  const primary = derivePrimarySpeaker(speakerBounds);
  if (!primary) {
    return { faceHead: null, upperTorso: null, lowerBody: null };
  }
  return {
    faceHead: {
      x: primary.x + (primary.width * 0.2),
      y: primary.y + (primary.height * 0.02),
      width: primary.width * 0.6,
      height: Math.max(24, primary.height * 0.32),
    },
    upperTorso: {
      x: primary.x + (primary.width * 0.08),
      y: primary.y + (primary.height * 0.28),
      width: primary.width * 0.84,
      height: Math.max(24, primary.height * 0.36),
    },
    lowerBody: {
      x: primary.x,
      y: primary.y + (primary.height * 0.58),
      width: primary.width,
      height: Math.max(24, primary.height * 0.42),
    },
  };
}

function clampRectToFrame(rect: Rect, frame: { width: number; height: number }): Rect {
  const width = Math.max(1, Math.min(rect.width, frame.width));
  const height = Math.max(1, Math.min(rect.height, frame.height));
  const maxX = Math.max(0, frame.width - width);
  const maxY = Math.max(0, frame.height - height);
  return {
    x: Math.max(0, Math.min(maxX, rect.x)),
    y: Math.max(0, Math.min(maxY, rect.y)),
    width,
    height,
  };
}

export function deriveFaceSafeZonesFromSpeakerBounds(speakerMaskBounds: Rect[]): Rect[] {
  const pad = 16;
  return speakerMaskBounds.map((speaker) => {
    const faceHeight = Math.max(24, speaker.height * 0.35);
    const faceWidth = Math.max(24, speaker.width * 0.65);
    const faceX = speaker.x + ((speaker.width - faceWidth) / 2);
    const faceY = speaker.y;
    return {
      x: faceX - pad,
      y: faceY - pad,
      width: faceWidth + (pad * 2),
      height: faceHeight + (pad * 2),
    };
  });
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
  return deriveSpeakerRegionRects(speakerBounds).faceHead;
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

function compositionBalanceScore(args: {
  candidate: PlacementCandidate["rect"];
  frame: { width: number; height: number };
}): number {
  const c = rectCenter(args.candidate);
  const thirds = [
    { x: args.frame.width / 3, y: args.frame.height / 3 },
    { x: (args.frame.width * 2) / 3, y: args.frame.height / 3 },
    { x: args.frame.width / 3, y: (args.frame.height * 2) / 3 },
    { x: (args.frame.width * 2) / 3, y: (args.frame.height * 2) / 3 },
  ];
  let best = Number.POSITIVE_INFINITY;
  for (const anchor of thirds) {
    best = Math.min(best, Math.hypot(c.x - anchor.x, c.y - anchor.y));
  }
  const maxD = Math.hypot(args.frame.width, args.frame.height) * 0.42;
  return Math.max(0, 1 - (best / Math.max(1, maxD)));
}

function edgePenalty(args: {
  candidate: PlacementCandidate["rect"];
  frame: { width: number; height: number };
}): number {
  const rect = args.candidate;
  const left = rect.x;
  const top = rect.y;
  const right = Math.max(0, args.frame.width - (rect.x + rect.width));
  const bottom = Math.max(0, args.frame.height - (rect.y + rect.height));
  const minEdgeGap = Math.max(0, Math.min(left, top, right, bottom));
  const edgeHug = Math.max(0, 1 - Math.min(1, minEdgeGap / 72));
  const cx = rect.x + (rect.width / 2);
  const cy = rect.y + (rect.height / 2);
  const cornerTargets = [
    { x: 0, y: 0 },
    { x: args.frame.width, y: 0 },
    { x: 0, y: args.frame.height },
    { x: args.frame.width, y: args.frame.height },
  ];
  let cornerMin = Number.POSITIVE_INFINITY;
  for (const corner of cornerTargets) {
    cornerMin = Math.min(cornerMin, Math.hypot(cx - corner.x, cy - corner.y));
  }
  const cornerPenalty = Math.max(0, 1 - Math.min(1, cornerMin / Math.max(1, args.frame.width * 0.32)));
  return Math.min(0.36, (edgeHug * 0.22) + (cornerPenalty * 0.14));
}

function weightedSpeakerOverlapPenalty(args: {
  candidate: PlacementCandidate["rect"];
  speakerBounds: PlacementCandidate["rect"][];
}): {
  faceHeadOverlapRatio: number;
  overlapPenalty: number;
} {
  const regions = deriveSpeakerRegionRects(args.speakerBounds);
  const faceRatio = regions.faceHead ? overlapRatio(args.candidate, regions.faceHead) : 0;
  const upperRatio = regions.upperTorso ? overlapRatio(args.candidate, regions.upperTorso) : 0;
  const lowerRatio = regions.lowerBody ? overlapRatio(args.candidate, regions.lowerBody) : 0;
  const overlapPenaltyValue = Math.min(
    0.45,
    (upperRatio * 0.18) + (lowerRatio * 0.06),
  );
  return {
    faceHeadOverlapRatio: faceRatio,
    overlapPenalty: overlapPenaltyValue,
  };
}

export function candidateHardRejectReason(args: {
  input: MaskAwarePlacementInput;
  candidate: PlacementCandidate;
  reservedZones: PlacementCandidate["rect"][];
  speakerBounds: PlacementCandidate["rect"][];
}): string | null {
  if (!isRectInsideFrame(args.candidate.rect, args.input.frame)) return "outside_frame_or_invalid";
  if (rectIntersectsAny(args.candidate.rect, args.reservedZones)) return "intersects_reserved_zone";
  const faceZones = deriveFaceSafeZonesFromSpeakerBounds(args.speakerBounds)
    .map((zone) => clampRectToFrame(zone, args.input.frame));
  for (const zone of faceZones) {
    if (intersectionArea(args.candidate.rect, zone) > 0) {
      return "covers_face_or_head_zone";
    }
  }
  return null;
}

export function scoreCandidate(args: {
  input: MaskAwarePlacementInput;
  candidate: PlacementCandidate;
  paddedSpeakerBounds: PlacementCandidate["rect"][];
  reservedZones: PlacementCandidate["rect"][];
}): ScoredPlacementCandidate | null {
  const { input, candidate, paddedSpeakerBounds, reservedZones } = args;
  const hardReject = candidateHardRejectReason({
    input,
    candidate,
    reservedZones,
    speakerBounds: input.speakerMaskBounds,
  });
  if (hardReject) return null;

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
  const overlapSignals = weightedSpeakerOverlapPenalty({
    candidate: candidate.rect,
    speakerBounds: input.speakerMaskBounds,
  });
  const edgePenaltyValue = edgePenalty({
    candidate: candidate.rect,
    frame: input.frame,
  });
  const compositionScore = compositionBalanceScore({
    candidate: candidate.rect,
    frame: input.frame,
  });
  const deadSpaceBonus = deadSpacePreferenceBonus({
    candidate: candidate.rect,
    paddedSpeakerBounds,
    reservedZones,
  });

  const baseScore = (
    (speakerDistanceScore * 0.34) +
    (reservedDistanceScore * 0.24) +
    (comfortScore * 0.16) +
    (compositionScore * 0.26) +
    zonePrior +
    deadSpaceBonus
  );
  const facePenalty = Math.min(1.2, faceProximityPenalty + upperCenterPenalty + eyeLinePenalty + (overlapSignals.faceHeadOverlapRatio * 2));
  const overlapPenaltyValue = overlapSignals.overlapPenalty;
  const finalScore = baseScore - repeatPenalty - facePenalty - overlapPenaltyValue - edgePenaltyValue;
  const whySelected = [
    `composition=${compositionScore.toFixed(2)}`,
    `speaker_distance=${speakerDistance.toFixed(1)}`,
    `overlap_penalty=${overlapPenaltyValue.toFixed(2)}`,
    `face_penalty=${facePenalty.toFixed(2)}`,
    `edge_penalty=${edgePenaltyValue.toFixed(2)}`,
  ].join(" · ");

  return {
    ...candidate,
    score: finalScore,
    compositionScore,
    overlapPenalty: overlapPenaltyValue,
    facePenalty,
    edgePenalty: edgePenaltyValue,
    finalScore,
    whySelected,
    reasons: [
      `speaker_distance=${speakerDistance.toFixed(1)}`,
      `reserved_distance=${reservedDistance.toFixed(1)}`,
      `comfort=${comfortScore.toFixed(2)}`,
      `composition_score=${compositionScore.toFixed(2)}`,
      `zone_prior=${zonePrior.toFixed(2)}`,
      `dead_space_bonus=${deadSpaceBonus.toFixed(2)}`,
      `overlap_penalty=${overlapPenaltyValue.toFixed(2)}`,
      `face_proximity_penalty=${faceProximityPenalty.toFixed(2)}`,
      `upper_center_penalty=${upperCenterPenalty.toFixed(2)}`,
      `eye_line_penalty=${eyeLinePenalty.toFixed(2)}`,
      `face_overlap_ratio=${overlapSignals.faceHeadOverlapRatio.toFixed(2)}`,
      `edge_penalty=${edgePenaltyValue.toFixed(2)}`,
      `repeat_penalty=${repeatPenalty.toFixed(2)}`,
      `final_score=${finalScore.toFixed(3)}`,
    ],
  };
}

export function buildPaddedSpeakerBounds(input: MaskAwarePlacementInput): PlacementCandidate["rect"][] {
  const pad = input.speakerPaddingPx ?? 20;
  return input.speakerMaskBounds.map((rect) => inflateRect(rect, pad));
}
