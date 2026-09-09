# OpenAI text billing boundary — wired, inactive integration

> Current model catalog, official-rate evidence, exact direct ceilings, and supporting-cost blockers are in [openai-text-model-catalog-and-cost-evidence.md](./openai-text-model-catalog-and-cost-evidence.md). GPT-5.3 entries below are historical configuration, not executable recommendations.

Production rollout remains `inactive`. Every marked transport now reaches the same server-owned execution adapter when enabled. The adapter cannot be replaced at runtime, and an enabled route without request-scoped accepted quote/reservation context fails closed before legacy transport. Exact provider rate and route cost-policy identities are append-only database revisions; no customer price or route is activated by the foundation migration.

| Route code | Product path | Provider operation | Attempts/bounds before activation | Usable-result condition | Current state |
|---|---|---|---|---|---|
| `hearth.chat_completion` | Hearth chat, rewrite, outline, readiness, media-map assistance | Responses/chat transport through `runAIRequest` | Up to 3 attempts; 384k aggregate input and 49,152 aggregate output | Hearth response validation plus Tongs persistence | Shared adapter wired; exact OpenAI ceiling $1.360128; supporting allocation unpriced; inactive |
| `hearth.research_synthesis` | Hearth research synthesis | Responses | Up to 3 attempts; 384k/49,152 aggregate | Research artifact validation plus Tongs persistence | Shared adapter wired through Hearth request path; exact OpenAI ceiling $1.360128; supporting allocation unpriced; inactive |
| `visual.unified_plan` | Unified visual planning | Responses | 1 attempt; 64k/16k | Visual-plan schema validation plus canonical plan persistence | Boundary marked; funded coordinator inactive |
| `visual.narrative_interpretation` | Image-prompt narrative interpretation | Responses | 1 attempt; 32k/8k | Substantive brief validation plus persistence by caller | Boundary marked; funded coordinator inactive |
| `motion.broll_interpretation` | B-roll motion interpretation | Responses | 1 attempt; 32k/8k | Motion-brief validation plus persistence by caller | Boundary marked; funded coordinator inactive |
| `hammer.transcript_cleanup` | Hammer transcript cleanup | Chat Completions | Primary plus one model-access fallback; 256k/32,768 aggregate | Valid selected-segment changes plus accepted transcript persistence | Shared adapter wired; exact primary + fallback OpenAI ceiling $0.482407; supporting allocation unpriced; inactive |
| `shorts.discovery` | Hammer shorts discovery | Responses | 1 attempt; 64k/16k | Proposal validation, deterministic resolution, and discovery-authority completion | Boundary marked; funded coordinator inactive |
| `quench.metadata` | Quench release metadata | Chat Completions | 1 attempt; 32k/8k | Metadata schema validation and persisted handoff | Boundary marked; funded coordinator inactive |

## Activation requirements

Each Forge-funded route already has an exact provider-rate revision and direct-provider attempt ceiling. It still needs an approved complete supporting-cost policy, a matching private pricing revision, and an active failure-loss revision. Each route then needs a customer-safe quote/acceptance, verified live deposit or funded allowance selection, and an atomic reservation supplied to the server adapter. Unknown or incomplete pricing blocks execution.

BYO activation must resolve the exact OpenAI credential before reservation. A missing or rejected BYO credential blocks the operation and cannot fall back to Forge. Forge-funded supporting components remain separately quoted and reserved.

Failure exposure is capped independently of the customer charge. The customer failure ceiling is always zero. The database now atomically accounts for per-operation exposure, rolling aggregate realized/open exposure, and concurrency before issuing each attempt lease; reaching the aggregate cap appends `halt_new`. Duplicate attempt keys return a blocked replay. An uncertain submission keeps its exposure and reservation unresolved and is never automatically resubmitted.

## Bounded activation proposal awaiting approval

- Route: `hearth.chat_completion`; model: `gpt-5.3-chat-latest`; one neutral text request with no tools, search, media, or purchased assets.
- Maximum 2,000 input tokens, 512 output tokens, one attempt, concurrency one, 24-hour authorization window.
- Exact direct-provider ceiling: 10,668 micros ($0.010668) at $1.75/M input and $14/M output.
- Proposed supporting-cost ceiling: 10,000 micros ($0.01); total Forge ceiling and per-operation/aggregate failure-loss cap: 20,668 micros ($0.020668).
- 33% cost-plus result is $0.02749044 and the approved cent-up rule previews a $0.03 customer maximum. Proposed owner-only test budget: $0.03 total/per operation.
- The proposal row is `awaiting_owner_approval`; it creates no budget, publishes no price, and activates no route.

## Authoritative reconciliation

`scripts/reconcile-openai-organization-costs.mjs` fetches paginated organization Costs grouped by project, line item, and API key, plus completions Usage grouped by project, API key, and model. It records idempotent owner-only batches through the service-role RPC. Costs are authoritative in aggregate; token usage is operational evidence. Per-operation contribution profit remains incomplete until a cost bucket is matched with explicit allocation evidence.

## Text-related gaps still outside enforcement

- Every row above intentionally uses legacy paid transport while its database rollout is `inactive`; changing the process environment alone cannot authorize a database-inactive route.
- The server-owned adapter is wired across the complete caller inventory, but production requests do not yet carry an accepted OpenAI quote/reservation because no OpenAI price is published and customer spending remains disabled.
- Exact OpenAI rate revisions are recorded; supporting-cost policies for normal production routes remain deliberately unpriced and activation-blocked.
- Customer spending and production OpenAI cutover remain disabled.
- The organization Costs/Usage ingestion path is implemented but has not ingested a production batch in this no-spend slice. The original Runway pilot also remains financially unresolved.

Non-text OpenAI image generation/edits and audio transcription are intentionally outside this slice. Runway remains enforced. Other remaining provider families are Hugging Face/Anvil, Brave/search, and the paid Fly-backed compute families.
