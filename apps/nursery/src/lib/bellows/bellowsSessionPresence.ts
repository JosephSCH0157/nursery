import type {
  BellowsDeviceReadinessState,
  BellowsJoinState,
  BellowsPresenceState,
  BellowsResolvedTongsJoinLink,
  BellowsRoleCode,
} from "@forge/bellows";

export type BellowsParticipantReadiness = {
  readonly microphone: BellowsDeviceReadinessState;
  readonly camera: BellowsDeviceReadinessState;
  readonly overall: BellowsDeviceReadinessState;
};

export type BellowsAudioActivityState =
  | "unknown"
  | "silent"
  | "active";

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
