# Storage billing integration — 2026-11-11 resumed certification

Branch: `codex/storage-billing-reconciliation-20261111`, preserving `94fe3d85`
and `c48469fc`; production base `f5a96058e31f2c8c9b9a6df28a4f6c9d1d2755c9`.
This supersedes the Stripe-access blocker in the earlier reconciliation record.

## Verified read-only reconciliation

Both Stripe modes are accessible for Black Anvil Studios, `acct_1Spw8c1OSG3CCNl8`.
All current catalog product/price pairs were read, including expanded product
records. Monthly 50/150/500 GiB packs match at $5/$10/$20 in both modes. Existing
SQL byte mappings remain unchanged. Discrepancies requiring separately approved
Stripe changes:

- Both modes' current storage product descriptions incorrectly say “one-time.”
- Legacy 250 GiB / 1 TiB / 5 TiB Test amounts are $6/$15/$40; Live amounts are
  $9/$24/$79. Preserve existing IDs and purchases; do not silently reprice them.
- Three active one-time Test prices remain as catalog compatibility aliases.
  They cannot be treated as recurring or perpetual entitlements without terms.

`GetSubscriptions(status=all)` for the six mapped recurring storage prices in
each mode returned no subscriptions (all pages complete). Complete Checkout
sessions, expanded with line items: eight Test and zero Live; none contained the
mapped storage prices. This is evidence about those API inventories, not proof
that no historical off-Checkout or deleted-customer purchase ever existed.

Hosted Tongs contains two canceled storage projections, two canceled memberships,
and one active membership. The active membership has a current active-environment
cycle receipt. No existing projections or financial history were edited.

## Implemented locally

Migration `20261111180013_storage_capacity_authority.sql` adds Tongs capacity
calculation, a customer-scoped read RPC, and deferred capacity enforcement on
Storage metadata publication. It does not mutate Storage rows or existing billing
records. Supabase remains actual-size evidence; Stripe-backed cycle receipts and
subscription state remain entitlement evidence.

- Free/trial accounts receive no permanent included capacity; an eligible current
  subscribed account receives 5 GiB. Current paid packs add capacity, including
  preserved legacy byte mappings. Pending unpaid upgrades cannot exceed the
  current paid pack; downgrades clamp it, cancellations remove it, and an expired
  paid-through period cannot continue granting capacity.
- Each retained object counts once against its workspace creator/owner. Retained
  revisions and Bellows playable segments count. Recording upload session/part
  objects and Bellows upload parts are temporary; database rows are excluded.
- Usage is read from actual Storage metadata, not a browser counter or stale
  registry size. Missing size/ownership evidence fails closed. The UI uses the
  Tongs receipt and consistent KiB/MiB/GiB/TiB labels; the hardcoded 500 GiB is gone.
- Per-owner transaction locks prevent competing additions from both using the
  same remaining capacity. Unsupported transaction isolation is rejected.
  Deletes are not gated; the existing Storage API deletion protection is intact.
- Deferred enforcement accommodates Storage's rolled-back metadata-less
  permission probe. Insufficient capacity rejects the final metadata commit.
  This is not a promise to reject a transfer before temporary network/upload work.
- Capacity checks never debit processing credits or issue Stripe charges.
- Shared billing metadata typing is now runtime-neutral; no SDK or API version
  change. Existing membership/AI behavior is unchanged.

## Local certification

- 29 focused storage, subscription-authority, billing-interface and invoice tests.
- 211 existing Tongs upload/canonical and financial contract tests.
- Real PostgreSQL, separate-process capacity race: exactly one winner. Coverage
  includes free/trial denial, 5 GiB, add-ons, legacy stacking, mode separation,
  duplicate receipt, upgrade/downgrade/cancellation/expiry, paid-through grace,
  temporary exclusion, retained Bellows segments, collaborator attribution,
  unknown ownership, delete-only behavior, function privileges, journal
  preservation, and permission-probe rollback.
- Database source: existing disposable `baseline-v1`, head `20261104071802`.
  Only its schema was copied into uniquely named disposable databases; each was
  dropped. Test Storage rows were synthetic metadata, not customer objects.
  Source history and hosted databases were unchanged. This is **schema behavior**
  evidence, not full-tail upgrade, historical financial equivalence, or an actual
  Storage HTTP upload/delete certification.
- Nursery typecheck, Tongs compilation, focused shared-module typecheck and scoped
  UI lint were run. Production Vite compilation and bundle checks are recorded
  separately in the completion report. No threshold was raised.

## Remaining release gates / minimum next actions

1. Resolve seven hosted legacy objects (`hearth`: 3; `recovery`: 4) using existing
   ownership/retention evidence. They have no matching workpiece registry entry.
   Do not guess a payer or delete them. A hosted rollout currently fails closed
   on their unresolved attribution. Any hosted correction needs owner approval.
2. Certify the full forward tail and actual Storage HTTP success/rejection/delete
   behavior in guarded disposable infrastructure with legitimate synthetic paid
   fixture receipts. Existing browser fixture accounts cannot be assumed funded.
   The current CI Auth fixture's exact-head sequencing also needs to be respected
   when applying a new successor; do not weaken its guard.
3. Certify concurrent subscription reconciliation against the new entitlement
   reads, zero-total discounted invoices, and historical projections lacking
   receipts. The code deliberately does not manufacture receipt-backed capacity.
   Refreshed Stripe reads alone do not prove ordered concurrent webhook commits.
4. Review the exact-hash registered migration and coordinated application/Edge
   deployment; authorize hosted changes separately. Correct Stripe descriptions
   and decide treatment of active legacy offers separately; never rewrite history.

**NO-GO for production release.** Local implementation and focused schema behavior
are established; the gates above remain. No hosted migration, Stripe mutation,
production deployment, media processing, or bandwidth experiment was performed.
