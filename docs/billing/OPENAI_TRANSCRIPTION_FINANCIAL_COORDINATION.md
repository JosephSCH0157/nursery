# OpenAI transcription financial coordination

Status: deployed code is intentionally inactive until an owner approves complete supporting-cost ceilings, prices, failure-loss capacity, and rollout revisions. `FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE` defaults to `inactive`; it is independent of the OpenAI text switch.

## Actual route inventory

| Route policy | Ordinary caller | Provider boundary | Canonical usable result | Enforced-path behavior |
|---|---|---|---|---|
| `hearth.speech_transcription` | Hearth stored-speech action → `/api/hearth/stt` | OpenAI `/v1/audio/transcriptions`, `gpt-4o-mini-transcribe` | Private `openai_transcription_canonical_results` row, returned as the Hearth transcript | Exact uploaded bytes/revision, one attempt, quote acceptance, reservation, aggregate admission, capture, validation, persistence, settlement/receipt |
| `anvil.realtime_transcription` | Anvil Whisper bridge → `/api/anvil/asr/whisper` | OpenAI `/v1/audio/transcriptions`, configured mini/full model | Private canonical chunk result plus the existing Anvil session assembly | One source chunk, maximum two seconds, one attempt; HF and paid transcode fallback fail closed because they have no complete policy |
| `hammer.transcript_prep` | Hammer interactive prep → `/api/hammer/prep/transcript`; Hammer background job creation/runner | OpenAI `/v1/audio/transcriptions`, `gpt-4o-transcribe-diarize` | Diarized transcript, speaker map, recording-revision/workpiece state, and billing replay result | One direct provider attempt; unpriced preprocessing is blocked before funding; background jobs carry immutable authority and the runner gates immediately before submission |
| `hammer.transcript_regeneration` | Hammer regeneration job → Tongs job creation/runner | OpenAI `/v1/audio/transcriptions`, `gpt-4o-transcribe-diarize` | New canonical diarized revision/workpiece state | Same exact-source and provider-boundary controls as prep; recovery cannot create a second provider attempt |

The recording/import flows do not contain another OpenAI transcription request. They create or select the canonical media consumed by Hammer. Hammer cleanup is an OpenAI **text** route and remains governed by `hammer.transcript_cleanup`, not by these audio policies.

## Official provider-rate evidence

Rates were checked on 2026-09-10 against OpenAI’s official model and API documentation. These are private provider cost inputs, not published customer prices and not proof of an individual operation’s authoritative cost.

| Provider model | Billing basis captured | Input rate | Output rate | Bound in draft | Direct-provider ceiling |
|---|---|---:|---:|---:|---:|
| `gpt-4o-mini-transcribe` | Audio input tokens, text input tokens, output tokens | $1.25 / 1M audio or text input tokens | $5.00 / 1M output tokens | 16,000 input + 2,000 output; one attempt | $0.030000 |
| `gpt-4o-transcribe` | Audio input tokens, text input tokens, output tokens | $2.50 / 1M audio or text input tokens | $10.00 / 1M output tokens | 16,000 input + 2,000 output; one attempt | $0.060000 |
| `gpt-4o-transcribe-diarize` | Audio input tokens, text input tokens, output tokens | $2.50 / 1M audio or text input tokens | $10.00 / 1M output tokens | 16,000 input + 2,000 output; one attempt | $0.060000 |
| `whisper-1` | Duration | $0.006 / minute | n/a | Separate duration-rate draft only | Not configured |

Sources:

- https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
- https://developers.openai.com/api/docs/models/gpt-4o-transcribe
- https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize
- https://developers.openai.com/api/docs/models/whisper-1
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/usage/methods/audio_transcriptions

OpenAI accepts files up to 25 MB for transcription. The enforced Hearth source bound is 10 MB; the Anvil chunk is 25 MB and two seconds; new Hammer background funding rejects canonical source objects above 25 MB. A changed byte length or SHA-256 hash invalidates accepted authority.

## Supporting-cost disposition

No support allocation is assumed. Each route remains `draft` with `supporting_unpriced` coverage and therefore cannot be quoted or activated:

- Netlify/server execution, validation, persistence, Supabase storage/database, and egress need an approved allocation and ceiling.
- Hearth’s ephemeral upload is removed after successful persistence; failed/unresolved cleanup remains an explicit tail obligation.
- Anvil’s Fly/local transcode fallback is excluded under enforcement.
- Hammer work needing preprocessing/transcode is rejected before reservation; a future Fly/local-compute policy must be priced separately.
- A transcription quote never authorizes search, extraction, enrichment, media generation, or another paid service.

The private 33% cost-plus markup remains stored and adjustable. It applies only after the full cost basis is approved. No transcription customer price is published by this release.

## Failure and replay behavior

- Provider response and usage evidence are recorded before Forge validation or canonical persistence.
- Provider, Forge-validation, and persistence failures charge the customer $0 while supplier cost remains estimated/unresolved until reconciled.
- A transport exception after submission is `submission_unknown`: the reservation and aggregate exposure remain, and the operation is not automatically resubmitted.
- The same operation/reservation/attempt key cannot authorize a second provider submission. Background operation identity is derived from the exact request fingerprint rather than a new click ID.
- BYO authority never falls back to a Forge credential. Direct BYO supplier cost is not Forge expense; separately attributable Forge work still requires its own complete policy.

## Reconciliation

The read-only evidence collector now retrieves organization Costs, completions Usage, and audio transcriptions Usage. Audio aggregate rows contain interval, project, API-key identity, model, seconds, and request count; they do not contain provider request IDs. Operation captures retain provider request ID, model, route, request fingerprint, detailed provider-reported usage, and canonical source binding.

Automatic audio allocation is permitted only when project, API key, model, interval, request count, and total provider-reported duration exactly account for the provider bucket. Otherwise the authoritative cost remains unmatched. This is a defensible aggregate allocation, not request-level cost certainty.

The completed 2026-09-01 through 2026-09-10 UTC evidence remains `$0.039058` of authoritative OpenAI transcription cost and is recorded once as unmatched. This release creates no supplier expense or customer allocation from that aggregate. The historical `$0.490925` item remains an unrelated, unresolved OpenAI text estimate.

## Activation decisions still required

1. Approve numeric support/tail ceilings for the selected routes and source formats.
2. Verify the intended model is visible to the production OpenAI project without generating content.
3. Approve complete cost-policy and aggregate failure-loss revisions.
4. Preview the 33% cost-plus customer prices and explicitly publish selected SKUs.
5. Select a narrowly scoped user/workspace rollout and funding source, then change the transcription rollout from `inactive` to `enforce`.

No one of these steps is implied by deploying this preparation release.
