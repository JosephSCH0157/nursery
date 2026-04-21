import assert from "node:assert/strict";
import { buildPreviewBayVM } from "../src/editor/hammerWorkspaceShellViewModels";

function buildArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    previewMode: "edit-aware",
    activeTool: "video",
    activeVisualTool: "polish",
    visualPolishPreviewActive: true,
    previewSurfaceRef: null,
    previewVideoRef: null,
    previewAudioRef: null,
    previewBrollVideoRefs: { current: new Map() },
    effectivePreviewVideoSrc: "blob:preview",
    effectivePlaybackMediaSrc: "blob:audio",
    isPlaybackActive: false,
    playbackWindow: null,
    handlePlaybackProgressWithOrigin: () => undefined,
    handlePlaybackEnded: () => undefined,
    setIsPlaybackActive: () => undefined,
    setPlaybackWindow: () => undefined,
    togglePlayback: () => undefined,
    playheadSec: 0,
    playbackModeLabel: "Paused",
    playbackSourceLabel: null,
    mediaLabelMismatchWarning: null,
    studioRackPlaybackConfig: { backend: "native" },
    currentPass: "visual_finishing",
    selectedImageAnimationLabel: "None",
    audioFinalizationCompareMode: "after",
    studioRackComparePreviewStatusLabel: null,
    packagingIntroPlacement: null,
    packagingOutroPlacement: null,
    packagingLogoPlacement: null,
    previewSurfaceLabel: "Preview",
    visualBackgroundBlur: true,
    visualBackgroundReplaceEnabled: false,
    visualBackgroundWashEnabled: false,
    backgroundBlurSettings: {},
    visualBackgroundBlurProviderId: "mediapipe_selfie_segmentation",
    visualBackgroundBlurDebugMask: false,
    visualBackgroundMaskPreviewMode: false,
    visualBackgroundMaskPreviewStage: "raw",
    setVisualBackgroundBlurRuntimeStatus: () => undefined,
    handleBackgroundEffectCanvas: () => undefined,
    visualEyeContactAssistEnabled: true,
    visualEyeContactAssistStrength: 0.5,
    visualBackgroundEffectCanvasRef: null,
    eyeContactUseBackgroundCanvasAsSource: false,
    visualEyeContactAssistDebugOverlay: false,
    setVisualEyeContactAssistRuntimeStatus: () => undefined,
    isVisualPreviewAuthority: true,
    activePreviewOverlays: [],
    visualPlacementEditingEnabled: false,
    selectVisualClip: () => undefined,
    beginPreviewCanvasDrag: () => undefined,
    ...overrides,
  };
}

{
  const vm = buildPreviewBayVM(buildArgs());
  assert.equal(vm.backgroundEffect.enabled, true);
  assert.equal(vm.eyeContactAssist.enabled, true);
  assert.equal(
    vm.visualPreview.emptyStateMessage,
    "No active visual overlay at this playhead time. Base-frame polish preview remains active.",
  );
}

{
  const vm = buildPreviewBayVM(buildArgs({ effectivePreviewVideoSrc: null }));
  assert.equal(vm.backgroundEffect.enabled, false);
  assert.equal(vm.eyeContactAssist.enabled, false);
  assert.equal(
    vm.visualPreview.emptyStateMessage,
    "No active visual overlay at this playhead time.",
  );
}

// eslint-disable-next-line no-console
console.log("Hammer preview bay target mapping tests passed.");
