import type { Dispatch, SetStateAction } from "react";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import type { HammerBackgroundBlurRuntimeStatus } from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import type { HammerEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerDialogueRenderExecutionResult } from "./hammerAudioProcessingBackend";
import {
  useHammerAudioFinishingCompareStatus,
  useHammerAudioFinishingPreviewEffects,
  useHammerAudioFinishingPreviewRefs,
  useHammerAudioFinishingPreviewSourceState,
} from "./useHammerWorkspaceShellAudioFinishing";
import { useHammerVisualPreviewRuntimeDerived, useHammerVisualPreviewRuntimeState } from "./useHammerWorkspaceShellVisualPreview";

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
  studioRackExactPreviewActive: boolean;
  eyeContactUseBackgroundCanvasAsSource: boolean;
  visualBackgroundBlurRuntimeStatus: HammerBackgroundBlurRuntimeStatus | null;
  setVisualBackgroundBlurRuntimeStatus: Dispatch<SetStateAction<HammerBackgroundBlurRuntimeStatus | null>>;
  visualBackgroundBlurStatusSummary: ReturnType<typeof useHammerVisualPreviewRuntimeDerived>["visualBackgroundBlurStatusSummary"];
  visualEyeContactAssistRuntimeStatus: HammerEyeContactAssistRuntimeStatus | null;
  setVisualEyeContactAssistRuntimeStatus: Dispatch<SetStateAction<HammerEyeContactAssistRuntimeStatus | null>>;
  visualEyeContactAssistStatusSummary: ReturnType<typeof useHammerVisualPreviewRuntimeDerived>["visualEyeContactAssistStatusSummary"];
};

export function useHammerWorkspaceShellPreviewRuntime(
  args: UseHammerWorkspaceShellPreviewRuntimeArgs,
): UseHammerWorkspaceShellPreviewRuntimeResult {
  const [studioRackPreviewSrc, setStudioRackPreviewSrc] = useHammerAudioFinishingPreviewSourceState();
  const {
    visualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurRuntimeStatus,
    visualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistRuntimeStatus,
  } = useHammerVisualPreviewRuntimeState();

  const audioPreviewRefs = useHammerAudioFinishingPreviewRefs();

  useHammerAudioFinishingPreviewEffects({
    activeTool: args.activeTool,
    currentPass: args.currentPass,
    compareMode: args.audioFinalizationCompareMode,
    rack: args.editableStudioRack,
    transcriptSegments: args.editableTranscriptSegments,
    workspaceId: args.launchContext.workspace_id,
    workpieceId: args.launchContext.workpiece_id,
    historyHeadEntryId: args.historyHeadEntryId,
    runtime: args.mediaBackboneRuntime,
    mediaRef: args.mediaRef,
    localRootAbs: args.playbackLocalRootAbs,
    preferredPlayback: args.preferredPlayback,
    hasAudibleProcessing: args.studioRackHasAudibleProcessing,
    ffmpegAvailable: args.studioRackRenderBackendFfmpegAvailable,
    playbackMediaSrc: args.playbackMediaSrc,
    previewVideoSrc: args.previewVideoSrc,
    setPlaybackMediaSrc: args.setPlaybackMediaSrc,
    setPreviewVideoSrc: args.setPreviewVideoSrc,
    setRenderStatus: args.setStudioRackRenderStatus,
    inferMime: args.inferPlaybackMimeTypeFromPath,
  }, studioRackPreviewSrc, setStudioRackPreviewSrc, audioPreviewRefs);

  const { visualBackgroundBlurStatusSummary, eyeContactUseBackgroundCanvasAsSource, visualEyeContactAssistStatusSummary } = useHammerVisualPreviewRuntimeDerived({
    blurEnabled: args.visualBackgroundBlur, replacementEnabled: args.visualBackgroundReplaceEnabled,
    washEnabled: args.visualBackgroundWashEnabled, providerId: args.visualBackgroundBlurProviderId,
    debugMask: args.visualBackgroundBlurDebugMask, fallbackMode: args.visualBackgroundBlurFallbackMode,
    blurStatus: visualBackgroundBlurRuntimeStatus, eyeContactDebugOverlay: args.visualEyeContactAssistDebugOverlay,
    eyeContactStatus: visualEyeContactAssistRuntimeStatus,
  });

  const studioRackComparePreviewStatusLabel = useHammerAudioFinishingCompareStatus({ activeTool: args.activeTool, currentPass: args.currentPass, compareMode: args.audioFinalizationCompareMode, hasAudibleProcessing: args.studioRackHasAudibleProcessing, ffmpegAvailable: args.studioRackRenderBackendFfmpegAvailable, previewSrc: studioRackPreviewSrc, playbackMediaSrc: args.playbackMediaSrc });
  const studioRackExactPreviewActive = Boolean(studioRackPreviewSrc && args.playbackMediaSrc === studioRackPreviewSrc);

  return {
    studioRackComparePreviewStatusLabel,
    studioRackExactPreviewActive,
    eyeContactUseBackgroundCanvasAsSource,
    visualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary,
    visualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary,
  };
}
