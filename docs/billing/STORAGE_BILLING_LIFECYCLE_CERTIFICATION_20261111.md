# Storage billing lifecycle correction — 2026-11-11

Scope: successor to `9f020c89ac6de124794b03ea2a75f22cca028546` on
`codex/storage-billing-reconciliation-20261111`. No hosted writes, Stripe events,
customer-object changes, merge or deployment. Earlier certification failures are
retained in STORAGE_BILLING_RELEASE_CERTIFICATION_20261111.md as historical evidence.

## Correction

A paid service period is separate immutable evidence from positive cash collection.
A freshly retrieved active subscription, recognized recurring price, matching paid
invoice/customer/mode/subscription/line, zero amount remaining and valid nontrial
period may establish storage entitlement even when amount paid is zero. Unknown,
manual, unpaid, trial, truncated, unrelated and credit-only evidence fails closed.
Cash receipts, processing grants and journal accounting are unchanged.

Every subscription projection writer now begins a database generation/token before
reading Stripe. Commit locks the subscription fence and billing owner, atomically
validates and records the snapshot and optional service period. Superseded reads
must acquire a new token and re-read Stripe (three bounded attempts, then fail for
provider retry). A committed cancellation is terminal for that subscription ID.
Fenced subscriptions reject the former generic unfenced upsert. Existing records
and receipts are preserved; they are not retroactively fabricated or rewritten.
The guarantee is refresh/commit serialization, not synchronous knowledge of a
Stripe change before its authoritative refresh arrives.

New forward migration: `20261111192458_storage_subscription_lifecycle_fencing.sql`.
SHA-256: `8f50f8c3f6e3df22ae835bbf3a3cee0a7fe4cea7ee5449b938721bf15ecbb349`.
Exact-hash successor registration uses the existing frozen-evidence verifier;
previous migrations are unchanged. Stripe 14.25.0 is pinned as a test-only SDK,
matching the existing webhook SDK, to authenticate synthetic fixtures without
sending provider events.

## Local evidence

- 33 focused price/lifecycle tests pass, including actual Stripe SDK HMAC verification
  and tampered payload/wrong-secret rejection. Synthetic fixtures only.
- Disposable PostgreSQL lifecycle PASS: $0 entitlement without cash, immutable and
  conflicting replays, nine invalid-period denials, paid-through grace, expiration,
  renewal, downgrade, cancellation, terminal-reactivation denial, legacy-writer
  denial, privilege isolation and unchanged financial journal.
- Independent PostgreSQL processes: cancellation holds the transaction while a
  stale active writer waits; stale writer returns superseded, final state canceled.
  Simultaneous begin operations produce different generations; only current token
  commits. This is not an event-timestamp ordering test.
- Real disposable Storage HTTP PASS: 17 operations through Tongs commit service,
  including additions, retries, overwrite preservation on denial, delete-only,
  temporary exclusion, unknown-owner denial/deletion, and one winner among
  concurrent requests for seven remaining bytes. SQL lookup adapter is used;
  this does not certify end-user HTTP authorization or a hosted environment.
- Source: existing guarded `baseline-v1` container, head `20261104071802`, schema-only
  copy into unique `forge_storage_*` database. Reviewed schema adapters and the
  three storage migrations applied there. Fresh temporary Storage JWTs/volume;
  resources removed after test. No historical financial-state claim.

## Unresolved objects: read-only disposition

| Class | Objects | Bytes | Authoritative evidence | Disposition |
|---|---:|---:|---|---|
| Missing matching workspace | 27 | 20,682 | 27 registry links; prior six episode/workpiece creation identities reference the same missing workspaces; no alternate billing owner | Potential retained/billable files, owner unresolved; do not charge |
| Missing episode association | 448 | 426,793 | No registry, asset, deletion-audit or hash-verified recovery association | Retention and payer unknown; do not classify from names |
| Total | 475 | 447,475 | No positively verified temporary, obsolete or retired class | Preserve every object |

Read-only aggregate recheck found no deletion/recovery evidence or retirement flag
for either class. Latest updates are August 10 and August 8 respectively; age does
not prove obsolescence. No object bytes were downloaded, changed or deleted.

An explicitly approved historical quarantine could isolate these costs from
customer accounting without granting capacity: immutable exact-object manifest
(object UUID, bucket, path hash, version, byte size, metadata fingerprint and
observation timestamps), operator-owned unassigned cost ledger, and deny all
mutations to matched objects. Only the unchanged tuple qualifies; a new object,
replacement, changed version/size, or ambiguous new write must fail closed.
No prefix/date/name-based exemption is safe. Authorized deletion must remain
available separately. This is a proposal, not an implemented exclusion; current
unknown-usage enforcement remains in force. Owner approval of that bounded policy
or authoritative ownership evidence is still required.

## Remaining production gates

1. Separate approved Stripe Test webhook destination: current Test destination is
   hosted production. No Test events were generated. SDK-signed synthetic evidence
   is not provider end-to-end certification.
2. Resolve ownership or approve and certify exact-object historical quarantine;
   do not deploy a blanket exclusion or charge unresolved bytes.
3. Review/authorize hosted migration and matching webhook rollout separately.
   Migrate before activating the new RPC caller; once subscriptions are fenced,
   old projection writers fail closed. Forward recovery is required, not removal
   of immutable billing evidence.
4. Guarded CI schema evidence does not reconstruct authentic historical financial
   state. Record that limitation in any separate release decision.

CI results are recorded after testing the exact implementation commit. No automatic
release approval follows from local correctness.
