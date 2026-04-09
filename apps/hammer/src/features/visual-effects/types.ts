export type SegmentationProviderReadiness =
  | { status: "idle" }
  | { status: "initializing"; startedAtMs: number }
  | { status: "ready" }
  | { status: "failed"; error: string };

export type SegmentationConfidenceSummary = {
  score: number; // 0..1
  foregroundRatio: number; // 0..1
  warnings: string[];
};

export type SegmentationResult = {
  width: number;
  height: number;
  // 0..255, length = width*height. 255 means "person/foreground", 0 means background.
  personMask: Uint8ClampedArray;
  confidenceSummary: SegmentationConfidenceSummary;
  processingMs: number;
  sourceTimestampSec: number;
  providerName: string;
  warnings: string[];
};

export interface SegmentationProvider {
  readonly name: string;
  initialize(): Promise<void>;
  isReady(): boolean;
  getReadiness(): SegmentationProviderReadiness;
  segmentFrame(args: { video: HTMLVideoElement; timestampSec: number }): Promise<SegmentationResult>;
  dispose(): Promise<void>;
}

export type ForegroundMatteQuality = "low" | "medium" | "high";

export type ForegroundMatte = {
  width: number;
  height: number;
  alphaMask: Uint8ClampedArray; // 0..255
  featherPx: number;
  temporalWeight: number;
  quality: ForegroundMatteQuality;
  metadata: {
    providerName: string;
    confidenceScore: number;
    warnings: string[];
  };
};

export type MatteBuildOptions = {
  featherPx: number;
  subjectExpansionPx: number;
  temporalSmoothing: number; // 0..1
  quality: ForegroundMatteQuality;
};

export interface MatteRefiner {
  buildMatte(input: SegmentationResult, options: MatteBuildOptions): ForegroundMatte;
  reset(): void;
}

export type BackgroundBlurSettings = {
  enabled: boolean;
  blurPx: number;
  edgeFeatherPx: number;
  temporalSmoothing: number; // 0..1
  subjectExpansionPx: number;
  qualityMode: ForegroundMatteQuality;
  fallbackMode: "disable" | "passthrough";
};

export type BackgroundEffectFrameResult = {
  compositingMs: number;
  droppedFrame: boolean;
  degradedReason: string | null;
  warnings: string[];
};

export interface BackgroundEffectRenderer {
  render(args: {
    source: CanvasImageSource;
    matte: ForegroundMatte;
    settings: BackgroundBlurSettings;
    output: HTMLCanvasElement;
  }): BackgroundEffectFrameResult;
}

