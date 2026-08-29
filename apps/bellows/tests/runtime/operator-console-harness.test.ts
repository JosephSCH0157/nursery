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
import { createBellowsOperatorConsoleHarness } from "../../src/index.js";

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
  const sessionId = asSessionId("session-operator-1");
  const workspaceId = asWorkspaceId("workspace-operator-1");
  const hostUserId = asUserId("user-host");
  const hostParticipantId = asParticipantId("participant-host");
  const coHostParticipantId = asParticipantId("participant-cohost");

  const session: BellowsSession = {
    sessionId,
    workspaceId,
    workpieceId: "workpiece-operator-1" as never,
    recordingCaptureAuthorityId: "capture-authority-operator-1" as never,
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
      workpieceId: "workpiece-operator-1" as never,
      hostUserId,
      mode: "live",
      sessionType: "remote",
      title: "Bellows operator console test session",
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

test("operator console harness can drive Bellows from idle through archive", async () => {
  const { session, hostParticipantId } = createSession();
  const harness = createBellowsOperatorConsoleHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
  });

  await harness.host.beginSetup();
  await harness.host.waitForParticipants();
  await harness.host.runPreflight();
  await harness.host.startShow();
  await harness.system.confirmCaptureReady();
  await harness.host.endSession();
  await harness.system.finalizeLocalSegments();
  await harness.system.beginIntegrityVerification();
  await harness.system.archiveSession();

  const snapshot = harness.getSnapshot();

  assert.equal(snapshot.session.machineState.lifecycle, "archived");
  assert.deepEqual(
    snapshot.studioShellObservations.map((observation) => observation.effectType),
    ["run_preflight_checks", "start_countdown"],
  );
  assert.deepEqual(
    snapshot.persistenceObservations.map((observation) => observation.effectType),
    ["resume_pending_uploads", "verify_integrity", "assemble_manifest", "seal_session_record"],
  );
  assert.equal(snapshot.dispatchLog.at(-1)?.lifecycleAfter, "archived");
});

test("operator console harness records rejected transitions in the dispatch log", async () => {
  const { session, hostParticipantId } = createSession();
  const harness = createBellowsOperatorConsoleHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
  });

  const result = await harness.host.endSession();

  assert.equal(result.transition.kind, "rejected");
  assert.equal(harness.getDispatchLog().length, 1);
  assert.equal(harness.getDispatchLog()[0]?.transitionKind, "rejected");
  assert.equal(
    harness.getDispatchLog()[0]?.rejection?.code,
    "illegal_transition",
  );
});

test("operator console harness can abort a manual countdown and restart cleanly", async () => {
  const { session, hostParticipantId } = createSession();
  const harness = createBellowsOperatorConsoleHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
    studioShell: {
      countdownResolution: "manual",
    },
  });

  await harness.host.beginSetup();
  await harness.host.waitForParticipants();
  await harness.host.runPreflight();
  await harness.host.startShow();

  assert.equal(harness.getState().machineState.lifecycle, "countdown");

  const abortResult = await harness.host.abortStart();

  assert.equal(abortResult.transition.kind, "accepted");
  assert.equal(harness.getState().machineState.lifecycle, "ready_to_start");

  const restartResult = await harness.host.startShow();

  assert.equal(restartResult.transition.kind, "accepted");
  assert.equal(harness.getState().machineState.lifecycle, "countdown");
  assert.equal(
    harness.getStudioShellObservations().filter((observation) => observation.effectType === "start_countdown").length,
    2,
  );
});

test("operator console harness rejects later host commands once the session is sealed", async () => {
  const { session, hostParticipantId } = createSession();
  const harness = createBellowsOperatorConsoleHarness({
    initialState: session,
    engineContext: createContext(),
    hostParticipantId,
  });

  await harness.host.beginSetup();
  await harness.host.waitForParticipants();
  await harness.host.runPreflight();
  await harness.host.startShow();
  await harness.system.confirmCaptureReady();
  await harness.host.endSession();
  await harness.system.finalizeLocalSegments();
  await harness.system.beginIntegrityVerification();

  assert.equal(harness.getState().machineState.lifecycle, "sealed");

  const result = await harness.host.beginSetup();

  assert.equal(result.transition.kind, "rejected");
  assert.equal(harness.getState().machineState.lifecycle, "sealed");
  assert.equal(harness.getDispatchLog().at(-1)?.actionType, "HOST_BEGIN_SETUP");
  assert.equal(harness.getDispatchLog().at(-1)?.transitionKind, "rejected");
  assert.equal(harness.getDispatchLog().at(-1)?.rejection?.code, "illegal_transition");
});
