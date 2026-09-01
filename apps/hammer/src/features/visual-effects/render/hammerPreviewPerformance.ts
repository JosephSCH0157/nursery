export const HAMMER_PREVIEW_PERFORMANCE_RECEIPT_SCHEMA = "HammerPreviewPerformanceReceiptV1" as const;
export const HAMMER_PREVIEW_PERFORMANCE_THRESHOLDS = Object.freeze({
  minimumWindowFps: 28,
  minimumPassingWindowShare: 0.95,
  maximumP95FrameIntervalMs: 35.7,
  maximumStallMs: 150,
  maximumControlLatencyMs: 35.7,
});

const SAMPLE_CAPACITY = 24_000;

class NumericRingBuffer {
  private readonly values: Float64Array;
  private cursor = 0;
  private size = 0;

  public constructor(capacity = SAMPLE_CAPACITY) { this.values = new Float64Array(Math.max(1, capacity)); }
  public push(value: number): void {
    if (!Number.isFinite(value)) return;
    this.values[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.size = Math.min(this.size + 1, this.values.length);
  }
  public snapshot(): number[] {
    const result = new Array<number>(this.size);
    const start = this.size === this.values.length ? this.cursor : 0;
    for (let index = 0; index < this.size; index += 1) result[index] = this.values[(start + index) % this.values.length]!;
    return result;
  }
  public get count(): number { return this.size; }
}

export type HammerPreviewPerformanceSnapshot = Readonly<{
  startedAtMs: number;
  decodedTimestampsMs: number[];
  compositeTimestampsMs: number[];
  segmentationTimestampsMs: number[];
  compositeLatenciesMs: number[];
  segmentationLatenciesMs: number[];
  controlLatenciesMs: number[];
  longTasksMs: number[];
  maximumPendingJobs: number;
  segmentationAttempted: number;
  segmentationCompleted: number;
  segmentationFailed: number;
  segmentationSuperseded: number;
  rawFrameFlashes: number;
  visibleSourceReloads: number;
  degradedDurationMs: number;
}>;

export class HammerPreviewPerformanceCollector {
  private readonly startedAtMs: number;
  private readonly decoded = new NumericRingBuffer();
  private readonly composites = new NumericRingBuffer();
  private readonly segmentations = new NumericRingBuffer();
  private readonly compositeLatencies = new NumericRingBuffer();
  private readonly segmentationLatencies = new NumericRingBuffer();
  private readonly controlLatencies = new NumericRingBuffer();
  private readonly longTasks = new NumericRingBuffer(2_000);
  private maximumPendingJobs = 0;
  private segmentationAttempted = 0;
  private segmentationCompleted = 0;
  private segmentationFailed = 0;
  private segmentationSuperseded = 0;
  private rawFrameFlashes = 0;
  private visibleSourceReloads = 0;
  private degradedDurationMs = 0;

  public constructor(startedAtMs = performance.now()) { this.startedAtMs = startedAtMs; }
  public recordDecoded(atMs = performance.now()): void { this.decoded.push(atMs); }
  public recordComposite(latencyMs: number, atMs = performance.now()): void { this.composites.push(atMs); this.compositeLatencies.push(latencyMs); }
  public recordSegmentation(latencyMs: number, atMs = performance.now()): void { this.segmentations.push(atMs); this.segmentationLatencies.push(latencyMs); this.segmentationCompleted += 1; }
  public recordSegmentationAttempt(): void { this.segmentationAttempted += 1; }
  public recordSegmentationFailure(): void { this.segmentationFailed += 1; }
  public recordSegmentationSuperseded(): void { this.segmentationSuperseded += 1; }
  public recordPendingJobs(count: number): void { this.maximumPendingJobs = Math.max(this.maximumPendingJobs, Math.max(0, Math.trunc(count))); }
  public recordControlLatency(latencyMs: number): void { this.controlLatencies.push(latencyMs); }
  public recordLongTask(durationMs: number): void { this.longTasks.push(durationMs); }
  public recordRawFrameFlash(): void { this.rawFrameFlashes += 1; }
  public recordVisibleSourceReload(): void { this.visibleSourceReloads += 1; }
  public recordDegradedDuration(durationMs: number): void { if (Number.isFinite(durationMs) && durationMs > 0) this.degradedDurationMs += durationMs; }

  public snapshot(): HammerPreviewPerformanceSnapshot {
    return Object.freeze({
      startedAtMs: this.startedAtMs,
      decodedTimestampsMs: this.decoded.snapshot(), compositeTimestampsMs: this.composites.snapshot(), segmentationTimestampsMs: this.segmentations.snapshot(),
      compositeLatenciesMs: this.compositeLatencies.snapshot(), segmentationLatenciesMs: this.segmentationLatencies.snapshot(), controlLatenciesMs: this.controlLatencies.snapshot(), longTasksMs: this.longTasks.snapshot(),
      maximumPendingJobs: this.maximumPendingJobs, segmentationAttempted: this.segmentationAttempted, segmentationCompleted: this.segmentationCompleted,
      segmentationFailed: this.segmentationFailed, segmentationSuperseded: this.segmentationSuperseded, rawFrameFlashes: this.rawFrameFlashes,
      visibleSourceReloads: this.visibleSourceReloads, degradedDurationMs: this.degradedDurationMs,
    });
  }
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
}

function intervals(timestamps: readonly number[]): number[] {
  const values: number[] = [];
  for (let index = 1; index < timestamps.length; index += 1) values.push(timestamps[index]! - timestamps[index - 1]!);
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

export function buildOneSecondCompositeWindows(timestampsMs: readonly number[], sampleStartMs: number, sampleDurationMs: number): number[] {
  const count = Math.max(0, Math.floor(sampleDurationMs / 1_000));
  const windows = new Array<number>(count).fill(0);
  for (const timestamp of timestampsMs) {
    const index = Math.floor((timestamp - sampleStartMs) / 1_000);
    if (index >= 0 && index < count) windows[index] += 1;
  }
  return windows;
}

export type HammerPreviewPerformanceEvaluation = ReturnType<typeof evaluateHammerPreviewPerformance>;
export function evaluateHammerPreviewPerformance(args: { snapshot: HammerPreviewPerformanceSnapshot; sampleStartMs: number; sampleDurationMs: number; allowDegraded?: boolean }) {
  const composites = args.snapshot.compositeTimestampsMs.filter((value) => value >= args.sampleStartMs && value < args.sampleStartMs + args.sampleDurationMs);
  const frameIntervals = intervals(composites);
  const windows = buildOneSecondCompositeWindows(composites, args.sampleStartMs, args.sampleDurationMs);
  const passingWindows = windows.filter((fps) => fps >= HAMMER_PREVIEW_PERFORMANCE_THRESHOLDS.minimumWindowFps).length;
  const passingWindowShare = windows.length ? passingWindows / windows.length : 0;
  const p95FrameIntervalMs = percentile(frameIntervals, 0.95);
  const maximumStallMs = frameIntervals.length ? Math.max(...frameIntervals) : null;
  const maximumControlLatencyMs = args.snapshot.controlLatenciesMs.length ? Math.max(...args.snapshot.controlLatenciesMs) : null;
  const reasons: string[] = [];
  if (passingWindowShare < HAMMER_PREVIEW_PERFORMANCE_THRESHOLDS.minimumPassingWindowShare) reasons.push("insufficient_sustained_compositor_fps");
  if (p95FrameIntervalMs == null || p95FrameIntervalMs > HAMMER_PREVIEW_PERFORMANCE_THRESHOLDS.maximumP95FrameIntervalMs) reasons.push("compositor_frame_interval_p95_exceeded");
  if (maximumStallMs == null || maximumStallMs > HAMMER_PREVIEW_PERFORMANCE_THRESHOLDS.maximumStallMs) reasons.push("compositor_stall_limit_exceeded");
  if (args.snapshot.maximumPendingJobs > 2) reasons.push("analysis_queue_bound_exceeded");
  if (args.snapshot.segmentationCompleted <= 0) reasons.push("segmentation_inactive");
  if (args.snapshot.rawFrameFlashes > 0) reasons.push("processed_to_raw_flash_detected");
  if (args.snapshot.visibleSourceReloads > 0) reasons.push("visible_source_reload_detected");
  if (!args.allowDegraded && args.snapshot.degradedDurationMs > 0) reasons.push("preview_degraded_during_steady_state");
  if (maximumControlLatencyMs != null && maximumControlLatencyMs > HAMMER_PREVIEW_PERFORMANCE_THRESHOLDS.maximumControlLatencyMs) reasons.push("control_to_composite_latency_exceeded");
  return Object.freeze({ passed: reasons.length === 0, blockingReasons: reasons, windows, passingWindows, passingWindowShare,
    decodedFps: args.snapshot.decodedTimestampsMs.filter((value) => value >= args.sampleStartMs && value < args.sampleStartMs + args.sampleDurationMs).length / (args.sampleDurationMs / 1_000),
    compositeFps: composites.length / (args.sampleDurationMs / 1_000),
    segmentedFps: args.snapshot.segmentationTimestampsMs.filter((value) => value >= args.sampleStartMs && value < args.sampleStartMs + args.sampleDurationMs).length / (args.sampleDurationMs / 1_000),
    frameIntervalMs: { p50: percentile(frameIntervals, 0.5), p95: p95FrameIntervalMs, max: maximumStallMs },
    compositeLatencyMs: { p50: percentile(args.snapshot.compositeLatenciesMs, 0.5), p95: percentile(args.snapshot.compositeLatenciesMs, 0.95), max: args.snapshot.compositeLatenciesMs.length ? Math.max(...args.snapshot.compositeLatenciesMs) : null },
    segmentationLatencyMs: { p50: percentile(args.snapshot.segmentationLatenciesMs, 0.5), p95: percentile(args.snapshot.segmentationLatenciesMs, 0.95), max: args.snapshot.segmentationLatenciesMs.length ? Math.max(...args.snapshot.segmentationLatenciesMs) : null },
    maximumControlLatencyMs, maximumLongTaskMs: args.snapshot.longTasksMs.length ? Math.max(...args.snapshot.longTasksMs) : null });
}
