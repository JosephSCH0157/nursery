# S5-0 Quench Contract Lock Proposal

Status: vocabulary proposal based on observed authorities. Documentation only; no public type or schema change is approved here.

## Reuse the authorities that already exist

Do not create a second manifest, candidate, or destination-intent registry.

- `tongs.quench_release_manifest_snapshots` already owns exact immutable Hammer manifest bytes and SHA-256 evidence.
- `tongs.quench_release_decision_revisions` plus assignments already own durable, revisioned candidate/release intent.
- `tongs.quench_destination_capability_revisions` already owns reviewed provider-neutral capability revisions.
- `quench_release_decision_applicability` already expresses when reviewed inputs advanced and require review.
- Existing decision-operation receipts remain decision-mutation receipts; they must not be renamed conceptually into publication receipts.

## Proposed vocabulary

```ts
type ReleaseManifestSnapshotId = string;
type ReleaseManifestContentHash = string;

type ReleaseCandidateDecisionId = string;
type ReleaseCandidateDecisionRevision = number;

type DestinationCapabilityId = string;
type DestinationCapabilityRevision = number;

type PublicationOperationId = string;
type PublicationReceiptId = string;
```

`QuenchOpenAuthority` should require agreement, not precedence:

```ts
type QuenchOpenAuthority = {
  workspaceId: string;
  workpieceId: string;
  manifestSnapshotId: ReleaseManifestSnapshotId;
  manifestContentHash: ReleaseManifestContentHash;
  source: "hammer_prepared_package" | "direct_manifest_review";
};
```

The publication operation should freeze existing reviewed authorities:

```ts
type PublicationOperationAuthority = {
  publicationOperationId: PublicationOperationId;
  workspaceId: string;
  workpieceId: string;

  manifestSnapshotId: ReleaseManifestSnapshotId;
  manifestContentHash: ReleaseManifestContentHash;

  releaseDecisionId: ReleaseCandidateDecisionId;
  releaseDecisionRevision: ReleaseCandidateDecisionRevision;

  destinationScopeId: string;
  destinationCapabilityId: DestinationCapabilityId;
  destinationCapabilityRevision: DestinationCapabilityRevision;
  destinationCapabilityContentHash: string;

  adapterId: string;
  executionConfigurationRevision: string;
};
```

The last field is intentionally unresolved in the current repository: the existing Tongs scopes are `intent_only` and the adapter contract has no durable account/channel/config revision. S5-3 must design this from actual connection authority rather than manufacture a string.

`PublicationReceiptAuthority` should prove both intended and observed execution:

```ts
type PublicationReceiptAuthority = {
  publicationReceiptId: PublicationReceiptId;
  publicationOperationId: PublicationOperationId;
  operationAuthorityHash: string;
  attemptId: string;
  retryOfAttemptId?: string;
  adapterId: string;
  externalObjectId?: string;
  externalUrl?: string;
  outcome: "queued" | "scheduled" | "published" | "failed";
  observedAt: string;
};
```

## Semantic locks

1. A release manifest is the existing immutable Tongs snapshot, not the prepared-package path, current workpiece-file pointer, route, or simplified `ReleasePacket`.
2. Navigation identifies what the user asked to open; it cannot override manifest workspace/workpiece identity.
3. “No release decision” remains no decision. Candidate ordering cannot create one.
4. A reviewed destination capability revision and an executable account/channel/configuration are separate until a verified relationship joins them.
5. A publication operation becomes immutable before adapter execution. Mutable UI state can draft it but cannot retarget it afterward.
6. Retry changes attempt/execution state only. Changed manifest, decision, destination, or capability requires a new operation or explicit rebase/review.
7. Canonical media identity from S4 remains embedded in the exact manifest and must survive all adapter projections. A path is access evidence only.
8. A rendered output is distinct from its canonical source media unless Tongs explicitly registers it as a new canonical authority.
9. Publication receipts and decision-mutation receipts are different contracts and histories.

## Explicit design answers

| Question | Evidence-backed answer |
| --- | --- |
| What persisted object should become immutable release-manifest authority? | Existing `tongs.quench_release_manifest_snapshots`; it stores exact bytes/hash and is immutable. |
| Does it exist or is a new snapshot required? | It exists. No duplicate snapshot registry is justified. Publication may need a relationship to it, not another manifest store. |
| What owns release-candidate selection? | Tongs immutable release-decision revisions and candidate assignments, current through a sequence pointer. |
| Is candidate choice revisioned and durable? | Yes for canonical thumbnail selection/experiment intent. Local platform/options state is not. |
| What identifies destination capability? | Tongs destination scope + immutable capability revision/hash for provider-neutral review intent. Executable account/channel/config identity is unresolved. |
| Can capability change between review and publish? | The current pointer can advance; applicability reports `capability_advanced`. Runtime adapter capabilities can also change independently and are not bound to the reviewed revision. |
| What defines a publication attempt? | No durable object currently does. The adapter effect invocation is the effective attempt; `request_id` is not unique. |
| Are retries idempotent replays? | Decision commits are. Adapter retries are not provably replay and currently re-resolve current context. |
| Can open Quench silently adopt a newer Hammer package? | Yes. Fingerprint mismatch warns, projection reads current manifest, and decision refresh rebuilds the case from current projection. |
| Can route/shell workspace disagree and proceed? | Prepared package/handoff disagreement can warn and proceed; direct Tongs projection validates shell workspace against route workpiece. |
| Does the receipt prove exact reviewed manifest and destination? | No. DB receipts prove decision mutation only; adapter receipts are ephemeral and omit manifest/decision/capability/operation authority. |
| Which changes require explicit rebase/review? | Manifest/hash, metadata revision/hash, candidate set, brand binding, release decision, destination capability/config/account, and canonical source-media evidence. Current applicability already recognizes several of these; publication execution does not yet enforce them. |

## Proposed S5-1 boundary

S5-1 should make the existing manifest snapshot the one immutable object Quench opens and reviews. It should define how a prepared Hammer package resolves once to that snapshot, how open authority records exact workspace/workpiece/hash agreement, and how a newer Hammer file becomes an explicit newer snapshot requiring review rather than silently replacing the open one.

S5-1 should not yet design publication-operation persistence, adapters, receipts, retries, or executable destination account authority. Those depend on the frozen manifest seam and belong to S5-3 onward.
