# Customer-funded creator flow

> Personal owner-testing funding and the five-model lineup in this document are superseded by [`HEARTH_ACCESS_AND_FUNDING.md`](./HEARTH_ACCESS_AND_FUNDING.md). Normal customer purchasing remains canonical here.

Status: implementation release prepared 2026-09-10. This release changes the customer funding read model and ordinary quote UX only. It publishes no Live price, changes no execution rollout, grants no funds, and invokes no provider.

## Checkpoint 1 — purchase and funding truth

The Account & Billing `Add Credits` action calls the authenticated `create-one-time-checkout-session` Edge Function. The function accepts only a server-known one-time AI-credit catalog price, verifies the Stripe price/product pair, binds the Stripe customer and checkout metadata to the authenticated Supabase user, and creates a Stripe Checkout `payment` session. Checkout creation cannot create a deposit or grant credits.

The signed `stripe-webhook` handler is the only normal purchase writer. `checkout.session.completed` must have `payment_status=paid`; it records the append-only `customer_deposit`, one-time purchase, and billing event before recording the authoritative Stripe balance-transaction fee. A Live deposit is ineligible for execution until that fee evidence exists. Delayed evidence is handled by signed `charge.updated` events and a bounded service-only recovery function; all three paths are idempotent. The old `grant_ai_credits` write remains Live-only compatibility display data and is not an eligible funding source for the shared gate. Stripe Test value stays separate.

The new self-only `read_my_customer_funding()` contract reports, without Stripe identifiers or private pricing data:

- verified Live purchased amount and credit units, split into purchased, consumed, refunded, reserved, and available;
- paid-cycle allowance capacity separately from deposits;
- Test value as ineligible for Live providers;
- `legacy_unverified` display value as ineligible;
- Live deposits waiting for processor-fee evidence as pending and ineligible; and
- current active reservations.

The UI polls this canonical view after checkout return, so a signed webhook appears without a manual database edit. Unique event/session/payment-intent keys make webhook replay idempotent. An abandoned session has no paid webhook and creates no deposit. Refund and dispute adjustments reduce the amount available to a new reservation; they never convert a negative balance into authority.

## Checkpoint 2 — ordinary creator callers

Each normal UI receives a customer-safe server quote. The client can return only the quote ID, operation ID, quote hash, and request fingerprint. Price, model, user/workspace/workpiece identity, limits, expiry, pricing revision, and funding source are re-read and checked on the server. If the quote is unfunded, the client offers `/app/subscriptions?funding=required`; it does not accept or execute that quote. After funding, the creator repeats the action and accepts a fresh quote.

| Route | Ordinary caller | Background/recovery | Paid boundary when enabled |
|---|---|---|---|
| `hearth.chat_completion` | Hearth chat/rewrite/outline action | Hearth request replay keeps the operation fingerprint | customer reservation + aggregate admission before OpenAI; canonical Hearth result before settlement |
| `hearth.research_synthesis` | same Hearth action with research mode | same operation identity on replay | same coordinated text adapter; research validation and canonical research persistence |
| `visual.unified_plan` | Hearth unified visual-plan action | Tongs workpiece commit recovery | same coordinated text adapter; plan validation and canonical workpiece commit |
| `visual.narrative_interpretation` | Hearth narrative/image-map interpretation | Tongs workpiece commit recovery | same coordinated text adapter; interpretation validation and canonical commit |
| `motion.broll_interpretation` | Hearth motion/B-roll interpretation | Tongs workpiece commit recovery | same coordinated text adapter; motion validation and canonical commit |
| `hammer.transcript_cleanup` | Hammer cleanup assist | Hammer prep background caller | same coordinated text adapter; cleanup validation and canonical transcript state |
| `shorts.discovery` | Hammer Shorts tool bay | shorts discovery runner | same coordinated text adapter; shorts validation and canonical artifact commit |
| `quench.metadata` | Quench metadata assist | Hammer/Quench background runner | same coordinated text adapter; metadata validation and canonical publish metadata |
| `hearth.speech_transcription` | Hearth stored-speech action | request replay | coordinated audio adapter; immutable source binding and canonical transcript |
| `anvil.realtime_transcription` | Anvil Whisper bridge | chunk replay | coordinated audio adapter; bounded chunk and canonical chunk result |
| `hammer.transcript_prep` | Hammer prep action | Tongs workpiece job runner | coordinated audio adapter; immutable source binding and canonical diarized result |
| `hammer.transcript_regeneration` | Hammer regeneration action | Tongs workpiece job runner/recovery | coordinated audio adapter; immutable source binding and canonical revision |

The seven text helpers and all four transcription helpers now share the same insufficient-funding decision. Background jobs persist exact accepted authority and stop before provider submission when it is missing, expired, changed, incomplete, or denied by aggregate admission. Duplicate operations return the stored canonical result. Ambiguous submissions retain both reservation and supplier exposure and cannot automatically resubmit. Forge/provider/validation/persistence failure charges the customer zero while preserving supplier evidence. BYO never falls back to a Forge credential.

## Checkpoint 3 — production cutover package

There are three independent release actions:

1. **Deploy repaired code/read model.** Makes canonical purchased/pending/Test/legacy/reserved balances visible and makes insufficient-funds errors actionable. It does not block legacy provider traffic.
2. **Enable enforcement.** Changes each selected database rollout and its matching server transport switch to `enforce`. An enabled route without a complete published cost policy, exact accepted quote, verified funding reservation, and aggregate admission then fails before provider submission. Rollback is `halt_new`, never `inactive`: it blocks new submissions while allowing existing operations to poll, persist, settle, and reconcile.
3. **Activate priced funding.** Requires an active model catalog entry with generation compatibility, an approved complete support/tail policy, a published private pricing revision, and approved per-route/global failure-loss limits. Only then can verified Live deposits fund a provider call.

### Payment acquisition cost

Stripe's public US standard online domestic-card rate checked 2026-09-10 is **2.9% + $0.30**. At the current $10/$25/$50 packs, that is a conservative deposit fee ratio of 5.9%/4.1%/3.5%. The webhook records the actual fee and settlement allocates it proportionally; it is never a second revenue event.

The activation proposal uses the worst current domestic ratio, 5.9%, and solves for the lowest cent price `P` satisfying `P >= round_up_cent(1.33 × (fulfillment ceiling + 0.059 × P))`. A deposit whose authoritative fee ratio exceeds 5.9% must be rejected for new execution until a higher versioned fee ceiling is approved. This avoids hiding acquisition cost inside the prepaid balance. Source: https://stripe.com/pricing.

### Exact inactive price proposals

These prices include the complete Option B support allocation from `OPENAI_TEXT_SUPPORTING_COST_DECISION.md`, the 5.9% processor-allocation ceiling, the private 33% markup, and whole-cent upward rounding. They remain proposals because no candidate except the bounded Hearth Luna pilot has generation-compatible route evidence. Choosing a row is a model/quality decision; the release does not substitute Luna for an existing route.

| Route capacity | Astra | Sol | Terra | Luna | deprecated Mini snapshot |
|---|---:|---:|---:|---:|---:|
| 128k input / 16,384 output (`research_synthesis`, `transcript_cleanup`) | $3.17 | $1.35 | $0.79 | $0.20 | $0.23, ineligible |
| 64k input / 16,384 output (`unified_plan`, `shorts.discovery`) | $2.24 | $0.98 | $0.61 | $0.19 | $0.21, ineligible |
| 32k input / 8,000 output (`narrative`, `broll`, `quench`) | $1.18 | $0.55 | $0.37 | $0.16 | $0.17, ineligible |

The already-proven bounded `hearth.chat_completion` Luna policy remains **$0.02**: $0.001015 direct + $0.010000 support, at most $0.001180 allocated acquisition fee, 33% markup, one attempt, 2,000 input and 512 output tokens. It is not published by this release.

Using the same Option B $0.092567 support allocation for transcription gives the following inactive proposals:

| Route/model | Direct ceiling | Support ceiling | Processor ceiling | Customer ceiling |
|---|---:|---:|---:|---:|
| Hearth speech / Anvil chunk, `gpt-4o-mini-transcribe` | $0.030000 | $0.092567 | $0.010620 | $0.18 |
| Hammer prep/regeneration, `gpt-4o-transcribe-diarize` | $0.060000 | $0.092567 | $0.013570 | $0.23 |

These audio prices exclude Fly/local preprocessing. A source that needs probe, transcode, extraction, search, enrichment, or any other separately paid support must fail before reservation until that component receives its own policy. Model visibility is not generation compatibility.

### Proposed bounded first activation

The earlier one-operation Luna proposal was a canary, not an everyday limit. Private owner testing now uses the explicit coordinated owner-testing identity and a separately approved scoped budget described in `HEARTH_ACCESS_AND_FUNDING.md`; normal customers continue to use verified Live deposits or backed allowances. No numeric owner-session limit is approved here. Roll back by appending `halt_new` and retaining reconciliation.

Before broader activation, choose a generation-compatible model for each capacity group and approve Option A or Option B plus the canonical-content tail. If one operation for every scoped route used the lowest-cost Luna/approved transcription proposals under Option B, the one-pass supplier/support exposure would be $1.412696 and the rounded customer ceilings would total $2.10. That arithmetic is capacity planning only; it is not a model recommendation or approved global limit.

## Current production behavior and remaining bypasses

- Runway retains its existing enforced/halted paid boundary; this release does not alter it.
- OpenAI text transport defaults to `inactive`. Inactive is intentional legacy pass-through: if a production generation credential is present, these eight routes may still spend outside the coordinator. `shadow` is not a safety cutover. Only `enforce` or `halt_new` prevents missing-authority fallback.
- OpenAI transcription transport defaults to `inactive`; `inactive` and `shadow` both preserve legacy provider transport. The four routes are not financially safe until complete policies are approved and both database and server transport controls are cut over.
- The seven text policies still name deprecated/ineligible historical aliases. An active catalog/model, exact route compatibility, and complete cost revisions are required before enforcement can serve them.
- Search, extraction, enrichment, media generation, Fly probe/transcode, and other provider families remain separate paid boundaries and are not authorized by these quotes.

## Verification evidence

- Isolated customer-funding database: paid deposit replay, abandoned checkout, Live/Test/legacy/reservation separation, refund blocking, self-only reads, and no revenue on reservation all pass.
- Billing boundary suite: 81/81 pass, covering all ordinary callers, exact acceptance, changed input, replay, provider/Forge/validation/persistence failure, customer relief, supplier expense, concurrency, ambiguous submission, BYO, aggregate denial, and private data.
- Aggregate isolated database: shared Runway/OpenAI capacity, cross-user/workspace contention, expiry/window obligations, partial recovery, overlapping/revised reconciliation, unmatched-profit safety, and operator privacy pass.
- Text and transcription isolated databases pass. The tests use fake providers and create no payment or provider call.

## Actions needed for one real customer-funded operation

1. Deploy this release and its `20261005120000` read-model migration.
2. In Account & Billing, choose a Live AI-credit pack and complete Stripe Checkout. The signed webhook and fee evidence must move the purchase from pending to verified Live funding.
3. Approve publication of the bounded Hearth Luna $0.02 revision and the proposed $0.011015 per-operation/24-hour aggregate failure-loss limits, or provide replacements.
4. Confirm the existing project credential has generation permission for the exact Luna request; metadata visibility alone is insufficient.
5. Append the scoped pricing/model revisions and switch only `hearth.chat_completion` to `enforce` in both database rollout and server transport configuration.
6. Repeat the Hearth action, review the new $0.02 quote, and accept it. Do not reuse a pre-purchase quote.
7. Verify one provider attempt, one canonical result, one settlement/receipt, one deposit consumption/revenue recognition, allocated processor fee, and no duplicate on replay; then append `halt_new` if continuing availability was not separately approved.

