import type {
  DebugPlacementCandidate,
  PlacementLayoutMode,
  MaskAwarePlacementInput,
  MaskAwarePlacementResult,
  PlacementCandidate,
  PlacementZone,
  Rect,
} from "./types";
import { deriveDefaultReservedZones, rectIntersectsAny } from "./reservedZones";
import { buildPaddedSpeakerBounds, candidateHardRejectReason, scoreCandidate } from "./placementScoring";

const DEFAULT_SAFE_MARGIN_PX = 24;
const DEFAULT_SCALE_STEPS = [1, 0.9, 0.8, 0.7];
const EMERGENCY_SCALE_STEPS = [0.6, 0.5];

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
    case "lower_center":
      return {
        x: Math.max(margin, Math.round((frame.width - overlay.width) / 2)),
        y: maxY,
        width: overlay.width,
        height: overlay.height,
      };
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
    "lower_center",
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

function resolveLayoutMode(input: MaskAwarePlacementInput): PlacementLayoutMode {
  const count = input.speakerMaskBounds.length;
  if (count <= 0) return "unknown";
  if (count === 1) return "single_person";
  return "multi_person";
}

function resolveSinglePersonPrimaryZones(input: MaskAwarePlacementInput): PlacementZone[] {
  const recent = input.recentPlacements ?? [];
  const latestPreferred = recent.find((entry) => entry.zone === "lower_left" || entry.zone === "lower_right")?.zone;
  if (latestPreferred === "lower_right") return ["lower_left", "lower_right"];
  if (latestPreferred === "lower_left") return ["lower_right", "lower_left"];
  return seededIndex(input.selectionSeed ?? 0, 2) === 0
    ? ["lower_right", "lower_left"]
    : ["lower_left", "lower_right"];
}

function zonePriorityFor(input: MaskAwarePlacementInput, mode: PlacementLayoutMode): PlacementZone[] {
  if (mode === "single_person") {
    const lower = resolveSinglePersonPrimaryZones(input);
    return [...lower, "lower_center", "left_gutter", "right_gutter", "upper_left", "upper_right", "background_open"];
  }
  if (mode === "multi_person") {
    return ["lower_center", "lower_left", "lower_right", "left_gutter", "right_gutter", "upper_left", "upper_right", "background_open"];
  }
  return ["lower_right", "lower_left", "lower_center", "left_gutter", "right_gutter", "upper_left", "upper_right", "background_open"];
}

function selectPlacementByEditorialOrder(args: {
  input: MaskAwarePlacementInput;
  candidates: DebugPlacementCandidate[];
  mode: PlacementLayoutMode;
}) {
  const grouped = new Map<PlacementZone, DebugPlacementCandidate[]>();
  for (const candidate of args.candidates) {
    if (!candidate.accepted) continue;
    const current = grouped.get(candidate.zone) ?? [];
    current.push(candidate);
    grouped.set(candidate.zone, current);
  }
  const order = zonePriorityFor(args.input, args.mode);
  const primaryZones = new Set<PlacementZone>(
    args.mode === "single_person"
      ? resolveSinglePersonPrimaryZones(args.input)
      : args.mode === "multi_person"
      ? ["lower_center", "lower_left", "lower_right"]
      : ["lower_right", "lower_left", "lower_center"],
  );
  for (const zone of order) {
    const entries = grouped.get(zone) ?? [];
    if (entries.length === 0) continue;
    const selected = entries
      .map((entry) => ({ ...entry, scoreValue: entry.score ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => b.scoreValue - a.scoreValue)[0]!;
    const fallbackUsed = !primaryZones.has(zone) || args.mode === "unknown";
    const fallbackReason = args.mode === "unknown"
      ? "no_mask_bounds"
      : primaryZones.has(zone)
      ? null
      : "preferred_zones_failed";
    return {
      selected,
      fallbackUsed,
      fallbackReason,
      preferredZoneChosen: zone,
    };
  }
  return null;
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
    const hardRejectReason = candidateHardRejectReason({
      input,
      candidate,
      reservedZones,
      speakerBounds: input.speakerMaskBounds,
    });
    if (hardRejectReason) {
      return {
        zone: candidate.zone,
        rect: candidate.rect,
        accepted: false,
        score: null,
        finalScore: null,
        whySelected: null,
        compositionScore: null,
        overlapPenalty: null,
        facePenalty: null,
        edgePenalty: null,
        rejectionReason: hardRejectReason,
        reasons: [],
      };
    }
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
        finalScore: scored.finalScore,
        whySelected: scored.whySelected,
        compositionScore: scored.compositionScore,
        overlapPenalty: scored.overlapPenalty,
        facePenalty: scored.facePenalty,
        edgePenalty: scored.edgePenalty,
        rejectionReason: null,
        reasons: scored.reasons,
      };
    }
    return {
      zone: candidate.zone,
      rect: candidate.rect,
      accepted: false,
      score: null,
      finalScore: null,
      whySelected: null,
      compositionScore: null,
      overlapPenalty: null,
      facePenalty: null,
      edgePenalty: null,
      rejectionReason: "score_below_threshold_or_invalid",
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
  const layoutMode = resolveLayoutMode(input);
  const originalOverlaySize = { width: input.overlay.width, height: input.overlay.height };
  const allowScaleFallback = Boolean(input.allowScaleFallback);
  const minScaleRaw = Number.isFinite(input.minScale as number) ? Number(input.minScale) : 0.5;
  const minScale = Math.max(0.5, Math.min(1, minScaleRaw));
  const baseSteps = Array.isArray(input.scaleSteps) && input.scaleSteps.length > 0
    ? input.scaleSteps
    : DEFAULT_SCALE_STEPS;
  const normalizedScales = Array.from(new Set([...baseSteps, ...EMERGENCY_SCALE_STEPS]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(minScale, Math.min(1, value)))
    .filter((value) => value >= minScale)
    .sort((a, b) => b - a)));
  const preferredScales = normalizedScales.filter((scale) => scale >= 0.7);
  const emergencyScales = normalizedScales.filter((scale) => scale < 0.7);
  const scaleLadder = preferredScales.length > 0 ? preferredScales : normalizedScales.length > 0 ? normalizedScales : [1];
  const activeScales = allowScaleFallback ? scaleLadder : [1];
  const scaleAttempts: ScaleAttemptDiagnostic[] = [];
  let emergencyAttempted = false;
  const allScales = [...activeScales, ...(allowScaleFallback ? emergencyScales : [])];

  for (const scale of allScales) {
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
    const rejectionCounts = new Map<string, number>();
    for (const candidate of rejected) {
      const key = candidate.rejectionReason ?? "unknown_rejection";
      rejectionCounts.set(key, (rejectionCounts.get(key) ?? 0) + 1);
    }
    const bestRejectionReason = rejectionCounts.size > 0
      ? [...rejectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;
    const selectedWithPolicy = accepted.length > 0
      ? selectPlacementByEditorialOrder({ input: scaledInput, candidates, mode: layoutMode })
      : null;
    if (!selectedWithPolicy) {
      scaleAttempts.push({
        scale,
        candidateCount: candidates.length,
        rejectedCount: rejected.length,
        bestRejectionReason,
        resolved: false,
      });
      continue;
    }
    if (scale < 0.7) emergencyAttempted = true;
    const selected = selectedWithPolicy.selected;
    const rawScore = selected.score ?? 0;
    const scalePenalty = scale >= 0.999 ? 0 : scale >= 0.9 ? 0.06 : scale >= 0.8 ? 0.14 : scale >= 0.7 ? 0.3 : scale >= 0.6 ? 0.55 : 0.9;
    const finalScore = rawScore - scalePenalty;
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
        score: finalScore,
        compositionScore: selected.compositionScore ?? 0,
        overlapPenalty: selected.overlapPenalty ?? 0,
        facePenalty: selected.facePenalty ?? 0,
        scalePenalty,
        edgePenalty: selected.edgePenalty ?? 0,
        finalScore,
        whySelected: selected.whySelected ?? "editorial defaults",
        candidateCountConsidered: accepted.length,
        reasons: [
          ...(selected.reasons ?? []),
          `layout_mode=${layoutMode}`,
          `preferred_zone_chosen=${selectedWithPolicy.preferredZoneChosen}`,
          `fallback_used=${selectedWithPolicy.fallbackUsed ? "true" : "false"}`,
          `fallback_reason=${selectedWithPolicy.fallbackReason ?? "none"}`,
          `scale_penalty=${scalePenalty.toFixed(2)}`,
          `final_score=${finalScore.toFixed(3)}`,
          `why_selected=${selected.whySelected ?? "editorial defaults"}`,
        ],
        scale,
        originalOverlaySize,
        resolvedOverlaySize: scaledOverlay,
        scaleAttempts,
        selectedScale: scale,
        resolvedWithScaleFallback: allowScaleFallback && scale < 0.999,
        layoutMode,
        preferredZoneChosen: selectedWithPolicy.preferredZoneChosen,
        fallbackUsed: selectedWithPolicy.fallbackUsed || emergencyAttempted,
        fallbackReason: scale < 0.7 ? "scale_emergency" : selectedWithPolicy.fallbackReason,
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
