# Storage sandbox genuine delivery certification

Status: historical local certification evidence; not production release approval.
Observed November 11, 2026 EST (November 12, 00:xx–01:10 UTC).
Starting candidate: `985745a2a8a79c27bc0969c4bf15518764354f5d`.

## Isolation and method

Stripe sandbox `acct_1Spw8m0v1TAfIsgZ`, Test mode only. The restricted SDK
credential and CLI identity independently resolved to that account. Sandbox v1
webhook endpoints and v2 event destinations were empty before execution and on
final readback. The original account's production-targeting Test endpoint was
not changed or exercised. No Live operations occurred.

The optional stage in `scripts/certify-storage-capacity-isolated.mjs` ran the
repository webhook in existing Edge Runtime v1.73.0, with a fresh local signing
secret and service JWT, PostgREST v13.0.5, and loopback-only forwarding. Runtime
configuration contained no hosted Supabase URL/project reference or Live key.
Original Stripe CLI-signed request bytes were forwarded without resigning;
invalid signatures were rejected. Replays retained the original signature and
remained inside its normal five-minute tolerance.

Database provenance: schema-only copy of the existing guarded `baseline-v1`
source at `20261104071802`, followed by the existing storage certification
adapter and registered storage migrations. This is not full-tail execution or
authentic historical financial-state reconstruction. Independent-connection
fencing, capacity, quarantine, financial isolation and cleanup tests ran in the
same existing disposable runner. No hosted database was modified.

## Genuine results

| Case | Observed result |
| --- | --- |
| Payment failure | Real `invoice.payment_failed`; incomplete subscription, zero capacity, delete-only |
| Successful recovery | Paid $5 invoice, active 50 GiB add-on, one cash receipt |
| 100% once discount | Paid $0 invoice, 150 GiB service period, no additional cash receipt |
| Upgrade/downgrade | Paid 500 GiB upgrade, subsequent 50 GiB downgrade |
| Delayed invoice and duplicate | Upgrade invoice delivered after downgrade retained `500gb`; repeated delivery did not duplicate receipt |
| Cancellation/stale event | Canceled status and zero capacity survived replay of earlier active-subscription event |
| Renewal | Stripe Test Clock generated paid `subscription_cycle` invoice; current service period granted 50 GiB |

Retest identities: main subscription `sub_1UamNz0v1TAfIsgZmmWwoFdn`,
renewal subscription `sub_1UamV30v1TAfIsgZG7vSZA2d`. Zero-total invoice
`in_1UamU70v1TAfIsgZdDt9VWO8`; delayed upgrade invoice
`in_1UamUR0v1TAfIsgZwxHh7SJS`; renewal invoice
`in_1UamVA0v1TAfIsgZblMmt8n0`.

The retest captured 21 deliveries of 16 distinct genuine events: 16 HTTP 200
responses and five HTTP 400 `Subscription refresh superseded` responses under
concurrent fencing. Controlled signed retries demonstrated recovery, including
the delayed paid invoice and stale active event. This is not an all-first-delivery
success claim; not every superseded event was individually retried. Stripe CLI
local delivery does not certify hosted automatic retry scheduling.

## Defect corrected

The first genuine run exposed a historical accounting error: a delayed paid
500 GiB invoice could be recorded as the subscription's current 50 GiB offer.
The handler now retrieves that specific invoice from Stripe and derives cash
receipt offer/period from its validated subscription line. Current subscription
state still controls capacity through the existing database fence. No migration,
historical receipt rewrite, allowance change or account-mapping relaxation was
introduced. Ambiguous/multiple-positive-line or truncated invoices fail closed.

## Local verification and cleanup

- 51 focused lifecycle, catalog, capacity and browser-entitlement tests passed.
- 33 financial contract regressions passed.
- Nursery typecheck and strict lifecycle/catalog shared TypeScript checks passed.
- Exact frozen-evidence verification passed; no protected worktree byte changes.
- Existing guarded PostgreSQL capacity/lifecycle/quarantine certification passed.
- Genuine run and retest used fresh disposable records; the incorrect first-run
  synthetic receipt was preserved as evidence, not manually repaired.

Both runs' customers were deleted, subscriptions canceled, coupons deleted,
and the retest clock deleted (its customer deletion independently verified).
Sandbox catalog and immutable Stripe events/invoices remain. Exact owned local
containers, listeners and databases were removed; database absence was checked.
No customer Storage objects or quarantine policy were activated.

Private evidence (contains signed requests; never publish raw files):
`/tmp/forge-stripe-delivery-A5acFO` (defect),
`/tmp/forge-stripe-delivery-mqXZJk` (passing retest), and
`/tmp/forge-stripe-cert-8450/final-*.log` (regressions).
Each run retains manifest, original signed requests, event/status log, database
projections, resource deletion receipts and local cleanup record.

## Release decision

Genuine sandbox storage add-on lifecycle certification: **PASS with the retry
limitation above**. This does not certify a Creator base-plan purchase, every
proration shape, hosted webhook delivery, or production deployment. Existing
5 GiB base-allowance behavior remains covered by local regression tests.

**GO for separate release certification; NO-GO for deployment yet.** Run the
required GitHub gates on the new receipt-fix/tooling commit; previous CI results
do not certify these changes. Hosted migration/configuration review, explicit
quarantine activation approval, and coordinated deployment remain separate.
Authentic historical financial-state equivalence remains an unresolved,
distinct claim; no gate is waived by this sandbox result.
