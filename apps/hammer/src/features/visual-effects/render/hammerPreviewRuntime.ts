export type HammerPreviewFrameReason = "decoded_frame" | "control_change" | "loaded" | "pause" | "play" | "seek";

export type HammerPreviewRuntimeDiagnostics = Readonly<{
  sourceRevision: string | null;
  scheduler: "request_video_frame_callback" | "request_animation_frame" | "idle";
  decodedFrames: number;
  explicitFrames: number;
  disposed: boolean;
}>;

type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime?: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** Playback-owned display scheduler. It never runs RVFC and RAF continuously together. */
export class HammerPreviewRuntime {
  private readonly onFrame: (reason: HammerPreviewFrameReason, mediaTimeSec: number | null) => void;
  private video: VideoFrameElement | null = null;
  private sourceRevision: string | null = null;
  private rvfcHandle = 0;
  private rafHandle = 0;
  private explicitRafHandle = 0;
  private decodedFrames = 0;
  private explicitFrames = 0;
  private disposed = false;
  private scheduler: HammerPreviewRuntimeDiagnostics["scheduler"] = "idle";
  private performanceCollector = new HammerPreviewPerformanceCollector();

  public constructor(onFrame: (reason: HammerPreviewFrameReason, mediaTimeSec: number | null) => void) { this.onFrame = onFrame; }

  public attachSource(video: HTMLVideoElement, mediaRevision: string): void {
    if (this.disposed) throw new Error("Preview runtime is disposed.");
    if (this.video === video && this.sourceRevision === mediaRevision) return;
    this.detachSource();
    this.video = video as VideoFrameElement;
    this.sourceRevision = mediaRevision;
    video.addEventListener("loadeddata", this.onLoaded);
    video.addEventListener("canplay", this.onLoaded);
    video.addEventListener("seeked", this.onSeeked);
    video.addEventListener("play", this.onPlay);
    video.addEventListener("pause", this.onPause);
    this.startContinuousScheduler();
    this.requestFrame("loaded");
  }

  public updateCompositeSettings(): void { this.requestFrame("control_change"); }
  public updateMatteSettings(): void { this.requestFrame("control_change"); }
  public notifySeek(_timeSec: number): void { this.requestFrame("seek"); }

  public requestFrame(reason: HammerPreviewFrameReason): void {
    if (this.disposed || !this.video || this.explicitRafHandle) return;
    this.explicitRafHandle = window.requestAnimationFrame(() => {
      this.explicitRafHandle = 0;
      if (this.disposed || !this.video) return;
      this.explicitFrames += 1;
      this.onFrame(reason, Number.isFinite(this.video.currentTime) ? this.video.currentTime : null);
    });
  }

  public snapshotDiagnostics(): HammerPreviewRuntimeDiagnostics {
    return Object.freeze({ sourceRevision: this.sourceRevision, scheduler: this.scheduler,
      decodedFrames: this.decodedFrames, explicitFrames: this.explicitFrames, disposed: this.disposed });
  }
  public snapshotPerformance(): HammerPreviewPerformanceSnapshot { return this.performanceCollector.snapshot(); }
  public resetPerformance(atMs = performance.now()): void { this.performanceCollector = new HammerPreviewPerformanceCollector(atMs); }
  public recordSuccessfulComposite(latencyMs: number, atMs = performance.now()): void { this.performanceCollector.recordComposite(latencyMs, atMs); }
  public recordSegmentationAttempt(): void { this.performanceCollector.recordSegmentationAttempt(); }
  public recordSegmentationCompleted(latencyMs: number, atMs = performance.now()): void { this.performanceCollector.recordSegmentation(latencyMs, atMs); }
  public recordSegmentationFailure(): void { this.performanceCollector.recordSegmentationFailure(); }
  public recordSegmentationSuperseded(): void { this.performanceCollector.recordSegmentationSuperseded(); }
  public recordPendingJobs(count: number): void { this.performanceCollector.recordPendingJobs(count); }
  public recordControlLatency(latencyMs: number): void { this.performanceCollector.recordControlLatency(latencyMs); }
  public recordLongTask(durationMs: number): void { this.performanceCollector.recordLongTask(durationMs); }
  public recordRawFrameFlash(): void { this.performanceCollector.recordRawFrameFlash(); }
  public recordVisibleSourceReload(): void { this.performanceCollector.recordVisibleSourceReload(); }
  public recordDegradedDuration(durationMs: number): void { this.performanceCollector.recordDegradedDuration(durationMs); }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachSource();
  }

  private readonly onLoaded = () => this.requestFrame("loaded");
  private readonly onSeeked = () => this.requestFrame("seek");
  private readonly onPlay = () => { this.startContinuousScheduler(); this.requestFrame("play"); };
  private readonly onPause = () => this.requestFrame("pause");

  private startContinuousScheduler(): void {
    if (!this.video || this.rvfcHandle || this.rafHandle) return;
    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.scheduler = "request_video_frame_callback";
      const next = () => {
        if (!this.video || this.disposed || typeof this.video.requestVideoFrameCallback !== "function") return;
        this.rvfcHandle = this.video.requestVideoFrameCallback((_now, metadata) => {
          this.rvfcHandle = 0;
          if (!this.video || this.disposed) return;
          this.decodedFrames += 1;
          this.performanceCollector.recordDecoded();
          this.onFrame("decoded_frame", Number.isFinite(metadata.mediaTime) ? metadata.mediaTime! : this.video.currentTime);
          next();
        });
      };
      next();
      return;
    }
    this.scheduler = "request_animation_frame";
    const loop = () => {
      if (!this.video || this.disposed) return;
      this.rafHandle = window.requestAnimationFrame(() => {
        this.rafHandle = 0;
        if (!this.video || this.disposed) return;
        this.decodedFrames += 1;
        this.performanceCollector.recordDecoded();
        this.onFrame("decoded_frame", this.video.currentTime);
        loop();
      });
    };
    loop();
  }

  private detachSource(): void {
    if (this.video) {
      this.video.removeEventListener("loadeddata", this.onLoaded);
      this.video.removeEventListener("canplay", this.onLoaded);
      this.video.removeEventListener("seeked", this.onSeeked);
      this.video.removeEventListener("play", this.onPlay);
      this.video.removeEventListener("pause", this.onPause);
      if (this.rvfcHandle && typeof this.video.cancelVideoFrameCallback === "function") this.video.cancelVideoFrameCallback(this.rvfcHandle);
    }
    if (this.rafHandle) window.cancelAnimationFrame(this.rafHandle);
    if (this.explicitRafHandle) window.cancelAnimationFrame(this.explicitRafHandle);
    this.video = null;
    this.rvfcHandle = 0;
    this.rafHandle = 0;
    this.explicitRafHandle = 0;
    this.scheduler = "idle";
  }
}

export function resolvePreviewAnalysisSize(args: { width: number; height: number; maxLongEdge: number }): { width: number; height: number } {
  const width = Math.max(1, Math.round(args.width));
  const height = Math.max(1, Math.round(args.height));
  const scale = Math.min(1, Math.max(1, args.maxLongEdge) / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function resolvePreviewBackingSize(args: { cssWidth: number; cssHeight: number; devicePixelRatio: number; maxLongEdge?: number }): { width: number; height: number; effectiveDpr: number } {
  const effectiveDpr = Math.max(1, Math.min(2, args.devicePixelRatio || 1));
  let width = Math.max(1, Math.round(args.cssWidth * effectiveDpr));
  let height = Math.max(1, Math.round(args.cssHeight * effectiveDpr));
  const cap = args.maxLongEdge ?? 1280;
  const scale = Math.min(1, cap / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  return { width, height, effectiveDpr };
}

export function isPreviewCompositeCadenceReady(args: { wallDeltaMs: number | null; mediaDeltaSec: number | null; maximumFps?: number }): boolean {
  const maximumFps = args.maximumFps ?? 30;
  const wallReady = args.wallDeltaMs == null || args.wallDeltaMs >= (1_000 / maximumFps);
  const mediaReady = args.mediaDeltaSec == null || Math.abs(args.mediaDeltaSec) >= ((1 / maximumFps) - 0.002);
  return wallReady || mediaReady;
}

export type HammerMatteContinuity = "missing" | "fresh" | "degraded" | "unavailable";

export function resolveMatteContinuity(ageMs: number | null): HammerMatteContinuity {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "missing";
  if (ageMs <= 750) return "fresh";
  if (ageMs <= 2_000) return "degraded";
  return "unavailable";
}
import { HammerPreviewPerformanceCollector, type HammerPreviewPerformanceSnapshot } from "./hammerPreviewPerformance";
