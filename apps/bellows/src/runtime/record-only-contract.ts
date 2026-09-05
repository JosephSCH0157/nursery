import type { ParticipantId, SessionId, TrackId } from "../domain/ids.js";

export const BELLOWS_RECORD_ONLY_CONTRACT_VERSION = 1 as const;
export const BELLOWS_SYNC_MAX_ERROR_MS = 40 as const;
export const BELLOWS_SYNC_OBSERVATION_INTERVAL_MS = 5 * 60 * 1000;
export const BELLOWS_CERTIFICATION_DURATION_MS = 60 * 60 * 1000;

export type BellowsSegmentIntegrityState =
  | "pending"
  | "verified"
  | "failed"
  | "unverifiable"
  | "missing";

export type BellowsUploadPartState =
  | "queued"
  | "uploading"
  | "retryable_failed"
  | "permanently_failed"
  | "verified_received";

export type BellowsRecorderBoundaryReason =
  | "initial"
  | "manual_stop"
  | "page_recovery"
  | "device_restart"
  | "permission_reset"
  | "capture_error";

export interface BellowsCaptureProfile {
  readonly mimeType: string;
  readonly audioBitsPerSecond: number | null;
  readonly videoBitsPerSecond: number | null;
  readonly sampleRate: number | null;
  readonly channelCount: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
  readonly userAgent: string;
}

export interface BellowsLocalUploadPartMetadata {
  readonly contractVersion: typeof BELLOWS_RECORD_ONLY_CONTRACT_VERSION;
  readonly partId: string;
  readonly sessionId: SessionId;
  readonly participantId: ParticipantId;
  readonly trackId: TrackId;
  readonly segmentId: string;
  readonly recorderGeneration: number;
  readonly sequenceNumber: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly capturedAtOffsetMs: number;
  readonly blobTimecodeMs: number | null;
  readonly state: BellowsUploadPartState;
  readonly createdAt: string;
}

export interface BellowsLocalUploadPart extends BellowsLocalUploadPartMetadata {
  readonly blob: Blob;
}

export interface BellowsPlayableSegmentManifest {
  readonly contractVersion: typeof BELLOWS_RECORD_ONLY_CONTRACT_VERSION;
  readonly sessionId: SessionId;
  readonly participantId: ParticipantId;
  readonly trackId: TrackId;
  readonly segmentId: string;
  readonly recorderGeneration: number;
  readonly boundaryReason: BellowsRecorderBoundaryReason;
  readonly profile: BellowsCaptureProfile;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly startOffsetMs: number;
  readonly durationMs: number | null;
  readonly expectedPartCount: number | null;
  readonly integrityState: BellowsSegmentIntegrityState;
}

export interface BellowsSyncObservation {
  readonly observationId: string;
  readonly sessionId: SessionId;
  readonly participantId: ParticipantId;
  readonly segmentId: string;
  readonly kind: "opening" | "interval" | "closing" | "before_restart" | "after_restart";
  readonly expectedOffsetMs: number;
  readonly observedAudioOffsetMs: number | null;
  readonly observedVideoOffsetMs: number | null;
  readonly correctedResidualMs: number | null;
  readonly confidence: number | null;
  readonly observedAt: string;
}

export interface BellowsRecordOnlyStatus {
  readonly phase: "idle" | "recording" | "recoverable" | "uploading" | "verified" | "failed";
  readonly segment: BellowsPlayableSegmentManifest | null;
  readonly partCount: number;
  readonly bytesHeldLocally: number;
  readonly uploadedPartCount: number;
  readonly message: string;
}

export function buildBellowsUploadPartId(segmentId: string, sequenceNumber: number): string {
  if (!segmentId.trim()) throw new Error("Bellows upload parts require a segment id.");
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 0) {
    throw new Error("Bellows upload part sequence must be a non-negative integer.");
  }
  return `${segmentId}:part:${sequenceNumber}`;
}

export function isBellowsSyncObservationWithinTolerance(
  observation: BellowsSyncObservation,
): boolean {
  return observation.correctedResidualMs !== null
    && Math.abs(observation.correctedResidualMs) <= BELLOWS_SYNC_MAX_ERROR_MS;
}
