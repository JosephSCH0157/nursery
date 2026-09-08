# OpenAI text billing boundary — inactive integration

Production rollout remains `inactive`. The transport markers below preserve current behavior today and fail closed if `FORGE_OPENAI_TEXT_EXECUTION_MODE` is changed to `shadow` or `enforce` without a fully funded coordinator operation.

| Route code | Product path | Provider operation | Attempts/bounds before activation | Usable-result condition | Current state |
|---|---|---|---|---|---|
| `hearth.chat_completion` | Hearth chat, rewrite, outline, readiness, media-map assistance | Responses/chat transport through `runAIRequest` | Up to 3 attempts; 128k input and 32k output unit ceilings | Hearth response validation plus Tongs persistence | Boundary marked; funded coordinator inactive |
| `hearth.research_synthesis` | Hearth research synthesis | Responses | Up to 3 attempts; 128k/32k | Research artifact validation plus Tongs persistence | Policy registered; no separate production transport was found beyond Hearth's shared request path |
| `visual.unified_plan` | Unified visual planning | Responses | 1 attempt; 64k/16k | Visual-plan schema validation plus canonical plan persistence | Boundary marked; funded coordinator inactive |
| `visual.narrative_interpretation` | Image-prompt narrative interpretation | Responses | 1 attempt; 32k/8k | Substantive brief validation plus persistence by caller | Boundary marked; funded coordinator inactive |
| `motion.broll_interpretation` | B-roll motion interpretation | Responses | 1 attempt; 32k/8k | Motion-brief validation plus persistence by caller | Boundary marked; funded coordinator inactive |
| `hammer.transcript_cleanup` | Hammer transcript cleanup | Chat Completions | Primary plus one model-access fallback; 128k/32k total ceiling | Valid selected-segment changes plus accepted transcript persistence | Boundary marked; funded coordinator inactive |
| `shorts.discovery` | Hammer shorts discovery | Responses | 1 attempt; 64k/16k | Proposal validation, deterministic resolution, and discovery-authority completion | Boundary marked; funded coordinator inactive |
| `quench.metadata` | Quench release metadata | Chat Completions | 1 attempt; 32k/8k | Metadata schema validation and persisted handoff | Boundary marked; funded coordinator inactive |

## Activation requirements

Each Forge-funded route needs a published, exact provider/model/SKU price revision whose complete cost basis includes all attempts, supporting services, validation, persistence, and applicable cost tail. Each route then needs a customer-safe quote/acceptance screen, verified live deposit or funded allowance selection, an atomic reservation, and a coordinator context passed at its marked transport boundary. Unknown pricing blocks execution.

BYO activation must resolve the exact OpenAI credential before reservation. A missing or rejected BYO credential blocks the operation and cannot fall back to Forge. Forge-funded supporting components remain separately quoted and reserved.

Failure exposure is capped independently of the customer charge. The customer failure ceiling is always zero. Before a route can be activated, its private failure-cost components must bound the maximum provider attempts plus required supporting work, a per-operation Forge failure cap must fit within a funded allowance/operating-risk policy, and an aggregate rolling loss cap must switch that SKU to `halt_new` when reached. An uncertain submission retains its reservation for bounded polling and manual reconciliation; it is never automatically resubmitted.

## Text-related gaps still outside enforcement

- Every row above still uses the legacy paid transport while rollout is inactive.
- The shared `workpiece-commit-api` records estimated usage after provider execution, but does not yet receive accepted quote/reservation context from all callers.
- Exact OpenAI model rate revisions and supporting-cost policies are not published.
- Customer spending and production OpenAI cutover remain disabled.
- Organization Costs API/invoice ingestion remains the authoritative reconciliation gap; response token usage is execution evidence, not final invoice evidence.

Non-text OpenAI image generation/edits and audio transcription are intentionally outside this slice. Runway remains enforced. Other remaining provider families are Hugging Face/Anvil, Brave/search, and the paid Fly-backed compute families.
