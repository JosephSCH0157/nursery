# OpenAI cost reconciliation

Status: implemented as an inactive financial-control connection on 2026-09-10. It changes no price, rollout, budget, provider credential, customer-settlement flag, or spending activation.

## Evidence boundaries

The OpenAI organization credential defines the organization boundary, but the Costs and completions Usage rows collected here do not return an organization ID. The collector scopes every request to the configured Forge project and records that project scope. Costs are authoritative only for their reporting interval, project ID, API-key ID, and line item. Usage is provider-reported at reporting interval, project ID, API-key ID, model, and service tier.

Neither organization endpoint returns a request identifier that joins a request to a cost. Forge retains provider request IDs on operation captures, but a shared request ID does not become a cost match unless a provider source actually supports that relationship.

The system therefore reports four different facts:

- `authoritative_provider_total_micros`: effective provider Costs totals after overlap/revision handling;
- `usage_based_operation_estimate_micros`: Forge's immutable operation estimates before provider allocation;
- `defensibly_allocated_micros`: authoritative aggregate cost allocated only after the complete Forge request set exactly accounts for a provider bucket;
- `unmatched_authoritative_micros`: effective provider total that remains owner-only and cannot be assigned to a customer or treated as confirmed operation profit.

An automatic allocation is permitted only when there is one provider API-key bucket for the model/project/day and the Forge captures exactly equal its request count, input tokens, cached input tokens, and output tokens. The operation split is a documented aggregate allocation, not a request-level provider cost. Otherwise the batch remains unmatched.

## Revision and overlap handling

Evidence batches and state events are append-only. Exact replays reuse the original batch. A confirmed window can supersede effective same-scope windows only when it fully contains every overlap. A contained, partial, or otherwise ambiguous overlap is quarantined and contributes neither authoritative totals nor allocations. Revised totals create a new batch and a new adjustment; history is never rewritten.

For an estimated supplier expense, the accounting adjustment is `allocated authoritative amount - original estimate`. For an unresolved expense with no booked amount, the first defensible allocation is the full positive adjustment. Reports apply only the adjustment belonging to the currently effective batch, so a revised provider batch cannot add its full amount on top of the estimate or the superseded revision.

## Aggregate exposure lifecycle

The same ingestion transaction processes defensible allocations and updates a bound aggregate hold. If the direct OpenAI amount is resolved but supporting costs remain estimated, `reconciliation_partial` replaces the direct-provider ceiling with the authoritative allocated amount while retaining the full supporting, tail, retry, and other unresolved ceilings. Full `reconciled` status is written only when every supplier component is authoritative.

Unresolved obligations remain committed regardless of reservation lease expiry or rolling-window rollover. Reconciled actual supplier spend remains committed for the policy's applicable rolling window, net of recorded supplier recoveries. A later provider revision appends another authoritative outcome and changes current exposure without deleting history. Customer relief, refund, or reservation release never changes supplier evidence.

Test-funded real-provider operations are structurally ineligible for allocation because Test funding cannot authorize a real provider. BYO direct-provider charges do not create Forge OpenAI supplier expenses. Owner-funded and customer-funded Forge operations retain their funding classification while sharing the same supplier-evidence rules.

## Historical evidence

The partial September 1 through September 9 batch (`ae608653-b19e-4cb8-865a-28a3e9db88be`) recorded `$0.039058` at provider aggregate granularity. A completed September 1–10 UTC collection must supersede that batch, not add to it.

The historical `$0.490925` is retained separately as a usage-based, unmatched estimate. Its exact interval, API-key identity, and provider cost-bucket/request relationship were not retained. It is not netted against organization totals, assigned to customers, used to release production exposure, or presented as authoritative expense. The three Hearth pilot supplier records likewise remain estimated or unresolved unless a complete provider bucket can account exactly for all requests in that bucket.

## Verification contract

The isolated database proof covers estimate replacement, confirmed cost above estimate, partial evidence, exact replay, revised totals, overlap quarantine, customer-zero failure with supplier exposure, lease/window rollover, aggregate admission after reconciliation, and customer/operator privacy. It uses synthetic provider evidence and creates no production account, payment, budget, price, or provider request.
