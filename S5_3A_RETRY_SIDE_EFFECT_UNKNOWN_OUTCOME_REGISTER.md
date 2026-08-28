# S5-3A Retry, Side-Effect, and Unknown-Outcome Register

Status: discovery and contract-lock evidence only.

## Current behavior register

| ID | Finding | Severity | Current evidence | Required later posture |
| --- | --- | --- | --- | --- |
| P-01 | Adapter invocation is effect-driven rather than an explicit command. | Critical once adapters become live | `loadPublishBoard` runs on mutable dependency changes. | Live adapters must be unreachable from preview effects. |
| P-02 | No durable publication operation exists. | Critical | No table/type/RPC binds manifest, decision, destination, capability and operation ID. | Reserve P1 before any external side effect. |
| P-03 | Current request ID is constant by run mode. | High | `quench_console_stub/live`. | Use durable operation and attempt identities; do not promote this token. |
| P-04 | Retry cannot prove same publication identity. | Critical | `retry(receipt, context)` lacks the original authority tuple. | Retry appends an attempt under P1. |
| P-05 | Retry reconstructs options from `scheduled_for`. | High | YouTube/RSS retry stubs default to schedule/publish. | Options affecting provider semantics belong to frozen intent/operation evidence. |
| P-06 | Receipt is ephemeral and incomplete. | Critical | React-only `PlatformReceipt`; no manifest/decision/destination/capability. | Persist intent and observed external evidence separately. |
| P-07 | Current state machine has no unknown outcome. | Critical for real providers | States are queued/scheduled/published/failed/stubbed. | A lost response after submission must become `outcome_unknown`. |
| P-08 | Static adapter selection ignores reviewed adapter binding. | High | Registry selected by platform string; capability row contains adapter ID/version. | Executor must validate exact reviewed binding or require review. |
| P-09 | Provider publication reconciliation is absent. | Critical | S5-2C implements connection/discovery only; no upload session/object lookup. | Provider execution remains unresolved until adapter design proves reconciliation. |
| P-10 | Decision mutation receipts could be mistaken for publication receipts. | Medium | Existing table name includes `release_operation_receipts`. | Keep semantic separation; do not reuse rows as publish receipts. |

## External side-effect classification

| State | Meaning | Retry posture |
| --- | --- | --- |
| `reserved` | P1 exists; no attempt has crossed the provider boundary. | Safe to start A1. |
| `definitely_not_submitted` | Validation/auth/capability failed before provider request. | A later attempt may execute P1 after allowed infrastructure recovery. |
| `submitting` | Provider request or resumable session is in progress. | Do not start a parallel blind attempt. |
| `acknowledged_success` | Provider returned durable success evidence. | P1 is terminal success; “Publish Again” creates P2. |
| `acknowledged_failure` | Provider explicitly rejected without creating the publication. | Retry only if provider semantics prove no external object exists. |
| `outcome_unknown` | Request may have crossed the boundary but Forge lacks conclusive response. | Never blind retry. Reconcile using provider evidence or require operator review. |

The irreversible boundary begins no later than the first provider request capable of creating an upload session, media object, scheduled publication, feed mutation, or other externally visible state. A network exception after that point is not evidence of failure.

## YouTube unknown-outcome questions

Repository evidence does not yet prove:

- which YouTube upload protocol/session identity will be used;
- whether Forge will persist a resumable upload URI before transferring bytes;
- whether a request correlation key can prevent duplicate video creation;
- how an accepted upload with a lost response will be located;
- whether metadata fingerprints are reliable enough for reconciliation;
- what provider-side transitions are reversible after upload but before publish/schedule.

Classification: **provider execution unresolved**. S5-3B may create generic operation/attempt persistence, but a live YouTube adapter must not claim safe retry until its provider-specific reconciliation contract is proven.

## Allowed versus forbidden rereads after P1 reservation

| Reread | Classification | Rule |
| --- | --- | --- |
| Active credential generation / access-token expiry | Allowed execution refresh | May rotate N to N+1 if connection and destination identity remain valid. Record actual generation used as attempt evidence. |
| Connection/credential state | Allowed safety validation | Revoked/invalid blocks execution; it cannot select a replacement connection. |
| Exact destination state and workspace grant | Allowed safety validation | Unavailable/revoked blocks; it cannot select another destination. |
| Reviewed capability C7 and current capability head | Allowed comparison | C8 may be observed, but P1 remains C7. Material change requires review/rebase. |
| Adapter implementation matching C7 | Allowed compatibility validation | Mismatch blocks unless an explicit compatibility policy proves equivalence. |
| Manifest/current Hammer package | Forbidden identity reread | Execute M1 bytes/evidence only. |
| Current release decision | Forbidden identity reread | Execute D7 only, even if D8 exists. |
| Current selected platform/destination UI state | Forbidden identity reread | Execute destination X only. |
| Route, shell workspace, browser cache | Forbidden identity reread | Navigation cannot retarget P1. |
| Media path or latest asset | Forbidden identity reread | Canonical media identity remains frozen through manifest authority. |

## Retry versus republish

- **Retry** creates A2 beneath P1 and preserves the entire authority tuple and frozen publication options.
- **Republish** creates P2, even when M1, D7, X, and C7 happen to be identical.
- Credential rotation, transport request IDs, timestamps, and transient responses may differ between attempts.
- A newer manifest, decision, destination, or reviewed capability requires a new reviewed operation, never a retry.

