import type { ParticipantId } from "../domain/ids.js";
import type { BellowsSession } from "../domain/session.js";
import type { BellowsLifecycleState } from "../domain/states.js";

const RECORDING_LIFECYCLES: readonly BellowsLifecycleState[] = [
  "recording_active",
  "recording_degraded",
  "recording_offline_local",
  "recording_rejoining",
] as const;

const TERMINAL_LIFECYCLES: readonly BellowsLifecycleState[] = [
  "sealed",
  "incomplete_capture",
  "failed_capture",
  "archived",
] as const;

export function isHostOrActingHost(
  session: BellowsSession,
  participantId: ParticipantId,
): boolean {
  return session.authorityState.actingHostParticipantId === participantId;
}

export function isPromotedCoHost(
  session: BellowsSession,
  participantId: ParticipantId,
): boolean {
  return (
    session.authorityState.actingAuthorityState === "co_host_promoted" &&
    session.authorityState.actingHostParticipantId === participantId
  );
}

export function hasConfiguredParticipantSlots(session: BellowsSession): boolean {
  return session.draft.participantSlots.length > 0;
}

export function hasEnabledLiveTargets(session: BellowsSession): boolean {
  return session.draft.broadcastTargets.some((target) => target.enabled);
}

export function hasValidSessionDraft(session: BellowsSession): boolean {
  if (!hasConfiguredParticipantSlots(session)) {
    return false;
  }

  if (
    session.draft.mode === "live" &&
    session.draft.broadcastIntent !== "none" &&
    !hasEnabledLiveTargets(session)
  ) {
    return false;
  }

  return true;
}

export function getAssignedParticipantIds(
  session: BellowsSession,
): readonly ParticipantId[] {
  return session.draft.participantSlots
    .map((slot) => slot.participantId)
    .filter((participantId): participantId is ParticipantId => participantId !== null);
}

export function hasMinimumReadyParticipants(session: BellowsSession): boolean {
  const assignedParticipantIds = getAssignedParticipantIds(session);

  if (assignedParticipantIds.length === 0) {
    return false;
  }

  return assignedParticipantIds.every((participantId) => {
    const participant = session.participants[participantId];

    return (
      participant !== undefined &&
      (participant.presenceState === "ready" ||
        participant.presenceState === "connected")
    );
  });
}

export function canEndSession(session: BellowsSession): boolean {
  return RECORDING_LIFECYCLES.includes(session.machineState.lifecycle);
}

export function canArchive(session: BellowsSession): boolean {
  return TERMINAL_LIFECYCLES.includes(session.machineState.lifecycle);
}

export function getPromotableCoHost(
  session: BellowsSession,
): ParticipantId | null {
  for (const participantId of session.authorityState.coHostParticipantIds) {
    const participant = session.participants[participantId];

    if (participant && participant.presenceState !== "removed") {
      return participantId;
    }
  }

  return null;
}
