import type { BellowsAuthorityState } from "./authority.js";
import type {
  BellowsBroadcastIntent,
  BellowsBroadcastState,
  BellowsBroadcastTarget,
} from "./broadcast.js";
import type { BellowsSessionEvent } from "./events.js";
import type {
  ParticipantId,
  ScriptId,
  ScriptRevisionId,
  SegmentId,
  SessionId,
  TrackId,
  UserId,
  WorkspaceId,
} from "./ids.js";
import type { BellowsParticipant } from "./participant.js";
import type {
  BellowsOffsetMs,
  BellowsUtcDateTime,
} from "./primitives.js";
import type { BellowsRoleCode } from "./roles.js";
import type { BellowsSegment, BellowsSyncMarker } from "./segment.js";
import type {
  BellowsIntegrityFlag,
  BellowsMachineState,
  BellowsRecordingState,
  BellowsSealState,
  BellowsUploadState,
} from "./states.js";
import type { BellowsTrack } from "./track.js";

export type BellowsSessionMode = "record_only" | "live";

export type BellowsSessionType = "remote" | "hybrid" | "solo";

export interface BellowsParticipantSlot {
  readonly roleCode: BellowsRoleCode;
  readonly participantId: ParticipantId | null;
}

export interface BellowsScriptReference {
  readonly scriptId: ScriptId;
  readonly revisionId: ScriptRevisionId;
  readonly speakerMap: Partial<Record<BellowsRoleCode, ParticipantId>>;
  readonly timingHintOffsetsMs?: readonly BellowsOffsetMs[];
}

export interface BellowsSessionTimeline {
  readonly t0OffsetMs: BellowsOffsetMs | null;
  readonly startTimeUtc: BellowsUtcDateTime | null;
  readonly endTimeUtc: BellowsUtcDateTime | null;
  readonly trackIds: readonly TrackId[];
  readonly segmentIds: readonly SegmentId[];
  readonly syncMarkers: readonly BellowsSyncMarker[];
}

export interface BellowsSessionDraft {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly hostUserId: UserId;
  readonly mode: BellowsSessionMode;
  readonly sessionType: BellowsSessionType;
  readonly title: string;
  readonly participantSlots: readonly BellowsParticipantSlot[];
  readonly scriptReference: BellowsScriptReference | null;
  readonly broadcastIntent: BellowsBroadcastIntent;
  readonly broadcastTargets: readonly BellowsBroadcastTarget[];
  readonly scheduledTimeUtc: BellowsUtcDateTime | null;
}

export interface BellowsSession {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly hostUserId: UserId;
  readonly authorityState: BellowsAuthorityState;
  readonly draft: BellowsSessionDraft;
  readonly participants: Readonly<Record<ParticipantId, BellowsParticipant>>;
  readonly tracks: Readonly<Record<TrackId, BellowsTrack>>;
  readonly segments: Readonly<Record<SegmentId, BellowsSegment>>;
  readonly machineState: BellowsMachineState;
  readonly recordingState: BellowsRecordingState;
  readonly broadcastState: BellowsBroadcastState;
  readonly uploadState: BellowsUploadState;
  readonly sealState: BellowsSealState;
  readonly timeline: BellowsSessionTimeline;
  readonly integrityFlags: readonly BellowsIntegrityFlag[];
  readonly events: readonly BellowsSessionEvent[];
}
