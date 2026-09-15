# Forge Financial Architecture — Canonical Manifest

> **One Forge. One financial path. Test keys now. Live keys at launch.**

Authority level: **Canonical System Manifest**.  
If code behavior contradicts this document, the code is wrong.

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

## 4. Go-Live Protocol: Environment Activation

Go-live for Podcaster's Forge financial capabilities is an **environment activation**, not a product development phase.

At launch:
1. Environment variables and secrets are configured with Stripe Live credentials and Live Stripe Price IDs.
2. Verified Live Stripe webhooks are pointed to the production webhook handler.
3. Live model catalog entries and pricing revisions are enabled.

**No new billing code, no new reservation logic, no new accounting handlers, and no new settlement endpoints may be written for go-live.** If a feature is needed for launch, it must be implemented and tested in the unified pipeline beforehand.

---

## 5. Architectural Guardrails & Enforcement

Whenever an engineer, contributor, or AI agent encounters:
- A proposal to add a "test-only" balance bypass or mock settlement path in production code;
- A conditional branch altering billing behavior based on environment;
- A requirement to duplicate pricing or subscription schemas for test versus live;

The agent MUST:
1. **STOP immediately.**
2. Refuse to implement divergent logic or workarounds.
3. Cite this manifest (`docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md`) and raise an architecture issue.
