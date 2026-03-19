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
import { createBellowsStudioShellHarness } from "../../src/index.js";

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
  const sessionId = asSessionId("session-shell-1");
  const workspaceId = asWorkspaceId("workspace-shell-1");
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
      title: "Bellows studio shell test session",
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
      lifecycle: "preflight_ready",
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

test("studio shell harness auto-passes preflight and records the shell effect", async () => {
  const { session, hostParticipantId } = createSession();
  const harness = createBellowsStudioShellHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
  });

  const result = await harness.host.runPreflight();

  assert.equal(result.transition.kind, "accepted");
  assert.equal(result.transition.state.machineState.lifecycle, "preflight_checks");
  assert.equal(harness.getState().machineState.lifecycle, "ready_to_start");
  assert.deepEqual(harness.getStudioShellObservations(), [
    {
      effectType: "run_preflight_checks",
      triggerActionType: "HOST_RUN_PREFLIGHT",
      lifecycleAtDispatch: "preflight_checks",
      followUpActionType: "PREFLIGHT_PASSED",
    },
  ]);
});

test("studio shell harness auto-completes countdown and advances to sync initialization", async () => {
  const { session, hostParticipantId } = createSession({
    machineState: {
      lifecycle: "ready_to_start",
      broadcast: "not_broadcasting",
      outcome: null,
    },
  });
  const harness = createBellowsStudioShellHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
  });

  const result = await harness.host.startShow();

  assert.equal(result.transition.kind, "accepted");
  assert.equal(result.transition.state.machineState.lifecycle, "countdown");
  assert.equal(harness.getState().machineState.lifecycle, "sync_initializing");
  assert.deepEqual(harness.getStudioShellObservations(), [
    {
      effectType: "start_countdown",
      triggerActionType: "HOST_START_SHOW",
      lifecycleAtDispatch: "countdown",
      followUpActionType: "COUNTDOWN_COMPLETED",
    },
  ]);
});

test("studio shell harness can hold in manual countdown mode without follow-up dispatch", async () => {
  const { session, hostParticipantId } = createSession({
    machineState: {
      lifecycle: "ready_to_start",
      broadcast: "not_broadcasting",
      outcome: null,
    },
  });
  const harness = createBellowsStudioShellHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
    studioShell: {
      countdownResolution: "manual",
    },
  });

  const result = await harness.host.startShow();

  assert.equal(result.transition.kind, "accepted");
  assert.equal(harness.getState().machineState.lifecycle, "countdown");
  assert.deepEqual(harness.getStudioShellObservations(), [
    {
      effectType: "start_countdown",
      triggerActionType: "HOST_START_SHOW",
      lifecycleAtDispatch: "countdown",
      followUpActionType: null,
    },
  ]);
});
