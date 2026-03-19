import type { BellowsActingAuthorityState, BellowsAuthorityState } from "../domain/authority.js";
import type { BellowsBroadcastState } from "../domain/broadcast.js";
import type {
  BellowsActionSource,
  BellowsEngineEffectType,
  BellowsEventActorType,
} from "../domain/events.js";
import type {
  ParticipantId,
  SessionId,
  UserId,
  WorkspaceId,
} from "../domain/ids.js";
import type { BellowsRoleCode } from "../domain/roles.js";
import type {
  BellowsSession,
  BellowsSessionMode,
  BellowsSessionType,
} from "../domain/session.js";
import type {
  BellowsIntegrityFlag,
  BellowsLifecycleState,
  BellowsRecordingState,
  BellowsSealState,
  BellowsSessionOutcome,
  BellowsUploadState,
} from "../domain/states.js";
import type { BellowsOffsetMs } from "../domain/primitives.js";
import type { BellowsPersistenceFollowUpActionType } from "./persistence-store.js";

export const BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION = 1;
export const BELLOWS_TONGS_SESSION_TABLE = "bellows_sessions";
export const BELLOWS_TONGS_CHECKPOINT_TABLE = "bellows_session_checkpoints";
export const BELLOWS_TONGS_JOIN_LINK_TABLE = "bellows_session_join_links";

export const BELLOWS_TONGS_CHECKPOINT_KINDS = [
  "session_created",
  "draft_updated",
  "runtime_transition",
  "effect_checkpoint",
  "recovery_checkpoint",
  "integrity_checkpoint",
  "seal_checkpoint",
  "archive_checkpoint",
] as const;

export type BellowsTongsCheckpointKind =
  (typeof BELLOWS_TONGS_CHECKPOINT_KINDS)[number];

export interface BellowsTongsAuthorityProjection {
  readonly actingAuthorityState: BellowsActingAuthorityState;
  readonly hostParticipantId: ParticipantId | null;
  readonly actingHostParticipantId: ParticipantId | null;
  readonly coHostParticipantIds: readonly ParticipantId[];
}

export interface BellowsTongsSessionHeaderRecord {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly hostUserId: UserId;
  readonly title: string;
  readonly mode: BellowsSessionMode;
  readonly sessionType: BellowsSessionType;
  readonly recordingSessionId: string | null;
  readonly calendarEventId: string | null;
  readonly authority: BellowsTongsAuthorityProjection;
  readonly lifecycleState: BellowsLifecycleState;
  readonly recordingState: BellowsRecordingState;
  readonly broadcastState: BellowsBroadcastState;
  readonly uploadState: BellowsUploadState;
  readonly sealState: BellowsSealState;
  readonly outcome: BellowsSessionOutcome | null;
  readonly integrityFlags: readonly BellowsIntegrityFlag[];
  readonly snapshotSchemaVersion: number;
  readonly latestCheckpointId: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly sealedAt: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface BellowsTongsRecoveryCheckpointRecord {
  readonly checkpointId: string;
  readonly sessionId: SessionId;
  readonly sequenceNo: number;
  readonly checkpointKind: BellowsTongsCheckpointKind;
  readonly triggerActionSource: BellowsActionSource;
  readonly triggerActionType: string;
  readonly actorType: BellowsEventActorType | null;
  readonly actorId: string | null;
  readonly effectType: BellowsEngineEffectType | null;
  readonly followUpActionSource: BellowsActionSource | null;
  readonly followUpActionType: string | BellowsPersistenceFollowUpActionType | null;
  readonly offsetMs: BellowsOffsetMs | null;
  readonly occurredAt: string | null;
  readonly lifecycleState: BellowsLifecycleState;
  readonly recordingState: BellowsRecordingState;
  readonly broadcastState: BellowsBroadcastState;
  readonly uploadState: BellowsUploadState;
  readonly sealState: BellowsSealState;
  readonly outcome: BellowsSessionOutcome | null;
  readonly authority: BellowsTongsAuthorityProjection;
  readonly integrityFlags: readonly BellowsIntegrityFlag[];
  readonly eventCount: number;
  readonly snapshotSchemaVersion: number;
  readonly sessionSnapshot: BellowsSession;
  readonly delta: Readonly<Record<string, unknown>> | null;
  readonly recordedAt: string;
}

export interface BellowsCreateTongsSessionHeaderInput {
  readonly session: BellowsSession;
  readonly recordingSessionId?: string | null;
  readonly calendarEventId?: string | null;
}

export interface BellowsSyncTongsSessionHeaderInput {
  readonly sessionId: SessionId;
  readonly title?: string;
  readonly mode?: BellowsSessionMode;
  readonly sessionType?: BellowsSessionType;
  readonly recordingSessionId?: string | null;
  readonly calendarEventId?: string | null;
  readonly authority?: BellowsAuthorityState;
}

export interface BellowsAppendTongsRecoveryCheckpointInput {
  readonly session: BellowsSession;
  readonly checkpointKind: BellowsTongsCheckpointKind;
  readonly triggerActionSource: BellowsActionSource;
  readonly triggerActionType: string;
  readonly actorType?: BellowsEventActorType | null;
  readonly actorId?: string | null;
  readonly effectType?: BellowsEngineEffectType | null;
  readonly followUpActionSource?: BellowsActionSource | null;
  readonly followUpActionType?: string | BellowsPersistenceFollowUpActionType | null;
  readonly offsetMs?: BellowsOffsetMs | null;
  readonly occurredAt?: string | null;
  readonly delta?: Readonly<Record<string, unknown>> | null;
}

export interface BellowsTongsCheckpointLoadOptions {
  readonly limit?: number;
}

export interface BellowsTongsRehydrationBundle {
  readonly header: BellowsTongsSessionHeaderRecord;
  readonly latestCheckpoint: BellowsTongsRecoveryCheckpointRecord | null;
}

export interface BellowsTongsJoinLinkRecord {
  readonly joinLinkId: string;
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly tokenHash: string;
  readonly createdByUserId: string;
  readonly roleCode: BellowsRoleCode;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly maxUses: number;
  readonly useCount: number;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BellowsCreateTongsJoinLinkInput {
  readonly sessionId: SessionId;
  readonly roleCode?: BellowsRoleCode;
  readonly expiresHours?: number;
  readonly maxUses?: number;
  readonly createdByUserId?: string;
}

export interface BellowsCreatedTongsJoinLink {
  readonly joinLink: BellowsTongsJoinLinkRecord;
  readonly token: string;
}

export interface BellowsResolvedTongsJoinLink {
  readonly joinLinkId: string;
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly roleCode: BellowsRoleCode;
  readonly title: string;
  readonly hostUserId: UserId;
  readonly lifecycleState: BellowsLifecycleState;
  readonly expiresAt: string;
  readonly maxUses: number;
  readonly useCount: number;
  readonly lastUsedAt: string;
  readonly resolvedAt: string;
}

export type BellowsSealTongsSessionInput =
  BellowsAppendTongsRecoveryCheckpointInput;

export interface BellowsTongsJoinLinkRepository {
  loadJoinLinks(
    sessionId: SessionId,
  ): Promise<readonly BellowsTongsJoinLinkRecord[]>;
  createJoinLink(
    input: BellowsCreateTongsJoinLinkInput,
  ): Promise<BellowsCreatedTongsJoinLink>;
  resolveJoinLink(
    sessionId: SessionId,
    token: string,
  ): Promise<BellowsResolvedTongsJoinLink | null>;
  revokeJoinLink(
    joinLinkId: string,
  ): Promise<boolean>;
}

export interface BellowsTongsSessionRepository {
  createSessionHeader(
    input: BellowsCreateTongsSessionHeaderInput,
  ): Promise<BellowsTongsSessionHeaderRecord>;
  syncSessionHeader(
    input: BellowsSyncTongsSessionHeaderInput,
  ): Promise<BellowsTongsSessionHeaderRecord>;
  appendRecoveryCheckpoint(
    input: BellowsAppendTongsRecoveryCheckpointInput,
  ): Promise<BellowsTongsRecoveryCheckpointRecord>;
  markLatestCheckpoint(
    sessionId: SessionId,
    checkpointId: string,
  ): Promise<BellowsTongsSessionHeaderRecord>;
  loadSessionHeader(
    sessionId: SessionId,
  ): Promise<BellowsTongsSessionHeaderRecord | null>;
  loadLatestCheckpoint(
    sessionId: SessionId,
  ): Promise<BellowsTongsRecoveryCheckpointRecord | null>;
  loadRecoveryStream(
    sessionId: SessionId,
    options?: BellowsTongsCheckpointLoadOptions,
  ): Promise<readonly BellowsTongsRecoveryCheckpointRecord[]>;
  loadRehydrationBundle(
    sessionId: SessionId,
  ): Promise<BellowsTongsRehydrationBundle | null>;
  loadMostRecentSession(
    workspaceId: WorkspaceId,
  ): Promise<BellowsTongsRehydrationBundle | null>;
  loadMostRecentRecoverableSession(
    workspaceId: WorkspaceId,
  ): Promise<BellowsTongsRehydrationBundle | null>;
  sealSession(
    input: BellowsSealTongsSessionInput,
  ): Promise<BellowsTongsRecoveryCheckpointRecord>;
}
