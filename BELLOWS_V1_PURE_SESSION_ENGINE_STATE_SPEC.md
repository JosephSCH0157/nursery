# BELLOWS V1 - Pure Session Engine State Spec

## Purpose

Translate the Bellows operational state machine into a code-ready pure engine contract with explicit transitions, guards, and emitted effects.

## Engine Rule

The session engine is pure logic.

It does not:

- call browser APIs
- talk to the network
- start recorders directly
- write to Supabase directly
- mutate UI state

Instead, it accepts actions, validates transitions, updates state, and emits effects for adapters to perform.

## Recommended Engine Contract

```ts
type BellowsTransitionResult = {
  state: BellowsMachineState
  events: BellowsSessionEvent[]
  effects: BellowsEngineEffect[]
  rejectedAction?: BellowsRejectedAction
}

type BellowsEngine = (
  state: BellowsMachineState,
  action: BellowsEngineAction,
) => BellowsTransitionResult
```

## Canonical State Model

Represent Bellows as one discriminated union for lifecycle state plus one broadcast overlay field.

### Lifecycle states

- `idle`
- `configuring`
- `linking_accounts`
- `inviting`
- `waiting_for_participants`
- `preflight_ready`
- `preflight_checks`
- `ready_to_start`
- `countdown`
- `sync_initializing`
- `recording_active`
- `recording_degraded`
- `recording_offline_local`
- `recording_rejoining`
- `finalizing_local`
- `uploading`
- `upload_degraded`
- `upload_paused`
- `upload_resuming`
- `upload_complete_pending_verification`
- `verifying_integrity`
- `assembling_manifest`
- `sealing_session`
- `sealed`
- `incomplete_capture`
- `failed_capture`
- `archived`

### Broadcast overlay

- `not_broadcasting`
- `broadcast_starting`
- `broadcast_live`
- `broadcast_degraded`
- `broadcast_disconnected`
- `broadcast_ended`

Broadcast overlay does not create a second session state machine. It annotates recording-phase behavior only.

## Required State Shape

```ts
type BellowsMachineState = {
  lifecycle: BellowsLifecycleState
  broadcast: BellowsBroadcastState
  session: BellowsSession
  participants: Record<ParticipantId, BellowsParticipantRuntime>
  pendingEffects: readonly BellowsEngineEffect[]
}
```

Recommended rule:

- `lifecycle` is authoritative
- `broadcast` may only be non-default when Bellows is in a recording or post-recording lifecycle

## Action Classes

The engine should consume normalized actions from adapters:

- `HostAction`
- `CoHostAction`
- `ParticipantAction`
- `CaptureSignal`
- `ConnectivitySignal`
- `BroadcastSignal`
- `UploadSignal`
- `RecoverySignal`
- `EngineAction`

## Transition Output Rule

Every accepted transition must emit:

- updated machine state
- at least one session event
- zero or more effects

Every rejected action must emit:

- unchanged state
- a rejection event
- no destructive effects

## Core Guards

These guards should exist before transition work grows:

- `isHostOrActingHost`
- `isCoHostWithinDelegatedAuthority`
- `isSessionDraftValid`
- `hasConfiguredParticipantSlots`
- `hasSatisfiedPreflightRequirements`
- `hasMinimumReadyParticipants`
- `canEnterCountdown`
- `canEstablishT0`
- `canStartRecording`
- `canStopRecording`
- `canResumeAfterRecovery`
- `canEnterUploadPhase`
- `canMarkUploadComplete`
- `canSealSession`
- `canArchiveTerminalSession`

## Canonical Effects

The engine should emit effect descriptions, not perform work directly.

Recommended first-pass effects:

- `run_preflight_checks`
- `generate_invite_links`
- `start_countdown`
- `establish_t0`
- `emit_sync_marker`
- `start_local_recording`
- `start_broadcast`
- `stop_broadcast`
- `finalize_local_segments`
- `resume_pending_uploads`
- `verify_integrity`
- `assemble_manifest`
- `seal_session_record`
- `promote_co_host`
- `enter_engine_stewardship`

## Transition Spec

### Setup phase

`idle`

- `HOST_BEGIN_SETUP` -> `configuring`
  - guard: actor is host

`configuring`

- `HOST_UPDATE_DRAFT` -> `configuring`
  - guard: draft mutation is valid
- `HOST_BEGIN_ACCOUNT_LINK` -> `linking_accounts`
- `HOST_BEGIN_INVITES` -> `inviting`
  - guard: participant slots configured
- `HOST_WAIT_FOR_PARTICIPANTS` -> `waiting_for_participants`
  - guard: invite links exist
- `HOST_RUN_PREFLIGHT` -> `preflight_checks`
  - guard: session draft valid
  - effect: `run_preflight_checks`

`linking_accounts`

- `PLATFORM_LINK_SUCCEEDED` -> `configuring`
- `PLATFORM_LINK_FAILED` -> `configuring`

`inviting`

- `INVITES_GENERATED` -> `waiting_for_participants`
  - effect on entry: `generate_invite_links`

`waiting_for_participants`

- `PARTICIPANT_JOINED` -> `waiting_for_participants`
- `PARTICIPANT_READY` -> `waiting_for_participants`
- `MINIMUM_READY_REACHED` -> `preflight_ready`
  - guard: minimum ready participants satisfied

`preflight_ready`

- `PARTICIPANT_BECAME_UNREADY` -> `waiting_for_participants`
- `HOST_RUN_PREFLIGHT` -> `preflight_checks`
  - effect: `run_preflight_checks`

### Pre-show phase

`preflight_checks`

- `PREFLIGHT_PASSED` -> `ready_to_start`
  - guard: all blocking checks passed
- `PREFLIGHT_FAILED` -> `configuring`

`ready_to_start`

- `PARTICIPANT_BECAME_UNREADY` -> `preflight_ready`
- `HOST_START_SHOW` -> `countdown`
  - guard: preflight passed, minimum participants ready, countdown not already running
  - effect: `start_countdown`

`countdown`

- `HOST_ABORT_START` -> `ready_to_start`
- `COUNTDOWN_COMPLETED` -> `sync_initializing`
  - effect: `establish_t0`
  - effect: `emit_sync_marker`
  - effect: `start_local_recording`
  - effect: `start_broadcast` when session mode is live

`sync_initializing`

- `CAPTURE_STARTED_FOR_ALL_REQUIRED_PARTICIPANTS` -> `recording_active`
  - guard: T0 established and recorders confirmed
- `CAPTURE_STARTED_WITH_MISSING_PARTICIPANT` -> `recording_degraded`
  - guard: T0 established and at least one required recorder confirmed

### Recording phase

`recording_active`

- `PARTICIPANT_DISCONNECTED` -> `recording_degraded`
- `PARTICIPANT_NETWORK_LOST_LOCAL_CAPTURE_OK` -> `recording_offline_local`
- `HOST_END_SESSION` -> `finalizing_local`
  - guard: actor is host or acting host
  - effect: `stop_broadcast`
  - effect: `finalize_local_segments`
- `HOST_STOP_BROADCAST` -> `recording_active`
  - effect: `stop_broadcast`
- `HOST_START_BROADCAST` -> `recording_active`
  - guard: live targets were configured during setup
  - effect: `start_broadcast`

`recording_degraded`

- `PARTICIPANT_RECONNECTED` -> `recording_active`
  - guard: all required participants restored
- `PARTICIPANT_REJOIN_STARTED` -> `recording_rejoining`
- `HOST_END_SESSION` -> `finalizing_local`
  - effect: `stop_broadcast`
  - effect: `finalize_local_segments`

`recording_offline_local`

- `NETWORK_RESTORED` -> `recording_active`
  - effect: `resume_pending_uploads`
- `PARTICIPANT_REJOIN_STARTED` -> `recording_rejoining`
- `HOST_END_SESSION` -> `finalizing_local`
  - effect: `stop_broadcast`
  - effect: `finalize_local_segments`

`recording_rejoining`

- `PARTICIPANT_REJOIN_CONFIRMED` -> `recording_active`
- `PARTICIPANT_REJOIN_FAILED` -> `recording_degraded`
- `HOST_END_SESSION` -> `finalizing_local`
  - effect: `stop_broadcast`
  - effect: `finalize_local_segments`

### Host authority recovery

From any `recording_*` state:

- `HOST_DISCONNECTED` -> same lifecycle state with updated authority
  - guard branch A: co-host available
    - effect: `promote_co_host`
  - guard branch B: no co-host available
    - effect: `enter_engine_stewardship`

Authority loss does not automatically discard recording state.

### Upload phase

`finalizing_local`

- `LOCAL_SEGMENTS_FINALIZED` -> `uploading`
  - effect: `resume_pending_uploads`

`uploading`

- `UPLOAD_PROGRESS_RECORDED` -> `uploading`
- `UPLOAD_DEGRADED` -> `upload_degraded`
- `UPLOAD_PAUSED` -> `upload_paused`
- `UPLOADS_COMPLETE` -> `upload_complete_pending_verification`

`upload_degraded`

- `UPLOAD_RESUME_REQUESTED` -> `upload_resuming`
  - effect: `resume_pending_uploads`
- `UPLOAD_PAUSED` -> `upload_paused`

`upload_paused`

- `UPLOAD_RESUME_REQUESTED` -> `upload_resuming`
  - effect: `resume_pending_uploads`

`upload_resuming`

- `UPLOAD_PROGRESS_RECORDED` -> `uploading`
- `UPLOAD_RESUME_FAILED` -> `upload_degraded`

`upload_complete_pending_verification`

- `BEGIN_INTEGRITY_VERIFICATION` -> `verifying_integrity`
  - effect: `verify_integrity`

### Sealing phase

`verifying_integrity`

- `INTEGRITY_VERIFIED` -> `assembling_manifest`
  - effect: `assemble_manifest`
- `INTEGRITY_PARTIAL_BUT_USABLE` -> `assembling_manifest`
  - effect: `assemble_manifest`
- `INTEGRITY_FATAL` -> `failed_capture`

`assembling_manifest`

- `MANIFEST_ASSEMBLED` -> `sealing_session`
  - effect: `seal_session_record`

`sealing_session`

- `SESSION_SEALED` -> `sealed`
- `SESSION_SEALED_WITH_GAPS` -> `incomplete_capture`
- `SESSION_SEAL_FAILED_FATAL` -> `failed_capture`

### Terminal phase

`sealed`

- `ARCHIVE_REQUESTED` -> `archived`

`incomplete_capture`

- `ARCHIVE_REQUESTED` -> `archived`

`failed_capture`

- `ARCHIVE_REQUESTED` -> `archived`

## Illegal Transition Rules

The engine must reject:

- `HOST_START_SHOW` from any state other than `ready_to_start`
- `HOST_END_SESSION` when Bellows is not in a recording lifecycle
- `HOST_UPDATE_DRAFT` after Bellows leaves setup lifecycle
- `HOST_START_BROADCAST` if no live targets were configured in setup
- `UPLOADS_COMPLETE` before `finalizing_local` or upload lifecycle
- `SESSION_SEALED` before `sealing_session`

## Recovery Entry Points

These are valid re-entry transitions after crash or reload:

- `RECOVER_RECORDING_ACTIVE` -> one of `recording_active`, `recording_degraded`, `recording_offline_local`
- `RECOVER_UPLOAD_IN_PROGRESS` -> `upload_resuming`
- `RECOVER_FINALIZING_LOCAL` -> `finalizing_local`
- `RECOVER_INCOMPLETE_CAPTURE` -> `incomplete_capture`

Recovery actions must reconstruct state from persisted facts and verified local artifacts, not from UI memory.

## Testing Priority

Write engine tests in this order:

1. setup to ready-to-start transitions
2. countdown to recording transitions
3. host disconnect and co-host promotion behavior
4. recording degradation and rejoin behavior
5. upload and sealing transitions
6. illegal transition rejection cases

## Implementation Rule

If UI state and engine state ever disagree, engine state wins.
