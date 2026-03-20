# Bellows V1 Phase Seven Tongs Recovery Persistence

## Hard Law

Bellows recovery truth must be shaped for runtime recovery first, not retrofitted
from planner or calendar storage.

This requires a DB migration / RLS update.

The migration for this phase is:

- `supabase/migrations/20260319173000_tongs_bellows_runtime_sessions.sql`

## Purpose

Phase Seven turns Bellows from a runtime harness with an in-memory persistence seam
into a Tongs-backed recovery system with canonical session identity and append-only
runtime checkpoints.

This phase does not implement capture, signaling, or broadcast adapters. Those
remain seams until Bellows recovery is stable.

## Canonical Tables

### `tongs.bellows_sessions`

One row per Bellows runtime session. This is the canonical session header.

Primary responsibilities:

- stable Bellows session identity
- workspace and host ownership
- current lifecycle/state projection for fast queries
- authority projection for recovery and operator visibility
- optional linkage to planner/calendar entities without making them canonical
- latest checkpoint pointer for deterministic rehydration

Canonical columns:

- `id text primary key`
  Bellows `sessionId`. This stays Bellows-owned and is not forced into a planner UUID shape.
- `workspace_id uuid not null`
  Canonical workspace linkage into Tongs.
- `host_user_id text not null`
  Bellows host user identity as a Bellows-owned string.
- `title`, `mode`, `session_type`
  Operator-facing header identity.
- `recording_session_id uuid null`
  Optional link to `tongs.recording_sessions`.
- `calendar_event_id uuid null`
  Optional link to `tongs.calendar_events`.
- `acting_authority_state`, `host_participant_id`, `acting_host_participant_id`, `co_host_participant_ids`
  Current authority projection.
- `lifecycle_state`, `recording_state`, `broadcast_state`, `upload_state`, `seal_state`, `outcome`, `integrity_flags`
  Current runtime recovery projection.
- `snapshot_schema_version`
  Version of the latest checkpoint snapshot Bellows expects to rehydrate.
- `latest_checkpoint_id`
  Canonical pointer to the checkpoint Bellows should trust first on restore.
- `created_at`, `started_at`, `ended_at`, `sealed_at`, `archived_at`, `updated_at`
  Runtime lifecycle timestamps.

### `tongs.bellows_session_checkpoints`

Append-only recovery log.

Primary responsibilities:

- deterministic recovery checkpoints
- audit history
- persistence-side effect observation
- lifecycle/integrity/sealing milestones
- latest-checkpoint repair path

Canonical columns:

- `id uuid primary key`
  Checkpoint identity.
- `session_id text not null`
  Foreign key to `tongs.bellows_sessions`.
- `sequence_no bigint not null`
  Monotonic ordering within a Bellows session.
- `checkpoint_kind`
  Canonical checkpoint classification.
- `trigger_action_source`, `trigger_action_type`
  Which Bellows action led to this checkpoint.
- `actor_type`, `actor_id`
  Who or what caused the transition.
- `effect_type`, `follow_up_action_source`, `follow_up_action_type`
  Runtime adapter side-effects and any reducer follow-up they produced.
- `offset_ms`, `occurred_at`, `recorded_at`
  Bellows-relative and wall-clock timing.
- `lifecycle_state`, `recording_state`, `broadcast_state`, `upload_state`, `seal_state`, `outcome`, `integrity_flags`
  State projection at checkpoint time.
- `acting_authority_state`, `host_participant_id`, `acting_host_participant_id`, `co_host_participant_ids`
  Authority projection at checkpoint time.
- `event_count`
  Event stream size at checkpoint time.
- `snapshot_schema_version`
  Snapshot compatibility gate.
- `session_snapshot jsonb not null`
  Full Bellows rehydration snapshot. Phase Seven prefers recovery determinism over delta-only compactness.
- `delta jsonb null`
  Optional minimal change payload for debugging, analytics, or future replay tools.

## Why Checkpoint Snapshots Win

Phase Seven chooses full recovery snapshots plus relational state columns, not
delta-only persistence.

Reasons:

- Bellows recovery is more important than storage minimization in the first canonical slice.
- Nursery must be able to restore the latest usable runtime truth without replaying an uncertain partial stream.
- Indexed relational columns make it cheap to find active sessions.
- Full snapshots make it cheap to restore the runtime exactly enough to continue operation.

## Header And Checkpoint Disagreement Rules

These are canonical:

1. If `latest_checkpoint_id` points to a valid checkpoint for the same session, that checkpoint wins.
2. If the header pointer is null but checkpoints exist, the highest `sequence_no` wins and the header should be repaired.
3. If the header pointer is invalid or points outside the session, the highest `sequence_no` wins and the header should be repaired.
4. The session header is a query projection and recovery pointer cache. The pointed checkpoint is the authoritative rehydration source.
5. If the latest checkpoint snapshot schema is unsupported, the session is not resumable until migrated or explicitly archived.

## Resumable, Sealed, And Abandoned

Phase Seven keeps this strict:

- `resumable`
  The session has a latest checkpoint with a supported snapshot schema, and the latest lifecycle is not one of:
  `sealed`, `incomplete_capture`, `failed_capture`, `archived`.
- `sealed`
  The latest lifecycle is `sealed`, or the header has `sealed_at` set with a pointed checkpoint in a seal terminal state.
- `abandoned`
  Not a Bellows lifecycle and not persisted as canonical truth in Phase Seven.

Bellows does not currently have an `abandoned` runtime state. Phase Seven therefore
does not invent one in the schema. Nursery may classify a non-terminal session as
operationally stale for UI purposes, but that is derived operator logic, not stored
Bellows truth.

## Rehydration Contract

### How Nursery finds the current Bellows session

For a workspace launch:

1. Query `tongs.bellows_sessions` by `workspace_id`.
2. Restrict to non-terminal lifecycles:
   `idle`, `configuring`, `linking_accounts`, `inviting`, `waiting_for_participants`,
   `preflight_ready`, `preflight_checks`, `ready_to_start`, `countdown`,
   `sync_initializing`, `recording_active`, `recording_degraded`,
   `recording_offline_local`, `recording_rejoining`, `finalizing_local`, `uploading`,
   `upload_degraded`, `upload_paused`, `upload_resuming`,
   `upload_complete_pending_verification`, `verifying_integrity`,
   `assembling_manifest`, `sealing_session`.
3. Order by `updated_at desc`.
4. Load the first row’s `latest_checkpoint_id`.
5. Rehydrate from that checkpoint snapshot.

If no non-terminal session exists, Bellows starts a new session header.

### What Bellows restores

Bellows restores from the latest checkpoint snapshot, not from planner data and not
from the header alone.

The restore source is:

- checkpoint `session_snapshot`
- guarded by `snapshot_schema_version`
- cross-checked against header `sessionId`, `workspaceId`, and `latest_checkpoint_id`

### What if the stream and header disagree

Use the latest valid checkpoint for the session. Then repair the header pointer with
`markLatestCheckpoint` or its SQL equivalent.

### What gets linked but not trusted as recovery truth

- `tongs.recording_sessions`
- `tongs.calendar_events`

These remain optional linked context only. They never outrank Bellows checkpoints.

## RLS Model

### Reads

- workspace `viewer` or higher can read headers and checkpoints
- this supports shared operational visibility inside the workspace

### Writes

- workspace `editor` or higher can create/update Bellows headers
- workspace `editor` or higher can append checkpoints

### Guests

- Bellows guests are not granted direct canonical table access by Phase Seven
- guest participation is runtime/session behavior, not Tongs table authority

### Deletes

- authenticated delete is intentionally not granted
- Bellows should archive, not casually delete, canonical recovery truth

### Service role

- service role retains execution rights for repair, server-side orchestration, and future background workers

## Adapter Contract

The runtime-facing contract lives at:

- `apps/bellows/src/runtime/tongs-persistence-contract.ts`

Canonical operations:

- `createSessionHeader`
  Create the Bellows session header at runtime creation.
- `syncSessionHeader`
  Update mutable non-checkpoint header fields such as title or optional planner links.
- `appendRecoveryCheckpoint`
  Append one recovery checkpoint and atomically advance the header projection.
- `markLatestCheckpoint`
  Repair-only operation when the header pointer must be reconciled to an existing checkpoint.
- `loadSessionHeader`
  Load the canonical header.
- `loadLatestCheckpoint`
  Load the pointed checkpoint used for recovery.
- `loadRecoveryStream`
  Load checkpoint history for audit or repair.
- `loadRehydrationBundle`
  Load header plus latest checkpoint in one application-level call.
- `loadMostRecentSession`
  Load the latest Bellows session for a workspace, including terminal sessions.
- `loadMostRecentRecoverableSession`
  Find the workspace session Bellows should attempt to resume.
- `sealSession`
  Semantic alias for appending the terminal seal checkpoint.

## SQL Helpers In This Phase

The migration adds these RPC-safe database functions:

- `tongs.create_bellows_session_header(...)`
- `tongs.append_bellows_session_checkpoint(...)`
- `tongs.mark_bellows_session_latest_checkpoint(...)`

Normal operation should use `append_bellows_session_checkpoint(...)` so checkpoint
insert and header advancement happen in one transaction.

`mark_bellows_session_latest_checkpoint(...)` exists for repair and reconciliation,
not the happy path.

## Exact App Code Changes Needed To Use This

Phase Seven implementation should wire in these code changes next:

1. Add `apps/bellows/src/runtime/tongs-persistence-adapter.ts`.
   Implement `BellowsTongsSessionRepository` against Supabase using the new tables and RPCs.
2. Add `apps/nursery/src/lib/bellows/bellowsTongsRepository.ts`.
   Keep Nursery’s Supabase query details out of Bellows package code.
3. Update `apps/bellows/src/runtime/persistence-adapter.ts`.
   Allow a canonical Tongs-backed store/repository instead of only `BellowsMemoryPersistenceStore`.
4. Update `apps/bellows/src/runtime/operator-console-harness.ts`.
   Support injecting the Tongs-backed persistence repository for non-demo runs.
5. Update `apps/nursery/src/routes/BellowsStandalone.tsx`.
   Replace the hardcoded demo session bootstrap with:
   - load most recent recoverable session for the active workspace
   - rehydrate from latest checkpoint if present
   - otherwise create a new header and initial checkpoint
6. Add Bellows persistence tests.
   Cover:
   - header creation
   - checkpoint append ordering
   - header pointer advancement
   - rehydration preference for latest valid checkpoint
   - header/checkpoint disagreement repair
   - RLS access expectations

## Phase Boundary

Phase Seven still does not mean:

- real capture transport
- real broadcast transport
- signaling implementation
- media artifact persistence
- Bellows-to-Hammer handoff persistence

It means Bellows session recovery truth now has a canonical home in Tongs.
