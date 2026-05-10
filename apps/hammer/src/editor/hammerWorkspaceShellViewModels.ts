/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  resolveHammerPolishPreviewTarget,
  resolveVisualPreviewEmptyStateMessage,
} from "./hammerPolishPreviewTarget";
import { evaluateMaskAwarePlacementCandidates, resolveMaskAwarePlacement, resolveMaskAwarePlacementWithScaleFallback } from "../features/auto-placement";
import type { Rect as AutoPlacementRect } from "../features/auto-placement";
import type { PlacementLayoutMode, PlacementZone } from "../features/auto-placement";
import { isAutoPlacementDebugFlagEnabled } from "./hammerAutoPlacementDebugFlag";

function isTruthyDevToggle(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function shouldShowDiagnosticsPanel(): boolean {
  const isDev = Boolean((import.meta as any)?.env?.DEV);
  if (!isDev || typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    if (isTruthyDevToggle(params.get("dev"))) return true;
    if (isTruthyDevToggle(params.get("tp_dev_mode"))) return true;
  } catch {
    // ignore
  }
  return false;
}

function shouldShowAutoPlacementDiagnostics(): boolean {
  return isAutoPlacementDebugFlagEnabled();
}

function shouldTraceAutoPlacementDiagnostics(): boolean {
  return isAutoPlacementDebugFlagEnabled();
}

export type HammerAutoPlacementDiagnosticsState =
  | { enabled: false }
  | {
    enabled: true;
    state: "resolved" | "resolved_with_scale_fallback" | "no_mask_bounds" | "no_safe_placement" | "no_frame_input" | "waiting_for_selected_overlay_asset";
    statusLabel: string;
    overlay: null | {
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      zone: string;
      score: number;
      compositionScore: number;
      overlapPenalty: number;
      facePenalty: number;
      scalePenalty: number;
      edgePenalty: number;
      finalScore: number;
      whySelected: string;
      topPenaltyReason: string;
      scale: number;
      originalOverlaySize: { width: number; height: number };
      resolvedOverlaySize: { width: number; height: number };
      reasonsSummary: string;
      layoutMode: PlacementLayoutMode;
      preferredZoneChosen: PlacementZone;
      fallbackUsed: boolean;
      fallbackReason: string | null;
      scaleReason: string;
      placementReason: string;
    };
    ghost: null | {
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      zone: string;
      score: number;
      sourceClipId: string;
      reasonsSummary: string;
    };
    paddedSpeakerBounds: Array<{
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
    }>;
    faceSafeZones: Array<{
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
    }>;
    candidates: Array<{
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      zone: string;
      accepted: boolean;
      rejectionReason: string | null;
    }>;
    frameLabel: string;
    maskLabel: string;
    debugFlagDetected: boolean;
    vmDiagnosticState: "present" | "missing";
    maskBoundsCount: number;
    selectedOverlayAssetPresent: boolean;
    resolvedPlacementPresent: boolean;
    candidateCount: number;
    rejectedCandidateCount: number;
    selectedScale: number | null;
    faceSafeZoneCount: number;
    bodyOverlapAllowed: boolean;
    layoutMode: PlacementLayoutMode | null;
    preferredZoneChosen: PlacementZone | null;
    fallbackUsed: boolean;
    fallbackReason: string | null;
    scaleAttempts: Array<{
      scale: number;
      candidateCount: number;
      rejectedCount: number;
      bestRejectionReason: string | null;
      resolved: boolean;
    }>;
    gates: Array<{
      id: string;
      label: string;
      status: "PASS" | "FAIL" | "BLOCKED";
      reason: string;
    }>;
    firstBlockingReason: string | null;
    dependencyChain: string;
    upstream: {
      workspaceId: string;
      workpieceId: string;
      episodeId: string | null;
      expectedMediaPath: string | null;
      actualMediaPath: string | null;
      sourceDeskErrorRaw: string | null;
      playbackReadinessReason: string;
    };
  };

function buildAutoPlacementGates(args: {
  workspaceLoaded: boolean;
  workspaceReason: string;
  playbackMediaReady: boolean;
  playbackMediaReason: string;
  currentFrameAvailable: boolean;
  currentFrameReason: string;
  segmentationMaskAvailable: boolean;
  segmentationMaskReason: string;
  selectedVisualAssetAvailable: boolean;
  selectedVisualAssetReason: string;
  placementEvaluationExecuted: boolean;
  placementEvaluationReason: string;
  candidateGenerationExecuted: boolean;
  candidateGenerationReason: string;
}) {
  const raw = [
    { id: "workspace_loaded", label: "workspace loaded", pass: args.workspaceLoaded, reason: args.workspaceReason },
    { id: "playback_media_ready", label: "playback media ready", pass: args.playbackMediaReady, reason: args.playbackMediaReason },
    { id: "current_frame_available", label: "current frame available", pass: args.currentFrameAvailable, reason: args.currentFrameReason },
    { id: "segmentation_mask_available", label: "segmentation mask available", pass: args.segmentationMaskAvailable, reason: args.segmentationMaskReason },
    { id: "selected_visual_asset_available", label: "selected visual asset available", pass: args.selectedVisualAssetAvailable, reason: args.selectedVisualAssetReason },
    { id: "placement_evaluation_executed", label: "placement evaluation executed", pass: args.placementEvaluationExecuted, reason: args.placementEvaluationReason },
    { id: "candidate_generation_executed", label: "candidate generation executed", pass: args.candidateGenerationExecuted, reason: args.candidateGenerationReason },
  ] as const;
  let blocked = false;
  let firstBlockingReason: string | null = null;
  const gates = raw.map((gate) => {
    const status: "PASS" | "FAIL" | "BLOCKED" = blocked ? "BLOCKED" : gate.pass ? "PASS" : "FAIL";
    if (status === "FAIL" && !firstBlockingReason) firstBlockingReason = `${gate.label}: ${gate.reason}`;
    if (status !== "PASS") blocked = true;
    return { id: gate.id, label: gate.label, status, reason: gate.reason };
  });
  return {
    gates,
    firstBlockingReason,
    dependencyChain: gates.map((gate) => `${gate.id}:${gate.status}`).join(" -> "),
  };
}

export function normalizeSpeakerMaskBoundsToFrame(args: {
  speakerMaskBounds: AutoPlacementRect[];
  frameInput: { width: number; height: number } | null;
  maskResolution: { width: number; height: number } | null;
}): AutoPlacementRect[] {
  const frameW = Math.max(0, Number(args.frameInput?.width) || 0);
  const frameH = Math.max(0, Number(args.frameInput?.height) || 0);
  const maskW = Math.max(0, Number(args.maskResolution?.width) || 0);
  const maskH = Math.max(0, Number(args.maskResolution?.height) || 0);
  if (frameW <= 0 || frameH <= 0) return [];
  if (maskW <= 0 || maskH <= 0) return [];
  const sx = frameW / maskW;
  const sy = frameH / maskH;
  return args.speakerMaskBounds
    .filter((rect) => rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height))
    .map((rect) => ({
      x: Math.max(0, rect.x * sx),
      y: Math.max(0, rect.y * sy),
      width: Math.max(0, rect.width * sx),
      height: Math.max(0, rect.height * sy),
    }));
}

export function resolveAutoPlacementDiagnosticsForPreview(args: {
  debugEnabled: boolean;
  frameInput: { width: number; height: number } | null;
  speakerMaskBounds: AutoPlacementRect[];
  playheadSec: number;
  selectedOverlayForGhost?: null | {
    clipId: string;
    hasRealAsset: boolean;
    widthPct: number;
    heightPct: number;
  };
  maskResolution?: { width: number; height: number } | null;
  workspaceLoaded: boolean;
  workspaceReason: string;
  playbackMediaReady: boolean;
  playbackMediaReason: string;
  workspaceId: string;
  workpieceId: string;
  episodeId: string | null;
  expectedMediaPath: string | null;
  actualMediaPath: string | null;
  sourceDeskErrorRaw: string | null;
}): HammerAutoPlacementDiagnosticsState {
  const trace = shouldTraceAutoPlacementDiagnostics();
  if (trace) {
    console.debug("[hammer][auto-placement][resolver] enter", {
      debugEnabled: args.debugEnabled,
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      episodeId: args.episodeId,
      frameInput: args.frameInput,
      maskResolution: args.maskResolution ?? null,
      speakerMaskBoundsCount: Array.isArray(args.speakerMaskBounds) ? args.speakerMaskBounds.length : -1,
      selectedOverlayPresent: Boolean(args.selectedOverlayForGhost),
      selectedOverlayHasAsset: Boolean(args.selectedOverlayForGhost?.hasRealAsset),
      workspaceLoaded: args.workspaceLoaded,
      playbackMediaReady: args.playbackMediaReady,
    });
  }
  const hasSelectedOverlayAsset = Boolean(args.selectedOverlayForGhost?.hasRealAsset);
  if (!args.debugEnabled) {
    if (trace) console.debug("[hammer][auto-placement][resolver] early-return", { reason: "debug disabled" });
    return { enabled: false };
  }
  if (!args.frameInput || args.frameInput.width <= 0 || args.frameInput.height <= 0) {
    const gateSummary = buildAutoPlacementGates({
      workspaceLoaded: args.workspaceLoaded,
      workspaceReason: args.workspaceReason,
      playbackMediaReady: args.playbackMediaReady,
      playbackMediaReason: args.playbackMediaReason,
      currentFrameAvailable: false,
      currentFrameReason: "frame input missing",
      segmentationMaskAvailable: false,
      segmentationMaskReason: "blocked by current frame gate",
      selectedVisualAssetAvailable: hasSelectedOverlayAsset,
      selectedVisualAssetReason: hasSelectedOverlayAsset ? "selected overlay asset present" : "selected overlay asset missing",
      placementEvaluationExecuted: false,
      placementEvaluationReason: "blocked before evaluator",
      candidateGenerationExecuted: false,
      candidateGenerationReason: "blocked before candidate generation",
    });
    const result: HammerAutoPlacementDiagnosticsState = {
      enabled: true,
      state: "no_frame_input",
      statusLabel: "auto-placement: no frame input available",
      overlay: null,
      ghost: null,
      paddedSpeakerBounds: [],
      faceSafeZones: [],
      candidates: [],
      frameLabel: "frame n/a",
      maskLabel: "mask n/a",
      debugFlagDetected: args.debugEnabled,
      vmDiagnosticState: "present",
      maskBoundsCount: 0,
      selectedOverlayAssetPresent: Boolean(args.selectedOverlayForGhost?.hasRealAsset),
      resolvedPlacementPresent: false,
      candidateCount: 0,
      rejectedCandidateCount: 0,
      selectedScale: null,
      faceSafeZoneCount: 0,
      bodyOverlapAllowed: true,
      layoutMode: null,
      preferredZoneChosen: null,
      fallbackUsed: false,
      fallbackReason: null,
      scaleAttempts: [],
      gates: gateSummary.gates,
      firstBlockingReason: gateSummary.firstBlockingReason,
      dependencyChain: gateSummary.dependencyChain,
      upstream: {
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        episodeId: args.episodeId,
        expectedMediaPath: args.expectedMediaPath,
        actualMediaPath: args.actualMediaPath,
        sourceDeskErrorRaw: args.sourceDeskErrorRaw,
        playbackReadinessReason: args.playbackMediaReason,
      },
    };
    if (trace) console.debug("[hammer][auto-placement][resolver] return", { reason: "no_frame_input", result });
    return result;
  }
  const frameW = Math.max(1, args.frameInput.width);
  const frameH = Math.max(1, args.frameInput.height);
  const normalizedSpeakerBounds = normalizeSpeakerMaskBoundsToFrame({
    speakerMaskBounds: Array.isArray(args.speakerMaskBounds) ? args.speakerMaskBounds : [],
    frameInput: args.frameInput,
    maskResolution: args.maskResolution ?? null,
  });
  const frameLabel = `${Math.round(frameW)}x${Math.round(frameH)}`;
  const maskLabel = args.maskResolution
    ? `${Math.max(0, Math.round(args.maskResolution.width))}x${Math.max(0, Math.round(args.maskResolution.height))}`
    : "n/a";
  if (!hasSelectedOverlayAsset) {
    const gateSummary = buildAutoPlacementGates({
      workspaceLoaded: args.workspaceLoaded,
      workspaceReason: args.workspaceReason,
      playbackMediaReady: args.playbackMediaReady,
      playbackMediaReason: args.playbackMediaReason,
      currentFrameAvailable: true,
      currentFrameReason: "frame input resolved",
      segmentationMaskAvailable: true,
      segmentationMaskReason: "mask bounds available",
      selectedVisualAssetAvailable: false,
      selectedVisualAssetReason: "selected overlay asset missing",
      placementEvaluationExecuted: false,
      placementEvaluationReason: "blocked by selected visual asset gate",
      candidateGenerationExecuted: false,
      candidateGenerationReason: "blocked by selected visual asset gate",
    });
    const result: HammerAutoPlacementDiagnosticsState = {
      enabled: true,
      state: "waiting_for_selected_overlay_asset",
      statusLabel: "auto-placement: debug enabled, waiting for selected overlay asset",
      overlay: null,
      ghost: null,
      paddedSpeakerBounds: [],
      faceSafeZones: [],
      candidates: [],
      frameLabel,
      maskLabel,
      debugFlagDetected: args.debugEnabled,
      vmDiagnosticState: "present",
      maskBoundsCount: normalizedSpeakerBounds.length,
      selectedOverlayAssetPresent: false,
      resolvedPlacementPresent: false,
      candidateCount: 0,
      rejectedCandidateCount: 0,
      selectedScale: null,
      faceSafeZoneCount: 0,
      bodyOverlapAllowed: true,
      layoutMode: null,
      preferredZoneChosen: null,
      fallbackUsed: false,
      fallbackReason: null,
      scaleAttempts: [],
      gates: gateSummary.gates,
      firstBlockingReason: gateSummary.firstBlockingReason,
      dependencyChain: gateSummary.dependencyChain,
      upstream: {
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        episodeId: args.episodeId,
        expectedMediaPath: args.expectedMediaPath,
        actualMediaPath: args.actualMediaPath,
        sourceDeskErrorRaw: args.sourceDeskErrorRaw,
        playbackReadinessReason: args.playbackMediaReason,
      },
    };
    if (trace) console.debug("[hammer][auto-placement][resolver] return", { reason: "waiting_for_selected_overlay_asset", result });
    return result;
  }
  const overlaySize = {
    width: Math.max(140, Math.round(args.frameInput.width * 0.22)),
    height: Math.max(90, Math.round(args.frameInput.height * 0.16)),
  };
  const placementResolution = resolveMaskAwarePlacementWithScaleFallback({
    frame: args.frameInput,
    overlay: overlaySize,
    speakerMaskBounds: normalizedSpeakerBounds,
    reservedZones: [],
    selectionSeed: Math.floor(args.playheadSec || 0),
    allowScaleFallback: true,
    minScale: 0.5,
    scaleSteps: [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5],
  });
  const resolved = placementResolution.placement;
  const resolvedOverlaySize = resolved?.resolvedOverlaySize ?? overlaySize;
  const evaluation = evaluateMaskAwarePlacementCandidates({
    frame: args.frameInput,
    overlay: resolvedOverlaySize,
    speakerMaskBounds: normalizedSpeakerBounds,
    reservedZones: [],
    selectionSeed: Math.floor(args.playheadSec || 0),
  });
  const paddedSpeakerBounds = evaluation.paddedSpeakerBounds.map((rect) => ({
    leftPct: (rect.x / frameW) * 100,
    topPct: (rect.y / frameH) * 100,
    widthPct: (rect.width / frameW) * 100,
    heightPct: (rect.height / frameH) * 100,
  }));
  const faceSafeZones = evaluation.faceSafeZones.map((rect) => ({
    leftPct: (rect.x / frameW) * 100,
    topPct: (rect.y / frameH) * 100,
    widthPct: (rect.width / frameW) * 100,
    heightPct: (rect.height / frameH) * 100,
  }));
  const candidates = evaluation.candidates.map((candidate) => ({
    leftPct: (candidate.rect.x / frameW) * 100,
    topPct: (candidate.rect.y / frameH) * 100,
    widthPct: (candidate.rect.width / frameW) * 100,
    heightPct: (candidate.rect.height / frameH) * 100,
    zone: candidate.zone,
    accepted: candidate.accepted,
    rejectionReason: candidate.rejectionReason,
  }));
  const rejectedCandidateCount = candidates.reduce((count, candidate) => count + (candidate.accepted ? 0 : 1), 0);
  if (!resolved) {
    const gateSummary = buildAutoPlacementGates({
      workspaceLoaded: args.workspaceLoaded,
      workspaceReason: args.workspaceReason,
      playbackMediaReady: args.playbackMediaReady,
      playbackMediaReason: args.playbackMediaReason,
      currentFrameAvailable: true,
      currentFrameReason: "frame input resolved",
      segmentationMaskAvailable: true,
      segmentationMaskReason: "mask bounds available",
      selectedVisualAssetAvailable: true,
      selectedVisualAssetReason: "selected overlay asset present",
      placementEvaluationExecuted: true,
      placementEvaluationReason: "evaluator executed but no safe placement",
      candidateGenerationExecuted: candidates.length > 0,
      candidateGenerationReason: candidates.length > 0 ? "candidates generated" : "no candidates generated",
    });
    const result: HammerAutoPlacementDiagnosticsState = {
      enabled: true,
      state: "no_safe_placement",
      statusLabel: "auto-placement: no safe placement",
      overlay: null,
      ghost: null,
      paddedSpeakerBounds,
      faceSafeZones,
      candidates,
      frameLabel,
      maskLabel,
      debugFlagDetected: args.debugEnabled,
      vmDiagnosticState: "present",
      maskBoundsCount: normalizedSpeakerBounds.length,
      selectedOverlayAssetPresent: hasSelectedOverlayAsset,
      resolvedPlacementPresent: false,
      candidateCount: candidates.length,
      rejectedCandidateCount,
      selectedScale: null,
      faceSafeZoneCount: faceSafeZones.length,
      bodyOverlapAllowed: true,
      layoutMode: null,
      preferredZoneChosen: null,
      fallbackUsed: false,
      fallbackReason: null,
      scaleAttempts: placementResolution.scaleAttempts,
      gates: gateSummary.gates,
      firstBlockingReason: gateSummary.firstBlockingReason,
      dependencyChain: gateSummary.dependencyChain,
      upstream: {
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        episodeId: args.episodeId,
        expectedMediaPath: args.expectedMediaPath,
        actualMediaPath: args.actualMediaPath,
        sourceDeskErrorRaw: args.sourceDeskErrorRaw,
        playbackReadinessReason: args.playbackMediaReason,
      },
    };
    if (trace) console.debug("[hammer][auto-placement][resolver] return", { reason: "no_safe_placement", result });
    return result;
  }
  let ghost: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
    zone: string;
    score: number;
    sourceClipId: string;
    reasonsSummary: string;
  } | null = null;
  if (hasSelectedOverlayAsset && args.selectedOverlayForGhost) {
    const selectedOverlayWidthPx = Math.max(120, Math.round((args.selectedOverlayForGhost.widthPct / 100) * frameW));
    const selectedOverlayHeightPx = Math.max(80, Math.round((args.selectedOverlayForGhost.heightPct / 100) * frameH));
    const ghostPlacement = resolveMaskAwarePlacement({
      frame: args.frameInput,
      overlay: { width: selectedOverlayWidthPx, height: selectedOverlayHeightPx },
      speakerMaskBounds: normalizedSpeakerBounds,
      reservedZones: [],
      selectionSeed: Math.floor(args.playheadSec || 0) + 17,
    });
    if (ghostPlacement) {
      ghost = {
        leftPct: (ghostPlacement.rect.x / frameW) * 100,
        topPct: (ghostPlacement.rect.y / frameH) * 100,
        widthPct: (ghostPlacement.rect.width / frameW) * 100,
        heightPct: (ghostPlacement.rect.height / frameH) * 100,
        zone: ghostPlacement.zone,
        score: ghostPlacement.score,
        sourceClipId: args.selectedOverlayForGhost.clipId,
        reasonsSummary: ghostPlacement.reasons.slice(0, 8).join(" · "),
      };
    }
  }
  const gateSummary = buildAutoPlacementGates({
    workspaceLoaded: args.workspaceLoaded,
    workspaceReason: args.workspaceReason,
    playbackMediaReady: args.playbackMediaReady,
    playbackMediaReason: args.playbackMediaReason,
    currentFrameAvailable: true,
    currentFrameReason: "frame input resolved",
    segmentationMaskAvailable: true,
    segmentationMaskReason: "mask bounds available",
    selectedVisualAssetAvailable: true,
    selectedVisualAssetReason: "selected overlay asset present",
    placementEvaluationExecuted: true,
    placementEvaluationReason: "evaluator executed",
    candidateGenerationExecuted: candidates.length > 0,
    candidateGenerationReason: candidates.length > 0 ? "candidates generated" : "no candidates generated",
  });
  const result: HammerAutoPlacementDiagnosticsState = {
    enabled: true,
    state: resolved.resolvedWithScaleFallback ? "resolved_with_scale_fallback" : "resolved",
    statusLabel: resolved.resolvedWithScaleFallback
      ? `auto-placement: resolved_with_scale_fallback · ${resolved.layoutMode ?? "unknown"} · ${resolved.zone} (${resolved.score.toFixed(2)}) · selectedScale:${(resolved.selectedScale ?? 1).toFixed(2)}`
      : `auto-placement: ${resolved.layoutMode ?? "unknown"} · ${resolved.zone} (${resolved.score.toFixed(2)})`,
    overlay: {
      leftPct: (resolved.rect.x / frameW) * 100,
      topPct: (resolved.rect.y / frameH) * 100,
      widthPct: (resolved.rect.width / frameW) * 100,
      heightPct: (resolved.rect.height / frameH) * 100,
      zone: resolved.zone,
      score: resolved.score,
      compositionScore: resolved.compositionScore ?? 0,
      overlapPenalty: resolved.overlapPenalty ?? 0,
      facePenalty: resolved.facePenalty ?? 0,
      scalePenalty: resolved.scalePenalty ?? 0,
      edgePenalty: resolved.edgePenalty ?? 0,
      finalScore: resolved.finalScore ?? resolved.score,
      whySelected: resolved.whySelected ?? "editorial balance",
      topPenaltyReason: (() => {
        const penaltyEntries = (resolved.reasons ?? [])
          .map((reason) => {
            const [key, value] = reason.split("=");
            if (!key?.includes("penalty")) return null;
            const numeric = Number(value ?? "0");
            if (!Number.isFinite(numeric)) return null;
            return { key, value: numeric };
          })
          .filter((entry): entry is { key: string; value: number } => Boolean(entry));
        if (penaltyEntries.length === 0) return "none";
        const top = penaltyEntries.sort((a, b) => b.value - a.value)[0]!;
        return `${top.key}:${top.value.toFixed(2)}`;
      })(),
      scale: resolved.selectedScale ?? 1,
      originalOverlaySize: resolved.originalOverlaySize ?? overlaySize,
      resolvedOverlaySize: resolved.resolvedOverlaySize ?? overlaySize,
      reasonsSummary: resolved.reasons.slice(0, 8).join(" · "),
      layoutMode: resolved.layoutMode ?? "unknown",
      preferredZoneChosen: resolved.preferredZoneChosen ?? resolved.zone,
      fallbackUsed: Boolean(resolved.fallbackUsed),
      fallbackReason: resolved.fallbackReason ?? null,
      scaleReason: (resolved.selectedScale ?? 1) >= 0.85
        ? "readability_preferred"
        : (resolved.selectedScale ?? 1) >= 0.75
        ? "acceptable_fallback"
        : "emergency_only",
      placementReason: resolved.whySelected ?? "editorial defaults",
    },
    ghost,
    paddedSpeakerBounds,
    faceSafeZones,
    candidates,
    frameLabel,
    maskLabel,
    debugFlagDetected: args.debugEnabled,
    vmDiagnosticState: "present",
    maskBoundsCount: normalizedSpeakerBounds.length,
    selectedOverlayAssetPresent: hasSelectedOverlayAsset,
    resolvedPlacementPresent: true,
    candidateCount: candidates.length,
    rejectedCandidateCount,
    selectedScale: resolved.selectedScale ?? 1,
    faceSafeZoneCount: faceSafeZones.length,
    bodyOverlapAllowed: true,
    layoutMode: resolved.layoutMode ?? "unknown",
    preferredZoneChosen: resolved.preferredZoneChosen ?? resolved.zone,
    fallbackUsed: Boolean(resolved.fallbackUsed),
    fallbackReason: resolved.fallbackReason ?? null,
    scaleAttempts: resolved.scaleAttempts ?? placementResolution.scaleAttempts,
    gates: gateSummary.gates,
    firstBlockingReason: gateSummary.firstBlockingReason,
    dependencyChain: gateSummary.dependencyChain,
    upstream: {
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      episodeId: args.episodeId,
      expectedMediaPath: args.expectedMediaPath,
      actualMediaPath: args.actualMediaPath,
      sourceDeskErrorRaw: args.sourceDeskErrorRaw,
      playbackReadinessReason: args.playbackMediaReason,
    },
  };
  if (trace) console.debug("[hammer][auto-placement][resolver] return", { reason: "resolved", result });
  return result;
}

export function buildTimelineDockVM(args: any) {
  return {
    isScrubbing: args.isScrubbing,
    setFocusOverride: args.setFocusOverride,
    waveformProxy: args.editableAudioPolish?.analysis?.waveform_proxy ?? null,
    playbackTransportDurationSec: args.playbackTransportDurationSec,
    effectivePlaybackCutRegions: args.effectivePlaybackCutRegions,
    playheadSec: args.playheadSec,
    seekPlayheadToTime: args.seekPlayheadToTime,
    togglePlayback: args.togglePlayback,
    isPlaybackActive: args.isPlaybackActive,
    toggleSelectionLoopPlayback: args.toggleSelectionLoopPlayback,
    isLoopPlaybackActive: args.isLoopPlaybackActive,
    playSelectionWithRoll: args.playSelectionWithRoll,
    selectedSegment: args.selectedSegment,
    selectAdjacentSegment: args.selectAdjacentSegment,
    jumpToSelectionBoundary: args.jumpToSelectionBoundary,
    jumpToEditPoint: args.jumpToEditPoint,
    sortedTimelineMarkers: args.sortedTimelineMarkers,
    jumpToMarker: args.jumpToMarker,
    addMarkerAtPlayhead: args.addMarkerAtPlayhead,
    scrubRate: args.scrubRate,
    scrubRateOptions: args.SCRUB_RATE_OPTIONS,
    setScrubRate: (rate: number) => {
      if (!args.SCRUB_RATE_OPTIONS.includes(rate)) return;
      args.setScrubRate(rate);
    },
    zoomTimelineOut: args.zoomTimelineOut,
    zoomTimelineIn: args.zoomTimelineIn,
    resetTimelineZoom: args.resetTimelineZoom,
    timelineZoomPercent: args.timelineZoomPercent,
    nudgePlayhead: args.nudgePlayhead,
    smallPlayheadNudgeSec: args.SMALL_PLAYHEAD_NUDGE_SEC,
    splitSelectedSegmentAtPlayhead: args.splitSelectedSegmentAtPlayhead,
    deleteSelectedSegmentAndRipple: args.deleteSelectedSegmentAndRipple,
    toggleSelectedSegmentDisabled: args.toggleSelectedSegmentDisabled,
    transcriptDurationSec: args.transcriptDurationSec,
    audioCutSelectionStatus: args.audioCutSelectionStatus,
    persistedAudioCutCount: args.persistedAudioCutCount,
    canMarkAudioCutSelection: args.canMarkAudioCutSelection,
    canApplyAudioCutSelection: args.canApplyAudioCutSelection,
    hasPendingAudioCutSelection: args.hasPendingAudioCutSelection,
    markAudioCutBoundary: args.markAudioCutBoundary,
    applyAudioCutSelection: args.applyAudioCutSelection,
    clearAudioCutSelection: args.clearAudioCutSelection,
    jumpToMarkerById: args.jumpToMarkerById,
    removeMarker: args.removeMarker,
    moveSegment: args.moveSegment,
    trimSegmentStart: args.trimSegmentStart,
    trimSegmentEnd: args.trimSegmentEnd,
    adjustSelectedSegmentGain: args.adjustSelectedSegmentGain,
    visualTimelineDock: {
      clips: args.visualTimelineLaneClips,
      playheadSec: args.playheadSec,
      durationSec: args.timelineDurationSec,
      selectedClipId: args.linkedPrimaryVisualId,
      editable: args.visualPlacementEditingEnabled,
      focusToken: args.visualTimelineFocusNonce,
      onSelectClip: (clipId: string) => {
        args.selectVisualClip({
          clipId,
          origin: "timeline",
          revealUI: true,
          allowSurfaceSwitch: true,
        });
      },
      onMoveClip: (event: any, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!args.visualPlacementEditingEnabled) return;
        args.beginTimelineImagePlacementDrag(event as any, {
          placementId: clip.clipId,
          mode: "move",
          startSec: Math.max(0, clip.startSec - args.compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - args.compositionOffsetSec),
        });
      },
      onTrimClipStart: (event: any, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!args.visualPlacementEditingEnabled) return;
        args.beginTimelineImagePlacementDrag(event as any, {
          placementId: clip.clipId,
          mode: "resize_start",
          startSec: Math.max(0, clip.startSec - args.compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - args.compositionOffsetSec),
        });
      },
      onTrimClipEnd: (event: any, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!args.visualPlacementEditingEnabled) return;
        args.beginTimelineImagePlacementDrag(event as any, {
          placementId: clip.clipId,
          mode: "resize_end",
          startSec: Math.max(0, clip.startSec - args.compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - args.compositionOffsetSec),
        });
      },
    },
    timelineTrackScrollRef: args.timelineTrackScrollRef,
    handleTimelineTrackWheelZoom: args.handleTimelineTrackWheelZoom,
    editableTranscriptSegmentsLength: args.editableTranscriptSegments.length,
    timelineBoardZoomClassName: args.timelineBoardZoomClassName,
    beginTimelineScrub: args.beginTimelineScrub,
    timelineMinorTicks: args.timelineMinorTicks,
    timelineTicks: args.timelineTicks,
    timelineDurationSec: args.timelineDurationSec,
    playheadRatioPercent: args.playheadRatioPercent,
    timelineLanes: args.timelineLanes,
    laneGapsById: args.laneGapsById,
    visualPlacementEditingEnabled: args.visualPlacementEditingEnabled,
    currentPass: args.currentPass,
    resolvePlacementAnimationPreset: args.resolvePlacementAnimationPreset,
    visualPlacementsById: args.visualPlacementsById,
    beginTimelineImagePlacementDrag: args.beginTimelineImagePlacementDrag,
    openImageAnimationContextMenu: args.openImageAnimationContextMenu,
  };
}

export function buildSourceBayVM(args: any) {
  const layerOptions = args.outputLayerCandidates.map((layer: any) => ({
    id: layer.layer_id,
    label: args.formatOutputLayerLabel(layer),
  }));
  const historyEntries = args.recentHistoryEntries.map((entry: any) => {
    const isCurrent = entry.id === args.historyHeadEntryId;
    const derivedTransition = args.derivedLayerHistoryRef.current.get(entry.id) ?? null;
    const derivedLayerCreated = Boolean(derivedTransition);
    return {
      id: entry.id,
      label: entry.label,
      timestampLabel: args.formatHistoryTimestamp(entry.timestamp),
      scopeLabel: args.formatHistoryEntryScope(entry),
      layerActionLabel: derivedLayerCreated ? "yes" : "no",
      derivedLayerLabel: derivedLayerCreated ? "yes" : "no",
      layerLabel: derivedTransition?.layerLabel ?? null,
      isCurrent,
      isLayerTransition: derivedLayerCreated,
      isActiveLayerTransition: Boolean(isCurrent && derivedTransition),
      onSelect: () => {
        args.setFocusOverride("source-focus");
        args.jumpToHistoryEntry(entry.id);
      },
    };
  });

  return {
    aiInUse: Boolean(args.props.aiInUse),
    onRequestRegenerateAiTranscript: args.props.onRequestRegenerateAiTranscript,
    regenerateAiTranscriptDisabled: args.props.regenerateAiTranscriptDisabled ?? false,
    transcriptVersionRegistry: args.props.transcriptVersionRegistry ?? null,
    undo: {
      canUndo: args.canUndo,
      label: args.undoLabel,
      compactLabel: args.undoLabelCompact,
      depth: args.undoDepth,
      onUndo: args.undoHistory,
    },
    redo: {
      canRedo: args.canRedo,
      label: args.redoLabel,
      compactLabel: args.redoLabelCompact,
      depth: args.redoDepth,
      onRedo: args.redoHistory,
    },
    tabs: args.SOURCE_TABS.map((tab: any) => ({
      id: tab.id,
      label: tab.label,
      isActive: args.selectedSourceTab === tab.id,
      onSelect: () => args.selectEditorMode(args.resolveEditorModeFromSourceTab(tab.id), { focusOverride: "source-focus" }),
    })),
    sourceDeskLoading: args.sourceDeskLoading,
    sourceDeskError: args.sourceDeskError
      ? {
        message: args.sourceDeskError,
        className: args.isSourceDeskAuthMessage(args.sourceDeskError)
          ? "hammer-source-status hammer-source-status--info"
          : "hammer-source-status hammer-source-status--error",
      }
      : null,
    viewingLayer: {
      value: args.activeOutputLayerId ?? "__raw__",
      disabled: !args.workspaceStructuredTranscript,
      options: layerOptions,
      onChange: (nextLayerId: string | null) => {
        args.setFocusOverride("source-focus");
        args.selectViewingLayer(nextLayerId);
      },
    },
    exportBasis: {
      value: args.editableOutputSelection.layerId ?? "__raw__",
      options: layerOptions,
      onChange: (nextLayerId: string | null) => {
        args.setFocusOverride("source-focus");
        args.selectOutputLayerForExport(nextLayerId);
      },
    },
    historyPanel: {
      canRestoreState: args.canRedo,
      onRestoreState: args.restoreCurrentHistoryState,
      shownCountLabel: `${args.recentHistoryEntries.length} shown`,
      resetToRaw: args.props.onRequestResetToRaw ? {
        inFlight: Boolean(args.props.resetToRawInFlight),
        error: args.props.resetToRawError ?? null,
        onRequest: () => args.props.onRequestResetToRaw?.(),
      } : null,
      entries: historyEntries,
    },

    selectedSourceTab: args.selectedSourceTab,
    editableTranscriptSegments: args.editableTranscriptSegments,
    selectedSegment: args.selectedSegment,
    selectedSegmentId: args.selectedSegmentId,
    linkedSelection: args.linkedSelection,
    linkedTranscriptSegmentIdSet: args.linkedTranscriptSegmentIdSet,
    linkedVisualIdSet: args.linkedVisualIdSet,
    linkedPrimaryVisualId: args.linkedPrimaryVisualId,
    setFocusOverride: args.setFocusOverride,
    roundToTenth: args.roundToTenth,
    applyHistoryMutation: args.applyHistoryMutation,
    updateSegmentInTimeline: args.updateSegmentInTimeline,
    transcriptTimingHint: args.transcriptTimingHint,
    activeTool: args.activeTool,
    updateTranscriptSegmentSpeaker: args.updateTranscriptSegmentSpeaker,
    applyTranscriptSelection: args.applyTranscriptSelection,
    disableTranscriptSelection: args.disableTranscriptSelection,
    cutTranscriptSelection: args.cutTranscriptSelection,
    tightenTranscriptSelection: args.tightenTranscriptSelection,
    clearTranscriptSelection: args.clearTranscriptSelection,
    hasTranscriptSelection: args.hasTranscriptSelection,
    transcriptSelectionAllDisabled: args.transcriptSelectionAllDisabled,
    transcriptSelectionRange: args.transcriptSelectionRange,
    transcriptSelectionSegmentIdSet: args.transcriptSelectionSegmentIdSet,
    modifiedTranscriptSegmentIds: args.modifiedTranscriptSegmentIds,
    modifiedSegmentCount: args.modifiedSegmentCount,
    candidateSegmentIdSet: args.candidateSegmentIdSet,
    activeCandidateSegmentIdSet: args.activeCandidateSegmentIdSet,
    transcriptLineRefs: args.transcriptLineRefs,
    selectedTranscriptRange: args.selectedTranscriptRange,
    onTranscriptSelection: args.setSelectedTranscriptRangeDetail,
    isSubtractiveTranscriptEdit: args.isSubtractiveTranscriptEdit,
    commitTranscriptTextEdits: args.commitTranscriptTextEdits,
    commitDeleteOnlyTranscriptEdits: args.commitDeleteOnlyTranscriptEdits,
    setTranscriptTimingHint: args.setTranscriptTimingHint,

    formatBytes: args.formatBytes,
    selectedVisualFlowStep: args.selectedVisualFlowStep,
    uploadingCategory: args.uploadingCategory,
    savingIntroOutro: args.savingIntroOutro,
    workspaceIntroOutroDefaults: args.workspaceIntroOutroDefaults,
    savingWorkspaceIntroOutroDefaults: args.savingWorkspaceIntroOutroDefaults,
    applyIntroOutroSelectionToFutureEpisodes: args.applyIntroOutroSelectionToFutureEpisodes,
    setApplyIntroOutroSelectionToFutureEpisodes: args.setApplyIntroOutroSelectionToFutureEpisodes,
    persistWorkspaceIntroOutroDefaultsNow: args.persistWorkspaceIntroOutroDefaultsNow,
    sourceDeskPreviewUrls: args.sourceDeskPreviewUrls,
    sourceDeskPreviewFailures: args.sourceDeskPreviewFailures,
    sourceDeskRequestedPreviewPathSet: args.sourceDeskRequestedPreviewPathSet,
    sourceDeskPreviewPendingPathSet: args.sourceDeskPreviewPendingPathSet,
    sourceDeskRemainingPreviewCount: args.sourceDeskRemainingPreviewPaths.length,
    requestSourceDeskPreviews: args.requestSourceDeskPreviews,
    reportSourceDeskPreviewLoadError: args.reportSourceDeskPreviewLoadError,
    loadRemainingSourceDeskPreviews: () => args.requestSourceDeskPreviews(args.sourceDeskRemainingPreviewPaths),
    reportVisibleSourceDeskPreviewPaths: args.reportVisibleSourceDeskPreviewPaths,
    imageUploadInputRef: args.imageUploadInputRef,
    brollUploadInputRef: args.brollUploadInputRef,
    introOutroUploadInputRef: args.introOutroUploadInputRef,
    sourceImageItems: args.sourceImageItems,
    sourceImageLibraryItems: args.sourceImageLibraryItems,
    imageUsageByPath: args.imageUsageByPath,
    handleSourceDeskUpload: args.handleSourceDeskUpload,
    persistIntroOutroSelection: args.persistIntroOutroSelection,
    addImagePlacementFromLibrary: args.addImagePlacementFromLibrary,
    addVisualAssetPlacementFromLibrary: args.addVisualAssetPlacementFromLibrary,
    updatePlacementKindFromMediaMap: args.updatePlacementKindFromMediaMap,
    redoMediaMapFromScript: args.redoMediaMapFromScript,
    sourceReferenceClipItems: args.sourceReferenceClipItems,
    sourceBrollOnlyItems: args.sourceBrollOnlyItems,
    referenceClipPlannedBeats: args.referenceClipPlannedBeats,
    seekPlayheadToTime: args.seekPlayheadToTime,
    introOutroSelection: args.introOutroSelection,
    introOutroSelectedIntroPath: args.introOutroSelectedIntroPath,
    introOutroSelectedOutroPath: args.introOutroSelectedOutroPath,
    introOutroCandidateItems: args.introOutroCandidateItems,

    transcriptSegmentsById: args.transcriptSegmentsById,
    visualPlacementCardRefs: args.visualPlacementCardRefs,
    effectiveSelectedClipId: args.effectiveSelectedClipId,
    selectVisualClip: args.selectVisualClip,
    selectionOriginRef: args.selectionOriginRef,
    setSelectedClipId: args.setSelectedClipId,
    setSelectedSegmentId: args.setSelectedSegmentId,
    setTranscriptSelectionAnchorSegmentId: args.setTranscriptSelectionAnchorSegmentId,
    setTranscriptSelectionFocusSegmentId: args.setTranscriptSelectionFocusSegmentId,
    setVisualTimelineFocusNonce: args.setVisualTimelineFocusNonce,
    updateVisualPlacementTiming: args.updateVisualPlacementTiming,
    removeVisualPlacement: args.removeVisualPlacement,
    sourceAssetItems: args.sourceAssetItems,
    workspaceMapping: args.workspaceMapping,
    mediaMapBeats: args.mediaMapBeats,
    setSelectedVisualFlowStep: args.setSelectedVisualFlowStep,
    setMediaMapBeats: args.setMediaMapBeats,
    setRemovedMediaMapSegmentIds: args.setRemovedMediaMapSegmentIds,
    unresolvedBrollSuggestionItems: args.unresolvedBrollSuggestionItems,
  };
}

export function buildPreviewBayVM(args: any) {
  const trace = shouldTraceAutoPlacementDiagnostics();
  if (trace) {
    console.debug("[hammer][auto-placement][buildPreviewBayVM] enter", {
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      episodeId: args.episodeId ?? null,
      workspaceLoaded: args.workspaceLoaded,
      workspaceLoadError: args.workspaceLoadError ?? null,
      effectivePlaybackMediaSrcPresent: Boolean(args.effectivePlaybackMediaSrc),
      effectivePreviewVideoSrcPresent: Boolean(args.effectivePreviewVideoSrc),
    });
  }
  const polishPreviewTarget = resolveHammerPolishPreviewTarget({
    visualPolishPreviewActive: args.visualPolishPreviewActive,
    previewVideoSrc: args.effectivePreviewVideoSrc,
    activePreviewOverlays: args.activePreviewOverlays ?? [],
  });
  const segmentationSourceVideoRef = args.segmentationSourceVideoRef ?? args.previewVideoRef;
  const segmentationSourceVideoSrc = typeof args.segmentationSourceVideoSrc === "string"
    ? args.segmentationSourceVideoSrc
    : (typeof args.effectivePreviewVideoSrc === "string" ? args.effectivePreviewVideoSrc : null);
  const segmentationUsesDisplayedPreviewRef = segmentationSourceVideoRef === args.previewVideoRef;
  const segmentationSourceMatchesDisplayedBase = Boolean(
    segmentationUsesDisplayedPreviewRef
      || (segmentationSourceVideoSrc
        && args.effectivePreviewVideoSrc
        && segmentationSourceVideoSrc === args.effectivePreviewVideoSrc),
  );
  const hasBackgroundEffectRequest = Boolean(
    args.visualBackgroundBlur || args.visualBackgroundReplaceEnabled || args.visualBackgroundWashEnabled,
  );
  const hiddenSegmentationVideoMounted = segmentationSourceVideoRef !== args.previewVideoRef;
  const blurRuntime = args.visualBackgroundBlurRuntimeStatus ?? null;
  const autoPlacementDiagnosticsEnabled = shouldShowAutoPlacementDiagnostics();
  const selectedOverlayForGhostFromPreview = (args.activePreviewOverlays ?? []).find((overlay: any) => overlay?.selected);
  const selectedOverlayForGhostFromPlacement = args.selectedImagePlacement
    ? {
      clip_id: String(args.selectedImagePlacement.id ?? ""),
      src: null,
      asset_path: args.selectedImagePlacement.assetPath ?? null,
      asset_id: args.selectedImagePlacement.asset_id ?? null,
      width_pct: Number(args.selectedImagePlacementTransform?.widthPct ?? 22),
      height_pct: Number(args.selectedImagePlacementTransform?.heightPct ?? 16),
    }
    : null;
  const selectedOverlayForGhost = selectedOverlayForGhostFromPreview ?? selectedOverlayForGhostFromPlacement;
  const speakerMaskBounds: AutoPlacementRect[] = Array.isArray(blurRuntime?.mask?.speakerMaskBounds)
    ? blurRuntime.mask.speakerMaskBounds
    : [];
  const maskResolution = blurRuntime?.mask?.resolution
    ? {
      width: Number(blurRuntime.mask.resolution.width) || 0,
      height: Number(blurRuntime.mask.resolution.height) || 0,
    }
    : null;
  const autoPlacementFrame = blurRuntime?.frameInput
    ? { width: Number(blurRuntime.frameInput.width) || 0, height: Number(blurRuntime.frameInput.height) || 0 }
    : null;
  const autoPlacementDiagnostics = resolveAutoPlacementDiagnosticsForPreview({
    debugEnabled: autoPlacementDiagnosticsEnabled,
    frameInput: autoPlacementFrame,
    speakerMaskBounds,
    maskResolution,
    playheadSec: args.playheadSec ?? 0,
    selectedOverlayForGhost: selectedOverlayForGhost
      ? {
        clipId: String(selectedOverlayForGhost.clip_id ?? ""),
        hasRealAsset: Boolean(
          selectedOverlayForGhost.src
          || selectedOverlayForGhost.asset_path
          || selectedOverlayForGhost.asset_id,
        ),
        widthPct: Number(selectedOverlayForGhost.width_pct ?? 0),
        heightPct: Number(selectedOverlayForGhost.height_pct ?? 0),
      }
      : null,
    workspaceLoaded: Boolean(args.workspaceLoaded),
    workspaceReason: args.workspaceLoaded ? "workspace context available" : (args.workspaceLoadError ?? "workspace context missing"),
    playbackMediaReady: Boolean(args.effectivePlaybackMediaSrc),
    playbackMediaReason: args.effectivePlaybackMediaSrc ? "playback media source resolved" : "playback media unavailable",
    workspaceId: String(args.workspaceId ?? ""),
    workpieceId: String(args.workpieceId ?? ""),
    episodeId: args.episodeId == null ? null : String(args.episodeId),
    expectedMediaPath: args.expectedMediaPath == null ? null : String(args.expectedMediaPath),
    actualMediaPath: args.actualMediaPath == null ? null : String(args.actualMediaPath),
    sourceDeskErrorRaw: args.workspaceLoadError == null ? null : String(args.workspaceLoadError),
  });
  const autoPlacementRuntimeEnabled = autoPlacementDiagnosticsEnabled
    && polishPreviewTarget.hasFrame
    && segmentationSourceMatchesDisplayedBase;
  if (trace) {
    console.debug("[hammer][auto-placement][buildPreviewBayVM] diagnostics", {
      hasDiagnosticsObject: autoPlacementDiagnostics !== undefined,
      enabled: autoPlacementDiagnostics.enabled,
      state: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.state : "disabled",
    });
  }
  const audioPolish = args.editableAudioPolish ?? null;
  const audioAnalysis = audioPolish?.analysis ?? null;
  const loudness = audioAnalysis?.loudness ?? null;
  const transcriptPrep = audioAnalysis?.transcript_prep ?? null;
  const channelCharacterization = audioAnalysis?.channel_characterization ?? null;
  const audioPolishSettingsSummary = audioPolish?.settings_summary ?? {};
  const filterChain = Object.entries(audioPolishSettingsSummary)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  const playbackPipelineMode = args.isPlaybackActive
    ? "playback"
    : args.isScrubbing
    ? "scrub"
    : "paused preview";
  const exportPipelineActive = args.currentPass === "packaging" || args.activeTool === "export";
  const previewPipelineActive = !args.isPlaybackActive;
  const visualDiagnostics = {
    blurEnabled: Boolean(args.backgroundBlurSettings?.enabled),
    backgroundReplacementEnabled: Boolean(args.visualBackgroundReplaceEnabled),
    backgroundReplacementAssetPresent: Boolean(args.visualBackgroundReplaceImageAssetPath),
    backgroundReplacementAssetType: args.visualBackgroundReplaceImageAssetPath ? "image" : null,
    backgroundReplacementAssetPath: args.visualBackgroundReplaceImageAssetPath ?? null,
    backgroundReplacementAssetId: args.selectedBackgroundReplacementAssetId ?? null,
    replacementPipelineActive: Boolean(args.visualBackgroundReplaceEnabled && hasBackgroundEffectRequest),
    replacementMatteStage: "refined",
    blurStrength: Number(args.backgroundBlurSettings?.blurPx ?? 0),
    edgeFeather: Number(args.backgroundBlurSettings?.edgeFeatherPx ?? 0),
    subjectExpansion: Number(args.backgroundBlurSettings?.subjectExpansionPx ?? 0),
    temporalSmoothing: Number(args.backgroundBlurSettings?.temporalSmoothing ?? 0),
    qualityMode: args.backgroundBlurSettings?.qualityMode ?? "medium",
    maskPresent: blurRuntime?.mask?.status === "ok",
    maskStatus: blurRuntime?.mask?.status ?? "unknown",
    segmentationProvider: blurRuntime?.provider?.name ?? args.visualBackgroundBlurProviderId ?? "mediapipe_selfie_segmentation",
    providerLoaded: blurRuntime?.provider?.readiness?.status === "ready",
    maskPreviewMode: Boolean(args.visualBackgroundMaskPreviewMode),
    maskPreviewStage: args.visualBackgroundMaskPreviewStage ?? "raw",
    fallbackMode: args.backgroundBlurSettings?.fallbackMode ?? "disable",
    replacementFallbackState: blurRuntime?.degradedReason ?? null,
    lastSegmentationError: blurRuntime?.warnings?.[0] ?? null,
    videoFrameSize: blurRuntime?.frameInput ? `${blurRuntime.frameInput.width}x${blurRuntime.frameInput.height}` : "unknown",
    segmentationInputSize: blurRuntime?.frameInput ? `${blurRuntime.frameInput.width}x${blurRuntime.frameInput.height}` : "unknown",
    providerMaskSize: blurRuntime?.mask?.resolution ? `${blurRuntime.mask.resolution.width}x${blurRuntime.mask.resolution.height}` : "unknown",
    matteCanvasSize: blurRuntime?.mask?.resolution ? `${blurRuntime.mask.resolution.width}x${blurRuntime.mask.resolution.height}` : "unknown",
    renderCanvasSize: args.visualBackgroundEffectCanvasRef?.current
      ? `${args.visualBackgroundEffectCanvasRef.current.width}x${args.visualBackgroundEffectCanvasRef.current.height}`
      : "unknown",
    maskAgeMs: blurRuntime?.mask?.reason === "reused_recent_mask" ? "reused_recent_mask" : "live_or_unknown",
    maskFps: blurRuntime?.effectiveSegmentationFps ?? null,
    avgMaskGenerationMs: blurRuntime?.avgSegmentationMs ?? null,
    maxMaskGenerationMs: blurRuntime?.maxSegmentationMs ?? null,
    lastMaskAgeMs: blurRuntime?.lastMaskAgeMs ?? null,
    droppedMaskFrames: blurRuntime?.droppedFrames ?? 0,
    skippedMaskFrames: blurRuntime?.skippedSegmentationFrames ?? 0,
  };
  const diagnosticsSnapshot = {
    pipeline: {
      activePipeline: playbackPipelineMode,
      previewPipelineActive,
      playbackPipelineActive: Boolean(args.isPlaybackActive),
      exportPipelineActive,
      currentFrameSource: "previewVideoRef",
      segmentationFrameSource: hiddenSegmentationVideoMounted ? "segmentationSourceVideoRef" : "previewVideoRef",
      displayedVideoRef: "previewVideoRef",
      hiddenSegmentationVideoMounted,
      segmentationUsesDisplayedVideoRef: !hiddenSegmentationVideoMounted,
      maskEligibleDuringPlayback: Boolean(
        args.isPlaybackActive
          ? (segmentationSourceMatchesDisplayedBase && hasBackgroundEffectRequest)
          : segmentationSourceMatchesDisplayedBase,
      ),
    },
    media: {
      inputCodec: args.mediaPrepOutputs?.audio?.raw_source?.kind ?? "unknown",
      outputCodec: args.mediaPrepOutputs?.audio?.polish?.output_mime_type ?? "unknown",
      inputSampleRate: "unknown",
      outputSampleRate: "unknown",
      channels: channelCharacterization?.channel_count ?? "unknown",
      durationSec: typeof args.playbackTransportDurationSec === "number" ? Math.max(0, args.playbackTransportDurationSec) : null,
      transcriptPrepFormat: transcriptPrep ? `${transcriptPrep.strategy}` : "unknown",
      exportAudioFormat: args.mediaPrepOutputs?.audio?.polish?.output_mime_type ?? "unknown",
    },
    audio: {
      filterChainApplied: filterChain,
      normalizationApplied: filterChain.some((item) => item.includes("normalization")),
      loudnessLufs: loudness?.integrated_lufs ?? null,
      peakDbtp: loudness?.true_peak_dbtp ?? null,
      clippingDetected: typeof loudness?.true_peak_dbtp === "number" ? loudness.true_peak_dbtp > 0 : null,
      transcriptPrepChunkCount: transcriptPrep?.chunk_count ?? null,
    },
    visualEffects: visualDiagnostics,
    autoPlacement: autoPlacementDiagnosticsEnabled
      ? {
        state: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.state : "disabled",
        status: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.statusLabel : "auto-placement: disabled",
        speakerMaskBoundsCount: speakerMaskBounds.length,
        resolvedZone: autoPlacementDiagnostics.enabled && autoPlacementDiagnostics.overlay
          ? autoPlacementDiagnostics.overlay.zone
          : null,
      }
      : undefined,
  };

  return {
    previewModeLabel: args.previewMode,
    activeVisualTool: args.activeTool === "video" ? args.activeVisualTool : null,
    visualPolishPreviewActive: args.visualPolishPreviewActive,
    previewSurfaceRef: args.previewSurfaceRef,
    previewVideoRef: args.previewVideoRef,
    segmentationSourceVideoRef,
    previewAudioRef: args.previewAudioRef,
    previewBrollVideoRefs: args.previewBrollVideoRefs,
    previewVideoSrc: args.effectivePreviewVideoSrc,
    segmentationSourceVideoSrc,
    playbackMediaSrc: args.effectivePlaybackMediaSrc,
    isPlaybackActive: args.isPlaybackActive,
    playbackWindow: args.playbackWindow,
    handlePlaybackProgress: args.handlePlaybackProgressWithOrigin,
    handlePlaybackEnded: args.handlePlaybackEnded,
    setIsPlaybackActive: args.setIsPlaybackActive,
    clearPlaybackWindow: () => args.setPlaybackWindow(null),
    togglePlayback: args.togglePlayback,
    playheadSec: args.playheadSec,
    playbackModeLabel: args.playbackModeLabel,
    playbackSourceLabel: args.playbackSourceLabel,
    mediaLabelMismatchWarning: args.mediaLabelMismatchWarning,
    actualRecordingMismatchWarning: args.actualRecordingMismatchWarning,
    playbackBackendLabel: args.studioRackPlaybackConfig.backend,
    currentPassId: args.currentPass,
    selectedImageAnimationLabel: args.selectedImageAnimationLabel,
    audioFinalizationCompareModeLabel: args.audioFinalizationCompareMode === "before" ? "Before" : "After",
    audioComparePreviewStatusLabel: args.studioRackComparePreviewStatusLabel,
    packagingSummaryLabel: args.currentPass === "packaging"
      ? `Packaging: intro ${args.packagingIntroPlacement ? "on" : "off"} · outro ${args.packagingOutroPlacement ? "on" : "off"} · logo ${args.packagingLogoPlacement ? "on" : "off"}`
      : null,
    previewSurfaceLabel: args.previewSurfaceLabel,
    backgroundEffect: {
      enabled: (
        (polishPreviewTarget.segmentationEligible && hasBackgroundEffectRequest)
        || autoPlacementRuntimeEnabled
      ) && segmentationSourceMatchesDisplayedBase,
      settings: args.backgroundBlurSettings,
      providerId: args.visualBackgroundBlurProviderId,
      // Use the displayed preview surface as segmentation input so playback-visible
      // decoded frames always satisfy blur/segmentation readiness.
      sourceVideoRef: args.previewVideoRef,
      debugMasks: args.visualBackgroundBlurDebugMask || autoPlacementDiagnosticsEnabled,
      maskPreviewMode: args.visualBackgroundMaskPreviewMode || autoPlacementDiagnosticsEnabled,
      maskPreviewStage: args.visualBackgroundMaskPreviewStage,
      onStatus: args.setVisualBackgroundBlurRuntimeStatus,
      onCanvas: args.handleBackgroundEffectCanvas,
    },
    diagnostics: {
      enabled: shouldShowDiagnosticsPanel(),
      snapshot: diagnosticsSnapshot,
    },
    autoPlacementDiagnostics,
    eyeContactAssist: {
      enabled: polishPreviewTarget.segmentationEligible
        && segmentationSourceMatchesDisplayedBase
        && args.visualEyeContactAssistEnabled,
      strength: Math.max(0, Math.min(1, Number(args.visualEyeContactAssistStrength) || 0)),
      backgroundCanvasRef: args.visualBackgroundEffectCanvasRef,
      useBackgroundCanvasAsSource: args.eyeContactUseBackgroundCanvasAsSource,
      debugOverlay: args.visualEyeContactAssistDebugOverlay,
      onStatus: args.setVisualEyeContactAssistRuntimeStatus,
    },
    visualPreview: {
      isAuthority: args.isVisualPreviewAuthority,
      overlays: args.activePreviewOverlays,
      emptyStateMessage: resolveVisualPreviewEmptyStateMessage({ target: polishPreviewTarget }),
      editable: args.visualPlacementEditingEnabled,
      onSelectClip: (clipId: string) => {
        args.selectVisualClip({
          clipId,
          origin: "preview",
          revealUI: true,
          allowSurfaceSwitch: true,
          snapPlayhead: false,
        });
      },
      onBeginMove: (event: any, clipId: string) => {
        args.beginPreviewCanvasDrag(event as any, {
          placementId: clipId,
          mode: "move",
        });
      },
      onBeginResize: (event: any, clipId: string) => {
        args.beginPreviewCanvasDrag(event as any, {
          placementId: clipId,
          mode: "resize",
        });
      },
    },
  };
}

export function buildToolbarVM(args: any) {
  return {
    stats: [
      {
        id: "transcript",
        label: "Tx",
        value: String(args.editableTranscriptSegments.length),
        title: `Transcript: ${args.editableTranscriptSegments.length} segments`,
      },
      {
        id: "visuals",
        label: "Vis",
        value: (() => {
          const total = args.editableVisualPlacements?.placements.length ?? args.editableVisualTimeline?.clips.length ?? 0;
          const uncertain = (args.editableVisualPlacements?.placements ?? []).reduce(
            (count: number, placement: any) => count + (placement.status === "uncertain" ? 1 : 0),
            0,
          );
          return uncertain > 0 ? `${total}/${uncertain}?` : String(total);
        })(),
        title: (() => {
          const total = args.editableVisualPlacements?.placements.length ?? args.editableVisualTimeline?.clips.length ?? 0;
          const uncertain = (args.editableVisualPlacements?.placements ?? []).reduce(
            (count: number, placement: any) => count + (placement.status === "uncertain" ? 1 : 0),
            0,
          );
          return uncertain > 0
            ? `Visual placements: ${total} (${uncertain} uncertain)`
            : `Visual placements: ${total}`;
        })(),
      },
    ],
    passes: (() => {
      const summarize = (passIds: any[]): any => args.summarizePassStatuses(
        passIds.map((passId) => args.passSelectorResults.get(passId)?.status ?? args.getPassStatus(passId, args.passSelectorContext).status),
      );
      const transcriptPassIds: any[] = ["transcript_cleanup", "retakes", "gap_pacing"];
      const visualPassIds: any[] = ["visual_finishing", "image_placement", "image_animation"];
      const transcriptRepresentativePass: any = args.activeTool === "polish" && transcriptPassIds.includes(args.currentPass)
        ? args.currentPass
        : "transcript_cleanup";
      const visualRepresentativePass: any = args.activeVisualTool === "images"
        ? "image_placement"
        : args.activeVisualTool === "broll"
        ? "image_animation"
        : "visual_finishing";
      const visiblePasses = [
        {
          id: transcriptRepresentativePass,
          shortLabel: "T",
          label: "Transcript",
          toolId: "polish",
          statusLabel: summarize(transcriptPassIds),
          isActive: args.activeTool === "polish",
        },
        {
          id: visualRepresentativePass,
          shortLabel: "V",
          label: "Visuals",
          toolId: "video",
          statusLabel: summarize(visualPassIds),
          isActive: args.activeTool === "video",
        },
        {
          id: "audio_finalization",
          shortLabel: "A",
          label: "Audio",
          toolId: "audio",
          statusLabel: args.passSelectorResults.get("audio_finalization")?.humanLabel
            ?? args.getPassStatus("audio_finalization", args.passSelectorContext).humanLabel,
          isActive: args.activeTool === "audio",
        },
        {
          id: "packaging",
          shortLabel: "P",
          label: "Packaging",
          toolId: "finishing",
          statusLabel: args.passSelectorResults.get("packaging")?.humanLabel
            ?? args.getPassStatus("packaging", args.passSelectorContext).humanLabel,
          isActive: args.currentPass === "packaging",
        },
      ];
      return visiblePasses;
    })(),
    onSelectPass: args.selectPass,
  };
}

export function buildToolBayVM(args: any) {
  return {
    passLabel: args.passLabel,
    passStatus: args.passStatus,
    onMarkComplete: args.markCurrentPassComplete,
    activeVisualTool: args.activeVisualTool,
    onSelectVisualTool: args.selectVisualTool,
    shellProps: args.props,
    uploadingCategory: args.uploadingCategory,
    handleSourceDeskUpload: args.handleSourceDeskUpload,
    hasSilenceSuggestionAnalysis: args.hasSilenceSuggestionAnalysis,
    silenceSuggestionCount: args.silenceSuggestionCount,
    silenceCutSuggestions: args.silenceCutSuggestions,
    visibleSilenceCutSuggestions: args.visibleSilenceCutSuggestions,
    acceptSilenceCutSuggestion: args.acceptSilenceCutSuggestion,
    dismissSilenceCutSuggestion: args.dismissSilenceCutSuggestion,
    seekPlayheadToTime: args.seekPlayheadToTime,
    activeCaptionArtifactText: args.activeCaptionArtifactText,
    activeCaptionMode: args.activeCaptionMode,
    activeCaptionState: args.activeCaptionState,
    activeExposureAdjustment: args.activeExposureAdjustment,
    activeFillerCandidateCard: args.activeFillerCandidateCard,
    activeFillerCandidateDiffOps: args.activeFillerCandidateDiffOps,
    activeLookPreset: args.activeLookPreset,
    activeRetakeCandidateCard: args.activeRetakeCandidateCard,
    activeReviewKind: args.activeReviewKind,
    activeTool: args.activeTool,
    addMinimalTransition: args.addMinimalTransition,
    analyzeDeadAirClosure: args.analyzeDeadAirClosure,
    anchorLabelDraft: args.anchorLabelDraft,
    anchorTextDraft: args.anchorTextDraft,
    applyCleanup: args.applyCleanup,
    applyDeadAirClosureBatch: args.applyDeadAirClosureBatch,
    applyExposureAdjustment: args.applyExposureAdjustment,
    applyIntroPlacement: args.applyIntroPlacement,
    applyLogoOverlayStyle: args.applyLogoOverlayStyle,
    applyLookPresetSelection: args.applyLookPresetSelection,
    applyOutroPlacement: args.applyOutroPlacement,
    applyPodcastMasterPass: args.applyPodcastMasterPass,
    applyStudioRackMutation: args.applyStudioRackMutation,
    applyVoicePolishPreset: args.applyVoicePolishPreset,
    audioFinalizationCompareMode: args.audioFinalizationCompareMode,
    audioLevelingEnabled: args.audioLevelingEnabled,
    audioNoiseReductionEnabled: args.audioNoiseReductionEnabled,
    setVoicePolishDeEsserStrength: args.setVoicePolishDeEsserStrength,
    setVoicePolishEqProfile: args.setVoicePolishEqProfile,
    setVoicePolishFixEnabled: args.setVoicePolishFixEnabled,
    setVoiceCleanupEnabled: args.setVoiceCleanupEnabled,
    voicePolish: args.voicePolish,
    voicePolishHasAnyFixEnabled: args.voicePolishHasAnyFixEnabled,
    backgroundBlurProviderDescriptor: args.backgroundBlurProviderDescriptor,
    boundAttentionQueue: args.boundAttentionQueue,
    boundAttentionSummary: args.boundAttentionSummary,
    candidateProposedRemovalById: args.candidateProposedRemovalById,
    candidateReceiptByKind: args.candidateReceiptByKind,
    selectedTranscriptRange: args.selectedTranscriptRange,
    captionActiveModeLabel: args.captionActiveModeLabel,
    captionActiveModeSourceLabel: args.captionActiveModeSourceLabel,
    captionArtifactStatusLabel: args.captionArtifactStatusLabel,
    captionBuildFeedback: args.captionBuildFeedback,
    captionBuildFreshness: args.captionBuildFreshness,
    captionBuildState: args.captionBuildState,
    captionBuiltSummary: args.captionBuiltSummary,
    captionBuiltTone: args.captionBuiltTone,
    captionDiscardConsequenceLabel: args.captionDiscardConsequenceLabel,
    captionEditedBasisDetail: args.captionEditedBasisDetail,
    captionEditedChangeSummary: args.captionEditedChangeSummary,
    captionEditedState: args.captionEditedState,
    captionEditedSummary: args.captionEditedSummary,
    captionEditedTone: args.captionEditedTone,
    captionEditorRefs: args.captionEditorRefs,
    captionFormatting: args.captionFormatting,
    captionRebuildConsequenceLabel: args.captionRebuildConsequenceLabel,
    captionReleasePrepSafetyDetail: args.captionReleasePrepSafetyDetail,
    captionReleasePrepSafetyLabel: args.captionReleasePrepSafetyLabel,
    captionReleasePrepSafetyState: args.captionReleasePrepSafetyState,
    captionReleasePrepSummaryLine: args.captionReleasePrepSummaryLine,
    captionReleaseSourceLabel: args.captionReleaseSourceLabel,
    captionSourceLabel: args.captionSourceLabel,
    clampImagePlacementTransform: args.clampImagePlacementTransform,
    cleanupPreview: args.cleanupPreview,
    cleanupPreviewSummary: args.cleanupPreviewSummary,
    cleanupReceipt: args.cleanupReceipt,
    commitImagePlacementTransform: args.commitImagePlacementTransform,
    commitVisualAnchorRefinement: args.commitVisualAnchorRefinement,
    commitVisualPlacementWindow: args.commitVisualPlacementWindow,
    currentPass: args.currentPass,
    deadAirAnalysis: args.deadAirAnalysis,
    deadAirApplyInFlight: args.deadAirApplyInFlight,
    deadAirThresholdSec: args.deadAirThresholdSec,
    DEFAULT_IMAGE_PLACEMENT_TRANSFORM: args.DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
    detailTag: args.detailTag,
    discardHearthBrollSuggestion: args.discardHearthBrollSuggestion,
    editableAudioPolish: args.editableAudioPolish,
    editableStudioRack: args.editableStudioRack,
    editableTranscriptSegments: args.editableTranscriptSegments,
    editableVisualPlacements: args.editableVisualPlacements,
    effectivePlaybackCutRegions: args.effectivePlaybackCutRegions,
    exportStatusLabel: args.exportStatusLabel,
    exportTruthPosture: args.exportTruthPosture,
    exportTruthState: args.exportTruthState,
    fillerActiveCandidateIndex: args.fillerActiveCandidateIndex,
    fillerCandidateCards: args.fillerCandidateCards,
    fillerCleanupOptions: args.fillerCleanupOptions,
    fillerDecisionInFlight: args.fillerDecisionInFlight,
    finishingChecklist: args.finishingChecklist,
    focusBoundAttentionOperation: args.focusBoundAttentionOperation,
    focusReadinessIssue: args.focusReadinessIssue,
    gapCleanupOptions: args.gapCleanupOptions,
    handleCandidateDecision: args.handleCandidateDecision,
    handleDiscardEditedCaptions: args.handleDiscardEditedCaptions,
    handleEditCaptionChunkText: args.handleEditCaptionChunkText,
    handleEnableCaptionEdits: args.handleEnableCaptionEdits,
    handleMergeEditedCaptionChunk: args.handleMergeEditedCaptionChunk,
    handleNormalizeEditedCaptionChunkPunctuation: args.handleNormalizeEditedCaptionChunkPunctuation,
    handleRebuildCaptionArtifacts: args.handleRebuildCaptionArtifacts,
    handleSendToQuench: args.handleSendToQuench,
    handleSplitEditedCaptionChunk: args.handleSplitEditedCaptionChunk,
    handleToggleEditedCaptionChunkSpeakerLabel: args.handleToggleEditedCaptionChunkSpeakerLabel,
    handoffTruthPosture: args.handoffTruthPosture,
    hasTranscriptSelection: args.hasTranscriptSelection,
    introOutroSelectedIntroPath: args.introOutroSelectedIntroPath,
    introOutroSelectedOutroPath: args.introOutroSelectedOutroPath,
    introOutroSelection: args.introOutroSelection,
    loadedPreparedPackage: args.loadedPreparedPackage,
    LOGO_POSITION_OPTIONS: args.LOGO_POSITION_OPTIONS,
    LOGO_SIZE_OPTIONS: args.LOGO_SIZE_OPTIONS,
    MIN_IMAGE_PLACEMENT_DURATION_SEC: args.MIN_IMAGE_PLACEMENT_DURATION_SEC,
    moveResolvedBrollBinding: args.moveResolvedBrollBinding,
    navigateBoundAttention: args.navigateBoundAttention,
    outputSelectionSummary: args.outputSelectionSummary,
    PACKAGING_INTRO_ENTRY_ID: args.PACKAGING_INTRO_ENTRY_ID,
    PACKAGING_OUTRO_ENTRY_ID: args.PACKAGING_OUTRO_ENTRY_ID,
    packagingIntroPlacement: args.packagingIntroPlacement,
    packagingLogoAssetPath: args.packagingLogoAssetPath,
    packagingLogoPlacement: args.packagingLogoPlacement,
    packagingLogoPosition: args.packagingLogoPosition,
    packagingLogoSize: args.packagingLogoSize,
    packagingOutroPlacement: args.packagingOutroPlacement,
    persistedAudioCutCount: args.persistedAudioCutCount,
    podcastMasterLayer: args.podcastMasterLayer,
    podcastMasterUiStatus: args.podcastMasterUiStatus,
    polishStrength: args.polishStrength,
    previewQuickClean: args.previewQuickClean,
    previewRemoveFillers: args.previewRemoveFillers,
    previewRemoveRetakes: args.previewRemoveRetakes,
    previewShortenGaps: args.previewShortenGaps,
    previewSpeakerInterview: args.previewSpeakerInterview,
    previewSpeakerMonologue: args.previewSpeakerMonologue,
    previewSpeakerPanel: args.previewSpeakerPanel,
    previewSpeakerSolo: args.previewSpeakerSolo,
    previewTruthPosture: args.previewTruthPosture,
    autoPlacementDebugEnabled: args.autoPlacementDebugEnabled,
    previewAutoPosition: args.previewAutoPosition,
    forcePreviewAutoPosition: args.forcePreviewAutoPosition,
    resetPreviewAutoPosition: args.resetPreviewAutoPosition,
    selectedAutoPreviewActive: args.selectedAutoPreviewActive,
    previewAutoPositionStatus: args.previewAutoPositionStatus,
    previewDiagnosticsSummary: args.previewDiagnosticsSummary,
    episodeHealthSnapshot: args.episodeHealthSnapshot,
    props: args.props,
    quenchHandoffStatus: args.quenchHandoffStatus,
    readinessStatusLabel: args.readinessStatusLabel,
    readinessVerdict: args.readinessVerdict,
    readySummaryAreas: args.readySummaryAreas,
    refreshCandidateQueue: args.refreshCandidateQueue,
    releasePrepError: args.releasePrepError,
    releasePrepLoading: args.releasePrepLoading,
    releasePrepOpenHref: args.releasePrepOpenHref,
    releasePrepSaved: args.releasePrepSaved,
    releasePrepSaving: args.releasePrepSaving,
    releasePrepStaleReasons: args.releasePrepStaleReasons,
    removePackagingPlacement: args.removePackagingPlacement,
    removeVisualPlacement: args.removeVisualPlacement,
    replaceResolvedBrollBinding: args.replaceResolvedBrollBinding,
    resolvedBrollBindingItems: args.resolvedBrollBindingItems,
    resolveHearthBrollSuggestion: args.resolveHearthBrollSuggestion,
    retakeActiveCandidateIndex: args.retakeActiveCandidateIndex,
    retakeCandidateCards: args.retakeCandidateCards,
    retakeCleanupOptions: args.retakeCleanupOptions,
    retakeDecisionInFlight: args.retakeDecisionInFlight,
    revertResolvedBrollBinding: args.revertResolvedBrollBinding,
    roundToTenth: args.roundToTenth,
    SEGMENTATION_PROVIDER_DESCRIPTORS: args.SEGMENTATION_PROVIDER_DESCRIPTORS,
    selectedBoundBrollInspectorState: args.selectedBoundBrollInspectorState,
    selectedBoundBrollOperationId: args.selectedBoundBrollOperationId,
    selectedCaptionArtifactFormat: args.selectedCaptionArtifactFormat,
    selectedImageAnimationLabel: args.selectedImageAnimationLabel,
    selectedImagePlacement: args.selectedImagePlacement,
    selectedImagePlacementTransform: args.selectedImagePlacementTransform,
    selectedTransitionBoundObject: args.selectedTransitionBoundObject,
    selectedVisualAnchorSegment: args.selectedVisualAnchorSegment,
    selectedVisualAnchorSegmentId: args.selectedVisualAnchorSegmentId,
    selectedVisualClip: args.selectedVisualClip,
    sendToQuenchButtonLabel: args.sendToQuenchButtonLabel,
    setActiveCaptionArtifactMode: args.setActiveCaptionArtifactMode,
    setActiveReviewKind: args.setActiveReviewKind,
    setActiveTranscriptToolSection: args.setActiveTranscriptToolSection,
    setAnchorLabelDraft: args.setAnchorLabelDraft,
    setAnchorTextDraft: args.setAnchorTextDraft,
    setAudioFinalizationCompare: args.setAudioFinalizationCompare,
    setAudioLevelingEnabled: args.setAudioLevelingEnabled,
    setAudioNoiseReductionEnabled: args.setAudioNoiseReductionEnabled,
    updateCandidateProposedRemoval: args.updateCandidateProposedRemoval,
    setCaptionFormatting: args.setCaptionFormatting,
    setCleanupPreview: args.setCleanupPreview,
    setDeadAirThresholdSec: args.setDeadAirThresholdSec,
    setDetailTag: args.setDetailTag,
    setFillerCleanupOptions: args.setFillerCleanupOptions,
    setFinishingChecklist: args.setFinishingChecklist,
    setFocusOverride: args.setFocusOverride,
    setGapCleanupOptions: args.setGapCleanupOptions,
    setPolishStrength: args.setPolishStrength,
    setRetakeCleanupOptions: args.setRetakeCleanupOptions,
    setSelectedCaptionArtifactFormat: args.setSelectedCaptionArtifactFormat,
    setSpeakerInterviewOptions: args.setSpeakerInterviewOptions,
    setSpeakerMonologueOptions: args.setSpeakerMonologueOptions,
    setSpeakerPanelOptions: args.setSpeakerPanelOptions,
    setSpeakerSoloOptions: args.setSpeakerSoloOptions,
    setStudioRackBackend: args.setStudioRackBackend,
    setStudioRackBypassed: args.setStudioRackBypassed,
    setStudioRackEnabled: args.setStudioRackEnabled,
    setStudioRackModuleBypassed: args.setStudioRackModuleBypassed,
    setStudioRackModuleEnabled: args.setStudioRackModuleEnabled,
    setStudioRackOpen: args.setStudioRackOpen,
    setTranscriptTimingHint: args.setTranscriptTimingHint,
    setVideoSnapMode: args.setVideoSnapMode,
    setVisualBackgroundBlur: args.setVisualBackgroundBlur,
    setVisualBackgroundBlurDebugMask: args.setVisualBackgroundBlurDebugMask,
    setVisualBackgroundMaskPreviewMode: args.setVisualBackgroundMaskPreviewMode,
    setVisualBackgroundMaskPreviewStage: args.setVisualBackgroundMaskPreviewStage,
    setVisualBackgroundBlurFallbackMode: args.setVisualBackgroundBlurFallbackMode,
    setVisualBackgroundBlurFeatherPx: args.setVisualBackgroundBlurFeatherPx,
    setVisualBackgroundBlurSubjectExpansionPx: args.setVisualBackgroundBlurSubjectExpansionPx,
    setVisualBackgroundBlurProviderId: args.setVisualBackgroundBlurProviderId,
    setVisualBackgroundBlurPx: args.setVisualBackgroundBlurPx,
    setVisualBackgroundBlurQualityMode: args.setVisualBackgroundBlurQualityMode,
    setVisualBackgroundBlurRuntimeStatus: args.setVisualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurTemporalSmoothing: args.setVisualBackgroundBlurTemporalSmoothing,
    setVisualBackgroundReplaceColor: args.setVisualBackgroundReplaceColor,
    setVisualBackgroundReplaceEnabled: args.setVisualBackgroundReplaceEnabled,
    setVisualBackgroundReplaceImageAssetPath: args.setVisualBackgroundReplaceImageAssetPath,
    setVisualBackgroundReplaceImageUrl: args.setVisualBackgroundReplaceImageUrl,
    setVisualBackgroundReplaceMode: args.setVisualBackgroundReplaceMode,
    setVisualBackgroundWashDesaturateAmount: args.setVisualBackgroundWashDesaturateAmount,
    setVisualBackgroundWashDimAmount: args.setVisualBackgroundWashDimAmount,
    setVisualBackgroundWashEnabled: args.setVisualBackgroundWashEnabled,
    setVisualColorAmount: args.setVisualColorAmount,
    setVisualEyeContactAssistDebugOverlay: args.setVisualEyeContactAssistDebugOverlay,
    setVisualEyeContactAssistEnabled: args.setVisualEyeContactAssistEnabled,
    setVisualEyeContactAssistRuntimeStatus: args.setVisualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistStrength: args.setVisualEyeContactAssistStrength,
    setVisualWhiteBalance: args.setVisualWhiteBalance,
    sourceBrollItems: args.sourceBrollItems,
    sourceImageLibraryItems: args.sourceImageLibraryItems,
    speakerInterviewOptions: args.speakerInterviewOptions,
    speakerMonologueOptions: args.speakerMonologueOptions,
    speakerOptions: args.speakerOptions,
    speakerPanelOptions: args.speakerPanelOptions,
    speakerSoloOptions: args.speakerSoloOptions,
    studioRackEnabledModuleCount: args.studioRackEnabledModuleCount,
    studioRackOpen: args.studioRackOpen,
    studioRackPlaybackBackendResolution: args.studioRackPlaybackBackendResolution,
    studioRackPlaybackConfig: args.studioRackPlaybackConfig,
    studioRackRenderAppliedModules: args.studioRackRenderAppliedModules,
    studioRackRenderBackendResolution: args.studioRackRenderBackendResolution,
    studioRackRenderConfig: args.studioRackRenderConfig,
    studioRackRenderDeferredModules: args.studioRackRenderDeferredModules,
    studioRackRenderStatus: args.studioRackRenderStatus,
    studioRackComparePreviewStatusLabel: args.studioRackComparePreviewStatusLabel,
    toggleLogoOverlay: args.toggleLogoOverlay,
    transcriptSegmentsById: args.transcriptSegmentsById,
    transcriptSelectionRange: args.transcriptSelectionRange,
    trimResolvedBrollBinding: args.trimResolvedBrollBinding,
    unresolvedBrollSuggestionItems: args.unresolvedBrollSuggestionItems,
    updateImagePlacementTransform: args.updateImagePlacementTransform,
    updateVisualPlacementTiming: args.updateVisualPlacementTiming,
    videoSnapMode: args.videoSnapMode,
    viewingModeSummary: args.viewingModeSummary,
    visualBackgroundBlur: args.visualBackgroundBlur,
    visualBackgroundBlurDebugMask: args.visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode: args.visualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage: args.visualBackgroundMaskPreviewStage,
    visualBackgroundBlurFallbackMode: args.visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx: args.visualBackgroundBlurFeatherPx,
    visualBackgroundBlurSubjectExpansionPx: args.visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurPx: args.visualBackgroundBlurPx,
    visualBackgroundBlurQualityMode: args.visualBackgroundBlurQualityMode,
    visualBackgroundBlurRuntimeStatus: args.visualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary: args.visualBackgroundBlurStatusSummary,
    visualBackgroundBlurTemporalSmoothing: args.visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor: args.visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled: args.visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageAssetPath: args.visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId: args.selectedBackgroundReplacementAssetId,
    visualBackgroundReplaceImageUrl: args.visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode: args.visualBackgroundReplaceMode,
    visualBackgroundWashDesaturateAmount: args.visualBackgroundWashDesaturateAmount,
    visualBackgroundWashDimAmount: args.visualBackgroundWashDimAmount,
    visualBackgroundWashEnabled: args.visualBackgroundWashEnabled,
    visualColorAmount: args.visualColorAmount,
    visualEyeContactAssistDebugOverlay: args.visualEyeContactAssistDebugOverlay,
    visualEyeContactAssistEnabled: args.visualEyeContactAssistEnabled,
    visualEyeContactAssistRuntimeStatus: args.visualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary: args.visualEyeContactAssistStatusSummary,
    visualEyeContactAssistStrength: args.visualEyeContactAssistStrength,
    visualWhiteBalance: args.visualWhiteBalance,
    workspaceFocusMode: args.workspaceFocusMode,
  };
}
