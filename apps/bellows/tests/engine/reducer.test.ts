import assert from "node:assert/strict";
import test from "node:test";

import type {
  BellowsOffsetMs,
  BellowsSession,
  ParticipantId,
  SessionEventId,
  SessionId,
  UserId,
  WorkspaceId,
} from "../../src/index.js";
import { reduceBellowsSession } from "../../src/index.js";

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

function asOffset(value: number): BellowsOffsetMs {
  return value as BellowsOffsetMs;
}

function createContext() {
  let counter = 0;

  return {
    nextEventId: () => `evt-${++counter}` as SessionEventId,
  };
}

function createSession(
  overrides: Partial<BellowsSession> = {},
): {
  session: BellowsSession;
  hostParticipantId: ParticipantId;
  coHostParticipantId: ParticipantId;
} {
  const sessionId = asSessionId("session-1");
  const workspaceId = asWorkspaceId("workspace-1");
  const hostUserId = asUserId("user-host");
  const hostParticipantId = asParticipantId("participant-host");
  const coHostParticipantId = asParticipantId("participant-cohost");

  const session: BellowsSession = {
    sessionId,
    workspaceId,
    hostUserId,
    authorityState: {
      actingAuthorityState: "host_present",
      hostParticipantId,
      actingHostParticipantId: hostParticipantId,
      coHostParticipantIds: [coHostParticipantId],
    },
    draft: {
      sessionId,
      workspaceId,
      hostUserId,
      mode: "live",
      sessionType: "remote",
      title: "Bellows test session",
      participantSlots: [
        { roleCode: "S1", participantId: hostParticipantId },
        { roleCode: "S2", participantId: coHostParticipantId },
      ],
      scriptReference: null,
      broadcastIntent: "single_platform",
      broadcastTargets: [
        {
          broadcastTargetId: "target-1" as never,
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
        userId: hostUserId,
        displayName: "Host",
        roleCode: "S1",
        authorityTier: "host",
        presenceState: "ready",
        joinState: "approved",
        joinedAtOffsetMs: asOffset(0),
        leftAtOffsetMs: null,
      },
      [coHostParticipantId]: {
        participantId: coHostParticipantId,
        userId: asUserId("user-cohost"),
        displayName: "Co-host",
        roleCode: "S2",
        authorityTier: "co_host",
        presenceState: "ready",
        joinState: "approved",
        joinedAtOffsetMs: asOffset(0),
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
    ...overrides,
  };

  return {
    session,
    hostParticipantId,
    coHostParticipantId,
  };
}

test("moves from idle to configuring on host begin setup", () => {
  const { session, hostParticipantId } = createSession();
  const result = reduceBellowsSession(
    session,
    {
      source: "host",
      type: "HOST_BEGIN_SETUP",
      payload: {},
      meta: {
        actorId: hostParticipantId,
        offsetMs: asOffset(0),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "accepted");
  assert.equal(result.state.machineState.lifecycle, "configuring");
  assert.equal(result.events[0]?.type, "session_created");
});

test("rejects start show outside ready_to_start", () => {
  const { session, hostParticipantId } = createSession();
  const result = reduceBellowsSession(
    session,
    {
      source: "host",
      type: "HOST_START_SHOW",
      payload: {},
      meta: {
        actorId: hostParticipantId,
        offsetMs: asOffset(10),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "rejected");
  assert.equal(result.rejection.code, "illegal_transition");
  assert.equal(result.events[0]?.type, "transition_rejected");
});

test("starts countdown from ready_to_start and declares countdown effect", () => {
  const { session, hostParticipantId } = createSession({
    machineState: {
      lifecycle: "ready_to_start",
      broadcast: "not_broadcasting",
      outcome: null,
    },
  });
  const result = reduceBellowsSession(
    session,
    {
      source: "host",
      type: "HOST_START_SHOW",
      payload: {},
      meta: {
        actorId: hostParticipantId,
        offsetMs: asOffset(20),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "accepted");
  assert.equal(result.state.machineState.lifecycle, "countdown");
  assert.equal(result.state.recordingState, "countdown");
  assert.deepEqual(result.effects.map((effect) => effect.type), ["start_countdown"]);
});

test("promotes a co-host when the host disconnects during recording", () => {
  const { session, hostParticipantId, coHostParticipantId } = createSession({
    machineState: {
      lifecycle: "recording_active",
      broadcast: "live",
      outcome: null,
    },
    recordingState: "active",
    broadcastState: "live",
  });
  const result = reduceBellowsSession(
    session,
    {
      source: "connectivity",
      type: "HOST_DISCONNECTED",
      payload: {
        participantId: hostParticipantId,
      },
      meta: {
        actorId: "system",
        offsetMs: asOffset(30),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "accepted");
  assert.equal(result.state.authorityState.actingAuthorityState, "co_host_promoted");
  assert.equal(result.state.authorityState.actingHostParticipantId, coHostParticipantId);
  assert.deepEqual(result.effects.map((effect) => effect.type), ["promote_co_host"]);
});

test("rejects co-host session end before promotion", () => {
  const { session, coHostParticipantId } = createSession({
    machineState: {
      lifecycle: "recording_active",
      broadcast: "live",
      outcome: null,
    },
    recordingState: "active",
    broadcastState: "live",
  });
  const result = reduceBellowsSession(
    session,
    {
      source: "co_host",
      type: "CO_HOST_END_SESSION",
      payload: {},
      meta: {
        actorId: coHostParticipantId,
        offsetMs: asOffset(40),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "rejected");
  assert.equal(result.rejection.code, "unauthorized_actor");
});

test("allows a promoted co-host to end the session", () => {
  const promotedHostParticipantId = asParticipantId("participant-host");
  const promotedCoHostParticipantId = asParticipantId("participant-cohost");
  const { session, coHostParticipantId } = createSession({
    authorityState: {
      actingAuthorityState: "co_host_promoted",
      hostParticipantId: promotedHostParticipantId,
      actingHostParticipantId: promotedCoHostParticipantId,
      coHostParticipantIds: [promotedCoHostParticipantId],
    },
    machineState: {
      lifecycle: "recording_active",
      broadcast: "live",
      outcome: null,
    },
    recordingState: "active",
    broadcastState: "live",
  });
  const result = reduceBellowsSession(
    session,
    {
      source: "co_host",
      type: "CO_HOST_END_SESSION",
      payload: {},
      meta: {
        actorId: coHostParticipantId,
        offsetMs: asOffset(50),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "accepted");
  assert.equal(result.state.machineState.lifecycle, "finalizing_local");
  assert.deepEqual(result.effects.map((effect) => effect.type), [
    "stop_broadcast",
    "finalize_local_segments",
  ]);
});

test("enters upload_resuming through recovery", () => {
  const { session } = createSession();
  const result = reduceBellowsSession(
    session,
    {
      source: "recovery",
      type: "RECOVER_UPLOAD_IN_PROGRESS",
      payload: {},
      meta: {
        actorId: "engine",
        offsetMs: asOffset(60),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "accepted");
  assert.equal(result.state.machineState.lifecycle, "upload_resuming");
  assert.equal(result.state.uploadState, "resuming");
});

test("seals a session from sealing_session", () => {
  const { session } = createSession({
    machineState: {
      lifecycle: "sealing_session",
      broadcast: "ended",
      outcome: null,
    },
    sealState: "sealing_session",
  });
  const result = reduceBellowsSession(
    session,
    {
      source: "engine",
      type: "SESSION_SEALED",
      payload: {},
      meta: {
        actorId: "engine",
        offsetMs: asOffset(70),
      },
    },
    createContext(),
  );

  assert.equal(result.kind, "accepted");
  assert.equal(result.state.machineState.lifecycle, "sealed");
  assert.equal(result.state.machineState.outcome, "sealed");
});
