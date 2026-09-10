# Restricted-beta financial-enforcement preparation

> Owner-testing identity, organization-shared payer authority, Test refills, and the requested GPT-5.4 Mini lineup are superseded by [`HEARTH_ACCESS_AND_FUNDING.md`](./HEARTH_ACCESS_AND_FUNDING.md). Beta enrollment remains outside the revised plan.

Status: prepared, inactive, and no-spend on 2026-09-09. This release adds admission and exposure-accounting machinery but enrolls nobody, publishes no price, chooses no budget or loss allowance, and changes no existing rollout mode.

## What the restricted-beta policy changes when activated

The policy is server-owned and revisioned. A future active revision must bind an authenticated user/workspace, capability, operation identity, normalized request fingerprint, exact model/SKU, immutable cost evidence, opaque funding handle, attempts, supporting work, tail policy, evidence freshness, and expiry. Browser flags, client prices, missing credentials, and caller-provided authorization booleans have no authority.

For an enrolled request:

- a covered capability receives one atomic aggregate exposure hold before the paid boundary;
- an uncovered capability, stale cost revision, changed input/model, expired funding context, exhausted aggregate limit, or forbidden caller stops before cost;
- UI, background, retry, and recovery callers use the same decision and cannot fall back around a denial;
- Test customer funding is structurally forbidden from a real provider;
- ambiguous submission and unresolved supplier obligation become reconciliation-only and cannot resubmit;
- customer funding, supplier obligations/recoveries, and Forge loss are separate event fields;
- warnings or `halt_new` stop new work while existing polling, customer relief, and reconciliation continue.

The production seed is `draft`; its aggregate limit, reserved headroom, concurrency, rolling window, allocation policy, tail policy, cohort, and every capability term are deliberately unset or blocked. Existing Runway enforcement and the bounded Hearth chat control remain authoritative. This migration does not weaken either.

## Paid-capability inventory

The database contains the full revisioned inventory. “Missing credential” never counts as enforcement.

| Capability | Ordinary/background callers | Credential source | Current control and bypass | Restricted-beta admission |
|---|---|---|---|---|
| Hearth chat text | Hearth UI/server/recovery | `OPENAI_TEXT_API_KEY`, `OPENAI_API_KEY`, exact BYO | Existing bounded coordinator | Retain existing enforcement, then aggregate it |
| Seven certified text routes | Creator UIs, route handlers, scripts/jobs, retry/recovery | same Forge keys or exact BYO | Adapter/certification exists; inactive transport still has legacy pass-through | Cover exact route/model or block |
| OpenAI images/edits | visual asset UI/jobs | `OPENAI_IMAGE_API_KEY`, `OPENAI_API_KEY`, BYO | | Not connected to shared funding | Block |
| OpenAI audio/transcription | Anvil handler, workpiece runner, Hammer prep | `OPENAI_API_KEY`, BYO, caller-specific HF fallback | Unfunded provider/fallback paths | Block |
| Runway video | b-roll submitter, poller, reconciliation | `FORGE_BROLL_RUNWAY_API_KEY`, exact BYO | Enforced; `halt_new` preserves reconciliation | Retain existing enforcement, then aggregate it |
| Brave search | Hearth research/topic discovery/runtime | four existing Brave/Research key names | Key absence can disable a call but is not a spending gate | Block |
| Remote extraction/enrichment | research/reference ingestion jobs | caller-specific external configuration | Provider/rate inventory incomplete | Block |
| Hugging Face inference | Anvil ASR/model routing/background | `HUGGINGFACE_API_TOKEN`, `HF_TOKEN`, BYO | Caller-specific OpenAI/HF fallback | Block |
| Fly probe/transcode/render | media inspection, Hammer clients/workers | distinct Netlify/Supabase/worker caller tokens | Service authentication and resource limits exist; no money reservation | Block |
| Postmark Auth SMTP | Supabase Auth | externally configured SMTP credential | Outside local SDK call graph; invoice/volume evidence required | Block attributable email; ordinary Auth email remains explicit plan support |
| Supabase/Netlify storage and egress | canonical writes, uploads, delivery, exports, retention jobs | session/service role/platform runtime | Continuing and incompletely metered | Block unless included capacity and tail are funded |

Exact caller, fallback, limit, evidence, and bypass details live in `tongs.paid_capability_inventory_revisions`; direct authenticated table access is revoked. The operator RPC is the only human audit surface.

## Aggregate Forge exposure

`reserve_restricted_beta_exposure` takes a transaction-level advisory lock shared across routes and users. It counts in-flight supplier/support/tail/retry/unreconciled ceilings plus open failed or ambiguous obligations, then preserves configured headroom. It rejects before a hold is created if either concurrency or the aggregate Forge limit would be exceeded. Event-key and operation-key replay are idempotent; the same operation with a different fingerprint or model is a conflict.

The exposure model deliberately does not equate customer funds with Forge risk:

- customer funding is the accepted maximum that can be reserved or relieved;
- supplier exposure is what Forge may owe even when the customer owes $0;
- Forge loss is the unrecovered expense after customer relief;
- supplier recovery reduces the original obligation and is never customer revenue;
- unreconciled cost remains exposure until authoritative evidence closes it.

No production numeric limit exists in this release. Choosing one is a business approval, not a code default.

## Allocation alternatives (both inactive)

The measured fixed pool is Netlify $20 plus Supabase $25, or **$45/month**, recorded once.

Option A allocates up to $45 of already recognized, economically backed subscription-cycle revenue to fixed-cost recovery. Deposits do not become revenue again. Without sufficient eligible subscription revenue, the difference remains an owner-visible shortfall.

Option B uses a commercial pricing allocation of $45 / 500 completed paid operations = **$0.09 per successful operation**. It does not manufacture 500 expense events. Volume sensitivity:

| Completed operations | Fixed allocation represented in prices | Fixed-pool outcome |
|---:|---:|---:|
| 0 | $0 | $45 shortfall |
| 100 | $9 | $36 shortfall |
| 500 | $45 | exactly recovered |
| 1,000 | $90 | $45 commercial contribution above the one $45 expense |

Therefore `$0.09` recovers `$45` only at 500 successful operations. Failures that charge the customer $0 do not recover this allocation. Neither option is active; selecting one, its attributable product share, and its revision effective period remains an owner decision.

## Continuing storage and capacity ownership

Two revisioned proposals remain draft: `plan_funded` after a 30-day/1-MiB first period, or `recurring_metered` after that period. Both use 70% warning and 80% halt thresholds. Crossing a threshold stops new authorizations and opens an owner-visible shortfall; it never deletes creator content. Billing receipts remain append-only. Canonical scripts, plans, transcripts, media, shorts, and publishing metadata follow the workspace lifecycle rather than a blanket billing-record deletion rule.

Activation still needs an owner-approved policy owner and cadence for:

- Netlify credit, Supabase storage/egress/database, Fly, and Postmark invoice/usage collection;
- reserved-capacity headroom versus already leased work;
- evidence freshness and provider-reporting latency;
- overage detection and the exact `halt_new` threshold;
- continuing-cost allocation after the first funded retention period.

## Seven routes × five model candidates

Official documentation was rechecked 2026-09-09. Rates per million tokens are: Astra `$10 / $1 cached / $12.50 cache-write / $50 output`; Sol `$4 / $0.40 / $5 cache-write / $20`; Terra `$2 / $0.20 / $2.50 cache-write / $12`; Luna `$0.20 / $0.02 / $0.25 cache-write / $1.20`; GPT-5 Mini `$0.25 / $0.025 / $2` with no GPT-5.6 cache-write rule. Reasoning tokens consume the output ceiling. Astra/Sol/Terra requests above 272K input require the documented full-request long-context multipliers; every proposed Forge route stays below that threshold. Standard tier is the only tier proposed; Batch/Flex/Fast cannot be substituted into an accepted quote.

Sources: [model catalog](https://developers.openai.com/api/docs/models), [model comparison](https://developers.openai.com/api/docs/models/compare), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini), and [Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create).

Legend: `F` = actual route handler/validator/persistence certified only with a fake provider; `V` = exact Forge project returned the model from non-generating retrieval; `D` = official docs support Responses/Chat Completions/Structured Outputs; `G?` = route-specific paid generation not proven. `X` = activation-ineligible.

| Route | Astra | Sol | Terra | Luna | GPT-5 Mini |
|---|---|---|---|---|---|
| `hearth.research_synthesis` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |
| `visual.unified_plan` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |
| `visual.narrative_interpretation` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |
| `motion.broll_interpretation` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |
| `hammer.transcript_cleanup` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |
| `shorts.discovery` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |
| `quench.metadata` | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/G? | F/V/D/**X deprecated snapshot** |

The prior 28-call proposal covers only the four visible, non-deprecated candidates across seven routes. It is **not** a complete five-model matrix: that would be 35 calls, and seven Mini calls are ineligible because the pinned `gpt-5-mini-2025-08-07` snapshot is deprecated while the unpinned alias cannot preserve accepted terms. The proposal is revised to “28-call supported-candidate compatibility batch.” A true five-model batch is blocked until the owner replaces Mini or OpenAI exposes a non-deprecated exact binding.

“Best available” may select only an active entry with V+D+generation-verified route compatibility, current complete rate/support/tail evidence, exact funding, and active aggregate-loss capacity. A specific choice never silently falls back. Where OpenAI exposes only a rolling model ID, the accepted quote freezes the provider ID plus Forge rate/compatibility revision and expires before evidence freshness; any observed provider change halts new quotes rather than substituting silently.

## Runnable but unexecuted compatibility procedure

No paid call or budget is authorized. The previous `$0.60` figure remains an unapproved ceiling proposal.

1. Use a future dedicated owner operating budget, not customer/Test funds, scoped to the exact 28 operations, one concurrency slot, no renewal, and a 24-hour maximum window.
2. For each of seven routes and each of Astra/Sol/Terra/Luna, create one accepted owner quote bound to the exact model/rate/cost/policy revisions and a supplied local fixture.
3. Call the existing ordinary route handler and provider boundary using Responses API standard tier, strict JSON Schema output, at most 2,000 input tokens, 512 total output/reasoning tokens, and one attempt. Set prompt caching to explicit mode with no cache breakpoint; if the provider will still write cache tokens, stop and reprice before submitting.
4. Exclude search, extraction, enrichment, transcription, image/audio/video, email, and Fly work. Validation/persistence execute inside the existing 120-second/1-GB and 1-MiB result proposals only after those proposals are approved.
5. Direct ceilings remain `$0.319200` Astra + `$0.127680` Sol + `$0.071008` Terra + `$0.007105` Luna = `$0.524993`; conditional variable support is 28 × `$0.002567` = `$0.071876`; total is `$0.596869`.
6. Stop the whole batch on any ambiguous submission, validation/persistence failure, unexpected cache write, rate/model mismatch, support overrun, or stale capacity evidence. Retain the original reservation and do not resubmit.
7. After each usable canonical result, settle once and release only resolved unused exposure. Close the authorization after 28 terminal operations or expiry. Preserve unresolved obligations for reconciliation.

The future execution credential belongs only in the established server runtime secret destination and must not reuse the evidence-only GitHub environment names. The evidence credentials remain confined to GitHub’s `openai-billing-evidence` environment and cannot generate.

## Verification and remaining admission gates

Fake/unit and isolated-database tests cover: cross-user/cross-route aggregate contention, uncovered legacy rejection, background/retry denial, Test-to-real separation, stale evidence, changed fingerprint/model, duplicate reservation/attempt/outcome, ambiguous reconciliation-only behavior, supplier obligation despite customer relief, Forge loss visibility, and customer/operator privacy.

Remaining business approvals are consolidated here:

1. Select Option A or B, attributable product share, and effective period.
2. Approve the 120-second/1-GB function and 1-MiB result envelopes or replacements.
3. Select the post-30-day storage/tail proposal and operational owner.
4. Set per-operation and aggregate Forge failure-loss limits, reserved headroom, concurrency, rolling window, and evidence maximum age.
5. Select the restricted-beta cohort and supported model set; replace or remove deprecated Mini.
6. Approve a separate paid compatibility budget/credential only after reviewing the revised procedure.
7. Publish customer prices and verified funding eligibility separately; none is published here.

Engineering still required before admission: wire each paid boundary family into the generic admission RPC; remove each listed legacy fallback only after its replacement passes; add provider-specific reconciliation collectors; enforce the chosen capacity/tail policy; and prove the four-model paid compatibility batch if authorized. Approvals or credentials do not substitute for those implementation steps.

The current feature boundary is: Runway remains enforced; Hearth chat retains its proven coordinator; the seven text adapters and pricing UI remain inactive for ordinary Live execution; images, audio, Brave, extraction, Hugging Face, Fly monetary authorization, Postmark allocation, and continuing storage/egress remain outside funding enforcement. This release prepares a restricted beta; it does not complete Forge-wide billing.
