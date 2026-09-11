# Non-spending financial repair release

Status: implementation release; production execution settings remain unchanged.

## What this release changes

- JSON OpenAI text quotes bind a server-built, canonical serialized provider request before acceptance. The submission must match the quote's SHA-256, model, service tier, tokenizer/estimator revisions, token bounds, output ceiling, and attempt ceiling.
- Owner testing remains an explicit identity plus a separately approved owner budget. Operator, administrator, workspace-owner, and organization roles do not inherit the identity. The UI no longer tells an eligible owner-testing user to buy credits when the actual blocker is an inactive cap.
- Organization spending keeps the member and canonical payer separate. Permission is rechecked for new authority; incurred supplier obligations survive later revocation.
- Existing Stripe fee recovery remains immediate, signed-event-driven, bounded, and idempotent. Pending or reversed deposits remain unavailable.
- Aggregate exposure can be adjusted upward or downward with append-only evidence. An authoritative overrun appends a halt record and blocks new admission without interrupting polling, settlement, recovery, or reconciliation.
- Existing unresolved holds are captured as opening commitments for migration auditing. They are not new expense rows and do not duplicate supplier cost.
- Settled operations open explicit canonical-content, provider-evidence, accounting-evidence, and disposable-delivery tail records. Missing post-30-day funding remains incomplete rather than becoming zero.

## Complete request rule

The application serializes a JSON provider body in stable key order. Its conservative input bound is:

`max(o200k_base tokens + framing allowance, complete serialized UTF-8 bytes)`

The same accepted output and attempt ceilings are placed in the provider request. Customer responses expose price, maximum charge, payer label, terms, and receipt state only. Serialized content, token evidence, rates, markup, wholesale expense, exposure, and tail policy remain server/operator-only.

Transcription retains its separate exact authority over source revision, source SHA-256, byte count, duration, chunk ceiling, and output contract. Runway retains its exact operation/model/duration/aspect-ratio binding. Neither route receives a new active rollout from this release.

## Exposure lifecycle

The append-only lifecycle distinguishes admitted ceiling, provider submission, estimated realized expense, remaining reconciliation risk, authoritative adjustment, supplier recovery, and final closure. Provider usage can release unused direct-provider headroom only when the model, tier, usage dimensions, and pricing revision are proven. Supporting, tail, and currency-rounding risk remain until their own evidence resolves them.

Customer relief and supplier exposure are independent. A refund, released reservation, or zero-charge failure cannot erase provider expense. Lease expiry, policy revision, and rolling-window rollover cannot erase unresolved obligations. Authoritative increases consume capacity and may halt new admission.

## Cutover boundary

This release deliberately does not change production modes.

| Family | If later changed to `enforce` | Recovery-safe rollback |
|---|---|---|
| Runway | Missing exact funding and aggregate admission rejects before submission; async admission remains through polling/persistence/settlement | `halt_new`; never `inactive` |
| Hearth chat + seven JSON text routes | Missing quote-bound payload, acceptance, funding, or aggregate admission rejects before OpenAI; no legacy fallback | `halt_new`; existing operations can reconcile |
| Four OpenAI transcription routes | Missing source authority, funding, or aggregate admission rejects before upload; fallback/transcode cannot bypass | `halt_new`; existing jobs can finish accounting |

Inactive routes still retain their pre-existing legacy transport behavior. Deployment alone is therefore not a global paid-execution cutover.

## Deferred activation actions

Separate approval remains required for the global cutover, the `$0.09` compatibility batch, a numeric owner-session budget (the earlier `$10`/24-hour/concurrency-two proposal remains unapproved), exact five-model eligibility, customer price publication, customer/organization spending activation, generation credentials, or a bounded paid test.
