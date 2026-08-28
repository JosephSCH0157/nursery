# S5-3A Publication Operation Contract Lock Proposal

Status: proposed vocabulary and invariants based on repository evidence. No compile-time types or persistence were added.

## Reuse existing authorities

Do not create another manifest, decision, destination, or capability registry. A publication operation references:

- `tongs.quench_release_manifest_snapshots` for exact release content;
- `tongs.quench_release_decision_revisions` for the exact reviewed decision;
- `tongs.publishing_executable_destinations` for the exact external target;
- `tongs.publishing_destination_capability_revisions` for exact provider-observed capability evidence;
- the existing workspace grant chain for permission to use that destination.

The old planning-only `quench_destination_scopes` capability is decision-planning evidence, not a substitute executable destination.

## Proposed identities

```ts
type PublicationOperationId = string;
type PublicationAttemptId = string;
type PublicationReceiptId = string;

type PublicationOperationAuthority = {
  publicationOperationId: PublicationOperationId;
  workspaceId: string;
  workpieceId: string;

  manifestSnapshotId: string;
  manifestContentHash: string;

  releaseDecisionId: string;
  releaseDecisionRevision: number;
  releaseDecisionContentHash: string;

  executableDestinationId: string;
  destinationCapabilityRevisionId: string;
  destinationCapabilityRevision: number;
  destinationCapabilityContentHash: string;

  // Frozen semantic publish inputs, not mutable UI state.
  publicationIntentSnapshot: Readonly<Record<string, unknown>>;
  publicationIntentContentHash: string;
};
```

`publicationIntentSnapshot` includes provider-relevant reviewed values such as publish/schedule/premiere mode, schedule time, visibility, selected metadata/thumbnail/variant, and any other value whose change could alter the external result. Its schema should be explicit/versioned in S5-3B; generic JSON here is conceptual only.

## Operation reservation and idempotency

The future authority operation must enforce:

```text
same operation key + same complete authority fingerprint
  -> same publication operation

same operation key + any different identity or intent evidence
  -> publication_operation_idempotency_conflict
```

Reservation validates exact workspace/workpiece relationships, manifest/hash, decision revision/hash and manifest binding, explicit destination grant, destination relationship, and reviewed capability revision. It persists P1 before any adapter can create an external side effect.

## Attempts

```ts
type PublicationAttempt = {
  attemptId: PublicationAttemptId;
  publicationOperationId: PublicationOperationId;
  attemptNumber: number;
  executionState:
    | "reserved"
    | "executing"
    | "recoverable_failure"
    | "blocked"
    | "outcome_unknown"
    | "succeeded"
    | "failed_terminal";
  credentialGenerationId?: string;
  adapterId: string;
  adapterVersion: string;
  providerRequestId?: string;
  providerSessionId?: string;
  startedAt?: string;
  completedAt?: string;
};
```

Attempts are append-only execution evidence. They may use a newer credential generation after normal refresh. They may not change the operation authority or frozen intent.

## Receipts

```ts
type PublicationReceipt = {
  publicationReceiptId: PublicationReceiptId;
  publicationOperationId: PublicationOperationId;
  publicationAttemptId: PublicationAttemptId;

  // Copy/prove intended authority.
  workspaceId: string;
  workpieceId: string;
  manifestSnapshotId: string;
  manifestContentHash: string;
  releaseDecisionId: string;
  releaseDecisionRevision: number;
  executableDestinationId: string;
  destinationCapabilityRevisionId: string;

  // Observed execution evidence.
  outcome: "succeeded" | "failed" | "blocked" | "outcome_unknown";
  credentialGenerationId?: string;
  providerRequestId?: string;
  providerSessionId?: string;
  externalObjectId?: string;
  externalUrl?: string;
  normalizedProviderEvidence?: Readonly<Record<string, unknown>>;
  observedAt: string;
};
```

A receipt proves both what Forge intended and what it observed. Provider payloads must be normalized/redacted; secret credentials never enter receipt evidence.

## Capability-change lock

P1 freezes C7 as its reviewed basis. A later C8 never replaces it.

A capability change is material when it changes any of:

- support or limits relevant to P1's media, duration, size, metadata, thumbnail, privacy, scheduling, premiere, or other requested feature;
- destination/provider identity or executable state;
- required authorization scope;
- capability contract compatibility;
- adapter identity/version compatibility needed to interpret or execute C7.

Because the current repository has no proven compatibility classifier, the safe initial rule is: a changed capability content hash or incompatible adapter binding blocks P1 pending explicit review/rebase. A newer observation with identical canonical content is not a new semantic basis (`commit_publishing_destination_capability_revision` already returns no change for identical content).

## Credential boundary

Credential generation is excluded from P1 identity. The server executor may refresh or rotate credentials while preserving destination X. It records the actual generation on the attempt/receipt. Revocation, grant loss, identity conflict, or destination ownership change blocks P1; none authorizes substitution.

## Ownership boundary

| Concern | Owner |
| --- | --- |
| Immutable operation/attempt/receipt state | Tongs persistence authority |
| Explicit reserve/retry/republish commands | Quench through Tongs authority APIs |
| Credentials and token refresh | Server-only publishing credential authority |
| Provider protocol and reconciliation | Provider-specific server adapter |
| Destination/capability identity | S5-2 Tongs authority graph |
| UI projection | Quench; never authoritative |

## S5-3B boundary proposed by this lock

S5-3B should add the minimal additive persistence and server operations for operation reservation, immutable authority fingerprinting, attempts, state transitions, and durable receipts. It must keep provider HTTP execution disabled until a provider adapter separately proves its side-effect and unknown-outcome reconciliation rules.

