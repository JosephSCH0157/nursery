# Forge Financial Architecture — Canonical Manifest

> **One Forge. One financial path. Test keys now. Live keys at launch.**

Authority level: **Canonical System Manifest**.  
If code behavior contradicts this document, the code is wrong.

### Maintenance & Authority Rule
The single source of truth for Forge's financial architecture lives in this document. Agent instructions and repository policies (`AGENTS.md`, `.github/copilot-instructions.md`, etc.) must summarize the core invariant and reference this manifest directly rather than duplicating exhaustive rules, preventing documentation drift.

---

## 1. The Non-Negotiable Invariant

```
## Test / Live Financial Parity — Non-Negotiable

Forge has ONE customer financial system.

Development, testing, beta, and production MUST use the same application paths for:

- subscriptions and purchases
- customer credits/value and entitlements
- pricing
- model/provider selection
- reservations and admission
- spend controls
- settlement
- refunds
- accounting and journals
- storage and AI purchases
- failure handling

During development and beta, customer money flows through Stripe Test credentials.
At launch, the same system runs through Stripe Live credentials.

Test and Live may differ only where external providers require environment-specific
credentials or identifiers. Those differences MUST enter through configuration,
not separate product logic.

A customer using Stripe Test MUST exercise the same Forge product behavior that a
customer using Stripe Live will exercise.

Provider execution during testing may incur real Forge wholesale cost. That does
not justify a separate customer financial path.

Go-live MUST NOT require new billing, pricing, reservation, settlement, accounting,
entitlement, or customer-funding implementation. It is an environment activation,
not a product rewrite.

If proposed work introduces separate Test and Live financial behavior:

STOP.

Do not patch around it.
Raise an architecture issue.

If existing code contradicts this rule, the code is wrong.
```

---

## 2. Core Architectural Principles

### 2.1 Single Financial Core
Forge does not have a "test billing system" and a "live billing system." There is only **one** customer financial engine.

All lifecycle operations use the identical codebase, database schemas (`tongs`), RPCs, and Edge Functions across all environments:
1. **Catalog & Pricing:** Quoting, price calculations, margin checks, and versioned pricing revisions.
2. **Purchase & Deposit Ingestion:** Stripe Checkout session creation, signed webhook processing, append-only deposit logs, and Stripe fee recording.
3. **Funding & Balances:** `read_my_customer_funding()` balance reporting (purchased, reserved, consumed, refunded, available).
4. **Execution Gate:** Quote verification, funding reservation, aggregate spend admission, and provider dispatch.
5. **Settlement & Failure Handling:** Canonical artifact persistence followed by settlement, or immediate zero-charge release upon verified provider/platform failure.
6. **Accounting & Journals:** Immutable event journals, double-entry ledgers, and wholesale provider cost reconciliation.

### 2.2 External Identifiers vs. Internal Concepts
Stripe and third-party AI providers maintain separate namespaces and object graphs between Test mode and Live mode. This separation must remain at the boundary.

#### What IS allowed to differ (Environment Configuration):
- Stripe API Secret Keys (`STRIPE_SECRET_KEY`)
- Stripe Publishable Keys (`STRIPE_PUBLISHABLE_KEY`)
- Stripe Webhook Signing Secrets (`STRIPE_WEBHOOK_SIGNING_SECRET`)
- Stripe Product IDs and Price IDs (e.g., `price_test_123` in Test vs. `price_live_456` in Live)
- AI Provider API Keys and endpoint credentials
- Database connection URLs and service keys

#### What is NEVER allowed to differ (Product Logic & Contracts):
- The checkout creation flow
- The webhook event processing logic
- The deposit and balance calculation algorithms
- The quote-reservation-settlement state machine
- The database schema, tables, views, RLS policies, and triggers
- The user-facing billing and checkout UI contracts

#### The Mapping Rule: Two External Identifiers, ONE Forge Concept
When Stripe creates distinct Test and Live Price IDs for a credit pack or subscription tier, both identifiers MUST map into the **same canonical Forge contract** (e.g., SKU `credit_pack_1000`, tier `pro_monthly`).

Code MUST NEVER branch on environment to select a workflow:
```typescript
// FORBIDDEN (Antipattern)
if (isTestMode) {
  grantTestCreditsDirectly(user);
} else {
  createStripeLiveCheckout(user);
}

// CANONICAL (Correct)
// The same checkout workflow executes; environment configuration resolves
// the corresponding Stripe price ID and keys for the canonical SKU.
const stripePriceId = resolveStripePriceId(CANONICAL_SKU.CREDIT_PACK_1000);
await createCheckoutSession({ user, stripePriceId });
```

---

## 3. Wholesale Supplier Cost vs. Customer Funding

Provider execution during development, testing, and beta may incur real Forge wholesale costs (e.g., actual OpenAI token usage charges).

- Real wholesale supplier cost incurred during development or testing is a development expense.
- It **does not justify** bypassing customer billing, creating dummy deposit shortcuts, or fabricating a second financial pipeline.
- A user testing a flow in Stripe Test must proceed through the real quote, reservation, admission, and settlement lifecycle. This ensures that the production financial machine is exercised and verified before launch.

---

## 4. Forge Credit Economy

### 4.1 Customer denomination

The customer monetary abstraction is **Forge Credits**. "Tokens" describes
provider usage telemetry only and is never the name of customer currency.

The canonical denomination is invariant across Test and Live:

```
1 Forge Credit = 5,000 USD micros = $0.005 pre-tax customer value
200 Forge Credits = $1.00 pre-tax customer value
```

Pack size never changes the value of a Forge Credit. The approved logical pack
terms are:

| Pre-tax purchase price | Forge Credits |
| ---: | ---: |
| $10.00 | 2,000 |
| $25.00 | 5,000 |
| $50.00 | 10,000 |

Stripe Test and Live objects implement paired versions of these same logical
offers. Their external Product and Price identifiers may differ, but their
currency, pre-tax amount, credit grant, and Forge offer identity must agree.

### 4.2 Forge-provided AI price calculation

Forge-provided AI uses a fixed **33% cost-plus** base markup. Every calculation
uses deterministic integer arithmetic:

```
target_customer_value_micros = ceil(wholesale_cost_micros * 133 / 100)
customer_credit_charge       = ceil(target_customer_value_micros / 5,000)
settled_customer_value_micros = customer_credit_charge * 5,000
credit_rounding_adjustment_micros =
  settled_customer_value_micros - target_customer_value_micros
```

The rounding adjustment is evidence separate from the 33% base markup. It must
not be represented as additional markup. Arithmetic must fail closed on invalid,
negative, fractional, or unsafe inputs.

### 4.3 Tax boundary

Forge Credits represent pre-tax customer value. Applicable transaction tax is
calculated and preserved on the Stripe purchase transaction. Consuming Forge
Credits never calculates a second sales-tax charge, and the same operation burns
the same number of credits in every customer tax jurisdiction.

Stripe tax evidence belongs with the purchase receipt. Stripe Tax must not be
enabled merely by code: the applicable Stripe environment must also have the
merchant's confirmed active registrations and tax configuration.

### 4.4 Customer and operator views

Ordinary customers may see their Forge Credit balance, purchased credits,
included subscription credits where useful, usage, and legitimate purchase or
billing history. They must not receive provider wholesale cost, provider token
economics, markup calculations, supplier-cost ceilings, margin, internal
currency micros, owner funding concepts, or raw database/pricing errors.

Internal evidence must preserve the provider, route/model/service, verified
wholesale cost, base markup, target customer value, whole-credit rounding
adjustment, final credit charge, Stripe purchase/payment and tax identities,
financial environment, funding source, reservation, settlement, and provider
request/execution identities.

---

## 5. Subscription Allowances

Subscription allowances are versioned product terms backed by canonical Stripe
cycle receipts. They use the same grant, reservation, consumption, settlement,
and journal state machine in Test and Live. A receipt's financial environment is
immutable and an inactive environment cannot grant or spend an allowance.

The current **provisional Creator testing term** is:

- 1,000 Forge Credits per eligible monthly renewal;
- 5,000,000 allocated pre-tax customer-value micros; and
- 3,759,398 maximum wholesale AI exposure micros.

This is a testing term, not a final launch promise. Changes require a new
versioned term; application hardcoding and silent reinterpretation are
forbidden. No Pro or Studio allowance economics are approved by this term.

---

## 6. Legacy Credit Evidence

Historical token-labelled grants, simulated Test units, legacy `ai_credits`, and
earlier pack denominations are preserved as historical evidence. They are not
spendable Forge Credits unless an append-only reconciliation proves trustworthy
remaining customer-value micros and records an explicit conversion under the
current credit contract.

Conversions use whole credits derived from remaining customer value:

```
canonical_credits = floor(remaining_customer_value_micros / 5,000)
unconverted_remainder_micros = remaining_customer_value_micros % 5,000
```

The source units, calculation inputs, remainder, evidence, and resulting
canonical balance must remain auditable. A conversion never fabricates a Stripe
purchase, revenue, or a claim that historical units were already Forge Credits.

---

## 7. Accounting Boundary

The present boundary is **capture now, report later**. Operational financial
facts and immutable journal evidence must be accurate enough for future
reconciliation and export. Ledger will eventually reconcile provider invoices
and export suitable data to an external accounting system such as QuickBooks.

Ledger is not QuickBooks. Forge does not implement a general ledger UI, P&L,
tax filing, chart-of-accounts management, accountant seats, vendor invoice
import, or QuickBooks workflows in this financial slice.

---

## 8. Go-Live Protocol: Environment Activation

Go-live for Podcaster's Forge financial capabilities is an **environment activation**, not a product development phase.

At launch:
1. Environment variables and secrets are configured with Stripe Live credentials and Live Stripe Price IDs.
2. Verified Live Stripe webhooks are pointed to the production webhook handler.
3. Live model catalog entries and pricing revisions are enabled.

**No new billing code, no new reservation logic, no new accounting handlers, and no new settlement endpoints may be written for go-live.** If a feature is needed for launch, it must be implemented and tested in the unified pipeline beforehand.

---

## 9. Architectural Guardrails & Enforcement

Whenever an engineer, contributor, or AI agent encounters:
- A proposal to add a "test-only" balance bypass or mock settlement path in production code;
- A conditional branch altering billing behavior based on environment;
- A requirement to duplicate pricing or subscription schemas for test versus live;

The agent MUST:
1. **STOP immediately.**
2. Refuse to implement divergent logic or workarounds.
3. Cite this manifest (`docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md`) and raise an architecture issue.
