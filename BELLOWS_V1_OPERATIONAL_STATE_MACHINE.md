# Bellows V1 Operational State Machine

This document defines the canonical Bellows operational state machine for V1.

Its purpose is to ensure that Bellows behaves like a controlled machine rather than a loose collection of async features.

This state model exists to guarantee:

- no illegal combinations of conditions
- predictable behavior under stress
- deterministic recovery
- implementation clarity
- future extensibility without regressions

Core goal:

Every observable situation maps to exactly one legal state.

## Fundamental Principle

Bellows is not merely running or stopped.

Bellows is always in a well-defined state.

Actions do not change reality directly. Actions request state transitions.

## Top-Level State Categories

### 1. Setup Phase

Before anything irreversible happens.

States:

- `idle`: Bellows opened, no session yet
- `configuring`: host editing setup
- `linking_accounts`: OAuth or key-link flow active
- `inviting`: participants being invited
- `waiting_for_participants`: join links issued, awaiting arrivals
- `preflight_ready`: minimum participants present

### 2. Pre-Show Phase

The system is locked for start, but not yet recording.

States:

- `preflight_checks`: device permissions, readiness checks, bandwidth checks
- `ready_to_start`: host may begin
- `countdown`: optional sync countdown
- `sync_initializing`: `T0` establishment and start marker initialization

### 3. Recording Phase

The core operational recording state family.

Primary states:

- `recording_active`
- `recording_degraded`: recording continues with missing participants or degraded conditions
- `recording_offline_local`: recording continues locally while network connectivity is lost
- `recording_rejoining`: recording continues while one or more participants are rejoining

Important rule:

Recording never pauses automatically.

### 4. Broadcast Sub-State

Broadcast is not a top-level state. It overlays recording state when live transmission is enabled.

Possible broadcast states:

- `not_broadcasting`
- `broadcast_starting`
- `broadcast_live`
- `broadcast_degraded`
- `broadcast_disconnected`
- `broadcast_ended`

Recording continues regardless of broadcast overlay state.

### 5. Upload Phase

The upload phase begins when recording stops.

States:

- `finalizing_local`
- `uploading`
- `upload_degraded`
- `upload_paused`
- `upload_resuming`
- `upload_complete_pending_verification`

This is the phase where the safe-to-close progress bar lives.

### 6. Sealing Phase

This is the engine-controlled canonicalization phase.

States:

- `verifying_integrity`
- `assembling_manifest`
- `sealing_session`

These states are engine-controlled only.

### 7. Terminal States

These are lifecycle end states.

States:

- `sealed`: success
- `incomplete_capture`: usable but flawed
- `failed_capture`: unrecoverable
- `archived`: reserved future lifecycle stage

## State Transition Rules

All transitions must be:

- explicit
- atomic
- logged
- validated

Illegal transitions must be rejected.

Example:

Bellows cannot transition directly from `idle` to `recording_active`.

It must pass through valid setup and pre-show states first.

## Recovery Entry Points

Bellows must allow recovery entry into valid states after crashes, disconnects, or reloads.

Examples:

- user reloads during recording:
  - re-enter `recording_active` or `recording_offline_local`
- user reconnects during upload:
  - re-enter `upload_resuming`

Recovery paths must land in valid machine states, not ad hoc fallback modes.

## Authority Integration

Host actions request transitions.

The engine decides whether the transition is legal.

Example:

When the Host presses Stop Recording, the engine checks:

- is recording active
- are there unsaved buffers
- is storage full
- are uploads already in progress

Only then may it transition out of recording.

## Safety Locks

Certain states restrict or deny specific actions.

Examples:

- during `uploading`:
  - participants may not exit cleanly without warning or recovery consequences
- during `sealing_session`:
  - no mutable changes are allowed
- during `recording_active`:
  - session structure cannot be modified

These locks are part of the machine, not optional UX hints.

## Derived UI Behavior

The UI must reflect state. The UI must not invent state.

Example:

The Go Live button appears only when the machine is in `ready_to_start`, not because several unrelated flags happen to be true.

UI availability must be derived from machine state.

## Multi-Participant Coordination

Participants may be in different local sub-states while the session retains one authoritative session state.

Example:

If one participant goes offline, the session does not become globally offline. It transitions to a degraded recording state instead.

The session state is authoritative over participant-local perception.

## Idempotency

Repeated actions must not break the machine.

Example:

If Start Recording is clicked twice, the second request is ignored or rejected because the current state no longer permits that transition.

Transitions must be idempotent where repeated requests are plausible.

## Observability

Every state change should emit a structured record that includes:

- timestamp
- triggering event
- actor: host, engine, system, or participant
- prior state
- new state

This is critical for debugging, recovery analysis, and future automation.

## Canonical State Principle

Bellows behaves like a controlled machine, not a collection of features.

## Why This Matters

Without a formal state machine:

- edge cases multiply exponentially
- bugs become unreproducible
- recovery logic breaks
- live shows become risky

With a formal state machine:

- behavior is predictable
- testing is easier
- refactors are safer
- automation is more trustworthy
- reliability improves materially

## V1 Acceptance Criteria

The Bellows state model is sufficient only when all of the following are true:

- every UI-visible situation maps to a defined state
- no action bypasses transition rules
- recovery paths lead to valid states
- terminal states are final
- recording integrity is never compromised by transitions
