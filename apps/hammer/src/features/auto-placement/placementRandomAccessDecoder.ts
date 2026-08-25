import { FaceAnalysisFrameCapture } from "../eye-contact-assist/analysis/faceAnalysisAuthority";
import type { FaceAnalysisFrame } from "../eye-contact-assist/types";

export type PlacementRandomAccessFrameRequest = Readonly<{
  sourceIdentity: string;
  sourceUrl: string;
  compositionPresentationTimeSec: number;
  geometricRevision: string;
  abortSignal: AbortSignal;
}>;

export interface PlacementRandomAccessDecoder {
  capture(request: PlacementRandomAccessFrameRequest): Promise<FaceAnalysisFrame>;
  reset(): void;
  dispose(): Promise<void>;
}

function abortError(): DOMException {
  return new DOMException("Placement frame request aborted.", "AbortError");
}

function waitForEvent(target: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked", signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(`Random-access placement media timed out waiting for ${event}.`)); }, 5000);
    const cleanup = () => { window.clearTimeout(timer); target.removeEventListener(event, onEvent); target.removeEventListener("error", onError); signal.removeEventListener("abort", onAbort); };
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Random-access placement media failed to decode.")); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    if (signal.aborted) return onAbort();
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForDecodedFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  const source = video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number; cancelVideoFrameCallback?: (id: number) => void };
  if (!source.requestVideoFrameCallback) return;
  await new Promise<void>((resolve, reject) => {
    let handle = 0;
    const timer = window.setTimeout(() => { source.cancelVideoFrameCallback?.(handle); signal.removeEventListener("abort", onAbort); resolve(); }, 500);
    const onAbort = () => { window.clearTimeout(timer); source.cancelVideoFrameCallback?.(handle); reject(abortError()); };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    handle = source.requestVideoFrameCallback!(() => { window.clearTimeout(timer); signal.removeEventListener("abort", onAbort); resolve(); });
  });
}

/** One hidden, non-presentational decoder. Construction is restricted to the analysis authority. */
export class BrowserPlacementRandomAccessDecoder implements PlacementRandomAccessDecoder {
  private readonly video: HTMLVideoElement;
  private readonly captureAuthority = new FaceAnalysisFrameCapture();
  private sourceIdentity: string | null = null;
  private sourceUrl: string | null = null;
  private disposed = false;

  public constructor(videoFactory: () => HTMLVideoElement = () => document.createElement("video")) {
    this.video = videoFactory();
    this.video.preload = "auto";
    this.video.muted = true;
    this.video.playsInline = true;
  }

  public async capture(request: PlacementRandomAccessFrameRequest): Promise<FaceAnalysisFrame> {
    if (this.disposed) throw new Error("Placement random-access decoder is disposed.");
    if (request.abortSignal.aborted) throw abortError();
    if (this.sourceIdentity !== request.sourceIdentity || this.sourceUrl !== request.sourceUrl) {
      this.video.pause(); this.video.src = request.sourceUrl; this.video.load();
      this.sourceIdentity = request.sourceIdentity; this.sourceUrl = request.sourceUrl;
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForEvent(this.video, "loadeddata", request.abortSignal);
    }
    const requestedTime = Math.max(0, Math.min(Number.isFinite(this.video.duration) ? this.video.duration : Number.POSITIVE_INFINITY, request.compositionPresentationTimeSec));
    if (Math.abs(this.video.currentTime - requestedTime) > 0.001 || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const seeked = waitForEvent(this.video, "seeked", request.abortSignal);
      this.video.currentTime = requestedTime;
      await seeked;
    }
    await waitForDecodedFrame(this.video, request.abortSignal);
    if (request.abortSignal.aborted) throw abortError();
    const width = this.video.videoWidth; const height = this.video.videoHeight;
    if (width <= 0 || height <= 0) throw new Error("Random-access placement frame has no decoded dimensions.");
    return this.captureAuthority.capture({ source: this.video, sourceIdentity: request.sourceIdentity,
      sourcePresentationTimeSec: this.video.currentTime, width, height, geometricRevision: request.geometricRevision });
  }

  public reset(): void {
    if (this.disposed) return;
    this.video.pause(); this.video.removeAttribute("src"); this.video.load();
    this.sourceIdentity = null; this.sourceUrl = null;
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.reset(); this.disposed = true;
  }
}
