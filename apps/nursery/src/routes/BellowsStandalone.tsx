import type { User } from "@supabase/supabase-js";
import { listMyWorkspaces, type Workspace } from "@barstock/lib/tongs-api";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type {
  BellowsEventActorType,
  BellowsLifecycleState,
  BellowsOffsetMs,
  BellowsOperatorDispatchRecord,
  BellowsOperatorConsoleHarness,
  BellowsOperatorConsoleSnapshot,
  BellowsPersistenceObservation,
  BellowsRoleCode,
  BellowsRuntimeDispatchResult,
  BellowsSession,
  BellowsSessionAction,
  BellowsStudioShellObservation,
  BellowsTongsCheckpointKind,
  BellowsTongsJoinLinkRecord,
  BellowsTongsRecoveryCheckpointRecord,
  ParticipantId,
  SessionEventId,
  SessionId,
  UserId,
  WorkspaceId,
} from "@forge/bellows";
import {
  BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION,
  createBellowsOperatorConsoleHarness,
} from "@forge/bellows";
import {
  buildForgeRouteHref,
  parseForgeRouteContext,
} from "../lib/forge-route-context";
import {
  createBellowsTongsRepository,
  isBellowsTerminalLifecycle,
  supportsBellowsRehydration,
  type NurseryBellowsTongsRepository,
  type NurseryBellowsTongsSessionRepository,
} from "../lib/bellows/bellowsTongsRepository";
import {
  listBellowsGuestPresencePayloads,
  type BellowsGuestPresencePayload,
} from "../lib/bellows/bellowsSessionPresence";
import { supabase } from "../lib/supabase";
import "./BellowsStandalone.css";

const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_BARSTOCK_WORKSPACE_KEY = "barstock_workspace_id";
const BELLOWS_HOST_INVITE_CACHE_KEY = "forge_bellows_host_join_links_v1";
const BELLOWS_INVITE_ROLE_CODES = ["S2", "G1", "G2"] as const;

type BellowsRuntimeShell = {
  readonly harness: BellowsOperatorConsoleHarness;
  readonly hostParticipantId: ParticipantId;
  readonly nextOffsetMs: () => BellowsOffsetMs;
  readonly sessionOriginLabel: string;
};

type BellowsOperatorReport = {
  readonly title: string;
  readonly detail: string;
  readonly stateLabel: string;
  readonly technical: string;
};

type BellowsRecoveryRestoreTargets = {
  readonly latest: BellowsTongsRecoveryCheckpointRecord | null;
  readonly baseline: BellowsTongsRecoveryCheckpointRecord | null;
  readonly previousPhase: BellowsTongsRecoveryCheckpointRecord | null;
};

type BellowsInviteRoleCode = (typeof BELLOWS_INVITE_ROLE_CODES)[number];

type BellowsHostInviteLinkCacheEntry = {
  readonly sessionId: string;
  readonly roleCode: BellowsRoleCode;
  readonly joinUrl: string;
  readonly cachedAt: string;
};

type BellowsHostInviteSeat = {
  readonly roleCode: BellowsInviteRoleCode;
  readonly roleLabel: string;
  readonly link: BellowsTongsJoinLinkRecord | null;
  readonly liveGuests: readonly BellowsGuestPresencePayload[];
  readonly guestStatusLabel: string;
  readonly guestStatusDetail: string;
  readonly copyReady: boolean;
  readonly joinUrl: string | null;
};

function asParticipantId(value: string): ParticipantId {
  return value as ParticipantId;
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

function readBellowsHostInviteLinkCache(): Record<string, BellowsHostInviteLinkCacheEntry> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(BELLOWS_HOST_INVITE_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, BellowsHostInviteLinkCacheEntry>
      : {};
  } catch {
    return {};
  }
}

function writeBellowsHostInviteLinkCache(
  cache: Record<string, BellowsHostInviteLinkCacheEntry>,
): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(BELLOWS_HOST_INVITE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore session storage failures
  }
}

function readBellowsHostInviteUrls(sessionId: SessionId | null): Record<string, string> {
  if (!sessionId) return {};

  const cache = readBellowsHostInviteLinkCache();
  return Object.entries(cache).reduce<Record<string, string>>((result, [joinLinkId, entry]) => {
    if (entry.sessionId === sessionId) {
      result[joinLinkId] = entry.joinUrl;
    }
    return result;
  }, {});
}

function persistBellowsHostInviteUrl(args: {
  joinLinkId: string;
  sessionId: SessionId;
  roleCode: BellowsRoleCode;
  joinUrl: string;
}): Record<string, string> {
  const cache = readBellowsHostInviteLinkCache();
  cache[args.joinLinkId] = {
    sessionId: args.sessionId,
    roleCode: args.roleCode,
    joinUrl: args.joinUrl,
    cachedAt: new Date().toISOString(),
  };
  writeBellowsHostInviteLinkCache(cache);
  return readBellowsHostInviteUrls(args.sessionId);
}

function searchFromHref(href: string): string {
  const q = href.indexOf("?");
  return q >= 0 ? href.slice(q) : "";
}

function createBellowsId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildBellowsJoinHref(sessionId: SessionId, token: string): string {
  const path = `/apps/bellows/join/${sessionId}`;
  if (typeof window === "undefined") {
    return `${path}?token=${encodeURIComponent(token)}`;
  }

  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function describeInviteRole(roleCode: BellowsInviteRoleCode): string {
  switch (roleCode) {
    case "S2":
      return "Studio Seat Two";
    case "G1":
      return "Guest Seat One";
    case "G2":
      return "Guest Seat Two";
  }
}

function describeJoinLinkLifecycle(link: BellowsTongsJoinLinkRecord | null): string {
  if (!link) return "No link issued";
  if (link.revokedAt) return "Revoked";
  if (link.useCount >= link.maxUses) return "Use limit reached";
  return "Active";
}

function selectInviteLinkForRole(
  joinLinks: readonly BellowsTongsJoinLinkRecord[],
  roleCode: BellowsInviteRoleCode,
): BellowsTongsJoinLinkRecord | null {
  return joinLinks.find((link) =>
    link.roleCode === roleCode && !link.revokedAt && link.useCount < link.maxUses)
    ?? joinLinks.find((link) => link.roleCode === roleCode)
    ?? null;
}

function describeGuestInviteStatus(args: {
  roleCode: BellowsInviteRoleCode;
  link: BellowsTongsJoinLinkRecord | null;
  liveGuests: readonly BellowsGuestPresencePayload[];
}): {
  readonly label: string;
  readonly detail: string;
} {
  const readyCount = args.liveGuests.filter((guest) => guest.readiness.overall === "ready").length;
  if (readyCount > 0) {
    return {
      label: "Ready for host",
      detail: `${readyCount} live guest${readyCount === 1 ? "" : "s"} reached device-ready state on this seat.`,
    };
  }

  const blockedCount = args.liveGuests.filter((guest) => guest.readiness.overall === "blocked").length;
  if (blockedCount > 0) {
    return {
      label: "Permissions blocked",
      detail: `${blockedCount} guest${blockedCount === 1 ? "" : "s"} arrived, but Bellows still needs microphone or camera access.`,
    };
  }

  if (args.liveGuests.length > 0) {
    return {
      label: "Permissions pending",
      detail: `${args.liveGuests.length} live guest${args.liveGuests.length === 1 ? "" : "s"} arrived and Bellows is still checking devices.`,
    };
  }

  if (args.link?.lastUsedAt || (args.link?.useCount ?? 0) > 0) {
    return {
      label: "Guest arrived",
      detail: "A guest resolved this link, but no active presence is live on the session channel right now.",
    };
  }

  if (args.link && !args.link.revokedAt && args.link.useCount < args.link.maxUses) {
    return {
      label: "Link issued",
      detail: `Waiting for ${describeInviteRole(args.roleCode)} to open the invite link.`,
    };
  }

  if (args.link?.revokedAt) {
    return {
      label: "Link revoked",
      detail: "This seat has no active invite link right now.",
    };
  }

  if (args.link && args.link.useCount >= args.link.maxUses) {
    return {
      label: "Link used",
      detail: "This seat's latest link reached its use limit and should be replaced.",
    };
  }

  return {
    label: "Awaiting invite",
    detail: `Issue a join link when ${describeInviteRole(args.roleCode)} should enter Bellows.`,
  };
}

function createOffsetClock(startAt: number): () => BellowsOffsetMs {
  let current = startAt;

  return () => current++ as BellowsOffsetMs;
}

function readStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY)
      ?? window.localStorage.getItem(LEGACY_BARSTOCK_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function persistStoredWorkspaceId(workspaceId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (workspaceId) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
      window.localStorage.setItem(LEGACY_BARSTOCK_WORKSPACE_KEY, workspaceId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    window.localStorage.removeItem(LEGACY_BARSTOCK_WORKSPACE_KEY);
  } catch {
    // ignore storage errors
  }
}

function describeUser(user: User | null): string {
  if (!user) return "Guest";

  const metadata = user.user_metadata ?? {};
  const displayName = typeof metadata.display_name === "string" && metadata.display_name.trim()
    ? metadata.display_name.trim()
    : typeof metadata.full_name === "string" && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : null;

  return displayName
    ?? user.email?.trim()
    ?? user.phone?.trim()
    ?? `User ${user.id.slice(0, 8)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function isAccessibleWorkspaceId(
  workspaceId: string | null,
  workspaces: Workspace[],
  hasLoadedWorkspaces: boolean,
): string | null {
  if (!workspaceId) return null;
  if (!hasLoadedWorkspaces) return workspaceId;
  return workspaces.some((workspace) => workspace.id === workspaceId) ? workspaceId : null;
}

function resolveHostParticipantId(session: BellowsSession): ParticipantId {
  if (session.authorityState.actingHostParticipantId) {
    return session.authorityState.actingHostParticipantId;
  }

  if (session.authorityState.hostParticipantId) {
    return session.authorityState.hostParticipantId;
  }

  const participants = Object.values(session.participants);
  const hostLikeParticipant = participants.find((participant) =>
    participant.authorityTier === "host" || participant.authorityTier === "co_host");
  if (hostLikeParticipant) {
    return hostLikeParticipant.participantId;
  }

  const firstParticipant = participants[0];
  if (firstParticipant) {
    return firstParticipant.participantId;
  }

  throw new Error("Bellows session has no participant available to act as host authority.");
}

function nextOffsetSeed(session: BellowsSession): number {
  return session.events.reduce((highest, event) => {
    const offset = Number(event.offsetMs);
    return Number.isFinite(offset) ? Math.max(highest, offset) : highest;
  }, -1) + 1;
}

function createHarnessState(session: BellowsSession): {
  readonly harness: BellowsOperatorConsoleHarness;
  readonly hostParticipantId: ParticipantId;
  readonly nextOffsetMs: () => BellowsOffsetMs;
} {
  const hostParticipantId = resolveHostParticipantId(session);
  const nextOffsetMs = createOffsetClock(nextOffsetSeed(session));
  const eventPrefix = createBellowsId("bellows-evt");
  let eventCounter = session.events.length;

  return {
    harness: createBellowsOperatorConsoleHarness({
      initialState: session,
      engineContext: {
        nextEventId: () => `${eventPrefix}-${++eventCounter}` as SessionEventId,
      },
      hostParticipantId,
      nextOffsetMs,
    }),
    hostParticipantId,
    nextOffsetMs,
  };
}

function createSeedSession(args: {
  workspaceId: WorkspaceId;
  hostUserId: UserId;
}): BellowsSession {
  const sessionId = asSessionId(createBellowsId("bellows-session"));
  const hostParticipantId = asParticipantId(createBellowsId("bellows-host"));
  const coHostParticipantId = asParticipantId(createBellowsId("bellows-cohost"));

  return {
    sessionId,
    workspaceId: args.workspaceId,
    hostUserId: args.hostUserId,
    authorityState: {
      actingAuthorityState: "host_present",
      hostParticipantId,
      actingHostParticipantId: hostParticipantId,
      coHostParticipantIds: [coHostParticipantId],
    },
    draft: {
      sessionId,
      workspaceId: args.workspaceId,
      hostUserId: args.hostUserId,
      mode: "live",
      sessionType: "remote",
      title: "Bellows operator session",
      participantSlots: [
        { roleCode: "S1", participantId: hostParticipantId },
        { roleCode: "S2", participantId: coHostParticipantId },
      ],
      scriptReference: null,
      broadcastIntent: "single_platform",
      broadcastTargets: [
        {
          broadcastTargetId: createBellowsId("bellows-target") as never,
          platform: "youtube",
          enabled: true,
          credentialRef: null,
          displayLabel: "YouTube",
        },
      ],
      scheduledTimeUtc: null,
    },
    participants: {
      [hostParticipantId]: {
        participantId: hostParticipantId,
        userId: args.hostUserId,
        displayName: "Host",
        roleCode: "S1",
        authorityTier: "host",
        presenceState: "ready",
        joinState: "approved",
        joinedAtOffsetMs: 0 as BellowsOffsetMs,
        leftAtOffsetMs: null,
      },
      [coHostParticipantId]: {
        participantId: coHostParticipantId,
        userId: null,
        displayName: "Co-host Slot",
        roleCode: "S2",
        authorityTier: "co_host",
        presenceState: "ready",
        joinState: "approved",
        joinedAtOffsetMs: 0 as BellowsOffsetMs,
        leftAtOffsetMs: null,
      },
    } as BellowsSession["participants"],
    tracks: {},
    segments: {},
    machineState: {
      lifecycle: "idle",
      broadcast: "not_broadcasting",
      outcome: null,
    },
    recordingState: "idle",
    broadcastState: "not_broadcasting",
    uploadState: "not_started",
    sealState: "not_started",
    timeline: {
      t0OffsetMs: null,
      startTimeUtc: null,
      endTimeUtc: null,
      trackIds: [],
      segmentIds: [],
      syncMarkers: [],
    },
    integrityFlags: [],
    events: [],
  };
}

function createHostAction(
  type: string,
  payload: Record<string, unknown>,
  hostParticipantId: ParticipantId,
  nextOffsetMs: () => BellowsOffsetMs,
): BellowsSessionAction {
  return {
    source: "host",
    type,
    payload,
    meta: {
      actorId: hostParticipantId,
      offsetMs: nextOffsetMs(),
    },
  } as BellowsSessionAction;
}

function createEngineAction(
  type: string,
  payload: Record<string, unknown>,
  actorId: "engine" | "system",
  source: "engine" | "capture",
  nextOffsetMs: () => BellowsOffsetMs,
): BellowsSessionAction {
  return {
    source,
    type,
    payload,
    meta: {
      actorId,
      offsetMs: nextOffsetMs(),
    },
  } as BellowsSessionAction;
}

function resolveActorType(
  session: BellowsSession,
  action: BellowsSessionAction,
): BellowsEventActorType | null {
  const actorId = action.meta.actorId;

  if (actorId === "engine") return "engine";
  if (actorId === "system") return "system";

  const participant = session.participants[actorId as ParticipantId];
  if (!participant) return null;

  if (participant.authorityTier === "host") return "host";
  if (participant.authorityTier === "co_host") return "co_host";
  return "participant";
}

function classifyCheckpointKind(
  action: BellowsSessionAction,
  session: BellowsSession,
): BellowsTongsCheckpointKind {
  if (action.type === "HOST_UPDATE_DRAFT") return "draft_updated";
  if (action.source === "recovery") return "recovery_checkpoint";
  if (session.machineState.lifecycle === "archived" || action.type === "ARCHIVE_REQUESTED") {
    return "archive_checkpoint";
  }
  if (
    session.machineState.lifecycle === "verifying_integrity"
    || session.machineState.lifecycle === "assembling_manifest"
  ) {
    return "integrity_checkpoint";
  }
  if (
    session.machineState.lifecycle === "sealing_session"
    || session.machineState.lifecycle === "sealed"
    || session.machineState.lifecycle === "incomplete_capture"
    || session.machineState.lifecycle === "failed_capture"
  ) {
    return "seal_checkpoint";
  }
  return "runtime_transition";
}

function buildCheckpointDelta(
  action: BellowsSessionAction,
  result: BellowsRuntimeDispatchResult,
): Readonly<Record<string, unknown>> {
  return {
    transitionKind: result.transition.kind,
    lifecycleBefore: result.previousState.machineState.lifecycle,
    lifecycleAfter: result.currentState.machineState.lifecycle,
    effectDispatches: result.effectDispatches.map((dispatch) => ({
      adapter: dispatch.adapter,
      effectType: dispatch.effectType,
    })),
    actionSource: action.source,
    actionType: action.type,
    rejection:
      result.transition.kind === "rejected"
        ? {
          code: result.transition.rejection.code,
          message: result.transition.rejection.message,
        }
        : null,
  };
}

function buildBlockedRecoveryMessage(args: {
  scopeLabel: string;
  sessionId: SessionId;
  lifecycle: BellowsLifecycleState;
  checkpointId: string | null;
  checkpointSchemaVersion: number | null;
}): string {
  if (!args.checkpointId) {
    return `${args.scopeLabel} Bellows session ${args.sessionId} is in ${args.lifecycle} but has no latest recovery checkpoint. Tongs truth must be repaired before this console can continue.`;
  }

  if (
    args.checkpointSchemaVersion !== null
    && args.checkpointSchemaVersion !== BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION
  ) {
    return `${args.scopeLabel} Bellows session ${args.sessionId} points at checkpoint ${args.checkpointId} with snapshot schema ${args.checkpointSchemaVersion}. This console only supports schema ${BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION}.`;
  }

  return `${args.scopeLabel} Bellows session ${args.sessionId} has an unusable recovery checkpoint. Tongs truth must be repaired before this console can continue.`;
}

function isSupportedRecoveryCheckpoint(
  checkpoint: BellowsTongsRecoveryCheckpointRecord,
): boolean {
  return checkpoint.snapshotSchemaVersion === BELLOWS_TONGS_RECOVERY_SNAPSHOT_SCHEMA_VERSION;
}

function findLatestSupportedCheckpoint(
  checkpoints: readonly BellowsTongsRecoveryCheckpointRecord[],
): BellowsTongsRecoveryCheckpointRecord | null {
  for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
    const checkpoint = checkpoints[index];
    if (isSupportedRecoveryCheckpoint(checkpoint)) {
      return checkpoint;
    }
  }

  return null;
}

function findBaselineSupportedCheckpoint(
  checkpoints: readonly BellowsTongsRecoveryCheckpointRecord[],
): BellowsTongsRecoveryCheckpointRecord | null {
  for (const checkpoint of checkpoints) {
    if (isSupportedRecoveryCheckpoint(checkpoint)) {
      return checkpoint;
    }
  }

  return null;
}

function findPreviousPhaseCheckpoint(
  checkpoints: readonly BellowsTongsRecoveryCheckpointRecord[],
): BellowsTongsRecoveryCheckpointRecord | null {
  const latest = findLatestSupportedCheckpoint(checkpoints);
  if (!latest) return null;

  for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
    const checkpoint = checkpoints[index];
    if (!isSupportedRecoveryCheckpoint(checkpoint)) continue;
    if (checkpoint.checkpointId === latest.checkpointId) continue;
    if (checkpoint.lifecycleState !== latest.lifecycleState) {
      return checkpoint;
    }
  }

  return null;
}

function deriveRecoveryRestoreTargets(
  checkpoints: readonly BellowsTongsRecoveryCheckpointRecord[],
): BellowsRecoveryRestoreTargets {
  return {
    latest: findLatestSupportedCheckpoint(checkpoints),
    baseline: findBaselineSupportedCheckpoint(checkpoints),
    previousPhase: findPreviousPhaseCheckpoint(checkpoints),
  };
}

function humanizeCode(value: string): string {
  const label = value
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  if (!label) return value;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function describeLifecycleForOperator(lifecycle: BellowsLifecycleState): string {
  switch (lifecycle) {
    case "idle":
      return "Bellows is idle and ready for setup.";
    case "configuring":
      return "Session setup is open and draft changes are allowed.";
    case "linking_accounts":
      return "Account linking is in progress.";
    case "inviting":
      return "Invite generation is in progress.";
    case "waiting_for_participants":
      return "Waiting for participants before preflight can proceed.";
    case "preflight_ready":
      return "Participants are ready and Bellows can run preflight.";
    case "preflight_checks":
      return "Preflight is running and checking studio readiness.";
    case "ready_to_start":
      return "Preflight passed; microphones detected and Bellows is ready to start.";
    case "countdown":
      return "Countdown is live and Bellows is preparing the start.";
    case "sync_initializing":
      return "Countdown complete; initializing sync.";
    case "recording_active":
      return "Capture is live for all required participants.";
    case "recording_degraded":
      return "Capture is live with degraded participant coverage.";
    case "recording_offline_local":
      return "Remote capture degraded; Bellows is relying on local recovery.";
    case "recording_rejoining":
      return "A participant is rejoining while Bellows keeps the session alive.";
    case "finalizing_local":
      return "Capture has stopped and local segments are finalizing.";
    case "uploading":
      return "Uploads are in progress.";
    case "upload_degraded":
      return "Uploads are degraded and may need operator attention.";
    case "upload_paused":
      return "Uploads are paused.";
    case "upload_resuming":
      return "Bellows is resuming pending uploads.";
    case "upload_complete_pending_verification":
      return "Uploads complete; verification pending.";
    case "verifying_integrity":
      return "Upload verification is in progress.";
    case "assembling_manifest":
      return "Verification passed; assembling the session package.";
    case "sealing_session":
      return "Session sealing in progress.";
    case "sealed":
      return "Session sealed; recovery state finalized.";
    case "incomplete_capture":
      return "Capture completed with gaps and needs review.";
    case "failed_capture":
      return "Capture failed and recovery review is required.";
    case "archived":
      return "Session archived; operator actions are closed.";
  }
}

function describeActionTitle(actionType: BellowsOperatorDispatchRecord["actionType"]): string {
  switch (actionType) {
    case "HOST_BEGIN_SETUP":
      return "Setup opened";
    case "HOST_UPDATE_DRAFT":
      return "Draft updated";
    case "HOST_BEGIN_ACCOUNT_LINK":
      return "Account linking started";
    case "HOST_BEGIN_INVITES":
      return "Invite generation started";
    case "HOST_WAIT_FOR_PARTICIPANTS":
      return "Waiting for participants";
    case "HOST_RUN_PREFLIGHT":
      return "Preflight started";
    case "HOST_START_SHOW":
      return "Show start accepted";
    case "HOST_ABORT_START":
      return "Countdown canceled";
    case "CAPTURE_STARTED_FOR_ALL_REQUIRED_PARTICIPANTS":
      return "Capture confirmed";
    case "CAPTURE_STARTED_WITH_MISSING_PARTICIPANT":
      return "Capture started degraded";
    case "HOST_END_SESSION":
      return "Session ended";
    case "LOCAL_SEGMENTS_FINALIZED":
      return "Local segments finalized";
    case "BEGIN_INTEGRITY_VERIFICATION":
      return "Verification started";
    case "ARCHIVE_REQUESTED":
      return "Archive requested";
    default:
      return humanizeCode(actionType);
  }
}

function formatStudioShellReport(
  observation: BellowsStudioShellObservation,
): BellowsOperatorReport {
  if (observation.effectType === "run_preflight_checks") {
    if (observation.followUpActionType === "PREFLIGHT_PASSED") {
      return {
        title: "Preflight passed",
        detail: "Microphones detected and the studio is ready to start.",
        stateLabel: "Studio ready",
        technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
      };
    }

    if (observation.followUpActionType === "PREFLIGHT_FAILED") {
      return {
        title: "Preflight blocked",
        detail: "A studio readiness check failed and Bellows returned to setup.",
        stateLabel: "Operator attention needed",
        technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
      };
    }

    return {
      title: "Preflight running",
      detail: "Bellows is checking studio readiness before the countdown.",
      stateLabel: "Waiting for preflight result",
      technical: `${observation.triggerActionType} -> manual`,
    };
  }

  if (observation.followUpActionType === "COUNTDOWN_COMPLETED") {
    return {
      title: "Countdown complete",
      detail: "Bellows is initializing sync and preparing capture.",
      stateLabel: "Sync initialization",
      technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
    };
  }

  return {
    title: "Countdown started",
    detail: "Bellows is holding at countdown until the operator confirms the next move.",
    stateLabel: "Countdown live",
    technical: `${observation.triggerActionType} -> manual`,
  };
}

function formatPersistenceReport(
  observation: BellowsPersistenceObservation,
): BellowsOperatorReport {
  switch (observation.effectType) {
    case "resume_pending_uploads":
      if (observation.followUpActionType === "UPLOADS_COMPLETE") {
        return {
          title: "Upload recovery complete",
          detail: "Pending uploads were resolved and Bellows can continue recovery safely.",
          stateLabel: "Recovery clear",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      if (observation.followUpActionType === "UPLOAD_DEGRADED") {
        return {
          title: "Upload recovery degraded",
          detail: "Bellows resumed uploads, but the session still needs operator attention.",
          stateLabel: "Degraded recovery",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      if (observation.followUpActionType === "UPLOAD_PAUSED") {
        return {
          title: "Upload recovery paused",
          detail: "Bellows paused upload recovery and is waiting for the next operator decision.",
          stateLabel: "Paused",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      return {
        title: "Upload recovery running",
        detail: "Bellows is evaluating pending uploads before it can continue.",
        stateLabel: "Recovery in progress",
        technical: `${observation.triggerActionType} -> manual`,
      };

    case "verify_integrity":
      if (observation.followUpActionType === "INTEGRITY_VERIFIED") {
        return {
          title: "Upload verification passed",
          detail: "Bellows verified the uploaded material and can move toward sealing.",
          stateLabel: "Verification clear",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      if (observation.followUpActionType === "INTEGRITY_PARTIAL_BUT_USABLE") {
        return {
          title: "Upload verification usable with gaps",
          detail: "Bellows found issues, but the session can still proceed toward sealing.",
          stateLabel: "Usable with warnings",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      if (observation.followUpActionType === "INTEGRITY_FATAL") {
        return {
          title: "Upload verification failed",
          detail: "Bellows found a fatal integrity issue and the session is no longer safe to seal cleanly.",
          stateLabel: "Fatal verification issue",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      return {
        title: "Upload verification pending",
        detail: "Bellows is still validating the upload set.",
        stateLabel: "Verification pending",
        technical: `${observation.triggerActionType} -> manual`,
      };

    case "assemble_manifest":
      if (observation.followUpActionType === "MANIFEST_ASSEMBLED") {
        return {
          title: "Session package assembled",
          detail: "Bellows prepared the session manifest and is ready for sealing.",
          stateLabel: "Manifest ready",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      return {
        title: "Manifest assembly pending",
        detail: "Bellows is holding before the session package is finalized.",
        stateLabel: "Waiting for manifest",
        technical: `${observation.triggerActionType} -> manual`,
      };

    case "seal_session_record":
      if (observation.followUpActionType === "SESSION_SEALED") {
        return {
          title: "Session sealed",
          detail: "Bellows finalized the session record and recovery truth is locked.",
          stateLabel: "Sealed",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      if (observation.followUpActionType === "SESSION_SEALED_WITH_GAPS") {
        return {
          title: "Session sealed with gaps",
          detail: "Bellows closed the session, but the final record carries known gaps.",
          stateLabel: "Sealed with warnings",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      if (observation.followUpActionType === "SESSION_SEAL_FAILED_FATAL") {
        return {
          title: "Session sealing failed",
          detail: "Bellows could not complete sealing and the session requires recovery review.",
          stateLabel: "Seal failure",
          technical: `${observation.triggerActionType} -> ${observation.followUpActionType}`,
        };
      }

      return {
        title: "Session sealing in progress",
        detail: "Bellows is finalizing the session record.",
        stateLabel: "Sealing",
        technical: `${observation.triggerActionType} -> manual`,
      };
  }
}

function formatDispatchReport(
  record: BellowsOperatorDispatchRecord,
): BellowsOperatorReport {
  if (record.transitionKind === "rejected") {
    return {
      title: `${describeActionTitle(record.actionType)} blocked`,
      detail: record.rejection?.message ?? "Bellows rejected the action.",
      stateLabel: `Held in ${humanizeCode(record.lifecycleBefore)}`,
      technical:
        `${record.actionSource}:${record.actionType}`
        + (record.rejection?.code ? ` -> ${record.rejection.code}` : ""),
    };
  }

  return {
    title: describeActionTitle(record.actionType),
    detail: describeLifecycleForOperator(record.lifecycleAfter),
    stateLabel: `${humanizeCode(record.lifecycleBefore)} -> ${humanizeCode(record.lifecycleAfter)}`,
    technical:
      record.effectDispatches.length > 0
        ? `${record.actionSource}:${record.actionType} | ${record.effectDispatches.map((dispatch) => `${dispatch.adapter}:${dispatch.effectType}`).join(", ")}`
        : `${record.actionSource}:${record.actionType}`,
  };
}

function canArchive(lifecycle: BellowsLifecycleState): boolean {
  return lifecycle === "sealed"
    || lifecycle === "incomplete_capture"
    || lifecycle === "failed_capture";
}

function canEndSession(lifecycle: BellowsLifecycleState): boolean {
  return lifecycle === "recording_active"
    || lifecycle === "recording_degraded"
    || lifecycle === "recording_offline_local"
    || lifecycle === "recording_rejoining";
}

function formatDispatchSummary(
  snapshot: BellowsOperatorConsoleSnapshot,
  options: { checkpointStored?: boolean } = {},
): string {
  const last = snapshot.dispatchLog.at(-1);

  if (!last) {
    return "Bellows is waiting for the first operator action.";
  }

  if (last.transitionKind === "rejected") {
    const base = `${describeActionTitle(last.actionType)} blocked: ${last.rejection?.message ?? "Unknown rejection."}`;
    return options.checkpointStored ? `${base} Checkpoint stored; recovery safe.` : base;
  }

  const base = describeLifecycleForOperator(last.lifecycleAfter);
  return options.checkpointStored ? `${base} Checkpoint stored; recovery safe.` : base;
}

export default function BellowsStandalone() {
  const repository = useMemo<NurseryBellowsTongsRepository>(
    () => createBellowsTongsRepository(supabase),
    [],
  );
  const location = useLocation();
  const navigate = useNavigate();
  const routeContext = useMemo(
    () => parseForgeRouteContext(location.search),
    [location.search],
  );

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [hasLoadedWorkspaces, setHasLoadedWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [storedWorkspaceId, setStoredWorkspaceId] = useState<string | null>(() => readStoredWorkspaceId());

  const [runtimeShell, setRuntimeShell] = useState<BellowsRuntimeShell | null>(null);
  const [snapshot, setSnapshot] = useState<BellowsOperatorConsoleSnapshot | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Bellows is waiting for persisted runtime truth.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bootstrapMessage, setBootstrapMessage] = useState("Bellows is waiting for workspace context.");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const pendingLoadModeRef = useRef<"auto" | "forceFresh">("auto");
  const pendingReloadSummaryRef = useRef<string | null>(null);
  const [recoveryTargets, setRecoveryTargets] = useState<BellowsRecoveryRestoreTargets>({
    latest: null,
    baseline: null,
    previousPhase: null,
  });
  const [loadingRecoveryTargets, setLoadingRecoveryTargets] = useState(false);
  const [recoveryTargetsError, setRecoveryTargetsError] = useState<string | null>(null);
  const [joinLinks, setJoinLinks] = useState<readonly BellowsTongsJoinLinkRecord[]>([]);
  const [loadingJoinLinks, setLoadingJoinLinks] = useState(false);
  const [joinLinksError, setJoinLinksError] = useState<string | null>(null);
  const [inviteStatusMessage, setInviteStatusMessage] = useState(
    "Issue a join link to invite S2, G1, or G2 into the live Bellows session.",
  );
  const [invitePresenceEntries, setInvitePresenceEntries] = useState<readonly BellowsGuestPresencePayload[]>([]);
  const [invitePresenceError, setInvitePresenceError] = useState<string | null>(null);
  const [joinLinkUrls, setJoinLinkUrls] = useState<Record<string, string>>({});

  const viewerLabel = describeUser(authUser);
  const isAuthenticated = Boolean(authUser);
  const accessibleRouteWorkspaceId = useMemo(
    () => isAccessibleWorkspaceId(routeContext.workspaceId, workspaces, hasLoadedWorkspaces),
    [hasLoadedWorkspaces, routeContext.workspaceId, workspaces],
  );
  const accessibleStoredWorkspaceId = useMemo(
    () => (isAuthenticated
      ? isAccessibleWorkspaceId(storedWorkspaceId, workspaces, hasLoadedWorkspaces)
      : null),
    [hasLoadedWorkspaces, isAuthenticated, storedWorkspaceId, workspaces],
  );
  const workspaceId = accessibleRouteWorkspaceId
    ?? accessibleStoredWorkspaceId
    ?? (hasLoadedWorkspaces ? workspaces[0]?.id ?? null : null);
  const workspaceName = workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? null;
  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`;
  const backHref = buildForgeRouteHref("/app", {
    workspaceId,
  });

  useEffect(() => {
    let active = true;

    const applyUser = (user: User | null) => {
      if (!active) return;
      setAuthUser(user);
    };

    void supabase.auth.getUser().then(({ data }) => {
      applyUser(data.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser?.id) {
      setWorkspaces([]);
      setWorkspaceError(null);
      setHasLoadedWorkspaces(true);
      return;
    }

    let active = true;
    setLoadingWorkspaces(true);
    setHasLoadedWorkspaces(false);
    setWorkspaceError(null);

    void listMyWorkspaces()
      .then((nextWorkspaces) => {
        if (!active) return;
        setWorkspaces(nextWorkspaces);
      })
      .catch((error) => {
        if (!active) return;
        setWorkspaceError(getErrorMessage(error, "Bellows could not load workspace context."));
      })
      .finally(() => {
        if (!active) return;
        setLoadingWorkspaces(false);
        setHasLoadedWorkspaces(true);
      });

    return () => {
      active = false;
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncWorkspaceContext = () => {
      setStoredWorkspaceId(readStoredWorkspaceId());
    };

    window.addEventListener("storage", syncWorkspaceContext);
    window.addEventListener("focus", syncWorkspaceContext);
    return () => {
      window.removeEventListener("storage", syncWorkspaceContext);
      window.removeEventListener("focus", syncWorkspaceContext);
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    persistStoredWorkspaceId(workspaceId);
    setStoredWorkspaceId((current) => current === workspaceId ? current : workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;

    const nextHref = buildForgeRouteHref(location.pathname, {
      search: location.search,
      workspaceId,
    });
    const nextSearch = searchFromHref(nextHref);
    if (nextSearch === location.search) return;

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch,
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, workspaceId]);

  useEffect(() => {
    if (!authUser?.id) {
      setRuntimeShell(null);
      setSnapshot(null);
      setLoadingRuntime(false);
      setBootstrapError(null);
      setBootstrapMessage("Sign in to load Bellows from Tongs.");
      return;
    }

    if (!hasLoadedWorkspaces && !workspaceError) {
      setRuntimeShell(null);
      setSnapshot(null);
      setLoadingRuntime(false);
      setBootstrapError(null);
      setBootstrapMessage("Loading workspace context...");
      return;
    }

    if (!workspaceId) {
      setRuntimeShell(null);
      setSnapshot(null);
      setLoadingRuntime(false);
      setBootstrapError(null);
      setBootstrapMessage(
        loadingWorkspaces
          ? "Loading workspace context..."
          : workspaceError
          ? workspaceError
          : "Bellows needs an active workspace before it can load runtime truth.",
      );
      return;
    }

    let active = true;
    const workspace = asWorkspaceId(workspaceId);
    const hostUserId = asUserId(authUser.id);
    const loadMode = pendingLoadModeRef.current;
    pendingLoadModeRef.current = "auto";

    setLoadingRuntime(true);
    setBusyAction(null);
    setErrorMessage(null);
    setBootstrapError(null);
    setBootstrapMessage(
      loadMode === "forceFresh"
        ? "Creating a fresh Bellows session in Tongs..."
        : "Loading Bellows from Tongs...",
    );

    void (async () => {
      try {
        let session: BellowsSession;
        let sessionOriginLabel = "Tongs resume";
        let nextStatusMessage = "Rehydrated Bellows from Tongs.";

        if (loadMode === "forceFresh") {
          session = createSeedSession({ workspaceId: workspace, hostUserId });
          await repository.createSessionHeader({ session });
          await repository.appendRecoveryCheckpoint({
            session,
            checkpointKind: "session_created",
            triggerActionSource: "engine",
            triggerActionType: "SESSION_CREATED",
            actorType: "engine",
            actorId: "engine",
            occurredAt: new Date().toISOString(),
            delta: {
              bootstrapMode: "forceFresh",
            },
          });
          sessionOriginLabel = "Fresh session";
          nextStatusMessage = "Created a fresh Bellows session in Tongs. Checkpoint stored; recovery safe.";
        } else {
          const openBundle = await repository.loadMostRecentOpenSession(workspace);

          if (openBundle) {
            if (!supportsBellowsRehydration(openBundle)) {
              throw new Error(buildBlockedRecoveryMessage({
                scopeLabel: "Active",
                sessionId: openBundle.header.sessionId,
                lifecycle: openBundle.header.lifecycleState,
                checkpointId: openBundle.header.latestCheckpointId,
                checkpointSchemaVersion: openBundle.latestCheckpoint?.snapshotSchemaVersion ?? null,
              }));
            }

            session = openBundle.latestCheckpoint.sessionSnapshot;
            sessionOriginLabel = "Active resume";
            nextStatusMessage = `Rehydrated Bellows from checkpoint ${openBundle.latestCheckpoint.checkpointId}.`;
          } else {
            const latestBundle = await repository.loadMostRecentSession(workspace);

            if (!latestBundle) {
              session = createSeedSession({ workspaceId: workspace, hostUserId });
              await repository.createSessionHeader({ session });
              await repository.appendRecoveryCheckpoint({
                session,
                checkpointKind: "session_created",
                triggerActionSource: "engine",
                triggerActionType: "SESSION_CREATED",
                actorType: "engine",
                actorId: "engine",
                occurredAt: new Date().toISOString(),
                delta: {
                  bootstrapMode: "auto_create",
                },
              });
              sessionOriginLabel = "Fresh session";
              nextStatusMessage = "Created a new Bellows session in Tongs. Checkpoint stored; recovery safe.";
            } else {
              if (!supportsBellowsRehydration(latestBundle)) {
                throw new Error(buildBlockedRecoveryMessage({
                  scopeLabel: "Latest",
                  sessionId: latestBundle.header.sessionId,
                  lifecycle: latestBundle.header.lifecycleState,
                  checkpointId: latestBundle.header.latestCheckpointId,
                  checkpointSchemaVersion: latestBundle.latestCheckpoint?.snapshotSchemaVersion ?? null,
                }));
              }

              session = latestBundle.latestCheckpoint.sessionSnapshot;
              sessionOriginLabel = isBellowsTerminalLifecycle(latestBundle.header.lifecycleState)
                ? "Terminal load"
                : "Latest session";
              nextStatusMessage = isBellowsTerminalLifecycle(latestBundle.header.lifecycleState)
                ? "Loaded the latest terminal Bellows session from Tongs."
                : "Loaded the latest Bellows session from Tongs.";
            }
          }
        }

        if (pendingReloadSummaryRef.current) {
          sessionOriginLabel = "Recovery restore";
          nextStatusMessage = pendingReloadSummaryRef.current;
          pendingReloadSummaryRef.current = null;
        }

        const harnessState = createHarnessState(session);
        const nextSnapshot = harnessState.harness.getSnapshot();

        if (!active) return;

        setRuntimeShell({
          ...harnessState,
          sessionOriginLabel,
        });
        setSnapshot(nextSnapshot);
        setDraftTitle(nextSnapshot.session.draft.title);
        setStatusMessage(nextStatusMessage);
        setBootstrapMessage(nextStatusMessage);
      } catch (error) {
        if (!active) return;
        setRuntimeShell(null);
        setSnapshot(null);
        setBootstrapError(getErrorMessage(error, "Bellows could not load persisted runtime truth."));
      } finally {
        if (!active) return;
        setLoadingRuntime(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    authUser?.id,
    hasLoadedWorkspaces,
    loadingWorkspaces,
    reloadToken,
    repository,
    workspaceError,
    workspaceId,
  ]);

  const session = snapshot?.session ?? null;

  useEffect(() => {
    if (!session) {
      setRecoveryTargets({
        latest: null,
        baseline: null,
        previousPhase: null,
      });
      setRecoveryTargetsError(null);
      setLoadingRecoveryTargets(false);
      return;
    }

    let active = true;
    setLoadingRecoveryTargets(true);
    setRecoveryTargetsError(null);

    void repository.loadRecoveryStream(session.sessionId)
      .then((checkpoints) => {
        if (!active) return;
        setRecoveryTargets(deriveRecoveryRestoreTargets(checkpoints));
      })
      .catch((error) => {
        if (!active) return;
        setRecoveryTargets({
          latest: null,
          baseline: null,
          previousPhase: null,
        });
        setRecoveryTargetsError(getErrorMessage(error, "Bellows could not load recovery history."));
      })
      .finally(() => {
        if (!active) return;
        setLoadingRecoveryTargets(false);
      });

    return () => {
      active = false;
    };
  }, [repository, session?.sessionId, session?.events.length]);

  useEffect(() => {
    if (!session) {
      setJoinLinks([]);
      setJoinLinksError(null);
      setLoadingJoinLinks(false);
      setJoinLinkUrls({});
      return;
    }

    let active = true;
    setLoadingJoinLinks(true);
    setJoinLinksError(null);
    setJoinLinkUrls(readBellowsHostInviteUrls(session.sessionId));

    void repository.loadJoinLinks(session.sessionId)
      .then((links) => {
        if (!active) return;
        setJoinLinks(links);
      })
      .catch((error) => {
        if (!active) return;
        setJoinLinks([]);
        setJoinLinksError(getErrorMessage(error, "Bellows could not load join links."));
      })
      .finally(() => {
        if (!active) return;
        setLoadingJoinLinks(false);
      });

    return () => {
      active = false;
    };
  }, [repository, session?.sessionId]);

  useEffect(() => {
    if (!session) {
      setInvitePresenceEntries([]);
      setInvitePresenceError(null);
      return;
    }

    let active = true;
    const channel = supabase.channel(`bellows:session:${session.sessionId}`) as any;

    const syncPresence = () => {
      if (!active) return;
      setInvitePresenceEntries(listBellowsGuestPresencePayloads(channel.presenceState?.() ?? {}));
    };

    setInvitePresenceError(null);
    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("presence", { event: "join" }, syncPresence);
    channel.on("presence", { event: "leave" }, syncPresence);

    channel.subscribe((status: string) => {
      if (!active) return;

      if (status === "SUBSCRIBED") {
        syncPresence();
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setInvitePresenceEntries([]);
        setInvitePresenceError("Bellows could not observe guest presence on the live session channel.");
      }
    });

    return () => {
      active = false;
      void channel.unsubscribe();
    };
  }, [session?.sessionId]);

  async function persistRuntimeTransition(
    repositoryImpl: NurseryBellowsTongsSessionRepository,
    action: BellowsSessionAction,
    result: BellowsRuntimeDispatchResult,
  ) {
    const session = result.currentState;

    await repositoryImpl.appendRecoveryCheckpoint({
      session,
      checkpointKind: classifyCheckpointKind(action, session),
      triggerActionSource: action.source,
      triggerActionType: action.type,
      actorType: resolveActorType(session, action),
      actorId: String(action.meta.actorId),
      offsetMs: action.meta.offsetMs,
      occurredAt: new Date().toISOString(),
      delta: buildCheckpointDelta(action, result),
    });

    await repositoryImpl.syncSessionHeader({
      sessionId: session.sessionId,
      title: session.draft.title,
      mode: session.draft.mode,
      sessionType: session.draft.sessionType,
      authority: session.authorityState,
    });
  }

  function triggerRuntimeReload(mode: "auto" | "forceFresh") {
    pendingLoadModeRef.current = mode;
    setReloadToken((value) => value + 1);
  }

  async function runRecoveryRestore(
    actionKey: "reset-baseline" | "step-back-phase",
    target: BellowsTongsRecoveryCheckpointRecord | null,
  ) {
    if (!session || !activeRuntime) return;

    setBusyAction(actionKey);
    setErrorMessage(null);

    try {
      if (!target) {
        throw new Error(
          actionKey === "reset-baseline"
            ? "Bellows has no earlier baseline checkpoint to restore."
            : "Bellows has no earlier lifecycle phase to restore.",
        );
      }

      const restoredCheckpoint = await repository.appendRecoveryCheckpoint({
        session: target.sessionSnapshot,
        checkpointKind: "recovery_checkpoint",
        triggerActionSource: "recovery",
        triggerActionType:
          actionKey === "reset-baseline"
            ? "RESTORE_BASELINE_CHECKPOINT"
            : "RESTORE_PREVIOUS_LIFECYCLE_PHASE",
        actorType: "host",
        actorId: activeRuntime.hostParticipantId,
        occurredAt: new Date().toISOString(),
        delta: {
          recoveryMode:
            actionKey === "reset-baseline"
              ? "baseline_reset"
              : "step_back_phase",
          restoredFromCheckpointId: target.checkpointId,
          restoredFromSequenceNo: target.sequenceNo,
          restoredFromLifecycle: target.lifecycleState,
          latestCheckpointBeforeRestore: recoveryTargets.latest?.checkpointId ?? null,
          latestLifecycleBeforeRestore: recoveryTargets.latest?.lifecycleState ?? session.machineState.lifecycle,
        },
      });

      pendingReloadSummaryRef.current =
        actionKey === "reset-baseline"
          ? `Restored Bellows to baseline from checkpoint ${target.checkpointId}. Checkpoint ${restoredCheckpoint.checkpointId} stored; recovery safe.`
          : `Stepped Bellows back to ${humanizeCode(target.lifecycleState)} from checkpoint ${target.checkpointId}. Checkpoint ${restoredCheckpoint.checkpointId} stored; recovery safe.`;

      triggerRuntimeReload("auto");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Bellows recovery restore failed."));
    } finally {
      setBusyAction(null);
    }
  }

  async function issueJoinLink(roleCode: BellowsInviteRoleCode) {
    if (!session || !authUser?.id) return;

    setBusyAction(`invite-issue:${roleCode}`);
    setJoinLinksError(null);
    setInviteStatusMessage(`Issuing ${describeInviteRole(roleCode)} link...`);

    try {
      const currentActiveLinks = joinLinks.filter((link) =>
        link.roleCode === roleCode && !link.revokedAt && link.useCount < link.maxUses);

      const created = await repository.createJoinLink({
        sessionId: session.sessionId,
        roleCode,
        maxUses: 1,
        expiresHours: 24,
        createdByUserId: authUser.id,
      });

      const joinUrl = buildBellowsJoinHref(session.sessionId, created.token);
      setJoinLinkUrls(persistBellowsHostInviteUrl({
        joinLinkId: created.joinLink.joinLinkId,
        sessionId: session.sessionId,
        roleCode,
        joinUrl,
      }));

      const priorLinkIds = currentActiveLinks
        .map((link) => link.joinLinkId)
        .filter((joinLinkId) => joinLinkId !== created.joinLink.joinLinkId);

      const revocations = await Promise.allSettled(
        priorLinkIds.map((joinLinkId) => repository.revokeJoinLink(joinLinkId)),
      );

      const revokedCount = revocations.reduce((count, result) => {
        return count + (result.status === "fulfilled" && result.value ? 1 : 0);
      }, 0);

      const refreshedLinks = await repository.loadJoinLinks(session.sessionId);
      setJoinLinks(refreshedLinks);

      setInviteStatusMessage(
        revokedCount > 0
          ? `${describeInviteRole(roleCode)} link issued. ${revokedCount} earlier active invite${revokedCount === 1 ? "" : "s"} for this seat were revoked.`
          : `${describeInviteRole(roleCode)} link issued. Copy it from this panel before you leave this tab.`,
      );
    } catch (error) {
      setJoinLinksError(getErrorMessage(error, "Bellows could not issue a join link."));
    } finally {
      setBusyAction(null);
    }
  }

  async function copyJoinLink(link: BellowsTongsJoinLinkRecord | null) {
    if (!link) return;

    const joinUrl = joinLinkUrls[link.joinLinkId];
    if (!joinUrl) {
      setJoinLinksError(
        "Bellows can only re-copy links that were issued in this tab. Create a replacement link to issue a fresh secret.",
      );
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setJoinLinksError("Bellows could not access the clipboard in this browser context.");
      return;
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      setJoinLinksError(null);
      setInviteStatusMessage(`${describeInviteRole(link.roleCode as BellowsInviteRoleCode)} link copied to the clipboard.`);
    } catch (error) {
      setJoinLinksError(getErrorMessage(error, "Bellows could not copy this join link."));
    }
  }

  async function revokeJoinLink(link: BellowsTongsJoinLinkRecord | null) {
    if (!session || !link || link.revokedAt) return;

    setBusyAction(`invite-revoke:${link.joinLinkId}`);
    setJoinLinksError(null);
    setInviteStatusMessage(`Revoking ${describeInviteRole(link.roleCode as BellowsInviteRoleCode)} link...`);

    try {
      await repository.revokeJoinLink(link.joinLinkId);
      const refreshedLinks = await repository.loadJoinLinks(session.sessionId);
      setJoinLinks(refreshedLinks);
      setInviteStatusMessage(`${describeInviteRole(link.roleCode as BellowsInviteRoleCode)} link revoked.`);
    } catch (error) {
      setJoinLinksError(getErrorMessage(error, "Bellows could not revoke this join link."));
    } finally {
      setBusyAction(null);
    }
  }

  async function runAction(actionKey: string, buildAction: () => BellowsSessionAction) {
    if (!runtimeShell || !snapshot) return;

    setBusyAction(actionKey);
    setErrorMessage(null);

    let result: BellowsRuntimeDispatchResult | null = null;

    try {
      const action = buildAction();
      result = await runtimeShell.harness.dispatch(action);
      await persistRuntimeTransition(repository, action, result);

      const nextSnapshot = runtimeShell.harness.getSnapshot();
      setSnapshot(nextSnapshot);
      setDraftTitle(nextSnapshot.session.draft.title);
      setStatusMessage(formatDispatchSummary(nextSnapshot, { checkpointStored: true }));
    } catch (error) {
      const message = getErrorMessage(error, "Bellows action failed.");
      if (result) {
        setErrorMessage(`${message} Reloading canonical Tongs state.`);
        triggerRuntimeReload("auto");
      } else {
        setErrorMessage(message);
      }
    } finally {
      setBusyAction(null);
    }
  }

  const activeRuntime = session && runtimeShell ? runtimeShell : null;
  const lifecycle = session?.machineState.lifecycle ?? "idle";
  const terminal = session ? canArchive(lifecycle) : false;
  const controlsDisabled = busyAction !== null || loadingRuntime || !activeRuntime;
  const canStartFreshSession = Boolean(
    session && isBellowsTerminalLifecycle(session.machineState.lifecycle),
  );
  const baselineTarget = recoveryTargets.baseline;
  const previousPhaseTarget = recoveryTargets.previousPhase;
  const canResetToBaseline = Boolean(
    baselineTarget
      && recoveryTargets.latest
      && baselineTarget.checkpointId !== recoveryTargets.latest.checkpointId,
  );
  const canStepBackPhase = Boolean(previousPhaseTarget);
  const canIssueInvites = Boolean(activeRuntime) && !terminal;
  const inviteSeats = useMemo<readonly BellowsHostInviteSeat[]>(() => {
    return BELLOWS_INVITE_ROLE_CODES.map((roleCode) => {
      const link = selectInviteLinkForRole(joinLinks, roleCode);
      const liveGuests = invitePresenceEntries.filter((entry) => entry.roleCode === roleCode);
      const guestStatus = describeGuestInviteStatus({
        roleCode,
        link,
        liveGuests,
      });

      return {
        roleCode,
        roleLabel: describeInviteRole(roleCode),
        link,
        liveGuests,
        guestStatusLabel: guestStatus.label,
        guestStatusDetail: guestStatus.detail,
        copyReady: Boolean(
          link
            && !link.revokedAt
            && link.useCount < link.maxUses
            && joinLinkUrls[link.joinLinkId],
        ),
        joinUrl: link ? joinLinkUrls[link.joinLinkId] ?? null : null,
      };
    });
  }, [invitePresenceEntries, joinLinks, joinLinkUrls]);
  const manualSnapshot = useMemo(
    () => session
      ? JSON.stringify(
        {
          lifecycle: session.machineState.lifecycle,
          recordingState: session.recordingState,
          broadcastState: session.broadcastState,
          uploadState: session.uploadState,
          sealState: session.sealState,
          outcome: session.machineState.outcome,
          integrityFlags: session.integrityFlags,
          eventCount: session.events.length,
        },
        null,
        2,
      )
      : "",
    [session],
  );

  return (
    <div className="bellows-standalone">
      <header className="bellows-standalone__header">
        <div>
          <div className="bellows-standalone__eyebrow">Forge Tool Surface</div>
          <h1 className="bellows-standalone__title">Bellows</h1>
          <p className="bellows-standalone__subtitle">
            Thin operator console over the real Bellows runtime, rehydrated from canonical Tongs recovery truth.
          </p>
        </div>

        <div className="bellows-standalone__header-actions">
          <span className="bellows-standalone__pill">
            Operator: <strong>{viewerLabel}</strong>
          </span>
          <span className="bellows-standalone__pill">
            Workspace: <strong>{workspaceName ?? workspaceId ?? "unresolved"}</strong>
          </span>
          {session ? (
            <>
              <span className="bellows-standalone__pill">
                Lifecycle: <strong>{session.machineState.lifecycle}</strong>
              </span>
              <span className="bellows-standalone__pill">
                Events: <strong>{session.events.length}</strong>
              </span>
            </>
          ) : null}
          <Link to={backHref} className="bellows-standalone__back-link">
            Back to Forge
          </Link>
        </div>
      </header>

      {!isAuthenticated ? (
        <main className="bellows-standalone__main">
          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Sign In Required</h2>
                <p>Bellows now reads canonical recovery truth from Tongs, so this surface requires an authenticated workspace session.</p>
              </div>
              <Link to={loginHref} className="bellows-standalone__back-link">
                Sign In
              </Link>
            </div>
            <div className="bellows-standalone__status-banner" data-state="error">
              Sign in to load Bellows from Tongs.
            </div>
          </section>
        </main>
      ) : !workspaceId ? (
        <main className="bellows-standalone__main">
          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Workspace Required</h2>
                <p>Bellows needs a valid Forge workspace before it can rehydrate a session.</p>
              </div>
            </div>
            <div className="bellows-standalone__status-banner" data-state={workspaceError ? "error" : "ok"}>
              {workspaceError ?? bootstrapMessage}
            </div>
          </section>
        </main>
      ) : !session || !activeRuntime ? (
        <main className="bellows-standalone__main">
          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Runtime Bootstrap</h2>
                <p>Bellows is resolving persisted session truth for the active workspace.</p>
              </div>
              <button
                type="button"
                disabled={loadingRuntime || loadingWorkspaces}
                onClick={() => triggerRuntimeReload("auto")}
              >
                Reload from Tongs
              </button>
            </div>
            <div className="bellows-standalone__status-banner" data-state={bootstrapError ? "error" : "ok"}>
              {bootstrapError ?? bootstrapMessage}
            </div>
          </section>
        </main>
      ) : (
        <main className="bellows-standalone__main">
          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Runtime Status</h2>
                <p>Bellows is running real engine transitions over a runtime restored from Tongs-backed recovery checkpoints.</p>
              </div>
              <div className="bellows-standalone__header-actions">
                <span className="bellows-standalone__pill">
                  Source: <strong>{activeRuntime.sessionOriginLabel}</strong>
                </span>
                <button
                  type="button"
                  disabled={loadingRuntime}
                  onClick={() => triggerRuntimeReload("auto")}
                >
                  Reload from Tongs
                </button>
                <button
                  type="button"
                  disabled={loadingRuntime || busyAction !== null || !canStartFreshSession}
                  onClick={() => triggerRuntimeReload("forceFresh")}
                >
                  Start New Session
                </button>
              </div>
            </div>

            <div className="bellows-standalone__status-banner" data-state={errorMessage ? "error" : "ok"}>
              {errorMessage ?? statusMessage}
            </div>

            <div className="bellows-standalone__state-grid">
              <article className="bellows-standalone__state-card">
                <span>Recording</span>
                <strong>{session.recordingState}</strong>
              </article>
              <article className="bellows-standalone__state-card">
                <span>Broadcast</span>
                <strong>{session.broadcastState}</strong>
              </article>
              <article className="bellows-standalone__state-card">
                <span>Upload</span>
                <strong>{session.uploadState}</strong>
              </article>
              <article className="bellows-standalone__state-card">
                <span>Seal</span>
                <strong>{session.sealState}</strong>
              </article>
              <article className="bellows-standalone__state-card">
                <span>Outcome</span>
                <strong>{session.machineState.outcome ?? "in_progress"}</strong>
              </article>
              <article className="bellows-standalone__state-card">
                <span>Integrity</span>
                <strong>{session.integrityFlags.length > 0 ? session.integrityFlags.join(", ") : "clean"}</strong>
              </article>
            </div>
          </section>

          <section className="bellows-standalone__panel">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Recovery Restore</h2>
                <p>Append-only restore: Bellows writes a new canonical recovery checkpoint from an earlier trusted snapshot. Existing recovery history is never rewritten.</p>
              </div>
            </div>

            <div className="bellows-standalone__status-banner" data-state={recoveryTargetsError ? "error" : "ok"}>
              {recoveryTargetsError
                ?? (loadingRecoveryTargets
                  ? "Loading recovery history..."
                  : canResetToBaseline || canStepBackPhase
                  ? "Bellows recovery controls are ready."
                  : "Bellows is already at baseline, or no earlier lifecycle phase is available.")}
            </div>

            <div className="bellows-standalone__control-grid">
              <button
                type="button"
                disabled={controlsDisabled || loadingRecoveryTargets || !canStepBackPhase}
                onClick={() => void runRecoveryRestore("step-back-phase", previousPhaseTarget)}
              >
                Restore Earlier Phase
              </button>
              <button
                type="button"
                disabled={controlsDisabled || loadingRecoveryTargets || !canResetToBaseline}
                onClick={() => void runRecoveryRestore("reset-baseline", baselineTarget)}
              >
                Append Baseline Restore
              </button>
              <button
                type="button"
                disabled={loadingRuntime}
                onClick={() => triggerRuntimeReload("auto")}
              >
                Reload Persisted Truth
              </button>
            </div>

            <ul className="bellows-standalone__snapshot-list">
              <li>
                <strong>Latest checkpoint</strong>
                <span>{recoveryTargets.latest?.checkpointId ?? "Unavailable"}</span>
                <span>{recoveryTargets.latest ? humanizeCode(recoveryTargets.latest.lifecycleState) : "No supported checkpoint"}</span>
              </li>
              <li>
                <strong>Previous phase target</strong>
                <span>{previousPhaseTarget?.checkpointId ?? "Unavailable"}</span>
                <span>{previousPhaseTarget ? humanizeCode(previousPhaseTarget.lifecycleState) : "No earlier lifecycle phase"}</span>
              </li>
              <li>
                <strong>Baseline target</strong>
                <span>{baselineTarget?.checkpointId ?? "Unavailable"}</span>
                <span>{baselineTarget ? humanizeCode(baselineTarget.lifecycleState) : "No baseline checkpoint"}</span>
              </li>
            </ul>
          </section>

          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Invite / Join Links</h2>
                <p>Host-side invite management over canonical Tongs join links and live Bellows guest presence.</p>
              </div>
            </div>

            <div className="bellows-standalone__status-banner" data-state={joinLinksError || invitePresenceError ? "error" : "ok"}>
              {joinLinksError
                ?? invitePresenceError
                ?? (loadingJoinLinks
                  ? "Loading canonical join links..."
                  : canIssueInvites
                  ? inviteStatusMessage
                  : "Invite issuance is unavailable once the Bellows session reaches a terminal state.")}
            </div>

            <ul className="bellows-standalone__invite-list">
              {inviteSeats.map((seat) => (
                <li key={seat.roleCode} className="bellows-standalone__invite-card">
                  <div className="bellows-standalone__invite-header">
                    <div>
                      <strong>{seat.roleLabel}</strong>
                      <span>{seat.guestStatusLabel}</span>
                    </div>
                    <div className="bellows-standalone__invite-actions">
                      <button
                        type="button"
                        disabled={loadingJoinLinks || busyAction !== null || !canIssueInvites}
                        onClick={() => void issueJoinLink(seat.roleCode)}
                      >
                        {seat.link && !seat.link.revokedAt && seat.link.useCount < seat.link.maxUses
                          ? "Replace Link"
                          : "Issue Link"}
                      </button>
                      <button
                        type="button"
                        disabled={!seat.copyReady}
                        onClick={() => void copyJoinLink(seat.link)}
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        disabled={!seat.link || Boolean(seat.link.revokedAt) || busyAction !== null}
                        onClick={() => void revokeJoinLink(seat.link)}
                      >
                        Revoke Link
                      </button>
                    </div>
                  </div>

                  <p className="bellows-standalone__invite-note">{seat.guestStatusDetail}</p>

                  <dl className="bellows-standalone__invite-meta">
                    <div>
                      <dt>Link State</dt>
                      <dd>{describeJoinLinkLifecycle(seat.link)}</dd>
                    </div>
                    <div>
                      <dt>Join Link Id</dt>
                      <dd>{seat.link?.joinLinkId ?? "Not issued"}</dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>{formatTimestamp(seat.link?.expiresAt ?? null)}</dd>
                    </div>
                    <div>
                      <dt>Uses</dt>
                      <dd>{seat.link ? `${seat.link.useCount}/${seat.link.maxUses}` : "Not issued"}</dd>
                    </div>
                    <div>
                      <dt>Live Guest</dt>
                      <dd>{seat.liveGuests.length > 0 ? seat.liveGuests.map((guest) => guest.displayName).join(", ") : "No live guest"}</dd>
                    </div>
                    <div>
                      <dt>Copy State</dt>
                      <dd>{seat.joinUrl ? "Reusable in this tab" : seat.link ? "Create or replace to issue a fresh secret" : "No secret issued yet"}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <section className="bellows-standalone__panel">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Host Controls</h2>
                <p>Operator actions dispatch through the Bellows runtime, then checkpoint back into Tongs.</p>
              </div>
            </div>

            <label className="bellows-standalone__label" htmlFor="bellows-draft-title">
              Draft title
            </label>
            <div className="bellows-standalone__draft-row">
              <input
                id="bellows-draft-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Bellows session title"
              />
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "configuring"}
                onClick={() => void runAction(
                  "update-draft",
                  () => createHostAction(
                    "HOST_UPDATE_DRAFT",
                    {
                      draft: {
                        ...session.draft,
                        title: draftTitle.trim() || session.draft.title,
                      },
                    },
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Apply Draft
              </button>
            </div>

            <div className="bellows-standalone__control-grid">
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "idle"}
                onClick={() => void runAction(
                  "begin-setup",
                  () => createHostAction(
                    "HOST_BEGIN_SETUP",
                    {},
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Begin Setup
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "configuring"}
                onClick={() => void runAction(
                  "wait-for-participants",
                  () => createHostAction(
                    "HOST_WAIT_FOR_PARTICIPANTS",
                    {},
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Wait for Participants
              </button>
              <button
                type="button"
                disabled={controlsDisabled || (lifecycle !== "waiting_for_participants" && lifecycle !== "preflight_ready")}
                onClick={() => void runAction(
                  "run-preflight",
                  () => createHostAction(
                    "HOST_RUN_PREFLIGHT",
                    {},
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Run Preflight
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "ready_to_start"}
                onClick={() => void runAction(
                  "start-show",
                  () => createHostAction(
                    "HOST_START_SHOW",
                    {},
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Start Show
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "countdown"}
                onClick={() => void runAction(
                  "abort-start",
                  () => createHostAction(
                    "HOST_ABORT_START",
                    {},
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Abort Countdown
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "sync_initializing"}
                onClick={() => void runAction(
                  "confirm-capture",
                  () => createEngineAction(
                    "CAPTURE_STARTED_FOR_ALL_REQUIRED_PARTICIPANTS",
                    {},
                    "system",
                    "capture",
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Confirm Capture Ready
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "sync_initializing"}
                onClick={() => void runAction(
                  "confirm-capture-degraded",
                  () => createEngineAction(
                    "CAPTURE_STARTED_WITH_MISSING_PARTICIPANT",
                    {},
                    "system",
                    "capture",
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Confirm Capture Degraded
              </button>
              <button
                type="button"
                disabled={controlsDisabled || !canEndSession(lifecycle)}
                onClick={() => void runAction(
                  "end-session",
                  () => createHostAction(
                    "HOST_END_SESSION",
                    {},
                    activeRuntime.hostParticipantId,
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                End Session
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "finalizing_local"}
                onClick={() => void runAction(
                  "finalize-local-segments",
                  () => createEngineAction(
                    "LOCAL_SEGMENTS_FINALIZED",
                    {},
                    "system",
                    "capture",
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Finalize Local Segments
              </button>
              <button
                type="button"
                disabled={controlsDisabled || lifecycle !== "upload_complete_pending_verification"}
                onClick={() => void runAction(
                  "begin-integrity-verification",
                  () => createEngineAction(
                    "BEGIN_INTEGRITY_VERIFICATION",
                    {},
                    "engine",
                    "engine",
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Begin Integrity Verification
              </button>
              <button
                type="button"
                disabled={controlsDisabled || !terminal}
                onClick={() => void runAction(
                  "archive-session",
                  () => createEngineAction(
                    "ARCHIVE_REQUESTED",
                    {},
                    "engine",
                    "engine",
                    activeRuntime.nextOffsetMs,
                  ),
                )}
              >
                Archive Session
              </button>
            </div>
          </section>

          <section className="bellows-standalone__panel">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Studio Reports</h2>
                <p>Stubbed shell activity translated into operator-facing studio language.</p>
              </div>
            </div>
            <ul className="bellows-standalone__log">
              {snapshot.studioShellObservations.length === 0 ? (
                <li className="bellows-standalone__log-empty">No studio reports yet.</li>
              ) : snapshot.studioShellObservations.map((observation, index) => {
                const report = formatStudioShellReport(observation);
                return (
                  <li key={`${observation.effectType}-${index}`} className="bellows-standalone__log-item">
                    <strong className="bellows-standalone__log-title">{report.title}</strong>
                    <span className="bellows-standalone__log-detail">{report.detail}</span>
                    <span className="bellows-standalone__log-meta">{report.stateLabel}</span>
                    <code>{report.technical}</code>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bellows-standalone__panel">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Recovery Reports</h2>
                <p>Stubbed persistence activity phrased as the status a human operator would actually care about.</p>
              </div>
            </div>
            <ul className="bellows-standalone__log">
              {snapshot.persistenceObservations.length === 0 ? (
                <li className="bellows-standalone__log-empty">No recovery reports yet.</li>
              ) : snapshot.persistenceObservations.map((observation, index) => {
                const report = formatPersistenceReport(observation);
                return (
                  <li key={`${observation.effectType}-${index}`} className="bellows-standalone__log-item">
                    <strong className="bellows-standalone__log-title">{report.title}</strong>
                    <span className="bellows-standalone__log-detail">{report.detail}</span>
                    <span className="bellows-standalone__log-meta">{report.stateLabel}</span>
                    <code>{report.technical}</code>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Action Timeline</h2>
                <p>Every operator or system action, translated into the language of the session surface.</p>
              </div>
            </div>
            <ul className="bellows-standalone__log bellows-standalone__log--dispatch">
              {snapshot.dispatchLog.length === 0 ? (
                <li className="bellows-standalone__log-empty">No timeline entries yet.</li>
              ) : snapshot.dispatchLog.map((record, index) => {
                const report = formatDispatchReport(record);
                return (
                  <li key={`${record.actionType}-${index}`} className="bellows-standalone__log-item">
                    <strong className="bellows-standalone__log-title">{report.title}</strong>
                    <span className="bellows-standalone__log-detail">{report.detail}</span>
                    <span className="bellows-standalone__log-meta">{report.stateLabel}</span>
                    <code>{report.technical}</code>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bellows-standalone__panel bellows-standalone__panel--wide">
            <div className="bellows-standalone__panel-header">
              <div>
                <h2>Snapshots</h2>
                <p>Bellows’ current runtime state plus the persistence adapter’s observed snapshots.</p>
              </div>
            </div>

            <div className="bellows-standalone__snapshot-grid">
              <div>
                <h3>Current session</h3>
                <pre>{manualSnapshot}</pre>
              </div>
              <div>
                <h3>Persistence snapshots</h3>
                <ul className="bellows-standalone__snapshot-list">
                  {snapshot.persistenceSnapshots.length === 0 ? (
                    <li>No snapshots recorded yet.</li>
                  ) : snapshot.persistenceSnapshots.map((entry, index) => (
                    <li key={`${entry.lifecycle}-${index}`}>
                      <strong>{entry.lifecycle}</strong>
                      <span>{entry.uploadState}</span>
                      <span>{entry.sealState}</span>
                      <span>events: {entry.eventCount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
