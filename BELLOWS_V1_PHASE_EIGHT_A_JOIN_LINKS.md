# Bellows V1 Phase Eight A Join Links

## Hard Law

Bellows join URLs are canonical access artifacts. They are not client-owned state,
not route-only conveniences, and not derived from arbitrary UI state.

This requires a DB migration / RLS update.

The migration for this phase is:

- `supabase/migrations/20260319203000_tongs_bellows_join_links.sql`

## Purpose

Phase 8A introduces canonical Bellows join-link truth inside Tongs so Nursery can
offer a public guest entry surface without leaking access control into browser state.

This phase does not implement Bellows guest routing, device permission flow,
Realtime presence, or WebRTC capture. It establishes the persisted access artifact
that those later slices must trust.

## Canonical Table

### `tongs.bellows_session_join_links`

One row per Bellows access artifact.

Primary responsibilities:

- canonical join-link identity
- opaque token storage via server-side hash only
- session and workspace linkage
- role intent for the guest being admitted
- expiry and revocation truth
- bounded link consumption

Canonical columns:

- `id uuid primary key`
  Canonical join-link identity for management and revocation.
- `session_id text not null`
  Foreign key to `tongs.bellows_sessions(id)`.
- `workspace_id uuid not null`
  Workspace linkage for RLS and operator management queries.
- `token_hash text not null unique`
  Hash of the opaque bearer token. The raw token is returned once at creation and is
  never persisted in canonical form.
- `created_by_user_id uuid not null`
  Audit owner for the operator who minted the link.
- `role_code text not null`
  Intended Bellows role assignment for the guest. Phase 8A keeps this aligned to
  Bellows role codes: `S1`, `S2`, `G1`, `G2`.
- `expires_at`, `revoked_at`
  Expiry and revocation truth.
- `max_uses`, `use_count`, `last_used_at`
  Bounded link consumption and last successful resolution timestamp.
- `created_at`, `updated_at`
  Management timestamps.

## Session Truth Boundary

These are canonical:

1. Join-link truth lives in `tongs.bellows_session_join_links`.
2. Recovery truth still lives in `tongs.bellows_sessions` and `tongs.bellows_session_checkpoints`.
3. Realtime presence remains ephemeral and is not persisted in Phase 8A.
4. A valid join link grants access to Bellows session coordination, not authority to
   bypass Bellows engine rules.

Bellows recovery truth restores runtime state. It does not replace engine authority.

## Consumption Semantics

Phase 8A keeps link usage simple and explicit:

1. `resolve_bellows_join_link(...)` is a consuming operation.
2. A successful resolve increments `use_count` and stamps `last_used_at`.
3. The resolve returns no row if the token is invalid, expired, revoked, exhausted,
   or points at a terminal Bellows session.
4. Because Phase 8A does not yet have a separate join-claim artifact, operators
   should provision `max_uses` accordingly for expected retries and reloads.

This keeps `max_uses` honest without inventing additional persistence semantics early.

## RLS Model

### Reads

- workspace `editor` or higher can read join-link rows
- workspace `viewer` does not get canonical access-artifact visibility by default

### Writes

- workspace `editor` or higher can create and revoke Bellows join links

### Guests

- Bellows guests do not get direct table access
- guest link validation happens through `resolve_bellows_join_link(...)`

### Service role

- service role retains execution rights for server-side orchestration
- `create_bellows_join_link(...)` accepts `p_created_by_user_id` so service-side
  automation can still stamp an operator owner

## RPC Contract

The runtime-facing contract lives at:

- `apps/bellows/src/runtime/tongs-persistence-contract.ts`

The migration adds these database RPCs:

- `tongs.create_bellows_join_link(...)`
  Creates a canonical join-link row, stores only a token hash, and returns the raw
  token once to the caller.
- `tongs.resolve_bellows_join_link(...)`
  Validates a session + token pair and returns the join envelope Bellows guest flow
  needs before Realtime presence boot.
- `tongs.revoke_bellows_join_link(...)`
  Revokes a canonical join-link row without deleting history.

## Resolve Envelope

`resolve_bellows_join_link(...)` returns:

- `join_link_id`
- `session_id`
- `workspace_id`
- `role_code`
- `title`
- `host_user_id`
- `lifecycle_state`
- `expires_at`
- `max_uses`
- `use_count`
- `last_used_at`
- `resolved_at`

That is enough for Bellows guest flow to:

1. validate access
2. establish `bellows:session:{sessionId}` presence
3. publish guest arrival
4. request device permissions
5. publish readiness
6. show “Waiting for host”

## Public Join Route Contract

Phase 8A does not yet add the route implementation, but the intended page contract is:

1. read `sessionId` and `token`
2. call `resolve_bellows_join_link(sessionId, token)`
3. if the RPC returns a row, attach to `bellows:session:{sessionId}`
4. publish guest arrival and initial join state
5. request mic and camera permissions
6. publish readiness updates
7. show “Waiting for host”

That order is canonical because operator visibility should begin before device
permission friction.

## Exact App Code Changes Needed To Use This

After this persistence slice lands, the next app work should be:

1. implement a Bellows join-link repository against the new RPCs
2. add a public `BellowsJoin` route in Nursery
3. connect guest join flow to `bellows:session:{sessionId}` Realtime presence
4. request device permissions after link resolution and presence attach

