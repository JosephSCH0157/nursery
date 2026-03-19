import type {
  BellowsDeviceReadinessState,
  BellowsJoinState,
  BellowsPresenceState,
  BellowsResolvedTongsJoinLink,
  BellowsRoleCode,
} from "@forge/bellows";

export type BellowsGuestReadiness = {
  readonly microphone: BellowsDeviceReadinessState;
  readonly camera: BellowsDeviceReadinessState;
  readonly overall: BellowsDeviceReadinessState;
};

export type BellowsGuestPresencePayload = {
  readonly guestKey: string;
  readonly displayName: string;
  readonly roleCode: BellowsRoleCode;
  readonly joinLinkId: string;
  readonly sessionId: string;
  readonly joinState: BellowsJoinState;
  readonly presenceState: BellowsPresenceState;
  readonly readiness: BellowsGuestReadiness;
  readonly joinedAt: string;
  readonly resolvedAt: string;
  readonly source: "bellows_join_route";
};

export function buildBellowsGuestPresencePayload(args: {
  guestKey: string;
  displayName: string;
  resolved: BellowsResolvedTongsJoinLink;
  readiness: BellowsGuestReadiness;
  joinedAt: string;
}): BellowsGuestPresencePayload {
  return {
    guestKey: args.guestKey,
    displayName: args.displayName,
    roleCode: args.resolved.roleCode,
    joinLinkId: args.resolved.joinLinkId,
    sessionId: args.resolved.sessionId,
    joinState: "pending",
    presenceState: args.readiness.overall === "ready" ? "ready" : "joining",
    readiness: args.readiness,
    joinedAt: args.joinedAt,
    resolvedAt: args.resolved.resolvedAt,
    source: "bellows_join_route",
  };
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

function isGuestReadiness(value: unknown): value is BellowsGuestReadiness {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  return isDeviceReadinessState(row.microphone)
    && isDeviceReadinessState(row.camera)
    && isDeviceReadinessState(row.overall);
}

function isGuestPresencePayload(value: unknown): value is BellowsGuestPresencePayload {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  return typeof row.guestKey === "string"
    && typeof row.displayName === "string"
    && isRoleCode(row.roleCode)
    && typeof row.joinLinkId === "string"
    && typeof row.sessionId === "string"
    && isJoinState(row.joinState)
    && isPresenceState(row.presenceState)
    && isGuestReadiness(row.readiness)
    && typeof row.joinedAt === "string"
    && typeof row.resolvedAt === "string"
    && row.source === "bellows_join_route";
}

export function listBellowsGuestPresencePayloads(
  value: unknown,
): readonly BellowsGuestPresencePayload[] {
  if (!value || typeof value !== "object") return [];

  return Object.values(value as Record<string, unknown>).flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    return entry.filter(isGuestPresencePayload);
  });
}
