# BELLOWS V1 - Domain Type Inventory

## Purpose

Define the first code-level Bellows entities, identifiers, and enum-like unions that must exist before UI work starts.

## Type System Guidance

Prefer TypeScript string-literal unions and discriminated unions over runtime `enum` declarations unless a runtime enum object is explicitly needed.

The goal is:

- strong type narrowing
- zero ambiguity in state handling
- no accidental string drift

## Tier 1 Types - Must Exist Before UI

These are the first Bellows domain types that should be implemented before any meaningful UI work begins.

### Identifiers

- `WorkspaceId`
- `SessionId`
- `UserId`
- `ParticipantId`
- `InviteTokenId`
- `BroadcastTargetId`
- `TrackId`
- `SegmentId`
- `ArtifactId`
- `ScriptId`
- `ScriptRevisionId`

### Core entities

- `BellowsSessionDraft`
- `BellowsSession`
- `BellowsParticipant`
- `BellowsRoleAssignment`
- `BellowsAuthorityState`
- `BellowsTrack`
- `BellowsSegment`
- `BellowsBroadcastTarget`
- `BellowsSyncMarker`
- `BellowsSessionEvent`
- `BellowsMachineState`
- `BellowsEngineAction`
- `BellowsEngineEffect`

### Core value objects

- `BellowsTimestampMs`
- `BellowsDurationMs`
- `BellowsOffsetMs`
- `BellowsDriftEstimateMs`
- `BellowsResolution`
- `BellowsFrameRate`
- `BellowsAudioFormat`
- `BellowsChecksum`

## Tier 2 Types - Add Shortly After Engine Work Starts

- `BellowsLayoutSnapshot`
- `BellowsScriptReference`
- `BellowsUploadProgress`
- `BellowsCapturePackageManifest`
- `BellowsIntegrityReport`
- `BellowsParticipantRuntime`
- `BellowsRecordingReadiness`

## Recommended Enum-Like Unions

### Session configuration

- `BellowsSessionMode = "record_only" | "live"`
- `BellowsSessionType = "remote" | "hybrid" | "solo"`
- `BellowsPlatform = "youtube" | "rumble" | "custom_rtmp"`

### Roles and authority

- `BellowsRoleCode = "S1" | "S2" | "G1" | "G2"`
- `BellowsAuthorityTier = "host" | "co_host" | "guest" | "engine"`
- `BellowsActingAuthorityState = "host_present" | "co_host_promoted" | "engine_stewardship"`

### Participant runtime

- `BellowsPresenceState = "invited" | "joining" | "ready" | "connected" | "disconnected" | "removed"`
- `BellowsJoinState = "pending" | "approved" | "rejected"`
- `BellowsDeviceReadinessState = "unknown" | "pending" | "ready" | "blocked"`
- `BellowsCameraState = "enabled" | "disabled" | "failed"`
- `BellowsMicrophoneState = "enabled" | "disabled" | "failed"`

### Recording and capture

- `BellowsRecordingState = "idle" | "countdown" | "sync_initializing" | "active" | "degraded" | "offline_local" | "rejoining" | "stopping" | "stopped"`
- `BellowsTrackKind = "video" | "audio"`
- `BellowsContinuityFlag = "complete" | "partial" | "dropped"`
- `BellowsSegmentBoundaryReason = "initial" | "rejoin" | "device_restart" | "permission_reset" | "storage_rollover" | "manual_stop" | "crash_recovery"`

### Broadcast

- `BellowsBroadcastState = "not_broadcasting" | "starting" | "live" | "degraded" | "disconnected" | "ended"`
- `BellowsBroadcastIntent = "none" | "single_platform" | "multi_platform"`

### Upload and sealing

- `BellowsUploadState = "not_started" | "finalizing_local" | "uploading" | "degraded" | "paused" | "resuming" | "complete_pending_verification"`
- `BellowsSealState = "not_started" | "verifying_integrity" | "assembling_manifest" | "sealing_session" | "sealed"`
- `BellowsSessionOutcome = "sealed" | "incomplete_capture" | "failed_capture" | "archived"`

### Integrity and failure flags

- `BellowsIntegrityFlag = "missing_track" | "degraded_quality" | "participant_dropout" | "upload_interrupted" | "resync_required" | "corrupted_capture"`
- `BellowsFailureClass = "minor_disruption" | "participant_disruption" | "critical_disruption"`

## Recommended First-Pass Entity Shapes

### `BellowsSessionDraft`

Purpose:

- host-edited configuration before the session is locked

Fields:

- `sessionId`
- `workspaceId`
- `hostUserId`
- `mode`
- `sessionType`
- `title`
- `participantSlots`
- `scriptReference`
- `broadcastTargets`
- `scheduledTimeUtc`

### `BellowsSession`

Purpose:

- canonical runtime session aggregate used by engine and adapters

Fields:

- `sessionId`
- `workspaceId`
- `hostUserId`
- `actingAuthorityState`
- `draft`
- `participants`
- `machineState`
- `recordingState`
- `broadcastState`
- `uploadState`
- `sealState`
- `timeline`
- `integrityFlags`

### `BellowsParticipant`

Purpose:

- session-scoped participant identity

Fields:

- `participantId`
- `userId`
- `displayName`
- `roleCode`
- `authorityTier`
- `presenceState`
- `joinState`
- `joinedAtOffsetMs`
- `leftAtOffsetMs`

### `BellowsTrack`

Purpose:

- raw participant capture source

Fields:

- `trackId`
- `participantId`
- `kind`
- `codec`
- `resolution`
- `frameRate`
- `audioFormat`
- `continuityFlag`
- `segmentIds`

### `BellowsSegment`

Purpose:

- one continuous recording interval for a participant track

Fields:

- `segmentId`
- `trackId`
- `sequenceNumber`
- `startOffsetMs`
- `durationMs`
- `boundaryReason`
- `checksum`
- `continuityFlag`

### `BellowsBroadcastTarget`

Purpose:

- configured external live destination

Fields:

- `broadcastTargetId`
- `platform`
- `enabled`
- `credentialRef`
- `displayLabel`

### `BellowsSessionEvent`

Purpose:

- immutable domain event for state, audit, and recovery

Fields:

- `eventId`
- `sessionId`
- `type`
- `actorType`
- `actorId`
- `offsetMs`
- `payload`

## First Required Action Types

These are not UI actions. They are engine inputs.

- `HostAction`
- `CoHostAction`
- `ParticipantAction`
- `CaptureSignal`
- `ConnectivitySignal`
- `BroadcastSignal`
- `UploadSignal`
- `RecoverySignal`
- `EngineAction`

## File Placement Recommendation

Start with these files:

```text
src/domain/
  ids.ts
  primitives.ts
  roles.ts
  authority.ts
  session.ts
  participant.ts
  track.ts
  segment.ts
  broadcast.ts
  events.ts
  state.ts
  index.ts
```

Do not begin UI work until these files exist and can support reducer and test compilation.
