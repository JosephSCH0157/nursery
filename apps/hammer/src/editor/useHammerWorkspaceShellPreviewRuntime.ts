import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import type { HammerBackgroundBlurRuntimeStatus } from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import { summarizeBackgroundEffectRuntimeStatus } from "../features/visual-effects/render/backgroundEffectStatusSummary";
import type { HammerEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import { summarizeEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistStatusSummary";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import { resolveSegmentationProviderDescriptor } from "../features/visual-effects/providers/segmentationProviderRegistry";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerDialogueRenderExecutionResult } from "./hammerAudioProcessingBackend";
import { executeDialogueAudioRenderWithBackend } from "./hammerAudioProcessingBackend";
import { buildHammerDevMediaUrl, loadCanonicalAudioPolishPreviewUrl } from "../lib/previewSource";
import { loadWorkpieceMediaPreviewUrl } from "../lib/hammerSourceDeskMediaApi";

export type UseHammerWorkspaceShellPreviewRuntimeArgs = {
  activeTool: string;
  currentPass: string;
  audioFinalizationCompareMode: "before" | "after";
  editableStudioRack: HammerStudioRackState;
  editableTranscriptSegments: HammerTranscriptSegment[];
  launchContext: {
    workspace_id: string;
    workpiece_id: string;
  };
  historyHeadEntryId: string | null;
  mediaBackboneRuntime: HammerMediaBackboneRuntimeSummary;
  mediaRef: MediaRef | null;
  playbackLocalRootAbs: string | null;
  preferredPlayback: {
    kind: string;
    local_relpath?: string | null;
    workpiece_path?: string | null;
    mime_type?: string | null;
  };
  studioRackHasAudibleProcessing: boolean;
  studioRackRenderBackendFfmpegAvailable: boolean;
  playbackMediaSrc: string | null;
  previewVideoSrc: string | null;
  visualBackgroundBlur: boolean;
  visualBackgroundReplaceEnabled: boolean;
  visualBackgroundWashEnabled: boolean;
  visualBackgroundBlurProviderId: string | null;
  visualBackgroundBlurDebugMask: boolean;
  visualBackgroundBlurFallbackMode: BackgroundBlurSettings["fallbackMode"];
  visualEyeContactAssistDebugOverlay: boolean;
  setPlaybackMediaSrc: Dispatch<SetStateAction<string | null>>;
  setPreviewVideoSrc: Dispatch<SetStateAction<string | null>>;
  setStudioRackRenderStatus: Dispatch<SetStateAction<HammerDialogueRenderExecutionResult | null>>;
  inferPlaybackMimeTypeFromPath: (args: {
    path: string;
    kind: MediaRef["kind"];
  }) => string;
};

export type UseHammerWorkspaceShellPreviewRuntimeResult = {
  studioRackComparePreviewStatusLabel: string | null;
  eyeContactUseBackgroundCanvasAsSource: boolean;
  visualBackgroundBlurRuntimeStatus: HammerBackgroundBlurRuntimeStatus | null;
  setVisualBackgroundBlurRuntimeStatus: Dispatch<SetStateAction<HammerBackgroundBlurRuntimeStatus | null>>;
  visualBackgroundBlurStatusSummary: ReturnType<typeof summarizeBackgroundEffectRuntimeStatus> | null;
  visualEyeContactAssistRuntimeStatus: HammerEyeContactAssistRuntimeStatus | null;
  setVisualEyeContactAssistRuntimeStatus: Dispatch<SetStateAction<HammerEyeContactAssistRuntimeStatus | null>>;
  visualEyeContactAssistStatusSummary: ReturnType<typeof summarizeEyeContactAssistRuntimeStatus> | null;
};

export function useHammerWorkspaceShellPreviewRuntime(
  args: UseHammerWorkspaceShellPreviewRuntimeArgs,
): UseHammerWorkspaceShellPreviewRuntimeResult {
  const [studioRackPreviewSrc, setStudioRackPreviewSrc] = useState<string | null>(null);
  const [visualBackgroundBlurRuntimeStatus, setVisualBackgroundBlurRuntimeStatus] = useState<HammerBackgroundBlurRuntimeStatus | null>(null);
  const [visualEyeContactAssistRuntimeStatus, setVisualEyeContactAssistRuntimeStatus] = useState<HammerEyeContactAssistRuntimeStatus | null>(null);

  const studioRackPreviewSrcToRevokeRef = useRef<string | null>(null);
  const studioRackPreviewInFlightRef = useRef(false);
  const studioRackPreviewKeyRef = useRef<string | null>(null);
  const playbackMediaSrcToRevokeRef = useRef<string | null>(null);
  const previewVideoSrcToRevokeRef = useRef<string | null>(null);

  const shouldUseStudioRackPreviewForCompare = Boolean(
    args.activeTool === "audio"
      && args.currentPass === "audio_finalization"
      && args.audioFinalizationCompareMode === "after"
      && args.studioRackHasAudibleProcessing,
  );

  useEffect(() => {
    const current = studioRackPreviewSrcToRevokeRef.current;
    if (current && current.startsWith("blob:") && current !== studioRackPreviewSrc) {
      URL.revokeObjectURL(current);
    }
    studioRackPreviewSrcToRevokeRef.current = studioRackPreviewSrc && studioRackPreviewSrc.startsWith("blob:")
      ? studioRackPreviewSrc
      : null;
    return () => {
      const next = studioRackPreviewSrcToRevokeRef.current;
      if (next && next.startsWith("blob:")) {
        URL.revokeObjectURL(next);
      }
      studioRackPreviewSrcToRevokeRef.current = null;
    };
  }, [studioRackPreviewSrc]);

  useEffect(() => {
    const current = playbackMediaSrcToRevokeRef.current;
    if (current && current.startsWith("blob:") && current !== args.playbackMediaSrc) {
      URL.revokeObjectURL(current);
    }
    playbackMediaSrcToRevokeRef.current = (
      args.playbackMediaSrc
      && args.playbackMediaSrc.startsWith("blob:")
      && args.playbackMediaSrc !== studioRackPreviewSrc
    )
      ? args.playbackMediaSrc
      : null;
    return () => {
      const next = playbackMediaSrcToRevokeRef.current;
      if (next && next.startsWith("blob:")) {
        URL.revokeObjectURL(next);
      }
      playbackMediaSrcToRevokeRef.current = null;
    };
  }, [args.playbackMediaSrc, studioRackPreviewSrc]);

  useEffect(() => {
    const current = previewVideoSrcToRevokeRef.current;
    if (current && current.startsWith("blob:") && current !== args.previewVideoSrc) {
      URL.revokeObjectURL(current);
    }
    previewVideoSrcToRevokeRef.current = args.previewVideoSrc && args.previewVideoSrc.startsWith("blob:")
      ? args.previewVideoSrc
      : null;
    return () => {
      const next = previewVideoSrcToRevokeRef.current;
      if (next && next.startsWith("blob:")) {
        URL.revokeObjectURL(next);
      }
      previewVideoSrcToRevokeRef.current = null;
    };
  }, [args.previewVideoSrc]);

  useEffect(() => {
    if (!shouldUseStudioRackPreviewForCompare) {
      if (import.meta.env.DEV && args.currentPass === "audio_finalization" && args.activeTool === "audio") {
        console.info("[Hammer][AudioComparePreview] inactive", {
          compareMode: args.audioFinalizationCompareMode,
          studioRackHasAudibleProcessing: args.studioRackHasAudibleProcessing,
          playbackBackendPreference: args.editableStudioRack.backend_preference,
        });
      }
      studioRackPreviewKeyRef.current = null;
      setStudioRackPreviewSrc(null);
      return;
    }

    const renderRackState: HammerStudioRackState = {
      ...args.editableStudioRack,
      // Compare preview must request the render-backed lane. Native playback DSP is not implemented.
      backend_preference: "ffmpeg",
    };

    const renderLocalRelpath = args.preferredPlayback.kind === "polished"
      ? (args.preferredPlayback.local_relpath ?? args.mediaRef?.local_relpath ?? null)
      : (args.mediaRef?.local_relpath ?? null);
    const renderCanonicalWorkpiecePath = args.preferredPlayback.kind === "polished"
      ? (args.preferredPlayback.workpiece_path ?? null)
      : (args.mediaRef?.local_relpath ?? null);

    const key = JSON.stringify({
      head: args.historyHeadEntryId ?? "head:unknown",
      basis: renderCanonicalWorkpiecePath ?? renderLocalRelpath ?? "basis:unknown",
      rack: renderRackState,
    });

    if (studioRackPreviewInFlightRef.current) return;
    if (studioRackPreviewKeyRef.current === key && studioRackPreviewSrc) return;
    if (!args.studioRackRenderBackendFfmpegAvailable) {
      if (import.meta.env.DEV) {
        console.info("[Hammer][AudioComparePreview] ffmpeg unavailable", {
          compareMode: args.audioFinalizationCompareMode,
          playbackBackendPreference: args.editableStudioRack.backend_preference,
        });
      }
      return;
    }
    const mediaRef = args.mediaRef;
    if (!mediaRef) return;

    studioRackPreviewInFlightRef.current = true;
    studioRackPreviewKeyRef.current = key;

    void (async () => {
      try {
        const renderExecution = await executeDialogueAudioRenderWithBackend({
          workspaceId: args.launchContext.workspace_id,
          workpieceId: args.launchContext.workpiece_id,
          mediaKind: mediaRef.kind,
          timelineSegments: args.editableTranscriptSegments.map((segment) => ({
            segment_id: segment.segment_id,
            start_sec: segment.start_sec,
            end_sec: segment.end_sec,
            is_disabled: segment.is_disabled,
            gain_db: segment.gain_db,
          })),
          rackState: renderRackState,
          localRootAbs: args.playbackLocalRootAbs,
          localRelpath: renderLocalRelpath,
          canonicalWorkpiecePath: renderCanonicalWorkpiecePath,
          mimeType: args.preferredPlayback.kind === "polished" ? (args.preferredPlayback.mime_type ?? null) : null,
          runtimeSummary: args.mediaBackboneRuntime,
        });
        args.setStudioRackRenderStatus(renderExecution);
        if (import.meta.env.DEV) {
          console.info("[Hammer][AudioComparePreview] render", {
            compareMode: args.audioFinalizationCompareMode,
            requestedBackend: renderExecution.requestedBackend,
            resolvedBackend: renderExecution.resolvedBackend,
            status: renderExecution.status,
            outputLocalRelpath: renderExecution.outputLocalRelpath,
            outputWorkpiecePath: renderExecution.outputWorkpiecePath,
          });
        }

        if (renderExecution.status !== "processed") {
          setStudioRackPreviewSrc(null);
          return;
        }

        if (renderExecution.outputLocalRelpath && args.playbackLocalRootAbs) {
          setStudioRackPreviewSrc(buildHammerDevMediaUrl(args.playbackLocalRootAbs, renderExecution.outputLocalRelpath));
          return;
        }

        if (renderExecution.outputWorkpiecePath) {
          const previewUrl = await loadCanonicalAudioPolishPreviewUrl({
            workpieceId: args.launchContext.workpiece_id,
            workpiecePath: renderExecution.outputWorkpiecePath,
            mimeType: renderExecution.outputMimeType,
          });
          setStudioRackPreviewSrc(previewUrl);
          return;
        }

        setStudioRackPreviewSrc(null);
      } catch {
        setStudioRackPreviewSrc(null);
      } finally {
        studioRackPreviewInFlightRef.current = false;
      }
    })();
  }, [
    args.activeTool,
    args.audioFinalizationCompareMode,
    args.currentPass,
    args.editableStudioRack,
    args.editableTranscriptSegments,
    args.historyHeadEntryId,
    args.launchContext.workpiece_id,
    args.launchContext.workspace_id,
    args.mediaBackboneRuntime,
    args.mediaRef,
    args.playbackLocalRootAbs,
    args.preferredPlayback.kind,
    args.preferredPlayback.local_relpath,
    args.preferredPlayback.mime_type,
    args.preferredPlayback.workpiece_path,
    args.setStudioRackRenderStatus,
    args.studioRackHasAudibleProcessing,
    args.studioRackRenderBackendFfmpegAvailable,
    shouldUseStudioRackPreviewForCompare,
    studioRackPreviewSrc,
  ]);

  useEffect(() => {
    let active = true;
    const resolveRawPreviewVideoSrc = async (): Promise<string | null> => {
      const localRelpath = args.mediaRef?.local_relpath ?? null;
      if (!localRelpath) {
        args.setPreviewVideoSrc(null);
        return null;
      }

      if (args.playbackLocalRootAbs) {
        const url = buildHammerDevMediaUrl(args.playbackLocalRootAbs, localRelpath);
        args.setPreviewVideoSrc(url);
        return url;
      }

      try {
        const previewUrl = await loadWorkpieceMediaPreviewUrl({
          workpieceId: args.launchContext.workpiece_id,
          path: localRelpath,
          mimeType: args.inferPlaybackMimeTypeFromPath({ path: localRelpath, kind: args.mediaRef?.kind ?? "other" }),
          surface: "unknown",
        });
        if (!active) {
          URL.revokeObjectURL(previewUrl);
          return null;
        }
        args.setPreviewVideoSrc(previewUrl);
        return previewUrl;
      } catch {
        if (!active) return null;
        args.setPreviewVideoSrc(null);
        return null;
      }
    };

    (async () => {
      const rawVideoSrc = await resolveRawPreviewVideoSrc();
      if (!active) return;

      if (shouldUseStudioRackPreviewForCompare && studioRackPreviewSrc) {
        if (import.meta.env.DEV) {
          console.info("[Hammer][AudioComparePreview] source", {
            source: "studio-rack-preview",
            compareMode: args.audioFinalizationCompareMode,
            playbackBackendPreference: args.editableStudioRack.backend_preference,
          });
        }
        args.setPlaybackMediaSrc(studioRackPreviewSrc);
        return;
      }

      if (args.preferredPlayback.kind === "polished") {
        if (args.preferredPlayback.local_relpath && args.playbackLocalRootAbs) {
          if (import.meta.env.DEV && args.currentPass === "audio_finalization" && args.activeTool === "audio") {
            console.info("[Hammer][AudioComparePreview] source", {
              source: "prepared-audio-polish",
              compareMode: args.audioFinalizationCompareMode,
              playbackBackendPreference: args.editableStudioRack.backend_preference,
            });
          }
          args.setPlaybackMediaSrc(
            buildHammerDevMediaUrl(args.playbackLocalRootAbs, args.preferredPlayback.local_relpath),
          );
          return;
        }

        if (args.preferredPlayback.workpiece_path) {
          try {
            const previewUrl = await loadCanonicalAudioPolishPreviewUrl({
              workpieceId: args.launchContext.workpiece_id,
              workpiecePath: args.preferredPlayback.workpiece_path,
              mimeType: args.preferredPlayback.mime_type,
            });
            if (!active) {
              URL.revokeObjectURL(previewUrl);
              return;
            }
            args.setPlaybackMediaSrc(previewUrl);
            return;
          } catch {
            if (!active) return;
          }
        }
      }

      if (import.meta.env.DEV && args.currentPass === "audio_finalization" && args.activeTool === "audio") {
        console.info("[Hammer][AudioComparePreview] source", {
          source: rawVideoSrc ? "raw-source" : "none",
          compareMode: args.audioFinalizationCompareMode,
          playbackBackendPreference: args.editableStudioRack.backend_preference,
        });
      }
      args.setPlaybackMediaSrc(rawVideoSrc);
    })();

    return () => {
      active = false;
    };
  }, [
    args.launchContext.workpiece_id,
    args.mediaRef?.kind,
    args.mediaRef?.local_relpath,
    args.playbackLocalRootAbs,
    args.preferredPlayback.kind,
    args.preferredPlayback.local_relpath,
    args.preferredPlayback.mime_type,
    args.preferredPlayback.workpiece_path,
    args.activeTool,
    args.audioFinalizationCompareMode,
    args.currentPass,
    args.editableStudioRack.backend_preference,
    args.setPlaybackMediaSrc,
    args.setPreviewVideoSrc,
    shouldUseStudioRackPreviewForCompare,
    studioRackPreviewSrc,
  ]);

  const backgroundBlurProviderDescriptor = useMemo(
    () => resolveSegmentationProviderDescriptor(args.visualBackgroundBlurProviderId) ?? resolveSegmentationProviderDescriptor("mediapipe_selfie_segmentation"),
    [args.visualBackgroundBlurProviderId],
  );

  const visualBackgroundBlurStatusSummary = useMemo(() => {
    if (!visualBackgroundBlurRuntimeStatus) return null;
    return summarizeBackgroundEffectRuntimeStatus({
      status: visualBackgroundBlurRuntimeStatus,
      providerLabel: backgroundBlurProviderDescriptor?.displayName ?? null,
      showDebugDetails: args.visualBackgroundBlurDebugMask,
    });
  }, [args.visualBackgroundBlurDebugMask, backgroundBlurProviderDescriptor, visualBackgroundBlurRuntimeStatus]);

  const eyeContactUseBackgroundCanvasAsSource = useMemo(() => {
    if (!(args.visualBackgroundBlur || args.visualBackgroundReplaceEnabled || args.visualBackgroundWashEnabled)) return false;
    if (!visualBackgroundBlurRuntimeStatus) return false;
    if (args.visualBackgroundBlurFallbackMode === "passthrough") return true;
    return visualBackgroundBlurRuntimeStatus.degradedReason == null;
  }, [
    args.visualBackgroundBlur,
    args.visualBackgroundBlurFallbackMode,
    args.visualBackgroundReplaceEnabled,
    args.visualBackgroundWashEnabled,
    visualBackgroundBlurRuntimeStatus,
  ]);

  const visualEyeContactAssistStatusSummary = useMemo(() => {
    if (!visualEyeContactAssistRuntimeStatus) return null;
    return summarizeEyeContactAssistRuntimeStatus({
      status: visualEyeContactAssistRuntimeStatus,
      showDebugDetails: args.visualEyeContactAssistDebugOverlay,
    });
  }, [args.visualEyeContactAssistDebugOverlay, visualEyeContactAssistRuntimeStatus]);

  const studioRackComparePreviewStatusLabel = useMemo(() => {
    if (args.currentPass !== "audio_finalization" || args.activeTool !== "audio") {
      return null;
    }
    if (args.audioFinalizationCompareMode === "before") {
      return "Compare source: source audio (Before selected).";
    }
    if (!args.studioRackHasAudibleProcessing) {
      return "Compare source: source audio (rack disabled, bypassed, or identity).";
    }
    if (!args.studioRackRenderBackendFfmpegAvailable) {
      return "Compare source: source audio. Processed compare preview requires FFmpeg because native playback DSP is not implemented.";
    }
    if (studioRackPreviewSrc && args.playbackMediaSrc === studioRackPreviewSrc) {
      return "Compare source: processed Studio Rack preview artifact.";
    }
    if (studioRackPreviewSrc) {
      return "Compare source: processed Studio Rack preview ready; transport swap pending.";
    }
    return "Compare source: preparing processed Studio Rack preview artifact.";
  }, [
    args.activeTool,
    args.audioFinalizationCompareMode,
    args.currentPass,
    args.playbackMediaSrc,
    args.studioRackHasAudibleProcessing,
    args.studioRackRenderBackendFfmpegAvailable,
    studioRackPreviewSrc,
  ]);

  return {
    studioRackComparePreviewStatusLabel,
    eyeContactUseBackgroundCanvasAsSource,
    visualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary,
    visualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary,
  };
}
