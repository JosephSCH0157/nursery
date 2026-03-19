import type { BellowsBrand } from "./ids.js";

export type BellowsUtcDateTime = BellowsBrand<string, "BellowsUtcDateTime">;
export type BellowsTimestampMs = BellowsBrand<number, "BellowsTimestampMs">;
export type BellowsDurationMs = BellowsBrand<number, "BellowsDurationMs">;
export type BellowsOffsetMs = BellowsBrand<number, "BellowsOffsetMs">;
export type BellowsDriftEstimateMs = BellowsBrand<number, "BellowsDriftEstimateMs">;
export type BellowsFrameRate = BellowsBrand<number, "BellowsFrameRate">;
export type BellowsChecksum = BellowsBrand<string, "BellowsChecksum">;

export interface BellowsResolution {
  readonly width: number;
  readonly height: number;
}

export interface BellowsAudioFormat {
  readonly codec: string;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth?: 16 | 24 | 32;
}
