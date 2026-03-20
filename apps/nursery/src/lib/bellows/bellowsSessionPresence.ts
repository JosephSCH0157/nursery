import type {
  BellowsDeviceReadinessState,
  BellowsJoinState,
  BellowsLifecycleState,
  BellowsPresenceState,
  BellowsResolvedTongsJoinLink,
  BellowsRoleCode,
} from "@forge/bellows";

export const BELLOWS_HOST_SESSION_SIGNAL_EVENT = "bellows-host-session-signal";

export type BellowsParticipantReadiness = {
  readonly microphone: BellowsDeviceReadinessState;
  readonly camera: BellowsDeviceReadinessState;
  readonly overall: BellowsDeviceReadinessState;
};

export type BellowsAudioActivityState =
  | "unknown"
  | "silent"
  | "active";

export type BellowsHostSessionSignalKind =
  | "waiting_room"
  | "admitted"
  | "preflight"
  | "ready_to_start"
  | "countdown"
  | "sync_initializing"
  | "recording"
  | "finalizing"
  | "closed";

export type BellowsParticipantPresencePayload = {
  readonly presenceKey: string;
  readonly participantKind: "host" | "guest";
  readonly displayName: string;
  readonly roleCode: BellowsRoleCode;
  readonly sessionId: string;
  readonly joinState: BellowsJoinState;
  readonly presenceState: BellowsPresenceState;
  readonly readiness: BellowsParticipantReadiness;
  readonly audioLevelPct: number;
  readonly audioActivity: BellowsAudioActivityState;
  readonly hasPreview: boolean;
  readonly joinedAt: string;
  readonly updatedAt: string;
  readonly source: "bellows_join_route" | "bellows_operator_surface";
  readonly joinLinkId: string | null;
};

export type BellowsGuestPresencePayload =
  BellowsParticipantPresencePayload & {
    readonly participantKind: "guest";
    readonly joinLinkId: string;
    readonly source: "bellows_join_route";
  };

export type BellowsHostPresencePayload =
  BellowsParticipantPresencePayload & {
    readonly participantKind: "host";
    readonly joinLinkId: null;
    readonly source: "bellows_operator_surface";
  };

export type BellowsHostSessionSignal = {
  readonly kind: BellowsHostSessionSignalKind;
  readonly sessionId: string;
  readonly lifecycle: BellowsLifecycleState;
  readonly headline: string;
  readonly detail: string;
  readonly sentAt: string;
  readonly source: "bellows_operator_surface";
  readonly hostParticipantId: string | null;
  readonly hostDisplayName: string;
};

export function deriveBellowsPresenceState(
  readiness: BellowsParticipantReadiness,
): BellowsPresenceState {
  if (readiness.overall === "ready") {
    return "ready";
  }

  if (readiness.overall === "blocked") {
    return "connected";
  }

  return "joining";
}

export function buildBellowsGuestPresencePayload(args: {
  presenceKey: string;
  displayName: string;
  resolved: BellowsResolvedTongsJoinLink;
  readiness: BellowsParticipantReadiness;
  audioLevelPct?: number;
  audioActivity?: BellowsAudioActivityState;
  hasPreview?: boolean;
  joinedAt: string;
  updatedAt?: string;
}): BellowsGuestPresencePayload {
  return {
    presenceKey: args.presenceKey,
    participantKind: "guest",
    displayName: args.displayName,
    roleCode: args.resolved.roleCode,
    sessionId: args.resolved.sessionId,
    joinState: "pending",
    presenceState: deriveBellowsPresenceState(args.readiness),
    readiness: args.readiness,
    audioLevelPct: normalizeAudioLevelPct(args.audioLevelPct),
    audioActivity: args.audioActivity ?? "unknown",
    hasPreview: Boolean(args.hasPreview),
    joinedAt: args.joinedAt,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
    source: "bellows_join_route",
    joinLinkId: args.resolved.joinLinkId,
  };
}

export function buildBellowsHostPresencePayload(args: {
  presenceKey: string;
  displayName: string;
  sessionId: string;
  roleCode: BellowsRoleCode;
  readiness: BellowsParticipantReadiness;
  audioLevelPct?: number;
  audioActivity?: BellowsAudioActivityState;
  hasPreview?: boolean;
  joinedAt: string;
  updatedAt?: string;
}): BellowsHostPresencePayload {
  return {
    presenceKey: args.presenceKey,
    participantKind: "host",
    displayName: args.displayName,
    roleCode: args.roleCode,
    sessionId: args.sessionId,
    joinState: "approved",
    presenceState: deriveBellowsPresenceState(args.readiness),
    readiness: args.readiness,
    audioLevelPct: normalizeAudioLevelPct(args.audioLevelPct),
    audioActivity: args.audioActivity ?? "unknown",
    hasPreview: Boolean(args.hasPreview),
    joinedAt: args.joinedAt,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
    source: "bellows_operator_surface",
    joinLinkId: null,
  };
}

export function buildBellowsHostSessionSignal(args: {
  sessionId: string;
  lifecycle: BellowsLifecycleState;
  hostParticipantId: string | null;
  hostDisplayName: string;
  sentAt?: string;
}): BellowsHostSessionSignal {
  const description = describeBellowsHostSessionSignal(
    args.lifecycle,
    args.hostDisplayName,
  );

  return {
    kind: description.kind,
    sessionId: args.sessionId,
    lifecycle: args.lifecycle,
    headline: description.headline,
    detail: description.detail,
    sentAt: args.sentAt ?? new Date().toISOString(),
    source: "bellows_operator_surface",
    hostParticipantId: args.hostParticipantId,
    hostDisplayName: args.hostDisplayName,
  };
}

function describeBellowsHostSessionSignal(
  lifecycle: BellowsLifecycleState,
  hostDisplayName: string,
): {
  readonly kind: BellowsHostSessionSignalKind;
  readonly headline: string;
  readonly detail: string;
} {
  switch (lifecycle) {
    case "waiting_for_participants":
      return {
        kind: "admitted",
        headline: "Host opened the room",
        detail: `${hostDisplayName} is gathering participants in Bellows now. Stay camera and microphone ready.`,
      };
    case "preflight_checks":
      return {
        kind: "preflight",
        headline: "Preflight in progress",
        detail: `${hostDisplayName} is checking the room before start.`,
      };
    case "preflight_ready":
    case "ready_to_start":
      return {
        kind: "ready_to_start",
        headline: "Studio ready to start",
        detail: "Bellows sees the room as ready. Stay in position while the host decides when to start.",
      };
    case "countdown":
      return {
        kind: "countdown",
        headline: "Countdown live",
        detail: "Bellows countdown is running. Recording start is close.",
      };
    case "sync_initializing":
      return {
        kind: "sync_initializing",
        headline: "Initializing sync",
        detail: "Countdown complete. Bellows is aligning the room for capture start.",
      };
    case "recording_active":
    case "recording_degraded":
    case "recording_offline_local":
    case "recording_rejoining":
      return {
        kind: "recording",
        headline: "Recording underway",
        detail: "Bellows is past admission and into live recording behavior.",
      };
    case "finalizing_local":
    case "uploading":
    case "upload_degraded":
    case "upload_paused":
    case "upload_resuming":
    case "upload_complete_pending_verification":
    case "verifying_integrity":
    case "assembling_manifest":
    case "sealing_session":
      return {
        kind: "finalizing",
        headline: "Session closing out",
        detail: "Bellows has moved beyond live start and is closing the session safely.",
      };
    case "sealed":
    case "incomplete_capture":
    case "failed_capture":
    case "archived":
      return {
        kind: "closed",
        headline: "Session closed",
        detail: "Bellows reports that this session is no longer admitting live participation.",
      };
    case "idle":
    case "configuring":
    case "linking_accounts":
    case "inviting":
    default:
      return {
        kind: "waiting_room",
        headline: "Host is still setting up",
        detail: `${hostDisplayName} has not opened the live room yet. Bellows is still in setup.`,
      };
  }
}

function normalizeAudioLevelPct(value: unknown): number {
  const level = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(100, Math.round(level)));
}

function isDeviceReadinessState(value: unknown): value is BellowsDeviceReadinessState {
  return value === "unknown" || value === "pending" || value === "ready" || value === "blocked";
}

function isRoleCode(value: unknown): value is BellowsRoleCode {
  return value === "S1" || value === "S2" || value === "G1" || value === "G2";
}

function isJoinState(value: unknown): value is BellowsJoinState {
  return value === "pending" || value === "approved" || value === "rejected";
}

function isPresenceState(value: unknown): value is BellowsPresenceState {
  return value === "invited"
    || value === "joining"
    || value === "ready"
    || value === "connected"
    || value === "disconnected"
    || value === "removed";
}

function isAudioActivityState(value: unknown): value is BellowsAudioActivityState {
  return value === "unknown" || value === "silent" || value === "active";
}

function isLifecycleState(value: unknown): value is BellowsLifecycleState {
  return typeof value === "string" && value.trim().length > 0;
}

function isHostSessionSignalKind(value: unknown): value is BellowsHostSessionSignalKind {
  return value === "waiting_room"
    || value === "admitted"
    || value === "preflight"
    || value === "ready_to_start"
    || value === "countdown"
    || value === "sync_initializing"
    || value === "recording"
    || value === "finalizing"
    || value === "closed";
}

function isParticipantReadiness(value: unknown): value is BellowsParticipantReadiness {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  return isDeviceReadinessState(row.microphone)
    && isDeviceReadinessState(row.camera)
    && isDeviceReadinessState(row.overall);
}

function isParticipantPresencePayload(
  value: unknown,
): value is BellowsParticipantPresencePayload {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  return typeof row.presenceKey === "string"
    && (row.participantKind === "host" || row.participantKind === "guest")
    && typeof row.displayName === "string"
    && isRoleCode(row.roleCode)
    && typeof row.sessionId === "string"
    && isJoinState(row.joinState)
    && isPresenceState(row.presenceState)
    && isParticipantReadiness(row.readiness)
    && typeof row.joinedAt === "string"
    && typeof row.updatedAt === "string"
    && typeof row.audioLevelPct === "number"
    && isAudioActivityState(row.audioActivity)
    && typeof row.hasPreview === "boolean"
    && (row.source === "bellows_join_route" || row.source === "bellows_operator_surface")
    && (row.joinLinkId === null || typeof row.joinLinkId === "string");
}

export function listBellowsParticipantPresencePayloads(
  value: unknown,
): readonly BellowsParticipantPresencePayload[] {
  if (!value || typeof value !== "object") return [];

  return Object.values(value as Record<string, unknown>).flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    return entry.filter(isParticipantPresencePayload);
  });
}

export function listBellowsGuestPresencePayloads(
  value: unknown,
): readonly BellowsGuestPresencePayload[] {
  return listBellowsParticipantPresencePayloads(value).filter(
    (entry): entry is BellowsGuestPresencePayload =>
      entry.participantKind === "guest"
      && typeof entry.joinLinkId === "string"
      && entry.source === "bellows_join_route",
  );
}

export function parseBellowsHostSessionSignal(
  value: unknown,
): BellowsHostSessionSignal | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  if ("payload" in row) {
    return parseBellowsHostSessionSignal(row.payload);
  }

  if (
    !isHostSessionSignalKind(row.kind)
    || typeof row.sessionId !== "string"
    || !isLifecycleState(row.lifecycle)
    || typeof row.headline !== "string"
    || typeof row.detail !== "string"
    || typeof row.sentAt !== "string"
    || row.source !== "bellows_operator_surface"
    || (row.hostParticipantId !== null && typeof row.hostParticipantId !== "string")
    || typeof row.hostDisplayName !== "string"
  ) {
    return null;
  }

  return {
    kind: row.kind,
    sessionId: row.sessionId,
    lifecycle: row.lifecycle,
    headline: row.headline,
    detail: row.detail,
    sentAt: row.sentAt,
    source: row.source,
    hostParticipantId: row.hostParticipantId as string | null,
    hostDisplayName: row.hostDisplayName,
  };
}
