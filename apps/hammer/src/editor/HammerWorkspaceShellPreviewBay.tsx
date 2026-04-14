import type { JSX, MutableRefObject, MouseEvent, RefObject } from "react";
import BackgroundBlurPreviewLayer from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import EyeContactAssistPreviewLayer from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import VisualPreviewComposer, { type VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";

export type HammerWorkspaceShellPreviewBayVM = {
  previewModeLabel: string;

  previewSurfaceRef: RefObject<HTMLDivElement | null>;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  previewAudioRef: RefObject<HTMLVideoElement | null>;
  previewBrollVideoRefs: MutableRefObject<Map<string, HTMLVideoElement>>;

  previewVideoSrc: string | null;
  playbackMediaSrc: string | null;
  isPlaybackActive: boolean;
  playbackWindow: { mode: "loop" | "roll"; startSec: number; endSec: number; label: string } | null;
  handlePlaybackProgress: (currentTime: number) => void;
  setIsPlaybackActive: (next: boolean) => void;
  clearPlaybackWindow: () => void;
  togglePlayback: () => void;

  playheadSec: number;
  playbackModeLabel: string;
  playbackSourceLabel: string | null;
  mediaLabelMismatchWarning: string | null;
  playbackBackendLabel: string;

  currentPassId: string;
  selectedImageAnimationLabel: string;
  audioFinalizationCompareModeLabel: string;
  packagingSummaryLabel: string | null;

  previewSurfaceLabel: string;

  backgroundEffect: {
    enabled: boolean;
    settings: any;
    providerId: string | null;
    debugMasks: boolean;
    maskPreviewMode: boolean;
    maskPreviewStage: "raw" | "expanded" | "feathered" | "refined" | "final_composite";
    onStatus: (status: any) => void;
    onCanvas: (canvas: HTMLCanvasElement | null) => void;
  };

  eyeContactAssist: {
    enabled: boolean;
    strength: number;
    backgroundCanvasRef: RefObject<HTMLCanvasElement | null>;
    useBackgroundCanvasAsSource: boolean;
    debugOverlay: boolean;
    onStatus: (status: any) => void;
  };

  visualPreview: {
    isAuthority: boolean;
    overlays: VisualPreviewOverlayModel[];
    editable: boolean;
    onSelectClip: (clipId: string) => void;
    onBeginMove: (event: MouseEvent, clipId: string) => void;
    onBeginResize: (event: MouseEvent, clipId: string) => void;
  };
};

export default function HammerWorkspaceShellPreviewBay(props: { vm: HammerWorkspaceShellPreviewBayVM }): JSX.Element {
  const vm = props.vm;
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
            preload="metadata"
            playsInline
            className="hammer-preview-media"
          />
          <video
            ref={vm.previewAudioRef}
            src={vm.playbackMediaSrc ?? undefined}
            preload="metadata"
            playsInline
            onTimeUpdate={(event) => {
              if (!vm.isPlaybackActive) return;
              vm.handlePlaybackProgress(event.currentTarget.currentTime);
            }}
            onEnded={() => {
              vm.setIsPlaybackActive(false);
              if (vm.playbackWindow?.mode === "roll") {
                vm.clearPlaybackWindow();
              }
            }}
            className="hammer-preview-media hammer-preview-media--audio"
          />
          <BackgroundBlurPreviewLayer
            enabled={vm.backgroundEffect.enabled}
            settings={vm.backgroundEffect.settings}
            providerId={vm.backgroundEffect.providerId}
            videoRef={vm.previewVideoRef}
            onStatus={vm.backgroundEffect.onStatus}
            debugMasks={vm.backgroundEffect.debugMasks}
            maskPreviewMode={vm.backgroundEffect.maskPreviewMode}
            maskPreviewStage={vm.backgroundEffect.maskPreviewStage}
            onCanvas={vm.backgroundEffect.onCanvas}
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
          />
          <div className="hammer-preview-surface__label">{vm.previewSurfaceLabel}</div>
          <VisualPreviewComposer
            overlays={vm.visualPreview.isAuthority ? vm.visualPreview.overlays : []}
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
        </div>
        <div className="hammer-preview-meta">
          <span>Playhead {vm.playheadSec.toFixed(1)}s</span>
          <span>{vm.playbackModeLabel}</span>
          <span>{vm.playbackSourceLabel ?? "No media source"}</span>
          {vm.mediaLabelMismatchWarning ? (
            <span className="hammer-preview-meta__warning">{vm.mediaLabelMismatchWarning}</span>
          ) : null}
          <span>Playback lane: {vm.playbackBackendLabel}</span>
          <span>{vm.previewVideoSrc ? "Base video ready" : "Base video unavailable"}</span>
          <span>{vm.playbackMediaSrc ? "Playback media ready" : "Playback media unavailable"}</span>
          {vm.currentPassId === "visual_finishing" ? (
            <span>Visual finishing preview mode active</span>
          ) : null}
          {vm.currentPassId === "image_animation" ? (
            <span>Image animation preset: {vm.selectedImageAnimationLabel}</span>
          ) : null}
          {vm.currentPassId === "audio_finalization" ? (
            <span>Audio compare: {vm.audioFinalizationCompareModeLabel}</span>
          ) : null}
          {vm.currentPassId === "packaging" && vm.packagingSummaryLabel ? (
            <span>{vm.packagingSummaryLabel}</span>
          ) : null}
          {vm.playbackWindow ? (
            <span>
              Window {vm.playbackWindow.startSec.toFixed(1)}s - {vm.playbackWindow.endSec.toFixed(1)}s
            </span>
          ) : null}
          <button type="button" onClick={vm.togglePlayback}>
            {vm.isPlaybackActive ? "Pause (Space)" : "Play (Space)"}
          </button>
        </div>
      </div>
    </>
  );
}
