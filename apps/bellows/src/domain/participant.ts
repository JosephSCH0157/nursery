import type { BellowsAuthorityTier } from "./authority.js";
import type { ParticipantId, UserId } from "./ids.js";
import type { BellowsOffsetMs } from "./primitives.js";
import type { BellowsRoleCode } from "./roles.js";

export type BellowsPresenceState =
  | "invited"
  | "joining"
  | "ready"
  | "connected"
  | "disconnected"
  | "removed";

export type BellowsJoinState = "pending" | "approved" | "rejected";

export type BellowsDeviceReadinessState =
  | "unknown"
  | "pending"
  | "ready"
  | "blocked";

export type BellowsCameraState = "enabled" | "disabled" | "failed";

export type BellowsMicrophoneState = "enabled" | "disabled" | "failed";

export type BellowsLocalStorageState =
  | "unknown"
  | "pending"
  | "ready"
  | "blocked";

export type BellowsConnectionQuality =
  | "unknown"
  | "stable"
  | "degraded"
  | "offline";

export interface BellowsRecordingReadiness {
  readonly camera: BellowsDeviceReadinessState;
  readonly microphone: BellowsDeviceReadinessState;
  readonly localStorage: BellowsLocalStorageState;
  readonly overall: BellowsDeviceReadinessState;
}

export interface BellowsParticipant {
  readonly participantId: ParticipantId;
  readonly userId: UserId | null;
  readonly displayName: string;
  readonly roleCode: BellowsRoleCode;
  readonly authorityTier: BellowsAuthorityTier;
  readonly presenceState: BellowsPresenceState;
  readonly joinState: BellowsJoinState;
  readonly joinedAtOffsetMs: BellowsOffsetMs | null;
  readonly leftAtOffsetMs: BellowsOffsetMs | null;
}

export interface BellowsParticipantRuntime {
  readonly participantId: ParticipantId;
  readonly readiness: BellowsRecordingReadiness;
  readonly cameraState: BellowsCameraState;
  readonly microphoneState: BellowsMicrophoneState;
  readonly connectionQuality: BellowsConnectionQuality;
}
