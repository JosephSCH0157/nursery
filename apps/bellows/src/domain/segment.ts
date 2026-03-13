import type { SegmentId, SyncMarkerId, TrackId } from "./ids.js";
import type {
  BellowsChecksum,
  BellowsDriftEstimateMs,
  BellowsDurationMs,
  BellowsOffsetMs,
} from "./primitives.js";

export type BellowsContinuityFlag = "complete" | "partial" | "dropped";

export type BellowsSegmentBoundaryReason =
  | "initial"
  | "rejoin"
  | "device_restart"
  | "permission_reset"
  | "storage_rollover"
  | "manual_stop"
  | "crash_recovery";

export type BellowsSyncMarkerKind =
  | "start"
  | "clap"
  | "tone"
  | "flash"
  | "end";

export interface BellowsSegment {
  readonly segmentId: SegmentId;
  readonly trackId: TrackId;
  readonly sequenceNumber: number;
  readonly startOffsetMs: BellowsOffsetMs;
  readonly durationMs: BellowsDurationMs;
  readonly boundaryReason: BellowsSegmentBoundaryReason;
  readonly checksum: BellowsChecksum | null;
  readonly continuityFlag: BellowsContinuityFlag;
}

export interface BellowsSyncMarker {
  readonly syncMarkerId: SyncMarkerId;
  readonly kind: BellowsSyncMarkerKind;
  readonly observedAtOffsetMs: BellowsOffsetMs;
  readonly driftEstimateMs: BellowsDriftEstimateMs | null;
}
