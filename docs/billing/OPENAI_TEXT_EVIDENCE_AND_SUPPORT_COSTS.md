# OpenAI text evidence and supporting-cost proposal

Status: 2026-09-09. This is private pricing evidence and an inactive proposal. It publishes no Live price, changes no rollout mode, and authorizes no provider call.

The approval-ready comparison of subscription-funded versus full-cost allocation, including exact capacity thresholds, retention rules, volume sensitivity, and route/model price tables, is in `OPENAI_TEXT_SUPPORTING_COST_DECISION.md`.

## Credential-bound model visibility

The protected `main` workflow run `34370224975` completed at 2026-09-09 15:27 UTC. The exact Forge project returned HTTP 200 for `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5-mini-2025-08-07`, and `gpt-5.6-luna`. The observations were persisted against catalog revision 1 with project fingerprint `1c4f12836a63aa011a002864cc6f37d482020453c39f85d43f32d4a2808b0650`. This proves project visibility only: API-parameter compatibility, route fixtures, structured-output behavior, and generation compatibility remain untested. The workflow made no generation or other billable request.

The deployed trusted-runtime inventory was checked by secret **name only**. Netlify Production, Supabase Edge Function secrets, the `forge-ffmpeg` Fly app, and the checked-out server environment contain neither `OPENAI_TEXT_API_KEY`/`OPENAI_API_KEY` nor an organization-admin key name. The OpenAI text transport reads `OPENAI_TEXT_API_KEY || OPENAI_API_KEY`; therefore adding either name to Netlify would make the credential reachable by still-inactive legacy pass-through routes. This release deliberately isolates evidence collection on names that no execution path reads.

`pnpm verify:openai-model-availability` now reads the five non-deprecated candidates from the server-owned draft catalog, issues only `GET /v1/models/{model}`, and writes a sanitized append-only observation tied to the catalog entry and a SHA-256 fingerprint of `OPENAI_PROJECT_ID`. It never writes or prints the key or raw provider error body. The operator console labels this evidence **project visibility**, separately from documented API support, fixture compatibility, and generation compatibility.

Smallest secure configuration action if Forge still has an intended project key:

1. In GitHub, open `JosephSCH0157/nursery` → **Settings → Environments → openai-billing-evidence**. The environment is already restricted to the exact `main` branch. GitHub rejected a required-reviewer protection rule for this private repository under its current billing plan, so the present controls are the main-only environment policy, a manual workflow dispatch, read-only repository permissions, and narrowly scoped credentials. If the GitHub plan later supports environment reviewers, add the Forge owner as the required reviewer without changing the workflow or secret destinations.
2. Add environment secrets `OPENAI_MODEL_EVIDENCE_API_KEY` and `OPENAI_MODEL_EVIDENCE_PROJECT_ID`. `OPENAI_MODEL_EVIDENCE_API_KEY` must be a project API key/service-account key for the exact Forge OpenAI project. In **Organization settings → Projects → Forge project → API Keys**, edit the key to **Restricted**, grant **Read** only for the Models endpoint, and leave Responses, Chat Completions, Images, Audio, Assistants, Files, Batches, Fine-tuning, and every other inference/write endpoint at **None**. It must not have an organization-admin role. Do **not** use `OPENAI_TEXT_API_KEY`, `OPENAI_API_KEY`, a `VITE_` prefix, Netlify Production environment variables, or any application runtime secret store. The workflow reuses the repository's existing server-only `NURSERY_SUPABASE_URL` and `NURSERY_SUPABASE_SERVICE_ROLE_KEY`; do not duplicate those credentials into the environment.
3. Run the GitHub Actions workflow **OpenAI billing evidence**, choose `model_visibility`, and approve the protected environment job. The workflow checks out reviewed `main`; only the evidence checker references this secret name. A successful run prints only model IDs, HTTP status, timestamps, and the project fingerprint, and persists the same sanitized evidence.
4. A 200 response means only that the model is visible to that project. It does not activate the catalog or prove that the route's API parameters, structured schema, or real generation work.

Official behavior: [Retrieve model](https://developers.openai.com/api/reference/resources/models/methods/retrieve).

### Earlier successful Hearth pilot credential

The application code proves that the successful Forge-funded pilot could only obtain its OpenAI credential from the server process (`OPENAI_TEXT_API_KEY`, falling back to `OPENAI_API_KEY`) or an explicitly supplied BYO credential. The pilot accounting records classify it as `forge_project_scoped`, not BYO, and preserve the provider request/usage evidence. They do not store the environment-variable name, secret version, or secret value.

The current audit confirms that neither execution-key name is present in the **inspectable current** Netlify environment-name listing, Supabase Edge secret-name listing, Fly secret-name listing, checked-in configuration, or current checkout `.env` files. It cannot prove which ephemeral/local server environment supplied the historical pilot key, whether that value was later removed, or inspect historical secret values. Because the paid pilot was run through the bounded Hearth server path during an operator-directed test, the defensible conclusion is: the credential existed in that executing server process at the time; its exact historical source is not recoverable from retained evidence; it is absent from every currently inspectable deployed secret-name inventory. The new evidence-only key does not restore ordinary execution access.

## Organization Costs and Usage reconciliation

The connected ingestion, overlap/revision rules, accounting adjustments, and aggregate-exposure lifecycle are specified in [OPENAI_COST_RECONCILIATION.md](./OPENAI_COST_RECONCILIATION.md). The collector is no longer a storage-only endpoint: an accepted batch immediately applies only defensible allocations and leaves all other costs explicitly unmatched.

The protected `main` workflow run `34370394386` collected the exact project from `2026-09-01T00:00:00Z` through `2026-09-09T15:27:45Z`. Because the end precedes the requested September 10 cutoff, this is an **incomplete September reporting period**. It ingested authoritative aggregate batch `ae608653-b19e-4cb8-865a-28a3e9db88be` with a source total of **$0.039058**. No operation-level allocation was defensible from the project/day/API-key/model aggregates, so matched cost is **$0**, the estimate-replacement adjustment is **$0**, and the unresolved source amount is **$0.039058**. Replay run `34370695200` returned the same batch ID with `replay: true`; it did not duplicate the batch or its cost.

The historical `$0.490925` Forge-paid estimate remains a separate estimated/unreconciled amount. The new batch does not prove that it belongs to the same project, request set, or complete billing period. The numerical gap is **$0.451867**, but it is not an accounting adjustment and must not be booked as a recovery or correction. Request-level or invoice evidence is still required before replacing any pilot estimate.

## Isolated authenticated UI evidence

`openai.billing-evidence-isolation.spec.ts` exercises the real `/app/ledger` route with a generated authenticated user and deterministic workpieces in a disposable local Supabase project. The non-operator pass proves that a workspace owner cannot render the operator console, organization source totals, markup, or provider ceilings. The operator pass adds that same isolated user to `platform_operators` and proves the console renders sanitized model visibility, the aggregate source and unresolved totals, and disabled pricing and customer-settlement controls. The evidence run used a temporary Vite server on port 5188 and made no production mutation or provider call. It is intentionally separate from the production browser fixture suite.

The collector requires an **organization Admin API key**, not a normal project inference key. OpenAI currently gates the Costs, Usage, and project model-permissions administration endpoints with an Admin API key; it does not provide a request-only project inference key for those organization endpoints. Restriction is therefore enforced by using a dedicated credential, a protected environment, a manual workflow, one project filter, and a 31-day maximum. Configure it without sending it through chat:

1. An OpenAI API Platform organization owner creates a dedicated **Admin API key** in the organization administration UI. This is not a ChatGPT workspace-admin credential and not a project inference key. Use the organization whose project incurred the Forge pilots; do not reuse the key for generation or application execution. OpenAI does not currently expose endpoint-level restriction controls for Admin API keys, so the protected job boundary and project/date filters are the effective least-privilege controls.
2. In the same protected GitHub environment add `OPENAI_RECONCILIATION_ADMIN_KEY` and `OPENAI_RECONCILIATION_PROJECT_ID`. The former is referenced only by the historical-reconciliation job; it is not exported to the model check, PR checks, Netlify, or application runtime. The job reuses the repository's existing server-only Supabase secrets. Never use a `VITE_` name.
3. In **Actions → OpenAI billing evidence → Run workflow**, choose `historical_reconciliation`. Proposed initial window: `2026-09-01T00:00:00Z` through `2026-09-10T00:00:00Z`, exclusively scoped by `OPENAI_RECONCILIATION_PROJECT_ID`. The workflow rejects an invalid or greater-than-31-day window.
4. First run a read-only access check against `GET /v1/organization/costs` and `GET /v1/organization/usage/completions` for a one-day bucket. HTTP 200 with the expected organization/project fields proves access; it does not prove per-request attribution.
5. Approve the protected environment job. The collector's deterministic source key makes replay idempotent. The operator Ledger must show source total, matched amount, replacement adjustment, and unresolved amount.

The collector groups Costs by day, project, line item, and API key and Usage by day, project, API key, and model. Those aggregates are authoritative only at that granularity. An operation estimate is replaced only after defensible request allocation; the adjustment is `confirmed − estimated`, avoiding a duplicate expense.

Official APIs: [Organization Costs](https://developers.openai.com/api/reference/resources/organization/subresources/costs/methods/list), [Completions Usage](https://developers.openai.com/api/reference/resources/organization/subresources/usage/subresources/completions/methods/list), and [project model permissions](https://developers.openai.com/api/reference/resources/organization/subresources/projects/subresources/model_permissions/methods/retrieve).

## Authenticated plan and usage evidence

The operator inspected each authorized billing/runtime view on 2026-09-09. These observations establish the subscribed plan and period; public unit rates supply replacement rates, not proof of a particular operation's actual expense.

| Service | Authenticated evidence and period | Fixed overhead | Current usage evidence | Variable/replacement rate used |
|---|---|---:|---|---|
| Netlify | Blacksmiths Pro, Sep 7–Oct 6 | $20 / 3,000 credits | 542.4 credits used: 540 deploy, 1.3 requests, 0.4 compute, 0.8 bandwidth; AI inference 0; auto-recharge off | $20/3,000 = $0.006666667/credit; requests 2 credits/10k; compute 10 credits/GB-hour; bandwidth 20 credits/GB |
| Supabase | Pro, Sep 4–Oct 4; spend cap on | $25; included compute credit offsets the displayed $1.79 micro-compute charge | DB disk 8 GB provisioned, storage 3.807/100 GB, egress 0.971/250 GB (0.818 cached), 10 Edge Function invocations; no displayed overage | DB disk $0.125/GB-month, object storage $0.0213/GB-month, uncached egress $0.09/GB, cached egress $0.03/GB after inclusion |
| Fly.io | CLI-authenticated `forge-ffmpeg` config: shared-cpu-1x, 1 GB, DFW, autostop/autostart; app suspended/stopped | Invoice unavailable in the authenticated surface used | No Fly work is in these seven text-only paths when media/search/transcription remain excluded | Published running replacement $5.92/month; North America egress $0.02/GB. Not allocated to these routes. |
| Postmark | Supabase Auth is externally configured to Postmark SMTP | Invoice/plan not available to this checkout | No ordinary Auth email is triggered by a text operation | Treat as platform/plan support unless a product explicitly sends an attributable notification. |

Rate sources: [Netlify pricing](https://www.netlify.com/pricing/), [Netlify credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [Supabase pricing](https://supabase.com/pricing), [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), and [Fly pricing](https://fly.io/docs/about/pricing/).

## Conditional numeric proposal

For each of the seven routes, the draft revision-2 proposal is:

| Component | Ceiling | Method | Status / missing gate |
|---|---:|---|---|
| Validation | $0 | Included in the same function-compute envelope; never added twice | Conditional allocation, not zero actual expense |
| Netlify request + function hosting | $0.002225 | `ceil(1 × 2/10,000 × $20/3000) + ceil(120/3600 × 1 GB × 10 credits/GB-hour × $20/3000)` | Requires a uniform server-enforced 120-second timeout and 1 GB function allocation |
| Result egress | $0.000219 | At most 1 MiB: Netlify bandwidth replacement plus Supabase uncached egress replacement | Requires a server-enforced 1 MiB response/result ceiling; cached and uncached egress are never combined |
| Retained DB storage | $0.000123 | At most 1 MiB for 30 days at $0.125/GB-month | Requires an approved 30-day retention/tail policy; current canonical retention is not bounded this way |
| Persistence/database compute | unavailable | Fixed Supabase Pro/database compute allocation | Recommended classification below awaits owner approval; until then this component remains unresolved and activation-blocking |

Conditional measured-variable subtotal: **$0.002567** per operation (`$0.002225 + $0.000219 + $0.000123`; validation is included). The migration stores the rounded component ceilings separately and keeps persistence unresolved, so this subtotal cannot activate pricing. (The conservative component sum in integer micros is 2,567.)

The 33% private cost-plus rule would apply only after every required component is complete. Markup is not profit margin. Search, extraction, enrichment, transcription, paid media, and Fly processing remain excluded and must fail before execution. Fixed Netlify/Supabase subscriptions are not allocated again unless the owner approves a documented volume/share policy.

Owner decisions still required for a complete policy:

- approve or replace the 120-second/1-GB function execution envelope;
- approve or replace the 1-MiB result/egress ceiling;
- approve a bounded retention period or a recurring funded tail policy;
- classify Supabase baseline persistence as plan-funded overhead, or provide expected monthly operation volume and attributable product share;
- provide Postmark plan/invoice and message-volume evidence only if text operations will send attributable email.

### Persistence/database-compute proposal

Recommended policy: classify the fixed Supabase Pro database instance as **owner-funded baseline overhead**, not as zero cost and not as a per-operation confirmed expense. The existing operation ceiling would still include the measured storage tail and egress components above. This follows the accounting rule that baseline corporate overhead may remain in owner-only P&L while variable fulfillment costs must be quoted or plan-funded.

The policy may move from `unresolved` to `plan_funded_baseline` only after the owner approves all of these controls:

1. Supabase spend cap remains enabled and the fixed plan period is recorded in the private service registry.
2. Text operations receive no authority for search, extraction, transcription, enrichment, media processing, email, or any other paid support service.
3. The 1 MiB canonical-result ceiling and selected retention policy are enforced server-side.
4. A capacity monitor blocks new text quotes if database compute, disk, storage, or egress leaves the included plan envelope or begins incurring an unpriced variable charge.
5. Owner reporting keeps the $25 subscription in baseline P&L and labels operation contribution profit as excluding baseline overhead; it must never present this classification as evidence of zero database cost.

If the owner instead requires full absorption into each customer operation, the versioned allocation is:

`persistence allocation micros = ceil(monthly Supabase baseline micros × attributable text share basis points ÷ 10,000 ÷ conservative monthly completed-operation floor)`

The attributable share and operation floor are business inputs and must be approved together. Each accepted quote freezes both inputs and the resulting integer-micro allocation. Lower realized volume does not permit a retroactive customer charge; it becomes an owner-visible variance for the next pricing revision.
