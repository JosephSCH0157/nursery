# Stripe sandbox storage catalog — local certification

Starting candidate: `8450a169700cf5c17007b9936f3d6e5f03649b04` on
`codex/storage-billing-reconciliation-20261111`. Scope: sandbox catalog and
account-scoped recognition; no hosted database, production or original catalog changes.

## Provider evidence

Sandbox `acct_1Spw8m0v1TAfIsgZ`, Test mode; original account
`acct_1Spw8c1OSG3CCNl8`, read-only Test price/product lookup. On November 11,
2026, source recurring prices verified monthly, interval count 1, USD, licensed,
service products, amounts 500/1000/2000 cents. Exact receipts and source IDs are in
[stripe-sandbox-storage-catalog-20261111.json](stripe-sandbox-storage-catalog-20261111.json).

| Capacity (existing binary accounting) | USD/month | Sandbox product | Sandbox price |
| --- | --- | --- | --- |
| 50 GiB | 5 | `prod_Vbx1M86ZW7gIMB` | `price_1Uaj7f0v1TAfIsgZHtYtQGh6` |
| 150 GiB | 10 | `prod_Vbx1VHvjQUGhlj` | `price_1Uaj7g0v1TAfIsgZ9YJEklY0` |
| 500 GiB | 20 | `prod_Vbx1XLguEmEvJF` | `price_1Uaj7i0v1TAfIsgZ8E61NzZ4` |

Created only these three service products and recurring prices, then independently
retrieved all three prices with expanded products and verified their attributes.
One initial combined product/default-price request was rejected by Stripe's
parameter validation; no object was returned or created by that request. Separate
product and price calls succeeded. Source descriptions still say “one-time”; those
original descriptions are preserved. Sandbox descriptions accurately say monthly.
Product names retain approved “GB” labels; no change to the existing GiB policy.
No legacy offerings, subscriptions, invoices, payment methods or customer records
were created. Catalog creation itself emits Stripe catalog events; no subscription
or invoice lifecycle events were generated or delivered for certification.

Tax classification is preserved: service, no product tax code, price tax behavior
`unspecified`; no tax settings or registrations were changed. This is not a tax
configuration certification.

Before creation, both sandbox webhook endpoint and v2 event-destination inventories
were empty. The original production-targeting Test webhook was not modified.
CLI credential account identity was also checked read-only with `/v1/account`.

## Implementation

`stripe-account-catalog.ts` contains exact sandbox price/product IDs referencing
existing `STRIPE_CATALOG.storage` entries. It defines no duplicate allowance or
capacity policy. Existing original Test/Live/legacy entries remain byte-for-byte
unchanged. Sandbox IDs are deliberately absent from unscoped catalog lookups.

The webhook verifies the Stripe API credential's account with `accounts.retrieve()`
before billing RPCs. Server `STRIPE_ACCOUNT_ID` defaults to the original account;
sandbox use requires explicit `acct_1Spw8m0v1TAfIsgZ`. Any supplied event account
must agree. Unknown accounts, mismatches and unavailable account verification fail
closed. This introduces an account-read permission/API availability prerequisite;
there is no fallback if it fails.

Sandbox is Test-only and restricted to an HTTP loopback Supabase URL (no proxy path,
userinfo, query or fragment). The existing DB financial-environment guard still
runs before dispatch. A hosted URL is rejected even if its database is in Test
mode. Before actual delivery, the local receiver must additionally prove isolated
DB credentials and absence of forwarding to production; a loopback URL alone does
not certify the infrastructure behind it.

Immutable request context is threaded through subscription metadata resolution,
fenced refresh and paid-service-period validation. Exact account/environment/price
matching is mandatory in the webhook; names and metadata do not select a sandbox
entitlement. Mixed, unknown and cross-account recurring prices fail closed. Legacy
non-webhook helpers retain their original catalog behavior but cannot recognize
sandbox prices without explicit context. Original checkout catalog mappings are
unchanged; this does not introduce a sandbox Checkout UI.

## Local certification

- 54 focused billing/catalog/lifecycle tests PASS. New tests cover every sandbox
  offer, all existing original catalog and legacy IDs, mode/account mismatches,
  unknown IDs and prototype keys, stale metadata, zero-total paid periods, and
  execution of the actual webhook entrypoint with inert adapters through created,
  updated and deleted subscription dispatch. Sandbox-to-hosted rejection occurs
  before any DB RPC; wrong DB financial mode is rejected before writes.
- 32 configured financial migration/authority regressions PASS.
- Nursery TypeScript and strict explicit compilation of changed shared modules and
  the new test PASS. The default lint glob ignores `.mts`; the test is separately linted through
  stdin with the existing TypeScript rules.
- Existing guarded disposable PostgreSQL storage certification PASS: baseline-v1
  schema source `20261104071802`, fresh `forge_storage_99df2d08dee0`; four unchanged
  storage successor migrations. Independent-connection lifecycle fencing,
  cancellation, renewal, downgrade, zero-total periods and financial journal
  preservation PASS. Exact-object quarantine/immutability/concurrency PASS.
- 17 real disposable Storage HTTP operations PASS, including exhaustion,
  overwrite/retry, deletion and concurrency. SQL lookup adapters and synthetic
  quota metadata remain limitations; no customer media.
- Frozen exact-worktree evidence PASS: zero protected byte differences. All 14 negative
  frozen-evidence rejection checks PASS.

Commands:

```sh
pnpm --filter nursery exec tsx --test tests/stripe-account-catalog.test.mts tests/subscription-lifecycle.test.mts tests/storage-subscription-authority.test.mts tests/billing-interface.test.mts
pnpm --filter nursery typecheck
pnpm --filter nursery exec eslint --stdin --stdin-filename tests/stripe-account-catalog.test.ts < apps/nursery/tests/stripe-account-catalog.test.mts
FORGE_STORAGE_LIFECYCLE_CERT=1 FORGE_STORAGE_HTTP_CERT=1 FORGE_STORAGE_QUARANTINE_CERT=1 SUPABASE_DB_CONTAINER=supabase_db_forge-gate-e1-pre node scripts/certify-storage-capacity-isolated.mjs
node scripts/verify-frozen-git-evidence.mjs --require-exact-worktree-bytes
node scripts/test-frozen-git-evidence.mjs
```

## Remaining boundary

No genuine lifecycle delivery is claimed. Next: certify a sandbox-only local
receiver/signing secret and isolated DB credentials, recheck sandbox destinations,
then execute the authorized synthetic lifecycle delivery suite. CLI/API account
access now works; service credential access for the receiver and runtime remain to
be established. Creator-plan sandbox mapping is not included in this storage-only
catalog; real base-plan activation certification needs its own approved equivalent
if required, without changing the 5 GiB rule. Storage add-ons can be tested directly.

The disposable adapter proves schema/behavior compatibility, not authentic
historical financial-state equivalence or full-tail certification for this commit.
Prior GitHub evidence is for `8450a169`, not this changed candidate. Fresh CI and
genuine webhook delivery remain release gates. No merge, deployment, hosted
migration or quarantine activation was performed. Sandbox catalog entries are
intentionally retained for the next certification step; disposable DB/container
cleanup verified: the exact database no longer exists and no `forge-storage`
  test container remains. Authorized catalog resources are intentionally retained.
