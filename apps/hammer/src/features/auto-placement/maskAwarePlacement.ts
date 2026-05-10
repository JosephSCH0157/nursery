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
const DEFAULT_SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

export type ScaleAttemptDiagnostic = {
  scale: number;
  candidateCount: number;
  rejectedCount: number;
  bestRejectionReason: string | null;
  resolved: boolean;
};

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

export function resolveMaskAwarePlacementWithScaleFallback(input: MaskAwarePlacementInput): {
  placement: MaskAwarePlacementResult | null;
  scaleAttempts: ScaleAttemptDiagnostic[];
} {
  const originalOverlaySize = { width: input.overlay.width, height: input.overlay.height };
  const allowScaleFallback = Boolean(input.allowScaleFallback);
  const minScaleRaw = Number.isFinite(input.minScale as number) ? Number(input.minScale) : 0.5;
  const minScale = Math.max(0.1, Math.min(1, minScaleRaw));
  const baseSteps = Array.isArray(input.scaleSteps) && input.scaleSteps.length > 0
    ? input.scaleSteps
    : DEFAULT_SCALE_STEPS;
  const normalizedScales = Array.from(new Set(baseSteps
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(minScale, Math.min(1, value)))
    .filter((value) => value >= minScale)
    .sort((a, b) => b - a)));
  const scaleLadder = normalizedScales.length > 0 ? normalizedScales : [1];
  const activeScales = allowScaleFallback ? scaleLadder : [1];
  const scaleAttempts: ScaleAttemptDiagnostic[] = [];

  for (const scale of activeScales) {
    const scaledOverlay = {
      width: Math.max(1, Math.round(originalOverlaySize.width * scale)),
      height: Math.max(1, Math.round(originalOverlaySize.height * scale)),
    };
    if (scaledOverlay.width > input.frame.width || scaledOverlay.height > input.frame.height) {
      scaleAttempts.push({
        scale,
        candidateCount: 0,
        rejectedCount: 0,
        bestRejectionReason: "overlay_larger_than_frame",
        resolved: false,
      });
      continue;
    }
    const scaledInput: MaskAwarePlacementInput = {
      ...input,
      overlay: scaledOverlay,
      allowScaleFallback: false,
    };
    const evaluation = evaluateMaskAwarePlacementCandidates(scaledInput);
    const candidates = evaluation.candidates;
    const accepted = candidates.filter((candidate) => candidate.accepted);
    const rejected = candidates.filter((candidate) => !candidate.accepted);
    const scored = accepted
      .map((candidate) => ({
        zone: candidate.zone,
        rect: candidate.rect,
        score: candidate.score as number,
        reasons: candidate.reasons,
      }))
      .sort((a, b) => b.score - a.score);
    const rejectionCounts = new Map<string, number>();
    for (const candidate of rejected) {
      const key = candidate.rejectionReason ?? "unknown_rejection";
      rejectionCounts.set(key, (rejectionCounts.get(key) ?? 0) + 1);
    }
    const bestRejectionReason = rejectionCounts.size > 0
      ? [...rejectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;
    if (scored.length === 0) {
      scaleAttempts.push({
        scale,
        candidateCount: candidates.length,
        rejectedCount: rejected.length,
        bestRejectionReason,
        resolved: false,
      });
      continue;
    }
    const topK = Math.max(1, Math.floor(input.topK ?? DEFAULT_TOP_K));
    const pool = scored.slice(0, topK);
    const idx = seededIndex(input.selectionSeed ?? 0, pool.length);
    const selected = pool[idx] ?? pool[0];
    scaleAttempts.push({
      scale,
      candidateCount: candidates.length,
      rejectedCount: rejected.length,
      bestRejectionReason,
      resolved: true,
    });
    return {
      placement: {
        rect: selected.rect,
        zone: selected.zone,
        score: selected.score,
        candidateCountConsidered: scored.length,
        reasons: selected.reasons,
        scale,
        originalOverlaySize,
        resolvedOverlaySize: scaledOverlay,
        scaleAttempts,
        selectedScale: scale,
        resolvedWithScaleFallback: allowScaleFallback && scale < 0.999,
      },
      scaleAttempts,
    };
  }
  return {
    placement: null,
    scaleAttempts,
  };
}

export function resolveMaskAwarePlacement(input: MaskAwarePlacementInput): MaskAwarePlacementResult | null {
  if (!Number.isFinite(input.frame.width) || !Number.isFinite(input.frame.height)) return null;
  if (!Number.isFinite(input.overlay.width) || !Number.isFinite(input.overlay.height)) return null;
  if (input.overlay.width <= 0 || input.overlay.height <= 0) return null;
  if (
    (input.overlay.width > input.frame.width || input.overlay.height > input.frame.height)
    && !input.allowScaleFallback
  ) return null;

  return resolveMaskAwarePlacementWithScaleFallback(input).placement;
}
