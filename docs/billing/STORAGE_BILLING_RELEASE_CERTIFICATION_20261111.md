# Storage billing release certification — 2026-11-11

Scope: `codex/storage-billing-reconciliation-20261111`; preserves `94fe3d85`,
`c48469fc`, `e50a0c9f`, `c7a54f90`. No hosted writes or Stripe mutations.

## Hosted object disposition (read-only)

| Class | Objects | Bytes | Authoritative evidence | Disposition |
|---|---:|---:|---|---|
| Missing episode | 448 | 426,793 | No exact bucket/key registry, asset, recovery-receipt or release-snapshot match; no episode-deletion audit; Storage uploader absent | Ownership, retention and billability unresolved. Do not charge or delete. |
| Episode without existing workspace | 27 | 20,682 | 27 registry matches across six episodes; six creation events reference the same missing workspaces; no asset/deletion/recovery/release match or creator/uploader | Canonically registered retained objects, but no established billing owner. Do not charge or reassign. |

The six episodes are not marked archived or deleted. Their chat/draft events
provide no alternate workspace ownership. Names identify lookup candidates only;
no payer is inferred from paths, labels, timestamps, or apparent test content.
The 448 objects date July 16–August 8; the 27 date March 10–August 10, 2026.
No customer content was downloaded. The required owner action is to supply
preserved authoritative provenance/retention evidence for the 475 objects, or
separately authorize a reviewed disposition. This report authorizes neither
cleanup nor reassignment. Current enforcement intentionally fails closed globally
while that ownership gap remains; production rollout must not proceed unnoticed.

## Stripe integration isolation

Read-only `GetWebhookEndpoints` in Test mode for `acct_1Spw8c1OSG3CCNl8` found
one enabled endpoint, `we_1T7NyK1OSG3CCNl8XCyfPu3j`, targeting
`https://wtvdjndyxegudufrompx.supabase.co/functions/v1/stripe-webhook`.
It subscribes to subscription creation/update/deletion, invoice paid/failed,
Checkout completion and adjustment events. Creating Test subscriptions could
therefore cause hosted billing writes. No Test records were created. Safe
end-to-end Stripe event delivery requires a separately isolated destination;
local fixtures are explicitly not authentic Stripe delivery evidence.

## Reproducible local checks

The database adapter copies the existing disposable baseline-v1 schema at
`20261104071802`. It does not create or repair Forge migration history, copy
customer rows, or reconstruct historical financial authority. Storage component
migration inventory and owners must match the installed Storage image for HTTP
certification. Tests use synthetic metadata and separate PostgreSQL connections.

- `node --test scripts/tests/disposable-ci-database.test.mjs`
- `SUPABASE_DB_CONTAINER=supabase_db_forge-gate-e1-pre FORGE_STORAGE_HTTP_CERT=1 FORGE_STORAGE_LIFECYCLE_CERT=1 node scripts/certify-storage-capacity-isolated.mjs`

The latter must fail if a lifecycle certification gap remains. HTTP tests invoke
Tongs workspace publication with a real Storage client and a disposable SQL
workspace lookup adapter; they are not end-user authentication or hosted tests.
Synthetic quota-filler metadata avoids transferring gigabytes. No paid processing.

## Guarded full tail

Initial PR Smoke run `43079904845` reached `20261111180013` before the Auth fixture
rejected its exact-head contract. Both financial-alignment privilege modes and
lineage jobs passed. The run was superseded by the focused ordering correction.
Commit `50c676d6` validates the complete manifest, applies the prefix through
`20261105025313`, checks/repairs the synthetic Auth principal through its unchanged
guard, then restores/applies the remaining tail and verifies history again.
Nine setup regression tests pass. No fixture SQL, guard, historical migration,
catalog fingerprint or financial authority was altered.

## Actual Storage HTTP result and correction

Storage API `v1.44.11` initially returned HTTP 200 for two over-capacity writes
whose metadata transactions were subsequently rejected by the deferred trigger.
Tongs therefore reported success for objects absent from the registry. Durable
usage did not exceed the limit, but the HTTP success was incorrect.

New forward migration `20261111185031_storage_capacity_statement_enforcement.sql`
adds immediate enforcement for known-size writes and retains the deferred guard
for incomplete/final metadata. It preserves the original migration byte-for-byte.
Stable SQLSTATEs `PF001` (capacity) and `PF002` (unverified usage) survive Storage's
message sanitization; Tongs translates them to its existing distinct 409 errors.
No admission rule, allowance, payment policy or schema history is weakened.
SHA-256: `6f857b1cf4c971054cc01d268737496229b516048ed8119deb87d113f0f67080`.

Corrected HTTP certification: PASS, 17 observed Storage requests. Successful
writes/reads/deletes returned 200; rejected writes returned provider HTTP 500
with the stable code, translated by Tongs to the appropriate 409 error.
Covered overwrite and explicit retry without double counting, denied overwrite
preserving old bytes, full-capacity denial, temporary chunk exclusion, unknown
ownership denial with deletion still allowed, and concurrent requests competing
for seven remaining bytes (exactly one winner). Synthetic quota-filler metadata
was used; this is not a media-volume measurement. The ephemeral Storage service
used the existing image, fresh JWTs, a private temporary filesystem and a unique
schema-copy database; no shared volume or hosted credential. Test resources are
removed on completion. Storage schema owners/component migration inventory are
copied faithfully; no Forge migration history is fabricated.

## Lifecycle certification result

FAIL: a genuine zero-total `invoice.paid` cannot grant the intended capacity with
cash receipts as its only evidence: the webhook skips zero amounts and the cash
receipt RPC correctly rejects them. Do not invent cash or relax the journal.
Minimum correction: separate authenticated paid-service-period evidence (including
zero total, price, mode, identity and period) from positive cash accounting.

FAIL: two real PostgreSQL connections reproduce a delayed active snapshot
committing after a cancellation. Final subscription status becomes `active`.
Refreshing Stripe before each write is not serialization. Minimum correction:
coordinate refresh-and-commit per subscription with a database-backed fenced
operation/CAS protocol; cover invoice, subscription and checkout writers, terminal
cancellation and concurrent downgrade. An event timestamp alone does not establish
ordering for snapshots fetched concurrently.

Existing local checks pass for positive receipt activation, duplicate receipts,
paid-through grace, expiry, upgrade payment gating, downgrade and cancellation,
legacy stacking and mode isolation. These do not establish that delayed provider
callbacks preserve those outcomes. No connected Stripe write was attempted due
to the enabled hosted webhook. The overall release remains NO-GO.

The guarded browser fixture now obtains synthetic Test receipt-backed capacity
only inside the exact GitHub job-owned loopback environment. It does not activate
financial mode, contact Stripe, or change the normal browser/application path.
The immutable synthetic accounting evidence lasts until the disposable database
is destroyed. Local target-rejection tests pass.
