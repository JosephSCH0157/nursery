import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanonicalAutomaticPlacementResult } from "../features/auto-placement/canonicalPlacementAuthority";
import { resolveHammerAutomaticPlacementCommand } from "./hammerAutomaticPlacementController";
import { readPlacementDisplaySnapshot } from "../features/auto-placement/placementFrameDisplayAuthority";
import { DEFAULT_IMAGE_PLACEMENT_TRANSFORM, clampImagePlacementTransform } from "./hammerWorkspaceShellVisualUtils";
import { clearPreviewOverride, type PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
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

export function useHammerAutomaticPlacementEvidenceHandler(args: {
  selectedPlacement: Placement;
  setEvidence: (value: { placementId: string; result: CanonicalAutomaticPlacementResult } | null) => void;
}) {
  const { selectedPlacement, setEvidence } = args;
  return useCallback((result: CanonicalAutomaticPlacementResult | null): void => {
    const placementId = selectedPlacement?.id ?? null;
    setEvidence(result && placementId ? { placementId, result } : null);
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
    setOverrides((current) => clearPreviewOverride(current, command.placementId));
    setStatus(committed ? `Automatic placement saved (${command.zone}).` : "Automatic placement already matches the canonical saved geometry.");
  }, [commitTransform, evidence, isPlaybackActive, previewVideoRef, selectedPlacement?.id, setEvidence, setOverrides, setStatus]);

  useEffect(() => {
    const placementId = selectedPlacement?.id ?? null;
    if (!placementId || automaticallyPlacedIds.current.has(placementId)) return;
    if (evidence?.placementId !== placementId) return;
    const t = selectedTransform;
    const stillAtDefaultGeometry = Math.abs(t.leftPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.leftPct) < 0.01
      && Math.abs(t.topPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.topPct) < 0.01
      && Math.abs(t.widthPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) < 0.01
      && Math.abs(t.heightPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct) < 0.01;
    const frame = evidence.result.requestedFrameRef;
    const currentRect = { x: frame.width * (t.leftPct / 100), y: frame.height * (t.topPct / 100), width: frame.width * (t.widthPct / 100), height: frame.height * (t.heightPct / 100) };
    const currentlyCoversAHead = evidence.result.headSafeBounds.some((head) => currentRect.x < head.x + head.width && currentRect.x + currentRect.width > head.x && currentRect.y < head.y + head.height && currentRect.y + currentRect.height > head.y);
    if (!stillAtDefaultGeometry && !currentlyCoversAHead && !fallbackPlacedIds.current.has(placementId)) {
      automaticallyPlacedIds.current.add(placementId);
      return;
    }
    const command = resolveHammerAutomaticPlacementCommand({ selectedPlacementId: placementId, authorityResult: evidence.result,
      displayedFrame: readPlacementDisplaySnapshot({ video: previewVideoRef.current, playbackActive: isPlaybackActive }) });
    if (command.kind === "refused") { if (command.invalidateEvidence) setEvidence(null); return; }
    automaticallyPlacedIds.current.add(placementId);
    fallbackPlacedIds.current.delete(placementId);
    const committed = commitTransform(command.placementId, command.transform, "Apply initial mask-safe visual placement");
    setOverrides((current) => clearPreviewOverride(current, command.placementId));
    setStatus(committed ? `Mask-safe placement applied automatically (${command.zone}).` : "Mask-safe placement already matches the saved geometry.");
  }, [automaticallyPlacedIds, commitTransform, evidence, fallbackPlacedIds, isPlaybackActive, previewVideoRef, selectedPlacement?.id, selectedTransform, setEvidence, setOverrides, setStatus]);

  useEffect(() => {
    const placementId = selectedPlacement?.id ?? null;
    if (!placementId || automaticallyPlacedIds.current.has(placementId) || !automaticPlacementEnabled) return;
    if (evidence?.placementId === placementId && evidence.result.placement) return;
    const t = selectedTransform;
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
      commitTransform(command.placementId, command.transform, "Apply conservative visual placement fallback");
      setStatus("Face-aware analysis unavailable; conservative corner placement applied.");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [automaticPlacementEnabled, automaticallyPlacedIds, commitTransform, evidence, fallbackPlacedIds, selectedPlacement?.id, selectedTransform, setStatus]);

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
