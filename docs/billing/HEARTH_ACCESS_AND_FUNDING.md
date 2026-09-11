# Hearth access and funding

Status: implementation support prepared, financially inactive. This document supersedes the personal-owner funding and model-lineup portions of `CUSTOMER_FUNDED_CREATOR_FLOW.md` and `RESTRICTED_BETA_FINANCIAL_ENFORCEMENT_PREPARATION.md`. It does not publish a price, activate a route, establish a numeric owner budget, or authorize a provider call.

The canonical non-spending request, exposure, and tail repair is documented in `NON_SPENDING_FINANCIAL_REPAIR_RELEASE.md`. Its complete-request binding and corrected supporting-cost assumptions supersede earlier domain-input-only and 120-second pricing proposals.

## Funding identities

Forge treats the acting creator and funding payer as separate identities.

- **Personal customer funding** reserves the creator's verified Live deposit or economically backed allowance. Test receipts and legacy balances cannot fund a real provider.
- **Organization shared funding** reserves the selected organization's canonical payer account. The creator remains the actor and usage is attributed to them; no balance is copied. Current membership, an active organization payer revision, and an explicit member spend-permission revision are required before a new provider submission.
- **Private owner testing** is available only to an explicitly registered owner-testing principal. Platform-operator, administrator, workspace-owner, or organization membership does not imply this identity. It creates no customer debit or revenue, but it still requires an active, numeric, scoped owner operating budget before a provider boundary can run.

Changing payer requires a new immutable quote/authority binding. Forge does not silently fall back between personal, organization, owner, or BYO funding. Revoking authority stops new submissions; it does not erase a supplier obligation for an already admitted operation.

## Owner testing

The protected bootstrap records the verified account outside reusable migrations. An owner-testing budget is separately scoped by environment, workspace, provider, route/SKU, period, currency, and maximum amount. No maximum, concurrency, attempt count, or daily limit is set by this release.

An enabled identity without an active budget can select the owner-testing payer in the interface but receives a clear funding blocker. This is intentional: identity answers *who may use the lane*; the budget answers *how much Forge may owe*. Actual provider usage is recorded as owner/internal supplier expense and remains estimated until authoritative evidence arrives. It is never labeled synthetic merely because the creator is testing.

Recommended limits for later approval should fit a normal creator session rather than the earlier one-operation canary. Capacity used by a successful operation returns when authoritative or conservatively final cost replaces its ceiling; definitive failures retain incurred supplier cost; ambiguous submissions retain the complete conservative exposure until reconciled.

## Organization sharing

An organization owner or administrator may append a payer-account revision and explicit member permission. An optional route list narrows permission; an empty route list means all otherwise activated coordinated routes. The selected payer's existing verified deposits and funded allowances are reserved atomically, so concurrent members contend against one canonical balance. Refunds and disputes immediately reduce future available funding through the existing accounting records.

Permission is rechecked before new authority is issued. Accepted operations retain their payer and operation identity. Changing the payer preference, request fingerprint, workpiece, route, model, pricing revision, limits, or expiry requires a new quote and acceptance.

## Test refills

Operator-issued Test refills are append-only `test_credit` journal quantities. They are not Stripe deposits, Live liabilities, customer revenue, or evidence that a provider invoice was paid. Their consumption RPC accepts only `provider_mode=simulated`; a real-provider attempt fails closed. Existing legacy balances remain preserved and ineligible for Live funding.

## Purchased credits and delayed fees

The signed Checkout webhook records a paid deposit before fee enrichment. A Live deposit remains pending and ineligible until authoritative Stripe balance-transaction evidence exists. Forge attempts retrieval immediately, handles a later signed `charge.updated`, and provides a service-role-only bounded recovery endpoint (maximum 50 pending deposits per run). All paths call the same idempotent fee-recording RPC. Recovery is deployed unscheduled unless a separate operational cadence is approved.

## Model choices

Catalog revision 2 contains the requested candidates: GPT-6 Astra, GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.4 Mini (exact snapshot `gpt-5.4-mini-2026-03-17`), and GPT-5.6 Luna. Best Available is resolved server-side by the versioned quality rank and may select only a model that passes project visibility, route-specific generation compatibility, complete supporting/tail costs, exact rate/pricing, funding, and admission gates.

Official standard-tier rates checked 2026-09-10 (input / cached input / output per million tokens) are: Astra $10 / $1 / $50; Sol $4 / $0.40 / $20; Terra $2 / $0.20 / $12; GPT-5.4 Mini $0.75 / $0.075 / $4.50; Luna $0.20 / $0.02 / $1.20. Visibility for Astra, Sol, Terra, and Luna was previously observed by the non-generating evidence workflow. GPT-5.4 Mini visibility is unverified. Visibility does not prove generation compatibility. The catalog remains draft and no Live customer price is published.

## Deployment and activation boundaries

1. **Code/schema deployment** adds explicit identities, payer authority, Test-refill isolation, delayed fee recovery, the draft model catalog, and the customer-safe selector. It enables no spend.
2. **Enforcement cutover** switches an exact route in both the database and server transport to coordinated execution. Missing authority then rejects before the provider. Rollback is `halt_new`, preserving polling, settlement, and reconciliation.
3. **Owner-testing enablement** registers the verified principal and separately activates an approved numeric owner budget and failure-loss capacity. Registration alone cannot spend.
4. **Organization/customer enablement** requires complete route costs, published customer price at the existing private 33% markup, verified payer funds, and approved aggregate limits.

Writing, saving, and deterministic non-AI helpers remain available when paid AI is unavailable. Inactive legacy transports remain a documented spending bypass until each affected route is changed to `enforce` or `halt_new`; deploying this support does not alter those production modes.
