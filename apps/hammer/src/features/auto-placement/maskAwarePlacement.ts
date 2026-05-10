import type {
  DebugPlacementCandidate,
  MaskAwarePlacementInput,
  MaskAwarePlacementResult,
  PlacementCandidate,
  PlacementZone,
  Rect,
} from "./types";
import { deriveDefaultReservedZones, rectIntersectsAny } from "./reservedZones";
import { buildPaddedSpeakerBounds, scoreCandidate } from "./placementScoring";

const DEFAULT_SAFE_MARGIN_PX = 24;
const DEFAULT_TOP_K = 3;

function resolveZoneRect(
  zone: PlacementZone,
  frame: { width: number; height: number },
  overlay: { width: number; height: number },
  margin: number,
): Rect {
  const maxX = Math.max(margin, frame.width - overlay.width - margin);
  const maxY = Math.max(margin, frame.height - overlay.height - margin);
  const centerY = Math.max(margin, Math.round((frame.height - overlay.height) / 2));
  const gutterInset = Math.max(margin, Math.round(frame.width * 0.06));
  switch (zone) {
    case "upper_left":
      return { x: margin, y: margin, width: overlay.width, height: overlay.height };
    case "upper_right":
      return { x: maxX, y: margin, width: overlay.width, height: overlay.height };
    case "lower_left":
      return { x: margin, y: maxY, width: overlay.width, height: overlay.height };
    case "lower_right":
      return { x: maxX, y: maxY, width: overlay.width, height: overlay.height };
    case "left_gutter":
      return { x: gutterInset, y: centerY, width: overlay.width, height: overlay.height };
    case "right_gutter":
      return { x: Math.max(margin, frame.width - overlay.width - gutterInset), y: centerY, width: overlay.width, height: overlay.height };
    case "background_open":
      return { x: margin, y: margin, width: overlay.width, height: overlay.height };
  }
}

function generateBaseCandidates(input: MaskAwarePlacementInput, margin: number): PlacementCandidate[] {
  const zones: PlacementZone[] = [
    "upper_left",
    "upper_right",
    "lower_left",
    "lower_right",
    "left_gutter",
    "right_gutter",
  ];
  return zones.map((zone) => ({
    zone,
    rect: resolveZoneRect(zone, input.frame, input.overlay, margin),
  }));
}

function generateBackgroundOpenCandidate(args: {
  input: MaskAwarePlacementInput;
  margin: number;
  paddedSpeakerBounds: Rect[];
  reservedZones: Rect[];
}): PlacementCandidate | null {
  const { input, margin, paddedSpeakerBounds, reservedZones } = args;
  const maxX = Math.max(margin, input.frame.width - input.overlay.width - margin);
  const maxY = Math.max(margin, input.frame.height - input.overlay.height - margin);
  const stepX = Math.max(12, Math.round(input.overlay.width / 4));
  const stepY = Math.max(12, Math.round(input.overlay.height / 4));
  let best: PlacementCandidate | null = null;
  let bestDistance = -1;

  for (let y = margin; y <= maxY; y += stepY) {
    for (let x = margin; x <= maxX; x += stepX) {
      const rect = { x, y, width: input.overlay.width, height: input.overlay.height };
      if (rectIntersectsAny(rect, paddedSpeakerBounds)) continue;
      if (rectIntersectsAny(rect, reservedZones)) continue;
      let nearest = Number.POSITIVE_INFINITY;
      for (const obstacle of [...paddedSpeakerBounds, ...reservedZones]) {
        const cx = rect.x + (rect.width / 2);
        const cy = rect.y + (rect.height / 2);
        const ox = obstacle.x + (obstacle.width / 2);
        const oy = obstacle.y + (obstacle.height / 2);
        const d = Math.hypot(cx - ox, cy - oy);
        nearest = Math.min(nearest, d);
      }
      const scoreDistance = Number.isFinite(nearest) ? nearest : 999;
      if (scoreDistance > bestDistance) {
        bestDistance = scoreDistance;
        best = { zone: "background_open", rect };
      }
    }
  }
  return best;
}

function seededIndex(seed: number, size: number): number {
  if (size <= 1) return 0;
  let state = (Math.floor(seed) || 0) ^ 0x9e3779b9;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  const normalized = Math.abs(state);
  return normalized % size;
}

export function evaluateMaskAwarePlacementCandidates(input: MaskAwarePlacementInput): {
  paddedSpeakerBounds: Rect[];
  reservedZones: Rect[];
  candidates: DebugPlacementCandidate[];
} {
  const margin = Math.max(0, input.safeMarginPx ?? DEFAULT_SAFE_MARGIN_PX);
  const paddedSpeakerBounds = buildPaddedSpeakerBounds(input);
  const reservedZones = (input.reservedZones?.length ? input.reservedZones : deriveDefaultReservedZones());
  const candidates: PlacementCandidate[] = generateBaseCandidates(input, margin);
  const backgroundOpen = generateBackgroundOpenCandidate({
    input,
    margin,
    paddedSpeakerBounds,
    reservedZones,
  });
  if (backgroundOpen) candidates.push(backgroundOpen);
  const debugCandidates: DebugPlacementCandidate[] = candidates.map((candidate) => {
    const scored = scoreCandidate({
      input,
      candidate,
      paddedSpeakerBounds,
      reservedZones,
    });
    if (scored) {
      return {
        zone: candidate.zone,
        rect: candidate.rect,
        accepted: true,
        score: scored.score,
        rejectionReason: null,
        reasons: scored.reasons,
      };
    }
    const intersectsSpeaker = rectIntersectsAny(candidate.rect, paddedSpeakerBounds);
    const intersectsReserved = rectIntersectsAny(candidate.rect, reservedZones);
    return {
      zone: candidate.zone,
      rect: candidate.rect,
      accepted: false,
      score: null,
      rejectionReason: intersectsSpeaker
        ? "intersects_padded_speaker_bounds"
        : intersectsReserved
        ? "intersects_reserved_zone"
        : "outside_frame_or_invalid",
      reasons: [],
    };
  });
  return {
    paddedSpeakerBounds,
    reservedZones,
    candidates: debugCandidates,
  };
}

export function resolveMaskAwarePlacement(input: MaskAwarePlacementInput): MaskAwarePlacementResult | null {
  if (!Number.isFinite(input.frame.width) || !Number.isFinite(input.frame.height)) return null;
  if (!Number.isFinite(input.overlay.width) || !Number.isFinite(input.overlay.height)) return null;
  if (input.overlay.width <= 0 || input.overlay.height <= 0) return null;
  if (input.overlay.width > input.frame.width || input.overlay.height > input.frame.height) return null;

  const margin = Math.max(0, input.safeMarginPx ?? DEFAULT_SAFE_MARGIN_PX);
  const paddedSpeakerBounds = buildPaddedSpeakerBounds(input);
  const reservedZones = (input.reservedZones?.length ? input.reservedZones : deriveDefaultReservedZones());

  const candidates: PlacementCandidate[] = generateBaseCandidates(input, margin);
  const backgroundOpen = generateBackgroundOpenCandidate({
    input,
    margin,
    paddedSpeakerBounds,
    reservedZones,
  });
  if (backgroundOpen) candidates.push(backgroundOpen);

  const scored = candidates
    .map((candidate) => scoreCandidate({
      input,
      candidate,
      paddedSpeakerBounds,
      reservedZones,
    }))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const topK = Math.max(1, Math.floor(input.topK ?? DEFAULT_TOP_K));
  const pool = scored.slice(0, topK);
  const idx = seededIndex(input.selectionSeed ?? 0, pool.length);
  const selected = pool[idx] ?? pool[0];

  return {
    rect: selected.rect,
    zone: selected.zone,
    score: selected.score,
    candidateCountConsidered: scored.length,
    reasons: selected.reasons,
  };
}
