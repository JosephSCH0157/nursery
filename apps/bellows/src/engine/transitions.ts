import type {
  BellowsEngineEffect,
  BellowsEventActorType,
  BellowsSessionEvent,
  BellowsSessionEventPayload,
} from "../domain/events.js";
import type { ParticipantId } from "../domain/ids.js";
import type { BellowsParticipant } from "../domain/participant.js";
import type { BellowsSession } from "../domain/session.js";
import { declareBellowsEffect } from "./effects.js";
import type {
  BellowsRejectedTransition,
  BellowsTransitionResult,
} from "./errors.js";
import {
  canArchive,
  canEndSession,
  getPromotableCoHost,
  hasEnabledLiveTargets,
  hasMinimumReadyParticipants,
  hasValidSessionDraft,
  isHostOrActingHost,
  isPromotedCoHost,
} from "./guards.js";
import {
  type BellowsEngineContext,
  type BellowsSessionAction,
} from "./actions.js";
import { applyBellowsRecoveryTransition, isBellowsRecoveryAction } from "./recovery.js";

function mapActorType(source: BellowsSessionAction["source"]): BellowsEventActorType {
  switch (source) {
    case "host":
      return "host";
    case "co_host":
      return "co_host";
    case "engine":
    case "recovery":
      return "engine";
    default:
      return "system";
  }
}

function appendEvents(
  session: BellowsSession,
  events: readonly BellowsSessionEvent[],
): BellowsSession {
  return {
    ...session,
    events: [...session.events, ...events],
  };
}

function emitEvent(
  session: BellowsSession,
  action: BellowsSessionAction,
  context: BellowsEngineContext,
  type: BellowsSessionEvent["type"],
  payload: BellowsSessionEventPayload = {},
): BellowsSessionEvent {
  return {
    eventId: context.nextEventId(),
    sessionId: session.sessionId,
    type,
    actorType: mapActorType(action.source),
    actorId: action.meta.actorId,
    offsetMs: action.meta.offsetMs,
    payload,
  };
}

function acceptTransition(
  session: BellowsSession,
  action: BellowsSessionAction,
  context: BellowsEngineContext,
  nextState: BellowsSession,
  eventType: BellowsSessionEvent["type"],
  eventPayload: BellowsSessionEventPayload = {},
  effects: readonly BellowsEngineEffect[] = [],
): BellowsTransitionResult {
  const event = emitEvent(session, action, context, eventType, eventPayload);
  const acceptedState = appendEvents(nextState, [event]);

  return {
    kind: "accepted",
    state: acceptedState,
    effects,
    events: [event],
  };
}

function rejectTransition(
  session: BellowsSession,
  action: BellowsSessionAction,
  context: BellowsEngineContext,
  rejection: BellowsRejectedTransition,
): BellowsTransitionResult {
  const event = emitEvent(session, action, context, "transition_rejected", {
    code: rejection.code,
    message: rejection.message,
  });
  const rejectedState = appendEvents(session, [event]);

  return {
    kind: "rejected",
    state: rejectedState,
    effects: [],
    events: [event],
    rejection,
  };
}

function updateParticipant(
  session: BellowsSession,
  participantId: ParticipantId,
  updater: (participant: BellowsParticipant) => BellowsParticipant,
): BellowsSession {
  const participant = session.participants[participantId];

  if (!participant) {
    return session;
  }

  return {
    ...session,
    participants: {
      ...session.participants,
      [participantId]: updater(participant),
    },
  };
}

function addIntegrityFlag(
  session: BellowsSession,
  flag: BellowsSession["integrityFlags"][number],
): BellowsSession {
  if (session.integrityFlags.includes(flag)) {
    return session;
  }

  return {
    ...session,
    integrityFlags: [...session.integrityFlags, flag],
  };
}

function transitionRequiresLifecycle(
  session: BellowsSession,
  action: BellowsSessionAction,
  context: BellowsEngineContext,
  lifecycles: readonly string[],
  message: string,
): BellowsTransitionResult | null {
  if (lifecycles.includes(session.machineState.lifecycle)) {
    return null;
  }

  return rejectTransition(session, action, context, {
    code: "illegal_transition",
    message,
    lifecycle: session.machineState.lifecycle,
    actionType: action.type,
  });
}

export function applyBellowsTransition(
  session: BellowsSession,
  action: BellowsSessionAction,
  context: BellowsEngineContext,
): BellowsTransitionResult {
  const accept = (
    nextState: BellowsSession,
    eventType: BellowsSessionEvent["type"],
    eventPayload: BellowsSessionEventPayload = {},
    effects: readonly BellowsEngineEffect[] = [],
  ) => acceptTransition(session, action, context, nextState, eventType, eventPayload, effects);

  if (isBellowsRecoveryAction(action)) {
    return applyBellowsRecoveryTransition(session, action, context, accept);
  }

  switch (action.type) {
    case "HOST_BEGIN_SETUP": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["idle"],
        "Bellows can only enter setup from idle.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "configuring",
            outcome: null,
          },
        },
        "session_created",
      );
    }

    case "HOST_UPDATE_DRAFT": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["configuring"],
        "Draft updates are only allowed during configuring.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          draft: action.payload.draft,
        },
        "session_configured",
      );
    }

    case "HOST_BEGIN_ACCOUNT_LINK": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["configuring"],
        "Account linking is only legal during configuring.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "linking_accounts",
          },
        },
        "host_command_issued",
        { command: action.type },
      );
    }

    case "PLATFORM_LINK_SUCCEEDED":
    case "PLATFORM_LINK_FAILED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["linking_accounts"],
        "Platform link results are only legal during account linking.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "configuring",
          },
        },
        "session_configured",
      );
    }

    case "HOST_BEGIN_INVITES": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["configuring"],
        "Invite generation begins from configuring only.",
      );
      if (rejection) {
        return rejection;
      }
      if (!hasValidSessionDraft(session)) {
        return rejectTransition(session, action, context, {
          code: "invalid_session_draft",
          message: "Invite generation requires a valid session draft.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "inviting",
          },
        },
        "host_command_issued",
        { command: action.type },
        [declareBellowsEffect("generate_invite_links")],
      );
    }

    case "INVITES_GENERATED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["inviting"],
        "Invite completion is only legal while inviting.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "waiting_for_participants",
          },
        },
        "session_configured",
      );
    }

    case "HOST_WAIT_FOR_PARTICIPANTS": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["configuring"],
        "Waiting for participants begins from configuring.",
      );
      if (rejection) {
        return rejection;
      }
      if (!hasValidSessionDraft(session)) {
        return rejectTransition(session, action, context, {
          code: "invalid_session_draft",
          message: "Participant waiting requires a valid session draft.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "waiting_for_participants",
          },
        },
        "host_command_issued",
        { command: action.type },
      );
    }

    case "PARTICIPANT_JOINED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["waiting_for_participants", "preflight_ready"],
        "Participants can only join while waiting or preflight ready.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          participants: {
            ...session.participants,
            [action.payload.participant.participantId]: action.payload.participant,
          },
        },
        "participant_joined",
      );
    }

    case "PARTICIPANT_READY": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["waiting_for_participants", "preflight_ready"],
        "Participants can only become ready before the show starts.",
      );
      if (rejection) {
        return rejection;
      }

      const updated = updateParticipant(session, action.payload.participantId, (participant) => ({
        ...participant,
        presenceState: "ready",
        joinState: "approved",
      }));
      const lifecycle = hasMinimumReadyParticipants(updated)
        ? "preflight_ready"
        : "waiting_for_participants";

      return accept(
        {
          ...updated,
          machineState: {
            ...updated.machineState,
            lifecycle,
          },
        },
        "participant_ready",
      );
    }

    case "PARTICIPANT_BECAME_UNREADY": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["preflight_ready", "ready_to_start"],
        "Readiness can only degrade before recording begins.",
      );
      if (rejection) {
        return rejection;
      }

      const updated = updateParticipant(session, action.payload.participantId, (participant) => ({
        ...participant,
        presenceState: "joining",
      }));

      return accept(
        {
          ...updated,
          machineState: {
            ...updated.machineState,
            lifecycle:
              session.machineState.lifecycle === "ready_to_start"
                ? "preflight_ready"
                : "waiting_for_participants",
          },
        },
        "integrity_warning",
      );
    }

    case "HOST_RUN_PREFLIGHT": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["preflight_ready", "waiting_for_participants"],
        "Preflight can only run once participants are being prepared.",
      );
      if (rejection) {
        return rejection;
      }
      if (!hasMinimumReadyParticipants(session)) {
        return rejectTransition(session, action, context, {
          code: "insufficient_ready_participants",
          message: "Preflight requires all assigned participants to be ready.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "preflight_checks",
          },
        },
        "host_command_issued",
        { command: action.type },
        [declareBellowsEffect("run_preflight_checks")],
      );
    }

    case "PREFLIGHT_PASSED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["preflight_checks"],
        "Preflight results are only legal during preflight checks.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "ready_to_start",
          },
        },
        "session_configured",
      );
    }

    case "PREFLIGHT_FAILED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["preflight_checks"],
        "Preflight failure is only legal during preflight checks.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "configuring",
          },
        },
        "integrity_warning",
      );
    }

    case "HOST_START_SHOW": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["ready_to_start"],
        "The show can only start from ready_to_start.",
      );
      if (rejection) {
        return rejection;
      }
      if (!hasMinimumReadyParticipants(session)) {
        return rejectTransition(session, action, context, {
          code: "insufficient_ready_participants",
          message: "The show cannot start until assigned participants are ready.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "countdown",
          },
          recordingState: "countdown",
        },
        "host_command_issued",
        { command: action.type },
        [declareBellowsEffect("start_countdown")],
      );
    }

    case "HOST_ABORT_START": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["countdown"],
        "Countdown can only be aborted while countdown is active.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "ready_to_start",
          },
          recordingState: "idle",
        },
        "host_command_issued",
        { command: action.type },
      );
    }

    case "COUNTDOWN_COMPLETED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["countdown"],
        "Countdown completion is only legal while countdown is active.",
      );
      if (rejection) {
        return rejection;
      }
      if (
        session.draft.mode === "live" &&
        session.draft.broadcastIntent !== "none" &&
        !hasEnabledLiveTargets(session)
      ) {
        return rejectTransition(session, action, context, {
          code: "live_targets_not_configured",
          message: "Live mode requires enabled broadcast targets before countdown completes.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      const nextBroadcastState =
        session.draft.mode === "live" && session.draft.broadcastIntent !== "none"
          ? "starting"
          : "not_broadcasting";

      const effects: BellowsEngineEffect[] = [
        declareBellowsEffect("establish_t0"),
        declareBellowsEffect("emit_sync_marker"),
        declareBellowsEffect("start_local_recording"),
      ];

      if (nextBroadcastState === "starting") {
        effects.push(declareBellowsEffect("start_broadcast"));
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "sync_initializing",
            broadcast: nextBroadcastState,
          },
          recordingState: "sync_initializing",
          broadcastState: nextBroadcastState,
        },
        "sync_emitted",
        {},
        effects,
      );
    }

    case "CAPTURE_STARTED_FOR_ALL_REQUIRED_PARTICIPANTS": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["sync_initializing"],
        "Capture confirmation requires sync initialization.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "recording_active",
          },
          recordingState: "active",
        },
        "recording_started",
      );
    }

    case "CAPTURE_STARTED_WITH_MISSING_PARTICIPANT": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["sync_initializing"],
        "Degraded capture confirmation requires sync initialization.",
      );
      if (rejection) {
        return rejection;
      }

      const degradedState = addIntegrityFlag(session, "participant_dropout");

      return accept(
        {
          ...degradedState,
          machineState: {
            ...degradedState.machineState,
            lifecycle: "recording_degraded",
          },
          recordingState: "degraded",
        },
        "recording_started",
      );
    }

    case "PARTICIPANT_DISCONNECTED": {
      if (!canEndSession(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Participant disconnects are only handled during recording.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      const updated = updateParticipant(session, action.payload.participantId, (participant) => ({
        ...participant,
        presenceState: "disconnected",
        leftAtOffsetMs: action.meta.offsetMs,
      }));
      const degradedState = addIntegrityFlag(updated, "participant_dropout");

      return accept(
        {
          ...degradedState,
          machineState: {
            ...degradedState.machineState,
            lifecycle: "recording_degraded",
          },
          recordingState: "degraded",
        },
        "participant_disconnected",
      );
    }

    case "PARTICIPANT_NETWORK_LOST_LOCAL_CAPTURE_OK": {
      if (!canEndSession(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Offline-local transitions are only legal during recording.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...addIntegrityFlag(session, "participant_dropout"),
          machineState: {
            ...session.machineState,
            lifecycle: "recording_offline_local",
          },
          recordingState: "offline_local",
        },
        "connection_lost",
      );
    }

    case "PARTICIPANT_REJOIN_STARTED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["recording_degraded", "recording_offline_local"],
        "Participant rejoin starts from degraded recording states only.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "recording_rejoining",
          },
          recordingState: "rejoining",
        },
        "participant_reconnected",
      );
    }

    case "PARTICIPANT_REJOIN_CONFIRMED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["recording_rejoining"],
        "Participant rejoin confirmation requires rejoining state.",
      );
      if (rejection) {
        return rejection;
      }

      const updated = updateParticipant(session, action.payload.participantId, (participant) => ({
        ...participant,
        presenceState: "connected",
      }));
      const nextLifecycle = hasMinimumReadyParticipants(updated)
        ? "recording_active"
        : "recording_degraded";
      const recordingState = nextLifecycle === "recording_active" ? "active" : "degraded";

      return accept(
        {
          ...updated,
          machineState: {
            ...updated.machineState,
            lifecycle: nextLifecycle,
          },
          recordingState,
        },
        "participant_reconnected",
      );
    }

    case "PARTICIPANT_REJOIN_FAILED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["recording_rejoining"],
        "Participant rejoin failure requires rejoining state.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "recording_degraded",
          },
          recordingState: "degraded",
        },
        "participant_disconnected",
      );
    }

    case "HOST_DISCONNECTED": {
      if (!canEndSession(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Host disconnect handling only applies during recording.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      const promotableCoHost = getPromotableCoHost(session);

      if (promotableCoHost) {
        return accept(
          {
            ...session,
            authorityState: {
              ...session.authorityState,
              actingAuthorityState: "co_host_promoted",
              actingHostParticipantId: promotableCoHost,
            },
          },
          "authority_promoted",
          { actingHostParticipantId: promotableCoHost },
          [declareBellowsEffect("promote_co_host")],
        );
      }

      return accept(
        {
          ...session,
          authorityState: {
            ...session.authorityState,
            actingAuthorityState: "engine_stewardship",
          },
        },
        "authority_promoted",
        { actingAuthorityState: "engine_stewardship" },
        [declareBellowsEffect("enter_engine_stewardship")],
      );
    }

    case "HOST_END_SESSION":
    case "CO_HOST_END_SESSION": {
      const actorId = action.meta.actorId as ParticipantId;
      const authorized =
        action.type === "HOST_END_SESSION"
          ? isHostOrActingHost(session, actorId)
          : isPromotedCoHost(session, actorId);

      if (!authorized) {
        return rejectTransition(session, action, context, {
          code: "unauthorized_actor",
          message: "Only the Host or promoted acting Host may end the session.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }
      if (!canEndSession(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Ending the session is only legal during recording.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "finalizing_local",
            broadcast: "ended",
          },
          recordingState: "stopping",
          broadcastState: "ended",
          uploadState: "finalizing_local",
        },
        "session_stopped",
        {},
        [
          declareBellowsEffect("stop_broadcast"),
          declareBellowsEffect("finalize_local_segments"),
        ],
      );
    }

    case "HOST_START_BROADCAST": {
      if (!canEndSession(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Broadcast start is only legal during recording.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }
      if (!hasEnabledLiveTargets(session)) {
        return rejectTransition(session, action, context, {
          code: "live_targets_not_configured",
          message: "Starting broadcast requires configured live targets.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            broadcast: "starting",
          },
          broadcastState: "starting",
        },
        "broadcast_started",
        {},
        [declareBellowsEffect("start_broadcast")],
      );
    }

    case "HOST_STOP_BROADCAST": {
      if (!canEndSession(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Broadcast stop is only legal during recording.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            broadcast: "ended",
          },
          broadcastState: "ended",
        },
        "broadcast_ended",
        {},
        [declareBellowsEffect("stop_broadcast")],
      );
    }

    case "LOCAL_SEGMENTS_FINALIZED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["finalizing_local"],
        "Local segment finalization requires finalizing_local state.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "uploading",
          },
          recordingState: "stopped",
          uploadState: "uploading",
        },
        "upload_started",
        {},
        [declareBellowsEffect("resume_pending_uploads")],
      );
    }

    case "UPLOAD_PROGRESS_RECORDED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["uploading", "upload_resuming"],
        "Upload progress can only be recorded during upload lifecycles.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "uploading",
          },
          uploadState: "uploading",
        },
        "upload_chunk_received",
      );
    }

    case "UPLOAD_DEGRADED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["uploading"],
        "Upload degradation requires uploading state.",
      );
      if (rejection) {
        return rejection;
      }

      const degradedState = addIntegrityFlag(session, "upload_interrupted");

      return accept(
        {
          ...degradedState,
          machineState: {
            ...degradedState.machineState,
            lifecycle: "upload_degraded",
          },
          uploadState: "degraded",
        },
        "upload_paused",
      );
    }

    case "UPLOAD_PAUSED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["uploading", "upload_degraded"],
        "Upload pause requires an upload lifecycle.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "upload_paused",
          },
          uploadState: "paused",
        },
        "upload_paused",
      );
    }

    case "UPLOAD_RESUME_REQUESTED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["upload_degraded", "upload_paused"],
        "Upload resume requires a paused or degraded upload state.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "upload_resuming",
          },
          uploadState: "resuming",
        },
        "upload_resumed",
        {},
        [declareBellowsEffect("resume_pending_uploads")],
      );
    }

    case "UPLOAD_RESUME_FAILED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["upload_resuming"],
        "Upload resume failure requires upload_resuming state.",
      );
      if (rejection) {
        return rejection;
      }

      const degradedState = addIntegrityFlag(session, "upload_interrupted");

      return accept(
        {
          ...degradedState,
          machineState: {
            ...degradedState.machineState,
            lifecycle: "upload_degraded",
          },
          uploadState: "degraded",
        },
        "upload_paused",
      );
    }

    case "UPLOADS_COMPLETE": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["uploading", "upload_resuming"],
        "Upload completion requires an active upload lifecycle.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "upload_complete_pending_verification",
          },
          uploadState: "complete_pending_verification",
        },
        "upload_completed",
      );
    }

    case "BEGIN_INTEGRITY_VERIFICATION": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["upload_complete_pending_verification"],
        "Integrity verification starts after uploads complete.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "verifying_integrity",
          },
          sealState: "verifying_integrity",
        },
        "session_sealing_started",
        {},
        [declareBellowsEffect("verify_integrity")],
      );
    }

    case "INTEGRITY_VERIFIED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["verifying_integrity"],
        "Integrity verification results require verifying_integrity state.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "assembling_manifest",
          },
          sealState: "assembling_manifest",
        },
        "session_sealing_started",
        {},
        [declareBellowsEffect("assemble_manifest")],
      );
    }

    case "INTEGRITY_PARTIAL_BUT_USABLE": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["verifying_integrity"],
        "Partial integrity results require verifying_integrity state.",
      );
      if (rejection) {
        return rejection;
      }

      const partialState = addIntegrityFlag(session, "missing_track");

      return accept(
        {
          ...partialState,
          machineState: {
            ...partialState.machineState,
            lifecycle: "assembling_manifest",
          },
          sealState: "assembling_manifest",
        },
        "integrity_warning",
        {},
        [declareBellowsEffect("assemble_manifest")],
      );
    }

    case "INTEGRITY_FATAL": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["verifying_integrity"],
        "Fatal integrity results require verifying_integrity state.",
      );
      if (rejection) {
        return rejection;
      }

      const failedState = addIntegrityFlag(session, "corrupted_capture");

      return accept(
        {
          ...failedState,
          machineState: {
            ...failedState.machineState,
            lifecycle: "failed_capture",
            outcome: "failed_capture",
          },
        },
        "integrity_warning",
      );
    }

    case "MANIFEST_ASSEMBLED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["assembling_manifest"],
        "Manifest assembly completion requires assembling_manifest state.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "sealing_session",
          },
          sealState: "sealing_session",
        },
        "session_sealing_started",
        {},
        [declareBellowsEffect("seal_session_record")],
      );
    }

    case "SESSION_SEALED": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["sealing_session"],
        "Session sealing completion requires sealing_session state.",
      );
      if (rejection) {
        return rejection;
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "sealed",
            outcome: "sealed",
          },
          sealState: "sealed",
        },
        "session_sealed",
      );
    }

    case "SESSION_SEALED_WITH_GAPS": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["sealing_session"],
        "Gap-sealed completion requires sealing_session state.",
      );
      if (rejection) {
        return rejection;
      }

      const incompleteState = addIntegrityFlag(session, "missing_track");

      return accept(
        {
          ...incompleteState,
          machineState: {
            ...incompleteState.machineState,
            lifecycle: "incomplete_capture",
            outcome: "incomplete_capture",
          },
        },
        "session_sealed",
      );
    }

    case "SESSION_SEAL_FAILED_FATAL": {
      const rejection = transitionRequiresLifecycle(
        session,
        action,
        context,
        ["sealing_session"],
        "Seal failure requires sealing_session state.",
      );
      if (rejection) {
        return rejection;
      }

      const failedState = addIntegrityFlag(session, "corrupted_capture");

      return accept(
        {
          ...failedState,
          machineState: {
            ...failedState.machineState,
            lifecycle: "failed_capture",
            outcome: "failed_capture",
          },
        },
        "integrity_warning",
      );
    }

    case "ARCHIVE_REQUESTED": {
      if (!canArchive(session)) {
        return rejectTransition(session, action, context, {
          code: "illegal_transition",
          message: "Archive is only legal from a terminal Bellows state.",
          lifecycle: session.machineState.lifecycle,
          actionType: action.type,
        });
      }

      return accept(
        {
          ...session,
          machineState: {
            ...session.machineState,
            lifecycle: "archived",
            outcome: "archived",
          },
        },
        "session_configured",
      );
    }
  }
}
