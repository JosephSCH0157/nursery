import assert from "node:assert/strict";
import test from "node:test";

import type {
  BellowsBroadcastRuntime,
  BellowsCaptureRuntime,
  BellowsOffsetMs,
  BellowsPersistenceRuntime,
  BellowsSession,
  BellowsSignalingRuntime,
  BellowsStudioShellRuntime,
  ParticipantId,
  SessionEventId,
  SessionId,
  UserId,
  WorkspaceId,
} from "../../src/index.js";
import {
  createBellowsEffectDispatcher,
  createBellowsSessionRuntime,
} from "../../src/index.js";

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
  const sessionId = asSessionId("session-runtime-1");
  const workspaceId = asWorkspaceId("workspace-runtime-1");
  const hostUserId = asUserId("user-host");
  const hostParticipantId = asParticipantId("participant-host");
  const coHostParticipantId = asParticipantId("participant-cohost");

  const session: BellowsSession = {
    sessionId,
    workspaceId,
    workpieceId: "workpiece-runtime-1" as never,
    recordingCaptureAuthorityId: "capture-authority-runtime-1" as never,
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
      workpieceId: "workpiece-runtime-1" as never,
      hostUserId,
      mode: "live",
      sessionType: "remote",
      title: "Bellows runtime test session",
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
      lifecycle: "ready_to_start",
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

function createRuntimeAdapters(callLog: string[]) {
  const studioShell: BellowsStudioShellRuntime = {
    runPreflightChecks: () => {
      callLog.push("studio:preflight");
    },
    startCountdown: () => {
      callLog.push("studio:countdown");
    },
  };

  const capture: BellowsCaptureRuntime = {
    establishTimebase: () => {
      callLog.push("capture:establish_t0");
    },
    emitSyncMarker: () => {
      callLog.push("capture:emit_sync_marker");
    },
    startLocalRecording: () => {
      callLog.push("capture:start_local_recording");
    },
    finalizeLocalSegments: () => {
      callLog.push("capture:finalize_local_segments");
    },
  };

  const broadcast: BellowsBroadcastRuntime = {
    startBroadcast: () => {
      callLog.push("broadcast:start");
    },
    stopBroadcast: () => {
      callLog.push("broadcast:stop");
    },
  };

  const persistence: BellowsPersistenceRuntime = {
    resumePendingUploads: () => {
      callLog.push("persistence:resume_uploads");
    },
    verifyIntegrity: () => {
      callLog.push("persistence:verify_integrity");
    },
    assembleManifest: () => {
      callLog.push("persistence:assemble_manifest");
    },
    sealSessionRecord: () => {
      callLog.push("persistence:seal_session_record");
    },
  };

  const signaling: BellowsSignalingRuntime = {
    generateInviteLinks: () => {
      callLog.push("signaling:generate_invites");
    },
    promoteCoHost: () => {
      callLog.push("signaling:promote_co_host");
    },
    enterEngineStewardship: () => {
      callLog.push("signaling:engine_stewardship");
    },
  };

  return {
    studioShell,
    capture,
    broadcast,
    persistence,
    signaling,
  };
}

test("dispatches Bellows engine effects to the correct runtime adapters", async () => {
  const callLog: string[] = [];
  const dispatcher = createBellowsEffectDispatcher(createRuntimeAdapters(callLog));
  const { session, hostParticipantId } = createSession();

  const receipts = await dispatcher.dispatchEffects(
    [
      { type: "run_preflight_checks", payload: {} },
      { type: "start_local_recording", payload: {} },
      { type: "start_broadcast", payload: {} },
      { type: "resume_pending_uploads", payload: {} },
      { type: "generate_invite_links", payload: {} },
    ],
    {
      action: {
        source: "host",
        type: "HOST_RUN_PREFLIGHT",
        payload: {},
        meta: {
          actorId: hostParticipantId,
          offsetMs: asOffset(5),
        },
      },
      previousState: session,
      nextState: session,
      transition: {
        kind: "accepted",
        state: session,
        effects: [],
        events: [],
      },
      dispatch: async () => {
        throw new Error("dispatch not expected");
      },
    },
  );

  assert.deepEqual(callLog, [
    "studio:preflight",
    "capture:start_local_recording",
    "broadcast:start",
    "persistence:resume_uploads",
    "signaling:generate_invites",
  ]);
  assert.deepEqual(receipts, [
    { effectType: "run_preflight_checks", adapter: "studio_shell" },
    { effectType: "start_local_recording", adapter: "capture" },
    { effectType: "start_broadcast", adapter: "broadcast" },
    { effectType: "resume_pending_uploads", adapter: "persistence" },
    { effectType: "generate_invite_links", adapter: "signaling" },
  ]);
});

test("Bellows session runtime lets adapter callbacks feed new actions back into the engine", async () => {
  const callLog: string[] = [];
  const { session, hostParticipantId } = createSession();
  const adapters = createRuntimeAdapters(callLog);

  adapters.studioShell.startCountdown = async (_effect, context) => {
    callLog.push("studio:countdown");
    await context.dispatch({
      source: "engine",
      type: "COUNTDOWN_COMPLETED",
      payload: {},
      meta: {
        actorId: "engine",
        offsetMs: asOffset(10),
      },
    });
  };

  const runtime = createBellowsSessionRuntime({
    initialState: session,
    engineContext: createContext(),
    effectDispatcher: createBellowsEffectDispatcher(adapters),
  });

  const result = await runtime.dispatch({
    source: "host",
    type: "HOST_START_SHOW",
    payload: {},
    meta: {
      actorId: hostParticipantId,
      offsetMs: asOffset(0),
    },
  });

  assert.equal(result.transition.kind, "accepted");
  assert.equal(result.transition.state.machineState.lifecycle, "countdown");
  assert.equal(result.currentState.machineState.lifecycle, "sync_initializing");
  assert.deepEqual(result.effectDispatches, [
    { effectType: "start_countdown", adapter: "studio_shell" },
  ]);
  assert.deepEqual(callLog, [
    "studio:countdown",
    "capture:establish_t0",
    "capture:emit_sync_marker",
    "capture:start_local_recording",
    "broadcast:start",
  ]);
});
