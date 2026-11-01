# Inactive admission-enforcement preparation

Status: prepared by Slice 2B; **not active**.

Canonical admission remains the single projection row in
`tongs.account_admissions` whose `effective_state` is `admitted`. Neither a
legacy-cohort row, an approved application, an invitation event, a workspace
membership, nor possession of a service-role credential independently grants
admission.

## Activation boundaries

Slice 2B deliberately leaves four independent activation steps undone:

1. `tongs.account_admission_pre_request()` exists but is not registered as
   `pgrst.db_pre_request`.
2. No restrictive Storage policy is installed.
3. `FORGE_ADMISSION_ENFORCEMENT_ENABLED` and
   `VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED` are absent/false by default.
4. The INSERT-only financial guards pass through unless the exact PostgreSQL
   custom setting `forge.account_admission_enforcement` is `on`.

Activating any of these controls is a later, separately reviewed rollout. They
must not be toggled piecemeal in production.

## Server entrypoint inventory

The shared server guard first verifies the browser's Supabase Auth bearer token,
then asks the service-role-only `require_account_admission(uuid)` RPC about that
exact UUID. The service role is transport authority only.

| Surface | Prepared classification | Rationale |
| --- | --- | --- |
| Tongs commit API | new customer operation | protects persisted Forge work across Tongs, Bar-Stock, Bellows host, Hammer and Quench routes |
| Anvil transcription | new customer operation | begins provider/customer work |
| Hearth chat, STT, topic discovery, research readiness, key connect | new customer operation | begins or authorizes customer/provider work |
| Hearth chat/key status and key disconnect | existing/cleanup | permits status, credential removal and recovery |
| Hammer paid request | new customer operation | begins reservation/provider work |
| Hammer background transcription | existing authorized operation | permits already-authorized execution and completion |
| YouTube connect and destination grant | new customer operation | creates new publishing/provider authority |
| YouTube callback, refresh, disconnect and destination listing | existing/cleanup | completes, maintains or removes an already-started authority |
| YouTube publication background/recovery | trusted system maintenance | existing publication settlement/recovery remains available |
| beta invitation endpoint | platform-operator authority | admission administration is not customer admission |
| beta intake and public pages | public | no Forge customer operation |

Revocation therefore blocks new customer work when the server flag is active,
while already-authorized background completion, settlement, reconciliation,
failure relief, credential removal and recovery remain callable under their
existing authority contracts.

## Database and financial boundary

The prepared PostgREST pre-request hook admits anonymous requests to their
existing RLS-limited public/trial surfaces, admits service-role traffic to its
existing per-service authority checks, and requires canonical admission for an
authenticated Data API principal. Unknown roles fail closed.

The financial trigger is deliberately limited to `INSERT` on:

- `tongs.customer_spending_quote_acceptances`; and
- `tongs.funding_reservations`.

It does not run on reservation/event settlement, reconciliation, failure relief,
release, cleanup or recovery updates. Pricing, quote mathematics and accounting
contracts are unchanged.

## Prepared Storage policy contract (not installed)

Future activation must add a restrictive admission conjunct to each existing
authenticated `storage.objects` policy without replacing its workspace/path
predicate. The required form is:

```sql
create policy <existing_policy_name>_requires_account_admission
on storage.objects
as restrictive
for <matching_operation>
to authenticated
using (tongs.current_request_is_admitted())
with check (tongs.current_request_is_admitted());
```

Operation-inapplicable clauses must be omitted. Anonymous policies and
service-role maintenance paths are not converted into customer admission.
Activation certification must prove that every authenticated policy has the
restrictive conjunct and that the prior bucket/path/workspace predicate remains
byte-for-byte or semantically unchanged.

## Bellows public guest exception

`/apps/bellows/join/:sessionId` and `/bellows/join/:sessionId` remain public.
The guest can only resolve an opaque, expiring join token through
`resolve_bellows_join_link`, publish ephemeral Realtime Presence, receive the
host session-state Broadcast, and use local device preview. That exception does
not grant workspace membership, table access, Storage access, financial
authority, provider execution, recording persistence or a customer operation.
The Bellows host/operator route remains inside the ordinary protected Forge
boundary.

Realtime Broadcast/Presence policies must be reviewed independently at
activation because Supabase Realtime authorization is not covered by a
PostgREST pre-request hook. Slice 2B does not change Realtime policies.

## Frontend behavior

While its flag is absent, `AdmissionBoundary` returns the existing route tree
without an admission RPC. Once activated, a signed-in admitted account enters
normally; revoked and pending accounts receive distinct guidance; verification
errors fail closed; login, invitation completion, platform admission operations,
anonymous trial, and the Bellows public guest route remain reachable. Auth
state changes and window focus trigger a fresh admission read.
