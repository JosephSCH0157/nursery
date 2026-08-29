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
import { createBellowsPersistenceHarness } from "../../src/index.js";

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
  const sessionId = asSessionId("session-persistence-1");
  const workspaceId = asWorkspaceId("workspace-persistence-1");
  const hostUserId = asUserId("user-host");
  const hostParticipantId = asParticipantId("participant-host");
  const coHostParticipantId = asParticipantId("participant-cohost");

  const session: BellowsSession = {
    sessionId,
    workspaceId,
    workpieceId: "workpiece-persistence-1" as never,
    recordingCaptureAuthorityId: "capture-authority-persistence-1" as never,
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
      workpieceId: "workpiece-persistence-1" as never,
      hostUserId,
      mode: "live",
      sessionType: "remote",
      title: "Bellows persistence test session",
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
      lifecycle: "finalizing_local",
      broadcast: "ended",
      outcome: null,
    },
    recordingState: "stopped",
    broadcastState: "ended",
    uploadState: "finalizing_local",
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

test("persistence harness records resume-upload intent and snapshots upload state", async () => {
  const { session } = createSession();
  const harness = createBellowsPersistenceHarness({
    initialState: session,
    engineContext: createContext(),
    persistence: {
      resumeUploadsResolution: "manual",
    },
  });

  const result = await harness.dispatch({
    source: "capture",
    type: "LOCAL_SEGMENTS_FINALIZED",
    payload: {},
    meta: {
      actorId: "system",
      offsetMs: asOffset(10),
    },
  });

  assert.equal(result.transition.kind, "accepted");
  assert.equal(result.transition.state.machineState.lifecycle, "uploading");
  assert.equal(harness.getState().machineState.lifecycle, "uploading");
  assert.deepEqual(harness.getPersistenceObservations(), [
    {
      effectType: "resume_pending_uploads",
      triggerActionType: "LOCAL_SEGMENTS_FINALIZED",
      lifecycleAtDispatch: "uploading",
      followUpActionType: null,
      snapshot: {
        lifecycle: "uploading",
        recordingState: "stopped",
        broadcastState: "ended",
        uploadState: "uploading",
        sealState: "not_started",
        integrityFlags: [],
        eventCount: 1,
      },
    },
  ]);
});

test("persistence harness can auto-complete uploads from the resume intent", async () => {
  const { session } = createSession();
  const harness = createBellowsPersistenceHarness({
    initialState: session,
    engineContext: createContext(),
  });

  const result = await harness.dispatch({
    source: "capture",
    type: "LOCAL_SEGMENTS_FINALIZED",
    payload: {},
    meta: {
      actorId: "system",
      offsetMs: asOffset(20),
    },
  });

  assert.equal(result.transition.kind, "accepted");
  assert.equal(result.transition.state.machineState.lifecycle, "uploading");
  assert.equal(harness.getState().machineState.lifecycle, "upload_complete_pending_verification");
  assert.deepEqual(harness.getPersistenceObservations(), [
    {
      effectType: "resume_pending_uploads",
      triggerActionType: "LOCAL_SEGMENTS_FINALIZED",
      lifecycleAtDispatch: "uploading",
      followUpActionType: "UPLOADS_COMPLETE",
      snapshot: {
        lifecycle: "uploading",
        recordingState: "stopped",
        broadcastState: "ended",
        uploadState: "uploading",
        sealState: "not_started",
        integrityFlags: [],
        eventCount: 1,
      },
    },
  ]);
});

test("persistence harness can drive verification through manifest assembly to sealed", async () => {
  const { session } = createSession({
    machineState: {
      lifecycle: "upload_complete_pending_verification",
      broadcast: "ended",
      outcome: null,
    },
    uploadState: "complete_pending_verification",
  });
  const harness = createBellowsPersistenceHarness({
    initialState: session,
    engineContext: createContext(),
  });

  const result = await harness.dispatch({
    source: "engine",
    type: "BEGIN_INTEGRITY_VERIFICATION",
    payload: {},
    meta: {
      actorId: "engine",
      offsetMs: asOffset(30),
    },
  });

  assert.equal(result.transition.kind, "accepted");
  assert.equal(result.transition.state.machineState.lifecycle, "verifying_integrity");
  assert.equal(harness.getState().machineState.lifecycle, "sealed");
  assert.deepEqual(
    harness.getPersistenceObservations().map((observation) => ({
      effectType: observation.effectType,
      followUpActionType: observation.followUpActionType,
      lifecycleAtDispatch: observation.lifecycleAtDispatch,
    })),
    [
      {
        effectType: "verify_integrity",
        followUpActionType: "INTEGRITY_VERIFIED",
        lifecycleAtDispatch: "verifying_integrity",
      },
      {
        effectType: "assemble_manifest",
        followUpActionType: "MANIFEST_ASSEMBLED",
        lifecycleAtDispatch: "assembling_manifest",
      },
      {
        effectType: "seal_session_record",
        followUpActionType: "SESSION_SEALED",
        lifecycleAtDispatch: "sealing_session",
      },
    ],
  );
  assert.deepEqual(
    harness.getPersistenceSnapshots().map((snapshot) => snapshot.lifecycle),
    ["verifying_integrity", "assembling_manifest", "sealing_session"],
  );
});
