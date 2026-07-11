import type { FaceAnalysisFrame } from "../types";

export class LatestOwnedAnalysisFrameQueue {
  private pending: FaceAnalysisFrame | null = null;

  public offer(frame: FaceAnalysisFrame): void {
    if (this.pending === frame) return;
    this.pending?.release();
    this.pending = frame;
  }

  public take(): FaceAnalysisFrame | null {
    const frame = this.pending;
    this.pending = null;
    return frame;
  }

  public hasPending(): boolean {
    return this.pending != null;
  }

  public dispose(): void {
    this.pending?.release();
    this.pending = null;
  }
}
