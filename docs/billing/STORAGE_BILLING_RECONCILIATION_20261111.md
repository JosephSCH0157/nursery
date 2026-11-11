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

1. `Subscriptions.tsx` adds a hardcoded 500 GiB base allowance. No approved
   backend base term or free-versus-subscribed eligibility was established.
   Owner clarification requested; no allowance invented or changed.
2. The billing UI's used and remaining bytes are not surfaced. Canonical
   `tongs.account_balances` has entitlement bytes but no used-byte projection.
   Legacy `public` usage fields are not proof of current reconciled usage.
3. No capacity enforcement or usage reconciliation was found in the inspected
   Tongs write path. Completion requires authoritative usage/reservation and
   reconciliation semantics, including concurrent additions and delete-only
   access. **DB changes are required**, not a UI-only counter. The shared-workspace
   charging owner must be confirmed before implementing that contract.
4. Binary byte entitlements and decimal-looking GB/TB labels need consistent
   presentation without reducing existing purchased bytes.
5. Catalog-retained one-time Test price aliases do not establish approved legacy
   duration/capacity terms. Their historical fulfillment remains unverified.
6. Cancellation, failed payments, duplicate/out-of-order delivery, usage accuracy,
   RLS and no-double-billing need integrated disposable certification after the
   missing authoritative terms and usage/enforcement path are resolved.

## Local verification

- 23 focused tests pass: 11 storage resolver tests, 9 existing billing-interface
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

## Next action

Confirm the base allowance and eligibility for free/subscribed accounts, and
whether shared-workspace usage is charged to its owner. Then complete the
database-backed usage/enforcement integration and lifecycle certification using
those terms. Resolve any legacy one-time obligations from authentic purchase
evidence; do not manufacture them. Hosted migration, Edge-function deployment,
and any live Stripe/customer correction remain separate approvals.

No hosted writes, price changes, database migrations, media transfers, merge,
deployment, or unrelated source changes were performed. This is **NO-GO for
claiming storage billing complete or releasing the partial correction**.
