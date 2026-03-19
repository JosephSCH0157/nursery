import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  BELLOWS_TONGS_CHECKPOINT_TABLE,
  BELLOWS_TONGS_JOIN_LINK_TABLE,
  BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION,
  BELLOWS_TONGS_SESSION_TABLE,
  type BellowsAppendTongsRecoveryCheckpointInput,
  type BellowsCreateTongsJoinLinkInput,
  type BellowsCreatedTongsJoinLink,
  type BellowsCreateTongsSessionHeaderInput,
  type BellowsResolvedTongsJoinLink,
  type BellowsSealTongsSessionInput,
  type BellowsSyncTongsSessionHeaderInput,
  type BellowsTongsAuthorityProjection,
  type BellowsTongsCheckpointLoadOptions,
  type BellowsTongsCheckpointKind,
  type BellowsTongsJoinLinkRecord,
  type BellowsTongsJoinLinkRepository,
  type BellowsTongsRecoveryCheckpointRecord,
  type BellowsTongsRehydrationBundle,
  type BellowsTongsSessionHeaderRecord,
  type BellowsTongsSessionRepository,
  type BellowsSession,
  type BellowsSessionMode,
  type BellowsSessionType,
  type ParticipantId,
  type SessionId,
  type UserId,
  type WorkspaceId,
} from "@forge/bellows";

const TERMINAL_LIFECYCLES = new Set<string>([
  "sealed",
  "incomplete_capture",
  "failed_capture",
  "archived",
] as const);

const STARTED_LIFECYCLES = new Set<string>([
  "recording_active",
  "recording_degraded",
  "recording_offline_local",
  "recording_rejoining",
  "finalizing_local",
  "uploading",
  "upload_degraded",
  "upload_paused",
  "upload_resuming",
  "upload_complete_pending_verification",
  "verifying_integrity",
  "assembling_manifest",
  "sealing_session",
  "sealed",
  "incomplete_capture",
  "failed_capture",
  "archived",
] as const);

const ENDED_LIFECYCLES = new Set<string>([
  "finalizing_local",
  "uploading",
  "upload_degraded",
  "upload_paused",
  "upload_resuming",
  "upload_complete_pending_verification",
  "verifying_integrity",
  "assembling_manifest",
  "sealing_session",
  "sealed",
  "incomplete_capture",
  "failed_capture",
  "archived",
] as const);

type BellowsSessionRow = {
  id: string;
  workspace_id: string;
  host_user_id: string;
  title: string;
  mode: string;
  session_type: string;
  recording_session_id: string | null;
  calendar_event_id: string | null;
  acting_authority_state: string;
  host_participant_id: string | null;
  acting_host_participant_id: string | null;
  co_host_participant_ids: string[] | null;
  lifecycle_state: string;
  recording_state: string;
  broadcast_state: string;
  upload_state: string;
  seal_state: string;
  outcome: string | null;
  integrity_flags: string[] | null;
  snapshot_schema_version: number;
  latest_checkpoint_id: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  sealed_at: string | null;
  archived_at: string | null;
  updated_at: string;
};

type BellowsCheckpointRow = {
  id: string;
  session_id: string;
  sequence_no: number;
  checkpoint_kind: string;
  trigger_action_source: string;
  trigger_action_type: string;
  actor_type: string | null;
  actor_id: string | null;
  effect_type: string | null;
  follow_up_action_source: string | null;
  follow_up_action_type: string | null;
  offset_ms: number | null;
  occurred_at: string | null;
  lifecycle_state: string;
  recording_state: string;
  broadcast_state: string;
  upload_state: string;
  seal_state: string;
  outcome: string | null;
  acting_authority_state: string;
  host_participant_id: string | null;
  acting_host_participant_id: string | null;
  co_host_participant_ids: string[] | null;
  integrity_flags: string[] | null;
  event_count: number;
  snapshot_schema_version: number;
  session_snapshot: BellowsSession;
  delta: Record<string, unknown> | null;
  recorded_at: string;
};

type BellowsJoinLinkRow = {
  id: string;
  session_id: string;
  workspace_id: string;
  token_hash: string;
  created_by_user_id: string;
  role_code: string;
  expires_at: string;
  revoked_at: string | null;
  max_uses: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type BellowsJoinLinkCreateResultRow = {
  join_link_id: string;
  session_id: string;
  workspace_id: string;
  role_code: string;
  token: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

type BellowsJoinLinkResolveResultRow = {
  join_link_id: string;
  session_id: string;
  workspace_id: string;
  role_code: string;
  title: string;
  host_user_id: string;
  lifecycle_state: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  last_used_at: string | null;
  resolved_at: string;
};

type BellowsJoinLinkRevokeResultRow = {
  revoked: boolean;
  join_link_id: string;
};

export interface NurseryBellowsTongsSessionRepository
  extends BellowsTongsSessionRepository {
  loadMostRecentOpenSession(
    workspaceId: WorkspaceId,
  ): Promise<BellowsTongsRehydrationBundle | null>;
}

export interface NurseryBellowsTongsJoinLinkRepository
  extends BellowsTongsJoinLinkRepository {}

export interface NurseryBellowsTongsRepository
  extends NurseryBellowsTongsSessionRepository,
    NurseryBellowsTongsJoinLinkRepository {}

function asParticipantId(value: string | null): ParticipantId | null {
  return value ? value as ParticipantId : null;
}

function asSessionId(value: string): SessionId {
  return value as SessionId;
}

function asUserId(value: string): UserId {
  return value as UserId;
}

function asWorkspaceId(value: string): WorkspaceId {
  return value as WorkspaceId;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isNoRowsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const row = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };

  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (code === "PGRST116") return true;

  const text = [
    typeof row.message === "string" ? row.message : "",
    typeof row.details === "string" ? row.details : "",
  ].join(" ").toLowerCase();

  return text.includes("0 rows")
    || text.includes("no rows")
    || text.includes("json object requested, multiple (or no) rows returned");
}

function normalizeTitle(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "Bellows Session";
}

function mapSessionRow(row: BellowsSessionRow): BellowsTongsSessionHeaderRecord {
  return {
    sessionId: asSessionId(row.id),
    workspaceId: asWorkspaceId(row.workspace_id),
    hostUserId: asUserId(row.host_user_id),
    title: row.title,
    mode: row.mode as BellowsSessionMode,
    sessionType: row.session_type as BellowsSessionType,
    recordingSessionId: row.recording_session_id,
    calendarEventId: row.calendar_event_id,
    authority: {
      actingAuthorityState:
        row.acting_authority_state as BellowsTongsAuthorityProjection["actingAuthorityState"],
      hostParticipantId: asParticipantId(row.host_participant_id),
      actingHostParticipantId: asParticipantId(row.acting_host_participant_id),
      coHostParticipantIds: asStringArray(row.co_host_participant_ids) as ParticipantId[],
    },
    lifecycleState: row.lifecycle_state as BellowsTongsSessionHeaderRecord["lifecycleState"],
    recordingState: row.recording_state as BellowsTongsSessionHeaderRecord["recordingState"],
    broadcastState: row.broadcast_state as BellowsTongsSessionHeaderRecord["broadcastState"],
    uploadState: row.upload_state as BellowsTongsSessionHeaderRecord["uploadState"],
    sealState: row.seal_state as BellowsTongsSessionHeaderRecord["sealState"],
    outcome: row.outcome as BellowsTongsSessionHeaderRecord["outcome"],
    integrityFlags: asStringArray(row.integrity_flags) as BellowsTongsSessionHeaderRecord["integrityFlags"],
    snapshotSchemaVersion: row.snapshot_schema_version,
    latestCheckpointId: row.latest_checkpoint_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sealedAt: row.sealed_at,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  };
}

function mapCheckpointRow(row: BellowsCheckpointRow): BellowsTongsRecoveryCheckpointRecord {
  return {
    checkpointId: row.id,
    sessionId: asSessionId(row.session_id),
    sequenceNo: row.sequence_no,
    checkpointKind: row.checkpoint_kind as BellowsTongsCheckpointKind,
    triggerActionSource:
      row.trigger_action_source as BellowsTongsRecoveryCheckpointRecord["triggerActionSource"],
    triggerActionType: row.trigger_action_type,
    actorType: row.actor_type as BellowsTongsRecoveryCheckpointRecord["actorType"],
    actorId: row.actor_id,
    effectType: row.effect_type as BellowsTongsRecoveryCheckpointRecord["effectType"],
    followUpActionSource:
      row.follow_up_action_source as BellowsTongsRecoveryCheckpointRecord["followUpActionSource"],
    followUpActionType: row.follow_up_action_type,
    offsetMs: row.offset_ms as BellowsTongsRecoveryCheckpointRecord["offsetMs"],
    occurredAt: row.occurred_at,
    lifecycleState: row.lifecycle_state as BellowsTongsRecoveryCheckpointRecord["lifecycleState"],
    recordingState: row.recording_state as BellowsTongsRecoveryCheckpointRecord["recordingState"],
    broadcastState: row.broadcast_state as BellowsTongsRecoveryCheckpointRecord["broadcastState"],
    uploadState: row.upload_state as BellowsTongsRecoveryCheckpointRecord["uploadState"],
    sealState: row.seal_state as BellowsTongsRecoveryCheckpointRecord["sealState"],
    outcome: row.outcome as BellowsTongsRecoveryCheckpointRecord["outcome"],
    authority: {
      actingAuthorityState:
        row.acting_authority_state as BellowsTongsAuthorityProjection["actingAuthorityState"],
      hostParticipantId: asParticipantId(row.host_participant_id),
      actingHostParticipantId: asParticipantId(row.acting_host_participant_id),
      coHostParticipantIds: asStringArray(row.co_host_participant_ids) as ParticipantId[],
    },
    integrityFlags:
      asStringArray(row.integrity_flags) as BellowsTongsRecoveryCheckpointRecord["integrityFlags"],
    eventCount: row.event_count,
    snapshotSchemaVersion: row.snapshot_schema_version,
    sessionSnapshot: row.session_snapshot,
    delta: asObject(row.delta),
    recordedAt: row.recorded_at,
  };
}

function mapJoinLinkRow(row: BellowsJoinLinkRow): BellowsTongsJoinLinkRecord {
  return {
    joinLinkId: row.id,
    sessionId: asSessionId(row.session_id),
    workspaceId: asWorkspaceId(row.workspace_id),
    tokenHash: row.token_hash,
    createdByUserId: row.created_by_user_id,
    roleCode: row.role_code as BellowsTongsJoinLinkRecord["roleCode"],
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapResolvedJoinLinkRow(
  row: BellowsJoinLinkResolveResultRow,
): BellowsResolvedTongsJoinLink {
  return {
    joinLinkId: row.join_link_id,
    sessionId: asSessionId(row.session_id),
    workspaceId: asWorkspaceId(row.workspace_id),
    roleCode: row.role_code as BellowsResolvedTongsJoinLink["roleCode"],
    title: row.title,
    hostUserId: asUserId(row.host_user_id),
    lifecycleState: row.lifecycle_state as BellowsResolvedTongsJoinLink["lifecycleState"],
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at ?? row.resolved_at,
    resolvedAt: row.resolved_at,
  };
}

function deriveSessionTimestampPatch(session: BellowsSession, observedAt: string) {
  const lifecycle = session.machineState.lifecycle;
  const startedAt = STARTED_LIFECYCLES.has(lifecycle) ? observedAt : null;
  const endedAt = ENDED_LIFECYCLES.has(lifecycle) ? observedAt : null;
  const sealedAt = session.sealState === "sealed" ? observedAt : null;
  const archivedAt = lifecycle === "archived" ? observedAt : null;

  return {
    startedAt,
    endedAt,
    sealedAt,
    archivedAt,
  };
}

function isSupportedCheckpoint(
  checkpoint: BellowsTongsRecoveryCheckpointRecord | null,
): checkpoint is BellowsTongsRecoveryCheckpointRecord {
  return Boolean(
    checkpoint
      && checkpoint.snapshotSchemaVersion === BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION,
  );
}

class SupabaseBellowsTongsRepository
  implements NurseryBellowsTongsRepository {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async createSessionHeader(
    input: BellowsCreateTongsSessionHeaderInput,
  ): Promise<BellowsTongsSessionHeaderRecord> {
    const session = input.session;
    const { data, error } = await this.tongs.rpc("create_bellows_session_header", {
      p_session_id: session.sessionId,
      p_workspace_id: session.workspaceId,
      p_host_user_id: session.hostUserId,
      p_title: session.draft.title,
      p_mode: session.draft.mode,
      p_session_type: session.draft.sessionType,
      p_acting_authority_state: session.authorityState.actingAuthorityState,
      p_host_participant_id: session.authorityState.hostParticipantId,
      p_acting_host_participant_id: session.authorityState.actingHostParticipantId,
      p_co_host_participant_ids: [...session.authorityState.coHostParticipantIds],
      p_lifecycle_state: session.machineState.lifecycle,
      p_recording_state: session.recordingState,
      p_broadcast_state: session.broadcastState,
      p_upload_state: session.uploadState,
      p_seal_state: session.sealState,
      p_outcome: session.machineState.outcome,
      p_integrity_flags: [...session.integrityFlags],
      p_recording_session_id: input.recordingSessionId ?? null,
      p_calendar_event_id: input.calendarEventId ?? null,
      p_snapshot_schema_version: BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION,
    });

    if (error) throw error;
    return mapSessionRow(data as BellowsSessionRow);
  }

  public async syncSessionHeader(
    input: BellowsSyncTongsSessionHeaderInput,
  ): Promise<BellowsTongsSessionHeaderRecord> {
    const patch: Record<string, unknown> = {};
    const title = normalizeTitle(input.title);

    if (title !== undefined) patch.title = title;
    if (input.mode !== undefined) patch.mode = input.mode;
    if (input.sessionType !== undefined) patch.session_type = input.sessionType;
    if (input.recordingSessionId !== undefined) {
      patch.recording_session_id = input.recordingSessionId;
    }
    if (input.calendarEventId !== undefined) {
      patch.calendar_event_id = input.calendarEventId;
    }
    if (input.authority) {
      patch.acting_authority_state = input.authority.actingAuthorityState;
      patch.host_participant_id = input.authority.hostParticipantId;
      patch.acting_host_participant_id = input.authority.actingHostParticipantId;
      patch.co_host_participant_ids = [...input.authority.coHostParticipantIds];
    }

    if (Object.keys(patch).length === 0) {
      const existing = await this.loadSessionHeader(input.sessionId);
      if (!existing) {
        throw new Error(`Bellows session ${input.sessionId} was not found in Tongs.`);
      }
      return existing;
    }

    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_SESSION_TABLE)
      .update(patch)
      .eq("id", input.sessionId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error(`Bellows session ${input.sessionId} was not found in Tongs.`);
    }

    return mapSessionRow(data as BellowsSessionRow);
  }

  public async appendRecoveryCheckpoint(
    input: BellowsAppendTongsRecoveryCheckpointInput,
  ): Promise<BellowsTongsRecoveryCheckpointRecord> {
    const observedAt = input.occurredAt ?? new Date().toISOString();
    const timestamps = deriveSessionTimestampPatch(input.session, observedAt);

    const { data, error } = await this.tongs.rpc("append_bellows_session_checkpoint", {
      p_session_id: input.session.sessionId,
      p_checkpoint_kind: input.checkpointKind,
      p_trigger_action_source: input.triggerActionSource,
      p_trigger_action_type: input.triggerActionType,
      p_actor_type: input.actorType ?? null,
      p_actor_id: input.actorId ?? null,
      p_effect_type: input.effectType ?? null,
      p_follow_up_action_source: input.followUpActionSource ?? null,
      p_follow_up_action_type: input.followUpActionType ?? null,
      p_offset_ms: input.offsetMs ?? null,
      p_occurred_at: observedAt,
      p_lifecycle_state: input.session.machineState.lifecycle,
      p_recording_state: input.session.recordingState,
      p_broadcast_state: input.session.broadcastState,
      p_upload_state: input.session.uploadState,
      p_seal_state: input.session.sealState,
      p_outcome: input.session.machineState.outcome,
      p_acting_authority_state: input.session.authorityState.actingAuthorityState,
      p_host_participant_id: input.session.authorityState.hostParticipantId,
      p_acting_host_participant_id: input.session.authorityState.actingHostParticipantId,
      p_co_host_participant_ids: [...input.session.authorityState.coHostParticipantIds],
      p_integrity_flags: [...input.session.integrityFlags],
      p_event_count: input.session.events.length,
      p_session_snapshot: input.session,
      p_delta: input.delta ?? null,
      p_started_at: timestamps.startedAt,
      p_ended_at: timestamps.endedAt,
      p_sealed_at: timestamps.sealedAt,
      p_archived_at: timestamps.archivedAt,
      p_snapshot_schema_version: BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION,
    });

    if (error) throw error;
    return mapCheckpointRow(data as BellowsCheckpointRow);
  }

  public async markLatestCheckpoint(
    sessionId: SessionId,
    checkpointId: string,
  ): Promise<BellowsTongsSessionHeaderRecord> {
    const { data, error } = await this.tongs.rpc("mark_bellows_session_latest_checkpoint", {
      p_session_id: sessionId,
      p_checkpoint_id: checkpointId,
    });

    if (error) throw error;
    return mapSessionRow(data as BellowsSessionRow);
  }

  public async loadSessionHeader(
    sessionId: SessionId,
  ): Promise<BellowsTongsSessionHeaderRecord | null> {
    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_SESSION_TABLE)
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    return data ? mapSessionRow(data as BellowsSessionRow) : null;
  }

  public async loadLatestCheckpoint(
    sessionId: SessionId,
  ): Promise<BellowsTongsRecoveryCheckpointRecord | null> {
    const bundle = await this.loadRehydrationBundle(sessionId);
    return bundle?.latestCheckpoint ?? null;
  }

  public async loadRecoveryStream(
    sessionId: SessionId,
    options?: BellowsTongsCheckpointLoadOptions,
  ): Promise<readonly BellowsTongsRecoveryCheckpointRecord[]> {
    let query = this.tongs
      .from(BELLOWS_TONGS_CHECKPOINT_TABLE)
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence_no", { ascending: true });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row: unknown) => mapCheckpointRow(row as BellowsCheckpointRow));
  }

  public async loadRehydrationBundle(
    sessionId: SessionId,
  ): Promise<BellowsTongsRehydrationBundle | null> {
    const header = await this.loadSessionHeader(sessionId);
    if (!header) return null;

    const resolved = await this.resolveLatestCheckpoint(header);
    return {
      header: resolved.header,
      latestCheckpoint: resolved.latestCheckpoint,
    };
  }

  public async loadMostRecentSession(
    workspaceId: WorkspaceId,
  ): Promise<BellowsTongsRehydrationBundle | null> {
    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_SESSION_TABLE)
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    if (!data) return null;

    return this.loadRehydrationBundle(asSessionId((data as BellowsSessionRow).id));
  }

  public async loadMostRecentRecoverableSession(
    workspaceId: WorkspaceId,
  ): Promise<BellowsTongsRehydrationBundle | null> {
    const bundle = await this.loadMostRecentOpenSession(workspaceId);
    if (!bundle || !isSupportedCheckpoint(bundle.latestCheckpoint)) {
      return null;
    }
    return bundle;
  }

  public async loadMostRecentOpenSession(
    workspaceId: WorkspaceId,
  ): Promise<BellowsTongsRehydrationBundle | null> {
    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_SESSION_TABLE)
      .select("*")
      .eq("workspace_id", workspaceId)
      .neq("lifecycle_state", "sealed")
      .neq("lifecycle_state", "incomplete_capture")
      .neq("lifecycle_state", "failed_capture")
      .neq("lifecycle_state", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    if (!data) return null;

    return this.loadRehydrationBundle(asSessionId((data as BellowsSessionRow).id));
  }

  public async createJoinLink(
    input: BellowsCreateTongsJoinLinkInput,
  ): Promise<BellowsCreatedTongsJoinLink> {
    const { data, error } = await this.tongs
      .rpc("create_bellows_join_link", {
        p_session_id: input.sessionId,
        p_role_code: input.roleCode ?? "G1",
        p_expires_hours: input.expiresHours ?? 24,
        p_max_uses: input.maxUses ?? 5,
        p_created_by_user_id: input.createdByUserId ?? null,
      })
      .single();

    if (error) throw error;

    const created = data as BellowsJoinLinkCreateResultRow | null;
    const joinLinkId = created?.join_link_id?.trim();
    const token = created?.token?.trim();

    if (!joinLinkId || !token) {
      throw new Error("Bellows join-link creation did not return a link id and token.");
    }

    const joinLink = await this.loadJoinLinkById(joinLinkId);
    if (!joinLink) {
      throw new Error(`Bellows join link ${joinLinkId} was created but could not be read back from Tongs.`);
    }

    return {
      joinLink,
      token,
    };
  }

  public async resolveJoinLink(
    sessionId: SessionId,
    token: string,
  ): Promise<BellowsResolvedTongsJoinLink | null> {
    const normalizedToken = token.trim();
    if (!normalizedToken) return null;

    const { data, error } = await this.tongs
      .rpc("resolve_bellows_join_link", {
        p_session_id: sessionId,
        p_token: normalizedToken,
      })
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    return data ? mapResolvedJoinLinkRow(data as BellowsJoinLinkResolveResultRow) : null;
  }

  public async revokeJoinLink(joinLinkId: string): Promise<boolean> {
    const { data, error } = await this.tongs
      .rpc("revoke_bellows_join_link", {
        p_join_link_id: joinLinkId,
      })
      .single();

    if (error) throw error;
    return Boolean((data as BellowsJoinLinkRevokeResultRow | null)?.revoked);
  }

  public sealSession(
    input: BellowsSealTongsSessionInput,
  ): Promise<BellowsTongsRecoveryCheckpointRecord> {
    return this.appendRecoveryCheckpoint(input);
  }

  private get tongs(): any {
    return this.client.schema("tongs") as any;
  }

  private async resolveLatestCheckpoint(
    header: BellowsTongsSessionHeaderRecord,
  ): Promise<{
    header: BellowsTongsSessionHeaderRecord;
    latestCheckpoint: BellowsTongsRecoveryCheckpointRecord | null;
  }> {
    const pointed = header.latestCheckpointId
      ? await this.loadCheckpointById(header.sessionId, header.latestCheckpointId)
      : null;

    if (pointed) {
      return {
        header,
        latestCheckpoint: pointed,
      };
    }

    const fallback = await this.loadMostRecentCheckpoint(header.sessionId);
    if (!fallback) {
      return {
        header,
        latestCheckpoint: null,
      };
    }

    let effectiveHeader = header;
    try {
      effectiveHeader = await this.markLatestCheckpoint(header.sessionId, fallback.checkpointId);
    } catch {
      effectiveHeader = {
        ...header,
        latestCheckpointId: fallback.checkpointId,
        snapshotSchemaVersion: fallback.snapshotSchemaVersion,
      };
    }

    return {
      header: effectiveHeader,
      latestCheckpoint: fallback,
    };
  }

  private async loadCheckpointById(
    sessionId: SessionId,
    checkpointId: string,
  ): Promise<BellowsTongsRecoveryCheckpointRecord | null> {
    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_CHECKPOINT_TABLE)
      .select("*")
      .eq("session_id", sessionId)
      .eq("id", checkpointId)
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    return data ? mapCheckpointRow(data as BellowsCheckpointRow) : null;
  }

  private async loadMostRecentCheckpoint(
    sessionId: SessionId,
  ): Promise<BellowsTongsRecoveryCheckpointRecord | null> {
    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_CHECKPOINT_TABLE)
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    return data ? mapCheckpointRow(data as BellowsCheckpointRow) : null;
  }

  private async loadJoinLinkById(
    joinLinkId: string,
  ): Promise<BellowsTongsJoinLinkRecord | null> {
    const { data, error } = await this.tongs
      .from(BELLOWS_TONGS_JOIN_LINK_TABLE)
      .select("*")
      .eq("id", joinLinkId)
      .maybeSingle();

    if (error && !isNoRowsError(error)) throw error;
    return data ? mapJoinLinkRow(data as BellowsJoinLinkRow) : null;
  }
}

export function createBellowsTongsSessionRepository(
  client: SupabaseClient<Database>,
): NurseryBellowsTongsSessionRepository {
  return new SupabaseBellowsTongsRepository(client);
}

export function createBellowsTongsJoinLinkRepository(
  client: SupabaseClient<Database>,
): NurseryBellowsTongsJoinLinkRepository {
  return new SupabaseBellowsTongsRepository(client);
}

export function isBellowsTerminalLifecycle(lifecycle: string): boolean {
  return TERMINAL_LIFECYCLES.has(lifecycle);
}

export function supportsBellowsRehydration(
  bundle: BellowsTongsRehydrationBundle | null,
): bundle is BellowsTongsRehydrationBundle & {
  latestCheckpoint: BellowsTongsRecoveryCheckpointRecord;
} {
  return Boolean(bundle && isSupportedCheckpoint(bundle.latestCheckpoint));
}
