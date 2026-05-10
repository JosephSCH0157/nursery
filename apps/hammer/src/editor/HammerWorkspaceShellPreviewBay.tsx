import type { JSX, MutableRefObject, MouseEvent, RefObject } from "react";
import { useMemo, useState } from "react";
import BackgroundBlurPreviewLayer from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import EyeContactAssistPreviewLayer from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import VisualPreviewComposer, { type VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";

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
      state: "resolved" | "no_mask_bounds" | "no_safe_placement" | "no_frame_input";
      statusLabel: string;
      overlay: null | {
        leftPct: number;
        topPct: number;
        widthPct: number;
        heightPct: number;
        zone: string;
        score: number;
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

export default function HammerWorkspaceShellPreviewBay(props: { vm: HammerWorkspaceShellPreviewBayVM }): JSX.Element {
  const vm = props.vm;
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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
            enabled={vm.backgroundEffect.enabled}
            settings={vm.backgroundEffect.settings}
            providerId={vm.backgroundEffect.providerId}
            videoRef={vm.backgroundEffect.sourceVideoRef}
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
          {vm.autoPlacementDiagnostics.enabled ? (
            vm.autoPlacementDiagnostics.overlay ? (
              <svg className="hammer-preview-auto-placement-overlay" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect
                  className="hammer-preview-auto-placement-overlay__zone"
                  x={vm.autoPlacementDiagnostics.overlay.leftPct}
                  y={vm.autoPlacementDiagnostics.overlay.topPct}
                  width={vm.autoPlacementDiagnostics.overlay.widthPct}
                  height={vm.autoPlacementDiagnostics.overlay.heightPct}
                />
                <text
                  className="hammer-preview-auto-placement-overlay__label"
                  x={vm.autoPlacementDiagnostics.overlay.leftPct}
                  y={Math.max(3, vm.autoPlacementDiagnostics.overlay.topPct - 1.2)}
                >
                  auto {vm.autoPlacementDiagnostics.overlay.zone} · {vm.autoPlacementDiagnostics.overlay.score.toFixed(2)}
                </text>
              </svg>
            ) : (
              <div
                className="hammer-preview-matte-overlay hammer-preview-matte-overlay--auto-placement-status"
              >
                {vm.autoPlacementDiagnostics.statusLabel}
              </div>
            )
          ) : null}
        </div>
        <div className="hammer-preview-meta">
          <span>Playhead {vm.playheadSec.toFixed(1)}s</span>
          <span>{vm.playbackModeLabel}</span>
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
          <button type="button" onClick={vm.togglePlayback}>
            {vm.isPlaybackActive ? "Pause (Space)" : "Play (Space)"}
          </button>
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
      </div>
    </>
  );
}
