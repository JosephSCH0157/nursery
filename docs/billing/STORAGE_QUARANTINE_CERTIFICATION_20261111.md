# Historical storage quarantine — local certification

Base candidate: `7f3531e951e57a0097421251bdc66f06545e36ee`.
Scope: storage billing only. No hosted data, Stripe endpoint, prices, production
credentials or customer objects changed. Existing 5 GiB subscription and retained
file/revision rules remain unchanged. The 475 hosted objects are not enrolled by
this migration; no inventory, observation or approval is seeded.

## Operator workflow

Forward migration `20261111201029_storage_historical_quarantine.sql`
(SHA-256 `98fb99e3b5797d5266efe92d6e6b3cd8cb2e2e436fb4549cfaff1f1aa12563b6`) introduces:

1. `observe_storage_quarantine(uuid[])`: an authenticated platform operator supplies
   explicit IDs (1–475, unique). Server captures exact UUID, bucket, SHA-256 of path,
   version, byte-size string, metadata SHA-256, creation/update epochs and owner
   fields. Receipt includes observation time, full manifest and its SHA-256 over
   PostgreSQL `jsonb::text` UTF-8. `manifest_canonical_utf8` permits independent hashing.
   Only unresolved, nontemporary objects created AND updated before November 11,
   2026 UTC qualify. Age is eligibility, never ownership or disposal evidence.
2. Review the returned manifest and immutable identity evidence. This observation
   alone changes neither accounting nor object access.
3. `approve_storage_quarantine(observation_id, manifest_sha256, reason)`: authenticated
   operator authority is rechecked and locked against revocation. Serialize approvals,
   lock objects in UUID order, recheck every tuple and attribution, then atomically
   append the authorization receipt and approved identities. Lifetime enrollment is
   capped at 475 identities, including deleted ones. Exact replays are idempotent;
   altered requests conflict. No service-role-only or user-supplied actor shortcut.
   Guards verify both the incoming tuple and the final tuple after provider triggers.
4. `read_storage_quarantine_accounting()`: operator-only historical approved bytes,
   currently present unassigned bytes, and deletion totals. These are usage/cost
   exposure quantities, not a fabricated provider invoice, customer charge or credit.

An operator must use existing authenticated Forge credentials, not put privileged
secrets in a browser or create a new operator principal. Hosted execution of these
steps is NOT authorized by this local certification. Review the actual 475-object
manifest and its relationship to the earlier inventory before separately approving
hosted enrollment. No path-prefix, filename, age-only or count-only exemption exists.

Exact approved objects are excluded from customer usage and unidentified-usage
blocking; every mismatch remains fail closed. Approval does not change a customer's
entitlement. Mutation and reappearance of approved UUIDs or bucket/path hashes are
rejected. Deletion uses existing Storage authorization and provider deletion guard;
its audit append is transactional, not a deletion permission grant. Immutable
snapshots/receipts/tombstones remain after deletion. Direct table access is revoked,
RLS enabled, and functions/tables owned by postgres with explicit execute grants.

There is intentionally NO ownership assignment or quarantine-release RPC. A later
workspace repair cannot silently bill these objects. Authoritative ownership proof
and a separately reviewed forward procedure are prerequisites to later attribution;
this change does not pretend to validate unavailable historical ownership evidence.

## Disposable certification

Existing `baseline-v1`, head `20261104071802`, schema-only copy into a unique
`forge_storage_*` database; existing guarded adapter and synthetic Storage rows.
Four storage forward migrations applied in order. No hosted snapshot restoration,
shared schema writes or authentic historical financial-state reconstruction.

Reproduce from repository root:

```sh
FORGE_STORAGE_QUARANTINE_CERT=1 FORGE_STORAGE_HTTP_CERT=1 \
FORGE_STORAGE_LIFECYCLE_CERT=1 \
SUPABASE_DB_CONTAINER=supabase_db_forge-gate-e1-pre \
node scripts/certify-storage-capacity-isolated.mjs
```

Coverage: independent manifest hash; exact matches; changed/missing/new objects;
wrong hash; duplicate/oversized inventory; nonoperator and service-role-only denial;
operator revocation; private RLS/ownership; immutable receipts; nine mutation classes;
independent-connection approval/writer and approval/deletion races; concurrent replay;
rollback of interrupted approval; delete-guard preservation; same-ID and new-ID path
reappearance denial; unknown new writes; no implicit assignment on workspace repair;
unchanged customer capacity and accounting journal.

Existing Storage HTTP suite: 17 real local requests through Tongs commit service,
including capacity, retries, overwrite rejection, deletion and concurrent admission.
SQL lookup adapter and synthetic quota filler remain limitations; quarantine races
are PostgreSQL proofs, not a hosted physical-Storage in-flight mutation certificate.
Lifecycle regressions exercise independent connections, zero-total paid periods,
terminal cancellation, supersession, renewals and downgrades. Focused signed-fixture
and price tests: 33 passed. Tongs authority/security/financial suite: 687 passed.
Frozen verification must run against the committed exact-hash registration.

## Stripe isolation: blocked, no events generated

Read-only Test account `acct_1Spw8c1OSG3CCNl8` recheck: endpoint
`we_1T7NyK1OSG3CCNl8XCyfPu3j` is enabled, targets production project
`wtvdjndyxegudufrompx`, and subscribes to subscription created/updated/deleted and
invoice paid/payment_failed. Adding local forwarding does not isolate generated
account events from this destination. Existing endpoint remains unchanged.

Smallest supported prerequisite: an independent Stripe sandbox connection with no
production-targeting destinations, forwarded to a disposable local receiver/database
that has only sandbox Stripe and disposable Supabase credentials. Alternatively,
separate authorization must address the existing endpoint's relevant subscriptions
and pending/retried deliveries; merely adding a second endpoint is insufficient.
No customer subscriptions or genuine Test events may be created before certification
of that routing, credentials and cleanup boundary. No Live changes are needed.

## Release decision

Local quarantine correctness supports review, not production activation. Production
remains NO-GO until genuine isolated Stripe delivery is certified, required CI/full-tail
release checks run against the new candidate, and a separate hosted migration/rollout
and exact-inventory approval are granted. Existing protected migrations and financial
history remain unchanged. Historical financial-state equivalence is still unclaimed.
