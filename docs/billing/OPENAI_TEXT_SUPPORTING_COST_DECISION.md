# OpenAI text supporting-cost decision package

Status: inactive proposal prepared 2026-09-09. Neither option publishes a Live price, changes a rollout mode, or authorizes a provider call.

## Evidence boundary

The authenticated plan evidence is Netlify Blacksmiths Pro at **$20/month for 3,000 credits** and Supabase Pro at **$25/month**. The current periods, observed consumption, and public replacement rates are recorded in `OPENAI_TEXT_EVIDENCE_AND_SUPPORT_COSTS.md`. Netlify and Supabase receipts prove the fixed plan charges; public rate cards provide replacement assumptions. Neither is operation-level actual-cost evidence.

The existing conditional variable subtotal is **$0.002567 per completed operation**:

| Component | Ceiling | Rule |
|---|---:|---|
| Netlify request and function compute | $0.002225 | One request; at most 120 seconds at 1 GB |
| Result delivery | $0.000219 | At most 1 MiB serialized UTF-8; use one applicable cached or uncached path, never both |
| First 30 days of retained database content | $0.000123 | At most 1 MiB at the public database-disk replacement rate |
| Validation | Included | Runs inside the same 120-second function envelope and is not added twice |

This is a conservative replacement ceiling, not a measured expense. Search, source extraction, enrichment, transcription, email, media generation, and Fly processing are excluded. If any is required, the route stops before paid execution until a separate versioned policy exists.

At the proposed 120-second/1-GB envelope, one operation consumes at most 0.333533 Netlify credits (0.333333 compute plus 0.0002 request). The 3,000-credit plan therefore has a theoretical ceiling of 8,994 such operations if nothing else uses the plan. At the observed 542.4-credit usage, 2,457.6 credits remain, equivalent to at most 7,368 additional maximum-envelope operations. These are capacity ceilings, not demand forecasts and not proof that a specific operation incurred that cost.

The Supabase included allowances observed in the authenticated billing view were 100 GB storage and 250 GB egress. With 3.807 GB storage and 0.971 GB egress already used, the simple 1-MiB-per-result upper bounds are approximately 98,501 additional stored results and 255,005 uncached result deliveries. Database disk was provisioned at 8 GB; no operation-level database-compute measurement was available.

## Option A — subscription recovers fixed compute

Netlify's $20 and Supabase's $25 are a **$45 monthly fixed platform pool**. The private plan-allocation policy would recover that pool from successfully paid subscription-cycle revenue. Text operations carry only their direct OpenAI ceiling plus the $0.002567 variable supporting ceiling.

Accounting rules:

- A subscription receipt is not counted again as operation revenue. A versioned allocation moves no more than $45 of already-recognized monthly subscription revenue to the fixed-cost recovery view.
- Operation contribution profit is operation revenue less direct provider and variable supporting expense. Operating profit then subtracts the unrecovered part of the $45 fixed pool exactly once.
- Current subscriber count and allocable subscription revenue were not available in the authenticated evidence. Therefore recovery is **unproven** and the displayed monthly shortfall is `max($45 − approved allocated subscription revenue, $0)`.
- Low usage does not change a customer's accepted price. Provider/Forge failures charge the customer $0; their direct and variable supporting expense reduces contribution profit and consumes a separately approved failure-loss limit.
- A plan upgrade or an overage does not silently change this pool. New quotes halt until a new plan-cost revision and allocation are approved.

Owner decision required: approve a monthly subscription-revenue allocation of up to $45 and identify the economically backed plan cycles. Without that decision, Option A remains activation-blocked even though the operation price arithmetic is complete.

## Option B — fixed compute allocated to operations

The full-cost proposal allocates the entire $45 pool across a conservative floor of **500 completed paid operations per month**, or **$0.09 per completed operation**, then adds the $0.002567 variable ceiling. The supporting-cost ceiling is therefore **$0.092567 per operation**.

| Completed paid operations | Fixed allocation recovered | Fixed-pool variance before direct/variable costs |
|---:|---:|---:|
| 100 | $9 | $36 shortfall |
| 500 | $45 | $0 |
| 1,000 | $90 in the commercial price basis | $45 above the fixed pool; it is operating contribution, not a second $45 expense |

The $45 expense remains one monthly accounting event. Per-operation allocation is a pricing basis; it never creates 500 duplicate fixed-expense entries. At 1,000 operations, reporting caps fixed expense at $45 and reports the excess revenue as contribution. The next pricing revision may lower the allocation, but accepted quotes never change retroactively.

Low usage creates an owner-visible shortfall. Customer-free failures do not recover the allocation and their provider expense consumes the failure-loss limit. Any plan upgrade, overage, or change to the 500-operation floor requires a new revision before more quotes are issued.

Owner decision required: approve or replace the 500-operation floor and approve allocating 100% of the $45 pool to these text routes. Because the same plans serve non-text workloads, 100% is conservative and may over-allocate; no workload-share telemetry currently supports a smaller percentage.

### Recommendation

Use **Option B for the first bounded Live activation**, subject to owner approval of the 500-completion floor and the 100% text-workload allocation. It protects the no-subsidy rule without assuming that subscription revenue has funded the $45 pool. The tradeoff is deliberate over-recovery risk because Netlify and Supabase also serve non-text workloads. Record the $45 plans once as expenses, report the per-operation amount only as a pricing allocation, and revise the workload share after one complete month of route telemetry. Option A becomes preferable only after paid subscription cycles and an explicit revenue allocation can demonstrate the $45 recovery without counting those receipts twice.

## Exact capacity and retention controls proposed for either option

- Maximum attempts: one provider submission. An ambiguous response is reconciled under the original operation ID and is never automatically resubmitted.
- Function envelope: 120 wall-clock seconds and 1 GB memory. The request is rejected before submission if the configured route cannot fit this envelope.
- Result envelope: 1,048,576 serialized UTF-8 bytes across the provider capture, validated domain result, and customer-safe response. Oversize after provider use is a Forge validation failure: customer charge $0; supplier expense remains.
- Capacity warning: 70% of the current Netlify monthly credits or 70% of an included Supabase storage/egress allowance.
- Capacity halt: 80% of either included allowance, any first observed overage, or remaining Netlify credits below the maximum credits required by all currently leased reservations plus one operation. Quotes stay halted until an operator records a new capacity revision.
- Provider response evidence: retain the minimum response/usage evidence for 30 days, except unresolved reconciliation, dispute, or legal-hold records.
- Billing/accounting receipts: append-only business records under the accounting retention policy; no 30-day deletion.
- Canonical creator content: scripts, plans, interpretations, transcript edits, shorts, and publishing metadata remain for the workspace/product lifecycle. There is no blanket 30-day deletion. After the first 30 days, Option A treats canonical-content storage as plan-funded; Option B assigns it to the next recurring full-cost storage pool. A quote cannot be activated until one of those tail policies is selected.

The numeric warning/halt marks are Netlify 2,100/2,400 credits, Supabase storage 70/80 GB, and Supabase egress 175/200 GB. Reaching a warning blocks new long-lived batch authorization but permits already-reserved work. Reaching a halt blocks new quotes and reservations while preserving polling, customer relief, and reconciliation for existing operations. Retained canonical content is never deleted merely to get below a threshold; its continuing storage moves to the approved recurring tail pool or appears as an owner-visible unfunded shortfall.

## Direct-provider ceilings and customer prices

Every table assumes one attempt, maximum uncached input, maximum output/reasoning tokens, the private **33% markup on the complete cost basis**, and the established rule `ceil(cost × 1.33 to the next whole cent)`. Cached-input discounts are not used to reduce a maximum; any realized cache discount improves contribution. Reasoning tokens are charged against the output ceiling.

Official rate evidence retrieved 2026-09-09: GPT-6 Astra $10 input/$1 cached/$50 output per million tokens; GPT-5.6 Sol $4/$0.40/$20; GPT-5.6 Terra $2/$0.20/$12; GPT-5.6 Luna $0.20/$0.02/$1.20; GPT-5 Mini $0.25/$0.025/$2. Sources: [OpenAI model catalog](https://developers.openai.com/api/docs/models), [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini), and the individual model pages linked from the catalog.

Project visibility was proven by non-generating model retrieval. It does not prove generation compatibility. The pinned `gpt-5-mini-2025-08-07` snapshot is documented as deprecated and is not activation-eligible; the alias remains a draft compatibility candidate only. Each row below is therefore a finite **price proposal**, not a published or executable SKU.

### 128,000 input / 16,384 output

Applies to `hearth.research_synthesis` and `hammer.transcript_cleanup`.

| Candidate | Direct max | Option A full cost / customer max | Option B full cost / customer max |
|---|---:|---:|---:|
| GPT-6 Astra | $2.099200 | $2.101767 / **$2.80** | $2.191767 / **$2.92** |
| GPT-5.6 Sol | $0.839680 | $0.842247 / **$1.13** | $0.932247 / **$1.24** |
| GPT-5.6 Terra | $0.452608 | $0.455175 / **$0.61** | $0.545175 / **$0.73** |
| GPT-5.6 Luna | $0.045261 | $0.047828 / **$0.07** | $0.137828 / **$0.19** |
| GPT-5 Mini alias | $0.064768 | $0.067335 / **$0.09** | $0.157335 / **$0.21** |

### 64,000 input / 16,384 output

Applies to `visual.unified_plan` and `shorts.discovery`.

| Candidate | Direct max | Option A full cost / customer max | Option B full cost / customer max |
|---|---:|---:|---:|
| GPT-6 Astra | $1.459200 | $1.461767 / **$1.95** | $1.551767 / **$2.07** |
| GPT-5.6 Sol | $0.583680 | $0.586247 / **$0.78** | $0.676247 / **$0.90** |
| GPT-5.6 Terra | $0.324608 | $0.327175 / **$0.44** | $0.417175 / **$0.56** |
| GPT-5.6 Luna | $0.032461 | $0.035028 / **$0.05** | $0.125028 / **$0.17** |
| GPT-5 Mini alias | $0.048768 | $0.051335 / **$0.07** | $0.141335 / **$0.19** |

### 32,000 input / 8,000 output

Applies to `visual.narrative_interpretation`, `motion.broll_interpretation`, and `quench.metadata`.

| Candidate | Direct max | Option A full cost / customer max | Option B full cost / customer max |
|---|---:|---:|---:|
| GPT-6 Astra | $0.720000 | $0.722567 / **$0.97** | $0.812567 / **$1.09** |
| GPT-5.6 Sol | $0.288000 | $0.290567 / **$0.39** | $0.380567 / **$0.51** |
| GPT-5.6 Terra | $0.160000 | $0.162567 / **$0.22** | $0.252567 / **$0.34** |
| GPT-5.6 Luna | $0.016000 | $0.018567 / **$0.03** | $0.108567 / **$0.15** |
| GPT-5 Mini alias | $0.024000 | $0.026567 / **$0.04** | $0.116567 / **$0.16** |

## Evidence and activation checklist

For every proposed model/route pair, activation still requires: exact model/API/structured-output compatibility; a versioned rate record; the selected Option A or B policy; 1 MiB/120-second enforcement; a canonical-content tail policy; per-operation and aggregate Forge failure-loss limits; a verified Live funding source; and an explicit operator publication. Model aliases may not change the provider snapshot or accepted terms silently.

## Unexecuted paid-compatibility proposal

The non-generating project check showed `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` as visible. Visibility and documented API support are not generation evidence. The deprecated `gpt-5-mini-2025-08-07` snapshot and the unpinned Mini alias are excluded from this proposal.

The supported-candidate compatibility batch is 28 calls: each of the four visible, non-deprecated candidates against each of the seven route validators and canonical persistence paths. It is not a complete five-model matrix, which would require 35 calls; the seven GPT-5 Mini calls are ineligible because the exact pinned snapshot is deprecated and the alias cannot preserve accepted terms. Every eligible call would use a supplied local fixture, at most 2,000 uncached input tokens, at most 512 output/reasoning tokens, one attempt, concurrency one, no search/extraction/enrichment/transcription/media/email, and the original operation identity for reconciliation. No customer would be charged and an ambiguous submission would stop the matrix.

| Candidate | Calls | Direct ceiling per call | Full failure-loss ceiling per call | Aggregate direct ceiling |
|---|---:|---:|---:|---:|
| GPT-6 Astra | 7 | $0.045600 | $0.048167 | $0.319200 |
| GPT-5.6 Sol | 7 | $0.018240 | $0.020807 | $0.127680 |
| GPT-5.6 Terra | 7 | $0.010144 | $0.012711 | $0.071008 |
| GPT-5.6 Luna | 7 | $0.001015 | $0.003582 | $0.007105 |

With the $0.002567 conditional support ceiling on all 28 eligible calls, the aggregate full-cost/failure-loss ceiling is **$0.596869**, rounded to a proposed owner budget of **$0.60** with no renewal. This proposal is intentionally unexecuted and unapproved. It still requires explicit paid-test approval, an owner budget, a selected supporting-cost option/tail policy, cache-write-safe request parameters, and confirmation that the 512-token output cap is sufficient for each exact route schema. See `RESTRICTED_BETA_FINANCIAL_ENFORCEMENT_PREPARATION.md` for the complete 7×5 eligibility matrix and exact stop conditions.

The authoritative but unmatched OpenAI aggregate remains **$0.039058** for the incomplete September collection period. The historical **$0.490925** remains a separate estimate. Neither amount is embedded in these forward-looking prices or treated as an adjustment.
