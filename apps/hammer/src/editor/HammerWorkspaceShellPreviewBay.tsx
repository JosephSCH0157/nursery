import type { JSX, MutableRefObject, MouseEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BackgroundBlurPreviewLayer from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import EyeContactAssistPreviewLayer from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import FaceAnalysisPreviewLayer from "../features/eye-contact-assist/render/faceAnalysisPreviewLayer";
import type { FaceAnalysisFrame, FaceAnalysisResult } from "../features/eye-contact-assist/types";
import {
  resolveCanonicalAutomaticPlacement,
  type CanonicalAutomaticPlacementResult,
  type FrameBoundPlacementMatteResult,
  type FrameBoundPlacementEvidencePair,
} from "../features/auto-placement";
import type { PlacementFrameAnalysisAuthority } from "../features/auto-placement/placementFrameAnalysisAuthority";
import { sameFaceAnalysisFrame } from "../features/eye-contact-assist/analysis/faceAnalysisAuthority";
import VisualPreviewComposer, { type VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";
import { isAutoPlacementDebugFlagEnabled } from "./hammerAutoPlacementDebugFlag";
import { isAnalysisFrameAtCompositionTime } from "./hammerAutoPreviewPosition";

export type HammerWorkspaceShellPreviewBayVM = {
  previewModeLabel: string;
  activeVisualTool: "polish" | "images" | "broll" | null;
  visualPolishPreviewActive: boolean;

  previewSurfaceRef: RefObject<HTMLDivElement | null>;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  segmentationSourceVideoRef: RefObject<HTMLVideoElement | null>;
  previewAudioRef: RefObject<HTMLVideoElement | null>;
  previewBrollVideoRefs: MutableRefObject<Map<string, HTMLVideoElement>>;

  previewVideoSrc: string | null;
  segmentationSourceVideoSrc: string | null;
  playbackMediaSrc: string | null;
  isPlaybackActive: boolean;
  playbackWindow: { mode: "loop" | "roll"; startSec: number; endSec: number; label: string } | null;
  handlePlaybackProgress: (currentTime: number) => void;
  handlePlaybackEnded: (currentTime: number) => void;
  setIsPlaybackActive: (next: boolean) => void;
  clearPlaybackWindow: () => void;
  togglePlayback: () => void;

  playheadSec: number;
  playbackModeLabel: string;
  playbackSourceLabel: string | null;
  mediaLabelMismatchWarning: string | null;
  actualRecordingMismatchWarning: string | null;
  playbackBackendLabel: string;

  currentPassId: string;
  selectedImageAnimationLabel: string;
  audioFinalizationCompareModeLabel: string;
  audioComparePreviewStatusLabel: string | null;
  packagingSummaryLabel: string | null;

  previewSurfaceLabel: string;

  backgroundEffect: {
    enabled: boolean;
    settings: any;
    providerId: string | null;
    sourceVideoRef: RefObject<HTMLVideoElement | null>;
    debugMasks: boolean;
    maskPreviewMode: boolean;
    maskPreviewStage: "raw" | "expanded" | "feathered" | "refined" | "final_composite";
    onStatus: (status: any) => void;
    onCanvas: (canvas: HTMLCanvasElement | null) => void;
  };
  diagnostics: {
    enabled: boolean;
    snapshot: any;
  };
  autoPlacementDiagnostics:
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
      layoutMode: "single_person" | "multi_person" | "unknown";
      preferredZoneChosen: string;
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
      faceOverlap: boolean;
      bodyOverlap: boolean;
      rejectedByBodyMask: boolean;
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

  eyeContactAssist: {
    enabled: boolean;
    strength: number;
    backgroundCanvasRef: RefObject<HTMLCanvasElement | null>;
    useBackgroundCanvasAsSource: boolean;
    debugOverlay: boolean;
    onStatus: (status: any) => void;
  };
  faceAnalysisDemand?: boolean;
  automaticPlacement?: {
    enabled: boolean;
    overlay: { widthPct: number; heightPct: number } | null;
    selectionSeed: number;
    compositionPresentationTimeSec: number;
    previewApplied: boolean;
    previewStatus: string | null;
    onResult?: (result: CanonicalAutomaticPlacementResult | null) => void;
  };

  visualPreview: {
    isAuthority: boolean;
    overlays: VisualPreviewOverlayModel[];
    emptyStateMessage: string;
    editable: boolean;
    onSelectClip: (clipId: string) => void;
    onBeginMove: (event: MouseEvent, clipId: string) => void;
    onBeginResize: (event: MouseEvent, clipId: string) => void;
  };
};

export default function HammerWorkspaceShellPreviewBay(props: { vm: HammerWorkspaceShellPreviewBayVM; analysisAuthority: PlacementFrameAnalysisAuthority }): JSX.Element {
  const vm = props.vm;
  const analysisAuthority = props.analysisAuthority;
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [faceAnalysisResult, setFaceAnalysisResult] = useState<FaceAnalysisResult | null>(null);
  const [analysisFrame, setAnalysisFrame] = useState<FaceAnalysisFrame | null>(null);
  const [placementPair, setPlacementPair] = useState<FrameBoundPlacementEvidencePair | null>(null);
  const automaticPlacementEnabled = vm.automaticPlacement?.enabled ?? false;
  const automaticPlacementOverlayWidthPct = vm.automaticPlacement?.overlay?.widthPct ?? null;
  const automaticPlacementOverlayHeightPct = vm.automaticPlacement?.overlay?.heightPct ?? null;
  const automaticPlacementSelectionSeed = vm.automaticPlacement?.selectionSeed ?? 0;
  const automaticPlacementCompositionTimeSec = vm.automaticPlacement?.compositionPresentationTimeSec ?? 0;
  const onAutomaticPlacementResult = vm.automaticPlacement?.onResult;
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const visualFx = vm.diagnostics?.snapshot?.visualEffects ?? null;
  const segmentationSummary = (() => {
    if (!visualFx) return null;
    const avgMs = typeof visualFx.avgMaskGenerationMs === "number" ? visualFx.avgMaskGenerationMs : null;
    const maxMs = typeof visualFx.maxMaskGenerationMs === "number" ? visualFx.maxMaskGenerationMs : null;
    const fps = typeof visualFx.maskFps === "number" ? visualFx.maskFps : null;
    const ageMs = typeof visualFx.lastMaskAgeMs === "number" ? visualFx.lastMaskAgeMs : null;
    const dropped = typeof visualFx.droppedMaskFrames === "number" ? visualFx.droppedMaskFrames : 0;
    const skipped = typeof visualFx.skippedMaskFrames === "number" ? visualFx.skippedMaskFrames : 0;
    const hasMask = Boolean(visualFx.maskPresent);

    let health: "healthy" | "busy" | "stale" = "healthy";
    if (!hasMask || ageMs == null || ageMs > 750) {
      health = "stale";
    } else if ((avgMs != null && avgMs >= 8) || ageMs > 250) {
      health = "busy";
    }

    const avgLabel = avgMs != null ? `${avgMs.toFixed(1)}ms avg` : "n/a avg";
    const maxLabel = maxMs != null ? `${maxMs.toFixed(1)}ms max` : "n/a max";
    const fpsLabel = fps != null ? `${fps.toFixed(1)}fps` : "n/a fps";
    const ageLabel = ageMs != null ? `age ${Math.round(ageMs)}ms` : "age n/a";
    return {
      health,
      text: `Segmentation: ${health} · ${avgLabel} / ${maxLabel} · ${fpsLabel} · ${ageLabel} · dropped ${dropped} · skipped ${skipped}`,
    };
  })();
  const diagnosticsJson = useMemo(() => (
    diagnosticsOpen ? JSON.stringify(vm.diagnostics.snapshot, null, 2) : ""
  ), [diagnosticsOpen, vm.diagnostics.snapshot]);

  const handleCapturedAnalysisFrame = useCallback((frame: FaceAnalysisFrame): void => {
    setAnalysisFrame(frame);
    const pair = analysisAuthority.requestDisplayedFrame(frame.frameRef);
    if (pair) setPlacementPair(pair);
  }, [analysisAuthority]);
  const handleFaceAnalysisResult = useCallback((result: FaceAnalysisResult | null): void => {
    setFaceAnalysisResult(result);
    if (!result) return;
    const pair = analysisAuthority.acceptFace(result);
    if (pair) setPlacementPair(pair);
  }, [analysisAuthority]);
  const handlePlacementMatte = useCallback((matte: FrameBoundPlacementMatteResult): void => {
    const pair = analysisAuthority.acceptMatte(matte);
    if (pair) setPlacementPair(pair);
  }, [analysisAuthority]);
  const canonicalPlacementResult = useMemo(() => {
    if (
      !automaticPlacementEnabled
      || automaticPlacementOverlayWidthPct === null
      || automaticPlacementOverlayHeightPct === null
      || !placementPair
      || !analysisFrame
    ) return null;
    if (!sameFaceAnalysisFrame(placementPair.frameRef, analysisFrame.frameRef)) return null;
    if (!isAnalysisFrameAtCompositionTime(
      placementPair.frameRef.sourcePresentationTimeSec,
      automaticPlacementCompositionTimeSec,
    )) return null;
    return resolveCanonicalAutomaticPlacement({
      requestedFrameRef: placementPair.frameRef,
      matteResult: placementPair.matte,
      faceResult: placementPair.face,
      overlay: {
        width: Math.max(1, placementPair.frameRef.width * (automaticPlacementOverlayWidthPct / 100)),
        height: Math.max(1, placementPair.frameRef.height * (automaticPlacementOverlayHeightPct / 100)),
      },
      selectionSeed: automaticPlacementSelectionSeed,
      diagnosticsAvailable: vm.diagnostics.enabled,
    });
  }, [
    analysisFrame,
    automaticPlacementEnabled,
    automaticPlacementOverlayHeightPct,
    automaticPlacementOverlayWidthPct,
    automaticPlacementSelectionSeed,
    automaticPlacementCompositionTimeSec,
    placementPair,
    vm.diagnostics.enabled,
  ]);
  useEffect(() => {
    if (automaticPlacementEnabled) return;
    setAnalysisFrame(null);
    setPlacementPair(null);
    analysisAuthority.reset();
  }, [analysisAuthority, automaticPlacementEnabled]);
  useEffect(() => {
    if (!automaticPlacementEnabled) {
      onAutomaticPlacementResult?.(null);
      return;
    }
    // Pairing a newly captured frame briefly yields no canonical result. Keep the
    // last accepted evidence during that window; real invalidation lives in the
    // shell selection/media lifecycle.
    if (canonicalPlacementResult) onAutomaticPlacementResult?.(canonicalPlacementResult);
  }, [automaticPlacementEnabled, canonicalPlacementResult, onAutomaticPlacementResult]);

  async function handleCopyDiagnostics(): Promise<void> {
    const payload = JSON.stringify(vm.diagnostics.snapshot, null, 2);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        throw new Error("Clipboard API unavailable.");
      }
      setCopyStatus("Diagnostics copied.");
      window.setTimeout(() => setCopyStatus(null), 1500);
    } catch {
      setCopyStatus("Copy failed.");
      window.setTimeout(() => setCopyStatus(null), 2000);
    }
  }
  const autoPlacementDebugEnabledFromQuery = isAutoPlacementDebugFlagEnabled();
  const vmAutoPlacementMissingReason = useMemo(() => {
    if (vm.autoPlacementDiagnostics !== undefined) return null;
    const vmKeys = Object.keys(vm ?? {}).sort();
    return `diagnostic object absent on preview VM props (keys: ${vmKeys.join(", ")})`;
  }, [vm]);
  useEffect(() => {
    if (!autoPlacementDebugEnabledFromQuery) return;
    if (vm.autoPlacementDiagnostics !== undefined) return;
    console.error("[hammer][auto-placement] diagnostic VM unexpectedly undefined", {
      reason: vmAutoPlacementMissingReason,
      previewModeLabel: vm.previewModeLabel,
      playbackMediaSrcPresent: Boolean(vm.playbackMediaSrc),
      previewVideoSrcPresent: Boolean(vm.previewVideoSrc),
    });
  }, [autoPlacementDebugEnabledFromQuery, vm.autoPlacementDiagnostics, vm.playbackMediaSrc, vm.previewModeLabel, vm.previewVideoSrc, vmAutoPlacementMissingReason]);
  const autoPlacementDiagnostics = vm.autoPlacementDiagnostics
    ?? (autoPlacementDebugEnabledFromQuery
      ? {
        enabled: true as const,
        state: "no_frame_input" as const,
        statusLabel: "auto-placement: debug enabled, preview VM state missing",
        overlay: null,
        ghost: null,
        paddedSpeakerBounds: [],
        candidates: [],
        frameLabel: "n/a",
        maskLabel: "n/a",
        debugFlagDetected: true,
        vmDiagnosticState: "missing" as const,
        maskBoundsCount: 0,
        selectedOverlayAssetPresent: false,
        resolvedPlacementPresent: false,
        candidateCount: 0,
        rejectedCandidateCount: 0,
        selectedScale: null,
        scaleAttempts: [],
        gates: [
          { id: "workspace_loaded", label: "workspace loaded", status: "FAIL", reason: "preview VM state missing" },
          { id: "playback_media_ready", label: "playback media ready", status: "BLOCKED", reason: "blocked by missing VM state" },
          { id: "current_frame_available", label: "current frame available", status: "BLOCKED", reason: "blocked by missing VM state" },
          { id: "segmentation_mask_available", label: "segmentation mask available", status: "BLOCKED", reason: "blocked by missing VM state" },
          { id: "selected_visual_asset_available", label: "selected visual asset available", status: "BLOCKED", reason: "blocked by missing VM state" },
          { id: "placement_evaluation_executed", label: "placement evaluation executed", status: "BLOCKED", reason: "blocked by missing VM state" },
          { id: "candidate_generation_executed", label: "candidate generation executed", status: "BLOCKED", reason: "blocked by missing VM state" },
        ],
        firstBlockingReason: "workspace loaded: preview VM state missing",
        dependencyChain: "preview_vm:missing",
        upstream: {
          workspaceId: "n/a",
          workpieceId: "n/a",
          episodeId: null,
          expectedMediaPath: null,
          actualMediaPath: null,
          sourceDeskErrorRaw: "preview VM state missing",
          playbackReadinessReason: "preview VM state missing",
        },
      }
      : { enabled: false as const });
  const showAutoPlacementStatusBadge = autoPlacementDebugEnabledFromQuery || autoPlacementDiagnostics.enabled;
  const showAutoPlacementSvg = autoPlacementDiagnostics.enabled
    && (Boolean(autoPlacementDiagnostics.overlay) || Boolean(autoPlacementDiagnostics.ghost) || autoPlacementDiagnostics.paddedSpeakerBounds.length > 0 || autoPlacementDiagnostics.candidates.length > 0);
  useEffect(() => {
    if (!showAutoPlacementStatusBadge) return;
    console.debug("[hammer][auto-placement][debug-overlay]", {
      debugFlagDetected: autoPlacementDebugEnabledFromQuery,
      vmDiagnosticState: vm.autoPlacementDiagnostics === undefined
        ? "missing"
        : (autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.vmDiagnosticState : "present_disabled"),
      maskBoundsCount: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.maskBoundsCount : 0,
      frameSize: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.frameLabel : "n/a",
      maskSize: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.maskLabel : "n/a",
      selectedOverlayAsset: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.selectedOverlayAssetPresent : false,
      resolvedPlacement: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.resolvedPlacementPresent : false,
      candidateCount: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.candidateCount : 0,
      rejectedCandidateCount: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.rejectedCandidateCount : 0,
      gates: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.gates : [],
      firstBlockingReason: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.firstBlockingReason : "preview VM state missing",
      dependencyChain: autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.dependencyChain : "preview_vm:missing",
    });
  }, [autoPlacementDebugEnabledFromQuery, autoPlacementDiagnostics, showAutoPlacementStatusBadge]);
  return (
    <>
      <header className="hammer-bay-head">
        <strong>Preview Monitors</strong>
        <span>{vm.previewModeLabel}</span>
      </header>
      <div className="hammer-bay-body hammer-preview-bay__body">
        <div className="hammer-preview-surface" ref={vm.previewSurfaceRef}>
          <video
            ref={vm.previewVideoRef}
            src={vm.previewVideoSrc ?? undefined}
            muted
            preload="auto"
            playsInline
            className="hammer-preview-media"
          />
          {vm.segmentationSourceVideoRef !== vm.previewVideoRef ? (
            <video
              ref={vm.segmentationSourceVideoRef}
              src={vm.segmentationSourceVideoSrc ?? undefined}
              muted
              preload="auto"
              playsInline
              className="hammer-preview-media hammer-preview-media--segmentation-source"
              aria-hidden="true"
            />
          ) : null}
          {/* The editor exposes the synchronized transcript beside this source preview. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={vm.previewAudioRef}
            src={vm.playbackMediaSrc ?? undefined}
            preload="metadata"
            playsInline
            onTimeUpdate={(event) => {
              if (!vm.isPlaybackActive) return;
              vm.handlePlaybackProgress(event.currentTarget.currentTime);
            }}
            onEnded={(event) => {
              vm.handlePlaybackEnded(event.currentTarget.currentTime);
            }}
            className="hammer-preview-media hammer-preview-media--audio"
          />
          <BackgroundBlurPreviewLayer
            analysisAuthority={analysisAuthority}
            enabled={vm.backgroundEffect.enabled}
            settings={vm.backgroundEffect.settings}
            providerId={vm.backgroundEffect.providerId}
            videoRef={vm.backgroundEffect.sourceVideoRef}
            onStatus={vm.backgroundEffect.onStatus}
            debugMasks={vm.backgroundEffect.debugMasks}
            maskPreviewMode={vm.backgroundEffect.maskPreviewMode}
            maskPreviewStage={vm.backgroundEffect.maskPreviewStage}
            onCanvas={vm.backgroundEffect.onCanvas}
            analysisFrame={vm.automaticPlacement?.enabled ? analysisFrame : null}
            onPlacementMatte={handlePlacementMatte}
          />
          <FaceAnalysisPreviewLayer
            analysisAuthority={analysisAuthority}
            demand={Boolean(vm.faceAnalysisDemand ?? vm.eyeContactAssist.enabled)}
            videoRef={vm.previewVideoRef}
            onResult={handleFaceAnalysisResult}
            onCapturedFrame={vm.automaticPlacement?.enabled ? handleCapturedAnalysisFrame : undefined}
          />
          <EyeContactAssistPreviewLayer
            enabled={vm.eyeContactAssist.enabled}
            settings={{
              enabled: vm.eyeContactAssist.enabled,
              strength: vm.eyeContactAssist.strength,
            }}
            videoRef={vm.previewVideoRef}
            backgroundCanvasRef={vm.eyeContactAssist.backgroundCanvasRef}
            useBackgroundCanvasAsSource={vm.eyeContactAssist.useBackgroundCanvasAsSource}
            debugOverlay={vm.eyeContactAssist.debugOverlay}
            onStatus={vm.eyeContactAssist.onStatus}
            faceAnalysisResult={faceAnalysisResult}
          />
          <div className="hammer-preview-surface__label">{vm.previewSurfaceLabel}</div>
          <VisualPreviewComposer
            overlays={vm.visualPreview.overlays}
            emptyStateMessage={vm.visualPreview.emptyStateMessage}
            editable={vm.visualPreview.isAuthority && vm.visualPreview.editable}
            onSelectClip={(clipId) => {
              if (!vm.visualPreview.isAuthority) return;
              vm.visualPreview.onSelectClip(clipId);
            }}
            onBeginMove={(event, clipId) => {
              if (!vm.visualPreview.isAuthority) return;
              if (!vm.visualPreview.editable) return;
              vm.visualPreview.onBeginMove(event, clipId);
            }}
            onBeginResize={(event, clipId) => {
              if (!vm.visualPreview.isAuthority) return;
              if (!vm.visualPreview.editable) return;
              vm.visualPreview.onBeginResize(event, clipId);
            }}
            onRegisterBrollVideoRef={(clipId, node) => {
              if (node) {
                vm.previewBrollVideoRefs.current.set(clipId, node);
              } else {
                vm.previewBrollVideoRefs.current.delete(clipId);
              }
            }}
          />
          {showAutoPlacementSvg ? (
              <svg className="hammer-preview-auto-placement-overlay" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
                {autoPlacementDiagnostics.candidates.map((candidate) => (
                  <rect
                    key={`candidate-${candidate.zone}-${candidate.leftPct}-${candidate.topPct}`}
                    className={candidate.accepted
                      ? "hammer-preview-auto-placement-overlay__candidate"
                      : "hammer-preview-auto-placement-overlay__candidate hammer-preview-auto-placement-overlay__candidate--rejected"}
                    x={candidate.leftPct}
                    y={candidate.topPct}
                    width={candidate.widthPct}
                    height={candidate.heightPct}
                  />
                ))}
                {autoPlacementDiagnostics.paddedSpeakerBounds.map((bound, idx) => (
                  <g key={`speaker-${idx}`}>
                    <rect
                      className="hammer-preview-auto-placement-overlay__speaker-bound"
                      x={bound.leftPct}
                      y={bound.topPct}
                      width={bound.widthPct}
                      height={bound.heightPct}
                    />
                    <text
                      className="hammer-preview-auto-placement-overlay__label"
                      x={bound.leftPct}
                      y={Math.max(3, bound.topPct - 1.2)}
                    >
                      BODY MASK / overlap allowed
                    </text>
                  </g>
                ))}
                {autoPlacementDiagnostics.faceSafeZones.map((bound, idx) => (
                  <g key={`face-safe-${idx}`}>
                    <rect
                      className="hammer-preview-auto-placement-overlay__zone"
                      x={bound.leftPct}
                      y={bound.topPct}
                      width={bound.widthPct}
                      height={bound.heightPct}
                    />
                    <text
                      className="hammer-preview-auto-placement-overlay__label"
                      x={bound.leftPct}
                      y={Math.max(3, bound.topPct - 1.2)}
                    >
                      FACE SAFE ZONE {bound.widthPct.toFixed(1)}x{bound.heightPct.toFixed(1)}
                    </text>
                  </g>
                ))}
                {autoPlacementDiagnostics.overlay ? (
                  <>
                    <rect
                      className="hammer-preview-auto-placement-overlay__zone"
                      x={autoPlacementDiagnostics.overlay.leftPct}
                      y={autoPlacementDiagnostics.overlay.topPct}
                      width={autoPlacementDiagnostics.overlay.widthPct}
                      height={autoPlacementDiagnostics.overlay.heightPct}
                    />
                    <text
                      className="hammer-preview-auto-placement-overlay__label"
                      x={autoPlacementDiagnostics.overlay.leftPct}
                      y={Math.max(3, autoPlacementDiagnostics.overlay.topPct - 1.2)}
                    >
                      auto {autoPlacementDiagnostics.overlay.zone} · {autoPlacementDiagnostics.overlay.score.toFixed(2)} · scale {autoPlacementDiagnostics.overlay.scale.toFixed(2)}
                    </text>
                    <text
                      className="hammer-preview-auto-placement-overlay__reason-label"
                      x={autoPlacementDiagnostics.overlay.leftPct}
                      y={Math.min(98, autoPlacementDiagnostics.overlay.topPct + autoPlacementDiagnostics.overlay.heightPct + 2.2)}
                    >
                      {autoPlacementDiagnostics.overlay.topPenaltyReason} · {autoPlacementDiagnostics.overlay.whySelected}
                    </text>
                  </>
                ) : null}
                {autoPlacementDiagnostics.ghost ? (
                  <>
                    <rect
                      className="hammer-preview-auto-placement-overlay__ghost"
                      x={autoPlacementDiagnostics.ghost.leftPct}
                      y={autoPlacementDiagnostics.ghost.topPct}
                      width={autoPlacementDiagnostics.ghost.widthPct}
                      height={autoPlacementDiagnostics.ghost.heightPct}
                    />
                    <text
                      className="hammer-preview-auto-placement-overlay__ghost-label"
                      x={autoPlacementDiagnostics.ghost.leftPct}
                      y={Math.max(3, autoPlacementDiagnostics.ghost.topPct - 1.2)}
                    >
                      ghost {autoPlacementDiagnostics.ghost.zone} · {autoPlacementDiagnostics.ghost.score.toFixed(2)}
                    </text>
                    <text
                      className="hammer-preview-auto-placement-overlay__ghost-reason-label"
                      x={autoPlacementDiagnostics.ghost.leftPct}
                      y={Math.min(98, autoPlacementDiagnostics.ghost.topPct + autoPlacementDiagnostics.ghost.heightPct + 2.2)}
                    >
                      {autoPlacementDiagnostics.ghost.reasonsSummary}
                    </text>
                  </>
                ) : null}
              </svg>
          ) : null}
          {showAutoPlacementStatusBadge ? (
            <div className="hammer-preview-auto-placement-status-badge" aria-live="polite">
              <div className="hammer-preview-auto-placement-status-badge__title">AUTO-PLACEMENT DEBUG ACTIVE</div>
              <div>debug flag detected: {autoPlacementDebugEnabledFromQuery ? "yes" : "no"}</div>
              <div>VM diagnostic state: {vm.autoPlacementDiagnostics === undefined ? "missing" : (autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.vmDiagnosticState : "present (disabled)")}</div>
              <div>mask bounds count: {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.maskBoundsCount : 0}</div>
              <div>frame size: {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.frameLabel : "n/a"}</div>
              <div>mask size: {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.maskLabel : "n/a"}</div>
              <div>selected overlay asset: {autoPlacementDiagnostics.enabled && autoPlacementDiagnostics.selectedOverlayAssetPresent ? "yes" : "no"}</div>
              <div>analysis available: {placementPair && analysisFrame ? "yes" : "no"}</div>
              <div>candidates generated: {autoPlacementDiagnostics.enabled && autoPlacementDiagnostics.candidateCount > 0 ? "yes" : "no"}</div>
              <div>candidate resolved (diagnostic): {autoPlacementDiagnostics.enabled && autoPlacementDiagnostics.resolvedPlacementPresent ? "yes" : "no"}</div>
              <div>evidence accepted (canonical): {canonicalPlacementResult ? "yes" : "no"}</div>
              <div>preview applied: {vm.automaticPlacement?.previewApplied ? "yes" : "no"}</div>
              <div>explicit commit: {vm.automaticPlacement?.previewStatus?.startsWith("Automatic placement saved") ? "yes" : "no"}</div>
              <div>requested composition time: {automaticPlacementCompositionTimeSec.toFixed(3)}s</div>
              <div>captured media time: {placementPair?.frameRef.sourcePresentationTimeSec.toFixed(3) ?? "n/a"}s</div>
              <div>candidate count: {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.candidateCount : 0}</div>
              <div>rejected candidate count: {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.rejectedCandidateCount : 0}</div>
              <div>selected scale: {autoPlacementDiagnostics.enabled ? (autoPlacementDiagnostics.selectedScale == null ? "n/a" : autoPlacementDiagnostics.selectedScale.toFixed(2)) : "n/a"}</div>
              <div>face safe zone count: {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.faceSafeZoneCount : 0}</div>
              <div>body overlap allowed: {autoPlacementDiagnostics.enabled ? (autoPlacementDiagnostics.bodyOverlapAllowed ? "true" : "false") : "n/a"}</div>
              <div>scale reason: {autoPlacementDiagnostics.enabled ? (autoPlacementDiagnostics.overlay?.scaleReason ?? "n/a") : "n/a"}</div>
              <div>placement reason: {autoPlacementDiagnostics.enabled ? (autoPlacementDiagnostics.overlay?.placementReason ?? "n/a") : "n/a"}</div>
              {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.candidates.slice(0, 8).map((candidate, idx) => (
                <div key={`cand-meta-${idx}`}>
                  candidate {candidate.zone}: faceOverlap {candidate.faceOverlap ? "yes" : "no"} · bodyOverlap {candidate.bodyOverlap ? "yes" : "no"} · rejectedByBodyMask {candidate.rejectedByBodyMask ? "true" : "false"}
                </div>
              )) : null}
              {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.scaleAttempts.map((attempt, idx) => (
                <div key={`scale-attempt-${idx}`}>
                  scale attempt {attempt.scale.toFixed(2)}: candidates {attempt.candidateCount}, rejected {attempt.rejectedCount}, best rejection {attempt.bestRejectionReason ?? "none"}, resolved {attempt.resolved ? "yes" : "no"}
                </div>
              )) : null}
              {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.gates.map((gate) => (
                <div key={`gate-${gate.id}`}>
                  {gate.label}: {gate.status} ({gate.reason})
                </div>
              )) : null}
              {autoPlacementDiagnostics.enabled ? (
                <>
                  <div>first blocking reason: {autoPlacementDiagnostics.firstBlockingReason ?? "none"}</div>
                  <div>dependency chain: {autoPlacementDiagnostics.dependencyChain}</div>
                  <div>workspaceId: {autoPlacementDiagnostics.upstream.workspaceId}</div>
                  <div>workpieceId: {autoPlacementDiagnostics.upstream.workpieceId}</div>
                  <div>episodeId: {autoPlacementDiagnostics.upstream.episodeId ?? "n/a"}</div>
                  <div>expected media path: {autoPlacementDiagnostics.upstream.expectedMediaPath ?? "n/a"}</div>
                  <div>actual media path: {autoPlacementDiagnostics.upstream.actualMediaPath ?? "n/a"}</div>
                  <div>sourceDeskError raw: {autoPlacementDiagnostics.upstream.sourceDeskErrorRaw ?? "none"}</div>
                  <div>playback readiness reason: {autoPlacementDiagnostics.upstream.playbackReadinessReason}</div>
                </>
              ) : (
                <div>diagnostics disabled: no gate chain available.</div>
              )}
              <div className="hammer-preview-auto-placement-status-badge__meta">
                {autoPlacementDiagnostics.enabled ? autoPlacementDiagnostics.statusLabel : "auto-placement: debug enabled, preview VM state missing"}
              </div>
            </div>
          ) : null}
        </div>
        <div className="hammer-preview-primary-controls">
          <span>Playhead {vm.playheadSec.toFixed(1)}s</span>
          <span>{vm.playbackModeLabel}</span>
          <button type="button" onClick={vm.togglePlayback}>
            {vm.isPlaybackActive ? "Pause (Space)" : "Play (Space)"}
          </button>
        </div>
        <details className="hammer-preview-playback-details">
          <summary>Playback details</summary>
          <div className="hammer-preview-meta">
          {vm.playbackWindow?.mode === "loop" ? (
            <button
              type="button"
              onClick={() => {
                vm.clearPlaybackWindow();
                vm.setIsPlaybackActive(false);
              }}
              title="Disable loop playback"
            >
              Disable loop playback
            </button>
          ) : null}
          <span>{vm.playbackSourceLabel ?? "No media source"}</span>
          {vm.actualRecordingMismatchWarning ? (
            <span className="hammer-preview-meta__warning">{vm.actualRecordingMismatchWarning}</span>
          ) : null}
          {vm.mediaLabelMismatchWarning ? (
            <span className="hammer-preview-meta__warning">{vm.mediaLabelMismatchWarning}</span>
          ) : null}
          <span>Playback lane: {vm.playbackBackendLabel}</span>
          <span>{vm.previewVideoSrc ? "Base video ready" : "Base video unavailable"}</span>
          <span>{vm.playbackMediaSrc ? "Playback media ready" : "Playback media unavailable"}</span>
          {vm.visualPolishPreviewActive ? (
            <span>Visual polish preview mode active</span>
          ) : vm.activeVisualTool !== null ? (
            <span>Visual polish preview mode inactive. Select Polish in the Tool Rack to activate preview processing.</span>
          ) : null}
          {vm.currentPassId === "image_animation" ? (
            <span>B-roll inspection mode active</span>
          ) : null}
          {vm.currentPassId === "audio_finalization" ? (
            <span>Audio compare: {vm.audioFinalizationCompareModeLabel}</span>
          ) : null}
          {vm.currentPassId === "audio_finalization" && vm.audioComparePreviewStatusLabel ? (
            <span>{vm.audioComparePreviewStatusLabel}</span>
          ) : null}
          {vm.currentPassId === "packaging" && vm.packagingSummaryLabel ? (
            <span>{vm.packagingSummaryLabel}</span>
          ) : null}
          {vm.playbackWindow ? (
            <span>
              Window {vm.playbackWindow.startSec.toFixed(1)}s - {vm.playbackWindow.endSec.toFixed(1)}s
            </span>
          ) : null}
          {vm.diagnostics.enabled ? (
            <details
              className="hammer-preview-diagnostics"
              onToggle={(event) => {
                const target = event.currentTarget as HTMLDetailsElement;
                setDiagnosticsOpen(target.open);
              }}
            >
              <summary>Diagnostics</summary>
              {segmentationSummary ? (
                <div className={`hammer-preview-diagnostics__segmentation-summary is-${segmentationSummary.health}`}>
                  {segmentationSummary.text}
                </div>
              ) : null}
              <div className="hammer-preview-diagnostics__actions">
                <button type="button" onClick={() => { void handleCopyDiagnostics(); }}>Copy diagnostics</button>
                {copyStatus ? <span>{copyStatus}</span> : null}
              </div>
              {diagnosticsOpen ? (
                <pre className="hammer-preview-diagnostics__json">{diagnosticsJson}</pre>
              ) : null}
            </details>
          ) : null}
          </div>
        </details>
      </div>
    </>
  );
}
