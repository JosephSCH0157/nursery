import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { CanonicalAutomaticPlacementResult } from "../features/auto-placement/canonicalPlacementAuthority";
import { resolveHammerAutomaticPlacementCommand } from "./hammerAutomaticPlacementController";
import { readPlacementDisplaySnapshot } from "../features/auto-placement/placementFrameDisplayAuthority";
import { DEFAULT_IMAGE_PLACEMENT_TRANSFORM, clampImagePlacementTransform } from "./hammerWorkspaceShellVisualUtils";
import { applyPreviewOverride, clearPreviewOverride, previewTransformsEqual, type PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
import type { HammerAutoPlacementDiagnosticsState } from "./hammerWorkspaceShellViewModels";

/**
 * Automatic-placement authority owns evidence and placement lifecycle, but not unrestricted
 * timeline mutation. Every canonical placement mutation must be resolved through
 * `resolveHammerAutomaticPlacementCommand`.
 */

export function useHammerAutomaticPlacementState() {
  const [previewAutoPositionOverrides, setPreviewAutoPositionOverrides] = useState<Record<string, PreviewPlacementTransform>>({});
  const [previewAutoPositionStatus, setPreviewAutoPositionStatus] = useState<string | null>(null);
  const [canonicalAutoPlacementEvidence, setCanonicalAutoPlacementEvidence] = useState<{ placementId: string; result: CanonicalAutomaticPlacementResult } | null>(null);
  const automaticallyPlacedImageIdsRef = useRef<Set<string>>(new Set());
  const fallbackPlacedImageIdsRef = useRef<Set<string>>(new Set());
  return { previewAutoPositionOverrides, setPreviewAutoPositionOverrides, previewAutoPositionStatus,
    setPreviewAutoPositionStatus, canonicalAutoPlacementEvidence, setCanonicalAutoPlacementEvidence,
    automaticallyPlacedImageIdsRef, fallbackPlacedImageIdsRef };
}

export function createHammerAutomaticPlacementEvidenceLifecycle(identity: string) {
  let generation = 0;
  let currentIdentity = identity;
  const applied = new Set<number>();
  return {
    begin: <T>(request: T) => ({ generation: ++generation, identity: currentIdentity, request: structuredClone(request) } as const),
    accepts: (token: { generation: number; identity: string }) => token.generation === generation && token.identity === currentIdentity && !applied.has(token.generation),
    markApplied: (token: { generation: number }) => { if (applied.has(token.generation)) return false; applied.add(token.generation); return true; },
    reset: (identity: string) => { currentIdentity = identity; generation += 1; applied.clear(); },
  };
}

type Placement = { id: string } | null;
type PlacementEvidence = { placementId: string; result: CanonicalAutomaticPlacementResult };

function samePlacementEvidence(current: PlacementEvidence | null, next: PlacementEvidence): boolean {
  if (!current || current.placementId !== next.placementId) return false;
  const currentFrame = current.result.requestedFrameRef;
  const nextFrame = next.result.requestedFrameRef;
  return currentFrame.sourceIdentity === nextFrame.sourceIdentity
    && currentFrame.captureEpoch === nextFrame.captureEpoch
    && currentFrame.captureRevision === nextFrame.captureRevision
    && currentFrame.sourcePresentationTimeSec === nextFrame.sourcePresentationTimeSec
    && currentFrame.width === nextFrame.width
    && currentFrame.height === nextFrame.height;
}

export function doesPlacementOverlapSubject(args: {
  placement: { x: number; y: number; width: number; height: number };
  subjectBounds: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
}): boolean {
  const placement = args.placement;
  return args.subjectBounds.some((subject) => (
    placement.x < subject.x + subject.width
    && placement.x + placement.width > subject.x
    && placement.y < subject.y + subject.height
    && placement.y + placement.height > subject.y
  ));
}

export function useHammerAutomaticPlacementEvidenceHandler(args: {
  selectedPlacement: Placement;
  setEvidence: Dispatch<SetStateAction<PlacementEvidence | null>>;
}) {
  const { selectedPlacement, setEvidence } = args;
  return useCallback((result: CanonicalAutomaticPlacementResult | null): void => {
    const placementId = selectedPlacement?.id ?? null;
    if (!result || !placementId) {
      setEvidence(null);
      return;
    }
    const next = { placementId, result };
    setEvidence((current) => samePlacementEvidence(current, next) ? current : next);
  }, [selectedPlacement?.id, setEvidence]);
}

export function useHammerAutomaticPlacementLifecycle(args: {
  selectedPlacement: Placement;
  selectedTransform: PreviewPlacementTransform;
  evidence: { placementId: string; result: CanonicalAutomaticPlacementResult } | null;
  setEvidence: (value: { placementId: string; result: CanonicalAutomaticPlacementResult } | null) => void;
  automaticPlacementEnabled: boolean;
  isPlaybackActive: boolean;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  automaticallyPlacedIds: RefObject<Set<string>>;
  fallbackPlacedIds: RefObject<Set<string>>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, PreviewPlacementTransform>>>;
  setStatus: (value: string | null) => void;
  commitTransform: (placementId: string, transform: PreviewPlacementTransform, reason: string) => boolean;
}) {
  const { selectedPlacement, selectedTransform, evidence, setEvidence, automaticPlacementEnabled,
    isPlaybackActive, previewVideoRef, automaticallyPlacedIds, fallbackPlacedIds, setOverrides,
    setStatus, commitTransform } = args;
  const previousPlacementIdRef = useRef<string | null>(null);
  const selectedTransformRef = useRef(selectedTransform);
  selectedTransformRef.current = selectedTransform;

  useEffect(() => {
    const placementId = selectedPlacement?.id ?? null;
    const previousPlacementId = previousPlacementIdRef.current;
    if (previousPlacementId === placementId) return;
    previousPlacementIdRef.current = placementId;
    setEvidence(null);
    setStatus(null);
  }, [automaticallyPlacedIds, fallbackPlacedIds, selectedPlacement?.id, setEvidence, setOverrides, setStatus]);

  const previewAutoPosition = useCallback((): void => {
    const command = resolveHammerAutomaticPlacementCommand({
      selectedPlacementId: selectedPlacement?.id ?? null,
      authorityResult: evidence && evidence.placementId === selectedPlacement?.id ? evidence.result : null,
      displayedFrame: readPlacementDisplaySnapshot({ video: previewVideoRef.current, playbackActive: isPlaybackActive }),
    });
    if (command.kind === "refused") {
      if (command.invalidateEvidence) setEvidence(null);
      setStatus(command.status);
      return;
    }
    const committed = commitTransform(command.placementId, command.transform, "Apply automatic visual placement");
    if (committed) setEvidence(null);
    setOverrides((current) => clearPreviewOverride(current, command.placementId));
    setStatus(committed ? `Automatic placement applied (${command.zone}); saving canonical edit…` : "Automatic placement already matches the canonical geometry.");
  }, [commitTransform, evidence, isPlaybackActive, previewVideoRef, selectedPlacement?.id, setEvidence, setOverrides, setStatus]);

  useEffect(() => {
    const placementId = selectedPlacement?.id ?? null;
    if (!placementId || automaticallyPlacedIds.current.has(placementId)) return;
    if (evidence?.placementId !== placementId) return;
    const t = selectedTransformRef.current;
    const stillAtDefaultGeometry = Math.abs(t.leftPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.leftPct) < 0.01
      && Math.abs(t.topPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.topPct) < 0.01
      && Math.abs(t.widthPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) < 0.01
      && Math.abs(t.heightPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct) < 0.01;
    const frame = evidence.result.requestedFrameRef;
    const currentRect = { x: frame.width * (t.leftPct / 100), y: frame.height * (t.topPct / 100), width: frame.width * (t.widthPct / 100), height: frame.height * (t.heightPct / 100) };
    const subjectBounds = [...evidence.result.headSafeBounds, ...evidence.result.speakerMaskBounds];
    const currentlyCoversSubject = doesPlacementOverlapSubject({ placement: currentRect, subjectBounds });
    if (!stillAtDefaultGeometry && subjectBounds.length === 0 && !fallbackPlacedIds.current.has(placementId)) return;
    if (!stillAtDefaultGeometry && !currentlyCoversSubject && !fallbackPlacedIds.current.has(placementId)) {
      automaticallyPlacedIds.current.add(placementId);
      return;
    }
    const command = resolveHammerAutomaticPlacementCommand({ selectedPlacementId: placementId, authorityResult: evidence.result,
      displayedFrame: readPlacementDisplaySnapshot({ video: previewVideoRef.current, playbackActive: isPlaybackActive }) });
    if (command.kind === "refused") { if (command.invalidateEvidence) setEvidence(null); return; }
    automaticallyPlacedIds.current.add(placementId);
    fallbackPlacedIds.current.delete(placementId);
    setOverrides((current) => applyPreviewOverride(current, command.placementId, command.transform));
    setStatus(`Mask-safe preview active (${command.zone}) · Apply Auto Position to save.`);
  }, [automaticallyPlacedIds, evidence, fallbackPlacedIds, isPlaybackActive, previewVideoRef, selectedPlacement?.id, setEvidence, setOverrides, setStatus]);

  useEffect(() => {
    const placementId = selectedPlacement?.id ?? null;
    if (!placementId || !automaticallyPlacedIds.current.has(placementId) || evidence?.placementId !== placementId) return;
    const frame = evidence.result.requestedFrameRef;
    const t = selectedTransformRef.current;
    const currentRect = { x: frame.width * (t.leftPct / 100), y: frame.height * (t.topPct / 100), width: frame.width * (t.widthPct / 100), height: frame.height * (t.heightPct / 100) };
    const subjectBounds = [...evidence.result.headSafeBounds, ...evidence.result.speakerMaskBounds];
    if (!doesPlacementOverlapSubject({ placement: currentRect, subjectBounds })) return;
    const command = resolveHammerAutomaticPlacementCommand({ selectedPlacementId: placementId, authorityResult: evidence.result,
      displayedFrame: readPlacementDisplaySnapshot({ video: previewVideoRef.current, playbackActive: isPlaybackActive }) });
    if (command.kind === "refused") { if (command.invalidateEvidence) setEvidence(null); return; }
    const alreadyShowingResolvedPlacement = previewTransformsEqual(t, command.transform);
    if (alreadyShowingResolvedPlacement) return;
    setOverrides((current) => applyPreviewOverride(current, command.placementId, command.transform));
    setStatus(`Mask-following preview active (${command.zone}) · Apply Auto Position to save.`);
  }, [automaticallyPlacedIds, evidence, isPlaybackActive, previewVideoRef, selectedPlacement?.id, setEvidence, setOverrides, setStatus]);

  useEffect(() => {
    const placementId = selectedPlacement?.id ?? null;
    if (!placementId || automaticallyPlacedIds.current.has(placementId) || !automaticPlacementEnabled) return;
    if (evidence?.placementId === placementId && evidence.result.placement) return;
    const t = selectedTransformRef.current;
    const stillAtDefaultGeometry = Math.abs(t.leftPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.leftPct) < 0.01
      && Math.abs(t.topPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.topPct) < 0.01
      && Math.abs(t.widthPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) < 0.01
      && Math.abs(t.heightPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct) < 0.01;
    if (!stillAtDefaultGeometry) return;
    const timer = window.setTimeout(() => {
      if (automaticallyPlacedIds.current.has(placementId)) return;
      const fallbackTransform = clampImagePlacementTransform({ leftPct: 4, topPct: 6, widthPct: 36, heightPct: 26 });
      const command = resolveHammerAutomaticPlacementCommand({ selectedPlacementId: placementId, authorityResult: null, displayedFrame: null,
        fallback: { transform: fallbackTransform, zone: "conservative_corner" } });
      if (command.kind === "refused") return;
      fallbackPlacedIds.current.add(placementId);
      setOverrides((current) => applyPreviewOverride(current, command.placementId, command.transform));
      setStatus("Face-aware analysis unavailable; conservative corner preview active · Apply Auto Position to save.");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [automaticPlacementEnabled, automaticallyPlacedIds, evidence, fallbackPlacedIds, selectedPlacement?.id, setOverrides, setStatus]);

  const resetPreviewAutoPosition = useCallback((): void => {
    if (!selectedPlacement) return;
    setOverrides((current) => clearPreviewOverride(current, selectedPlacement.id));
    setStatus("Auto preview reset to persisted placement.");
  }, [selectedPlacement, setOverrides, setStatus]);
  return { previewAutoPosition, resetPreviewAutoPosition };
}

export function deriveHammerAutoPlacementDiagnostics(diagnostics: HammerAutoPlacementDiagnosticsState | null | undefined) {
  const gateById = new Map((diagnostics?.enabled ? diagnostics.gates : []).map((gate) => [gate.id, gate]));
  const frameGate = gateById.get("current_frame_available"); const maskGate = gateById.get("segmentation_mask_available");
  return { diagnosticsEnabled: Boolean(diagnostics?.enabled), resolvedPlacementExists: Boolean(diagnostics?.enabled && diagnostics.overlay),
    diagnosticsResolvedPlacement: diagnostics?.enabled ? diagnostics.resolvedPlacementPresent : false,
    candidateCount: diagnostics?.enabled ? diagnostics.candidateCount : 0, maskBoundsCount: diagnostics?.enabled ? diagnostics.maskBoundsCount : 0,
    currentFrameAvailable: frameGate ? frameGate.status === "PASS" : false, segmentationMaskAvailable: maskGate ? maskGate.status === "PASS" : false,
    resolverStatus: diagnostics?.enabled ? diagnostics.state : "disabled", resolverReason: diagnostics?.enabled ? (diagnostics.firstBlockingReason ?? diagnostics.statusLabel) : "diagnostics disabled",
    selectedScale: diagnostics?.enabled ? diagnostics.selectedScale : null, scaleAttempts: diagnostics?.enabled ? diagnostics.scaleAttempts : [] };
}
