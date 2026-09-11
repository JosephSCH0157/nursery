# OpenAI text supporting-cost decision package

Status: inactive proposal corrected by the 2026-10-07 non-spending financial repair. It publishes no Live price, changes no rollout mode, creates no budget, and authorizes no provider call.

## Evidence boundary

Authenticated plan evidence records Netlify Blacksmiths Pro at **$20/month for 3,000 credits** and Supabase Pro at **$25/month**. These receipts prove fixed plan charges, not operation-level actual cost. Public replacement rates provide conservative planning assumptions only.

The corrected first-30-day variable ceiling is **$0.001456 per completed operation**:

| Component | Ceiling | Rule |
|---|---:|---|
| Netlify request and function compute | $0.001114 | One request; at most 60 seconds at 1 GB |
| Result delivery | $0.000219 | At most 1 MiB serialized UTF-8; one applicable cached or uncached path |
| First 30 days of retained database content | $0.000123 | At most 1 MiB at the public database-disk replacement rate |
| Validation | Included | Runs in the same 60-second function envelope and is not added twice |

Search, source extraction, enrichment, transcription, email, media generation, and Fly processing are excluded. If a route needs one, it stops before provider execution until that component has its own versioned policy.

The previous 120-second assumption and every price derived from its `$0.002567` supporting ceiling are superseded. They must not be activated. The repository now prices the complete serialized provider request, so new private previews must also use the bound request's conservative input-token maximum rather than a domain-input approximation.

## Fixed-plan allocation choices still awaiting approval

Option A allocates no fixed-plan charge to an operation and recovers the **$45 monthly Netlify/Supabase pool** from explicitly identified paid subscription-cycle revenue. It cannot be considered funded until the backing cycles and maximum allocation are recorded. An operation then carries its direct-provider ceiling plus the `$0.001456` variable ceiling.

Option B allocates a selected share of that same `$45` pool across an approved completed-operation floor. The old 500-operation/100%-of-plan example would contribute `$0.09` per operation, producing a `$0.091456` supporting basis, but neither the floor nor a 100% text-workload allocation is approved. The monthly plan expense is recorded once; the per-operation amount is a pricing allocation and never a duplicate expense.

No-subsidy activation requires one of these allocations or another evidence-backed policy. The decision must identify how shared platform capacity is divided among text and non-text workloads.

## Complete-request and output bounds

Before a text quote can be accepted, the server builds the complete provider-visible request, including system instructions, history, injected context, schemas, tools, protocol fields, and the independent output ceiling. The input ceiling is the greater of model-aware `o200k_base` tokenization plus a versioned framing allowance or the serialized request's UTF-8 byte count. The quote stores only private hash and estimator evidence; the provider receives the exact same serialized bytes after reservation.

Unknown tokenizer/model mapping, changed bytes, unsupported parameters, or a request above the cost-policy maximum blocks before submission. Provider-reported usage remains an estimate for operation cost until provider billing evidence supports reconciliation.

## Storage and reconciliation tails

The `$0.000123` storage component covers only the first 30 days. It does not imply deletion or zero continuing cost.

- Canonical creator content follows the product lifecycle. Day-31-and-later storage needs a recorded plan allocation or owner-testing funding context.
- Provider evidence remains while reconciliation, recovery, dispute, or legal obligations are unresolved. Its tail stays owner-visible and estimated until measured or resolved.
- Append-only accounting evidence follows the business-retention policy and remains an explicit platform accounting cost.
- Disposable delivery payloads may be minimized after 30 days only after recovery, dispute, and reconciliation obligations are closed.

The deployed schema's revision-3 tail policy is draft and `unfunded_block`. An SKU with missing post-30-day funding evidence is activation-blocked. A capacity overrun halts new execution; it does not delete canonical content or financial evidence.

## Activation checklist

Each model/route pair still requires exact generation and parameter compatibility, a pinned provider model identifier, a private rate revision, complete request/output bounds, a selected fixed-plan allocation, funded post-30-day tails, payment-processing treatment for customer funding, per-operation and aggregate failure-loss limits, and explicit price publication.

The private markup remains **33% of the complete approved cost basis**, with the established upward whole-cent customer rounding. Markup is not profit margin. Forge/provider, validation, and persistence failures charge customers zero while their supplier expense remains Forge exposure.

Model visibility is not generation compatibility. No compatibility batch, paid call, customer price, or spending activation is authorized by this document.
