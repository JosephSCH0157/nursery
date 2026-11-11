# Storage billing reconciliation — 2026-11-11

Status: **incomplete; not release-certified**. Source baseline
`f5a96058e31f2c8c9b9a6df28a4f6c9d1d2755c9`. Branch:
`codex/storage-billing-reconciliation-20261111`.

## Existing implementation and read-only evidence

- Stripe account Black Anvil Studios: the three configured Live monthly prices
  match the UI: 50 GB / $5, 150 GB / $10, 500 GB / $20. No price changes made.
  The database implements those capacities as 50, 150, and 500 **GiB**.
- Read-only Stripe `GetPrices` and `GetSubscriptions` on all six configured Live
  storage prices found active recurring prices, but no subscriptions of any
  status (`status=all`, all pages complete). This does not establish Test-mode
  purchase history or absence of purchases under other prices.
- Project `wtvdjndyxegudufrompx`: read-only inspection of
  `tongs.billing_storage_entitled_bytes(text)` confirms the catalog's legacy
  identifiers preserve 250 GiB, 1 TiB, and 5 TiB. Do not reinterpret these IDs.
- Tongs has two canceled storage subscription records, with IDs `50gb` and
  `1tb`; neither has financial-environment metadata. Their environment and
  historical provenance were not established. No records changed.
- Existing canonical subscription projection sums active stackable packs.
  Existing webhook paths handle checkout, subscription lifecycle, invoices,
  and immutable billing events. Their presence is not end-to-end certification.

## Corrected independently of allowance policy

Previously, valid subscription metadata took precedence over the actual Stripe
price, allowing upgrades/downgrades to retain an old pack. The webhook now derives
storage pack identity from the recognized subscription price before entitlement
writes and invoice lifecycle accounting. Checkout fulfillment also validates
the retrieved subscription at the common upsert boundary.

The resolver preserves legacy ID mappings and incoming event evidence. It rejects
unknown prices, mode mismatches, nonmonthly/nonrecurring prices, quantities other
than one, mixed items, and truncated item lists instead of silently calculating
incorrect capacity. The existing ledger supports one pack per subscription;
multiple separate pack subscriptions remain supported. Membership logic and
financial database functions are unchanged.

## Remaining discrepancies / decisions

1. `Subscriptions.tsx` adds a hardcoded 500 GiB base allowance without a verified
   backend term. The owner subsequently specified the proposed replacement rules
   below. No production allowance has been activated or changed.
2. The billing UI's used and remaining bytes are not surfaced. Canonical
   `tongs.account_balances` has entitlement bytes but no used-byte projection.
   Legacy `public` usage fields are not proof of current reconciled usage.
3. No capacity enforcement or usage reconciliation was found in the inspected
   Tongs write path. Completion requires authoritative usage/reservation and
   reconciliation semantics, including concurrent additions and delete-only
   access. **DB changes are required**, not a UI-only counter. The shared-workspace
   charging owner has now been specified as the workspace owner.
4. Binary byte entitlements and decimal-looking GB/TB labels need consistent
   presentation without reducing existing purchased bytes.
5. Catalog-retained one-time Test price aliases do not establish approved legacy
   duration/capacity terms. Their historical fulfillment remains unverified.
6. Cancellation, failed payments, duplicate/out-of-order delivery, usage accuracy,
   RLS and no-double-billing need integrated disposable certification after the
   missing authoritative terms and usage/enforcement path are resolved.

## Local verification

- 25 focused tests pass: 13 storage resolver tests, 9 existing billing-interface
  checks, 3 invoice-compatibility tests. Both financial modes, upgrades/downgrades,
  legacy IDs, unknown prices and invalid shapes are covered. These are synthetic
  local tests, not actual Stripe payment or database/RLS lifecycle tests.
- Tests are discovered by the existing Nursery test runner.
- Standalone TypeScript check remains unsuccessful in unchanged
  `forge-billing-metadata.ts`: unresolved Deno HTTPS Stripe type import,
  narrow Set membership types, and widened `version` return types. Errors in
  the new test fixture's inferred literals were corrected; the existing errors
  remain. Deno is unavailable locally. No full Edge-function type certification
  is claimed.
- Existing ESLint configuration ignores `.mts` test files; its warning is not a
  lint pass. No full production build or database certification was run for this
  partial repair. No gate was disabled.

## Owner clarification and follow-up verification

The owner specified these proposed rules, conditional on checking existing terms:

- No permanent included storage for free accounts; trials require separate policy.
- 5 GiB base for subscribed accounts, plus purchased capacity.
- Shared-workspace usage belongs to the workspace owner's billing account once.
- Count retained files and revisions; exclude temporary processing files and DB rows.

No conflicting numeric included-storage term was found in the reviewed approved
billing documents or in read-only expanded Stripe Live product/price records for
all six current membership offers and the two legacy membership products. Legacy
Creator promises metadata storage but no numerical allowance. Existing add-on
byte mappings remain unchanged. This review does not establish Test catalog or
legacy one-time purchase equivalence.

A read-only Test catalog request for product `prod_UFwW0QUSUgTyV8` failed:
`No account found for the provided stripe_context and livemode` (HTTP 422).
Only the Live account is connected. Test catalog access and authentic legacy
purchase provenance are the remaining external verification prerequisite under
the owner's instruction to establish rules across all three systems before
implementing them. The two canceled Tongs rows cannot be assigned a financial
environment merely because no matching Live subscriptions were found.

Aggregate Storage metadata evidence (no file content retrieved): 2,856 objects,
all with size metadata, totaling 4,238,715,596 bytes. This includes temporary and
legacy paths and is **not customer-billable usage** under the clarified rules.
The reconciliation must classify retained objects and map workspace ownership;
counting collaborators or every physical object would be wrong.

Additional lifecycle correction: storage subscription update/delete handlers
retrieve current Stripe state rather than project the old webhook snapshot.
Identity/mode mismatches and retrieval failures fail closed. Unit tests cover
repeated stale deliveries and lookup failures. This is not proof of transactionally
ordered concurrent webhook commits; database ordering certification remains open.

The local Docker engine is available. Its existing B1 database is at
`20261104071802`. The repository contains guarded local catalog certification and
CI fixture procedures; no fixture guard was bypassed and no database was changed.
Historical financial-state equivalence is not claimed or required as a substitute
for ordinary schema-compatibility testing here.

## Next action

Connect the matching Stripe Test/sandbox account for read-only catalog and legacy
purchase reconciliation. Once that evidence confirms compatibility, implement the
versioned base term, owner-attributed retained-byte reconciliation, concurrent
capacity admission and delete-only enforcement, and complete disposable lifecycle
and RLS tests. Do not infer historical terms or financial environments.
Hosted migration, Edge-function deployment, and any live Stripe/customer correction
remain separate approvals.

No hosted writes, price changes, database migrations, media transfers, merge,
deployment, or unrelated source changes were performed. This is **NO-GO for
claiming storage billing complete or releasing the partial correction**.
