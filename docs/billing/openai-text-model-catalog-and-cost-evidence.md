# OpenAI text model catalog and cost evidence

Status date: 2026-09-09. This is a **draft** server-owned catalog. It publishes no Live price and activates no route.

## Evidence and selection rules

Provider identifiers, API support, context limits, output limits, and rates come from official OpenAI model documentation retrieved on 2026-09-09. A documentation entry is rate evidence, not Forge-project availability evidence. Forge had no accessible server credential in the deployment configuration available to this release process, so `GET /v1/models/{model}` could not be run against the actual Forge project. Even a successful model retrieval proves visibility only; route-specific generation compatibility remains a separate check.

`Best available` chooses the highest explicit quality rank among entries in an active lifecycle with verified exact-credential availability, generation-verified route/API compatibility, exact rates, complete supporting-cost coverage, pricing, and execution limits. A specific preference never silently falls back. Accepted quotes retain their catalog entry, model, rate, cost-policy, and pricing revisions.

## Draft candidate catalog

| Rank | Customer name | Exact provider identifier | APIs | Positioning basis | USD per 1M input / cached / output | Context / max output | Forge availability |
|---:|---|---|---|---|---:|---:|---|
| 100 | GPT-6 Astra | `gpt-6-astra` | Responses, Chat Completions, Structured Outputs | Officially the most capable model for complex, demanding work | $10 / $1 / $50 | 1,050,000 / 128,000 | Unverified |
| 90 | GPT-5.6 Sol | `gpt-5.6-sol` | Responses, Chat Completions, Structured Outputs | Officially positioned for complex professional work | $4 / $0.40 / $20 | 1,050,000 / 128,000 | Unverified |
| 80 | GPT-5.6 Terra | `gpt-5.6-terra` | Responses, Chat Completions, Structured Outputs | Officially positioned as the balanced model | $2 / $0.20 / $12 | 1,050,000 / 128,000 | Unverified |
| 70 | GPT-5 Mini | `gpt-5-mini-2025-08-07` (`gpt-5-mini` alias) | Responses, Chat Completions, Structured Outputs | Faster, cost-efficient GPT-5 variant for well-defined work | $0.25 / $0.025 / $2 | 400,000 / 128,000 | Unverified; fixture compatible |
| 60 | GPT-5.6 Luna | `gpt-5.6-luna` | Responses, Chat Completions, Structured Outputs | Officially positioned for cost-sensitive, high-volume work | $0.20 / $0.02 / $1.20 | 1,050,000 / 128,000 | Unverified; fixture compatible |

Quality is an operator-reviewed ordering grounded in provider positioning, not inferred from names or prices.

GPT-5.3 Chat (`gpt-5.3-chat-latest`) is retained as a deprecated historical entry only. Its official page says deprecated, and the earlier bounded Forge pilot received `model_not_found`. It is not executable and existing routes are not silently replaced.

Official sources: [models catalog](https://developers.openai.com/api/docs/models), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini), and [GPT-5.3 Chat](https://developers.openai.com/api/docs/models/gpt-5.3-chat-latest).

## Seven-route bounds and direct-provider ceilings

These are one-attempt standard-input ceilings. Cached input is recorded separately but not assumed for the maximum. Output includes reasoning/output tokens billed at the output rate. Higher context tiers, tools, search, extraction, enrichment, transcription, and a second attempt are excluded and blocked.

| Group | Routes | Input / output max | Astra | Sol | Terra | GPT-5 Mini | Luna |
|---|---|---:|---:|---:|---:|---:|---:|
| Large | `hearth.research_synthesis`, `hammer.transcript_cleanup` | 128,000 / 16,384 | $2.099200 | $0.839680 | $0.452608 | $0.064768 | $0.045261 |
| Medium | `visual.unified_plan`, `shorts.discovery` | 64,000 / 16,384 | $1.459200 | $0.583680 | $0.324608 | $0.048768 | $0.032461 |
| Small | `visual.narrative_interpretation`, `motion.broll_interpretation`, `quench.metadata` | 32,000 / 8,000 | $0.720000 | $0.288000 | $0.160000 | $0.024000 | $0.016000 |

Ceiling calculation is `ceil(input_max × input_rate / 1,000,000) + ceil(output_max × output_rate / 1,000,000)` in integer currency micros. A model alias or price change requires a new revision.

## Supporting-cost and price state

The migration creates owner-only evidence rows for validation, canonical persistence, hosting, storage, and egress for every route. Each starts `unresolved`; the required method is measured route use multiplied by the applicable production plan unit rate, allocated once to the originating operation and excluding subscription baseline or separately billed supporting operations.

No accessible invoice, production plan rate, or per-route measurement supports a numeric ceiling today. Therefore the proposed support ceiling, full-cost ceiling, and customer price are **unavailable and activation-blocking**. Search/extraction/enrichment/transcription remain excluded. A flat allowance or zero would be invented evidence.

Once support is evidenced and approved, existing pricing computes `round_up_to_USD_cent((direct + support) × 1.33)`. Markup is not contribution margin.

## Reconciliation

The collector reads OpenAI organization Costs grouped by project, line item, and API key, and completions Usage grouped by project, API key, and model. It writes through the `tongs` REST profile and uses idempotent batch source keys.

Organization/day evidence remains unmatched without a defensible request-level allocation. The new adjustment stores `confirmed amount − original estimate`; reporting applies that delta instead of adding confirmed cost as a second expense. Missing evidence remains unresolved and cannot imply zero cost or confirmed profit.

Historical ingestion uses the isolated `OPENAI_RECONCILIATION_ADMIN_KEY`; model evidence uses `OPENAI_MODEL_EVIDENCE_API_KEY` plus `OPENAI_MODEL_EVIDENCE_PROJECT_ID`. Ordinary execution does not read those names. Neither credential was accessible to this release process, so no batch or model check was fabricated. The current credential audit, exact secure setup, subscribed-plan evidence, and inactive numeric support proposal are in [OPENAI_TEXT_EVIDENCE_AND_SUPPORT_COSTS.md](./OPENAI_TEXT_EVIDENCE_AND_SUPPORT_COSTS.md).
