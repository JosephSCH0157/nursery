# S4-0 Canonical Asset and Visual Derivative Contract Lock

Status: proposed Slice 4 vocabulary and invariants for approval before S4-1 SQL design.

## Slice boundary

Slice 4 establishes what a production asset is. It does not implement visual effects, visual-quality decisions, automatic regeneration, render/export orchestration, or full Quench release authority.

## Architecture ratchet

> A production visual is always the exact canonical Tongs asset named by its authority chain, independent of paths, filenames, cached URLs, browser state, later assets, and timeline placement identity.

## Three separate axes

```ts
type CanonicalAssetId = string & { readonly __brand: "CanonicalAssetId" };
type HammerTimelineAssetId = string & { readonly __brand: "HammerTimelineAssetId" };
type ScriptDerivativeId = string & { readonly __brand: "ScriptDerivativeId" };
type LegacyDerivedAssetId = string & { readonly __brand: "LegacyDerivedAssetId" };
type StorageObjectKey = string & { readonly __brand: "StorageObjectKey" };
type MediaContentHash = string & { readonly __brand: "MediaContentHash" };
```

- Identity: `CanonicalAssetId` answers which media object this is.
- Purpose: `ScriptDerivativeBasis` plus derivative identity answers why it belongs in production.
- Placement: `HammerTimelineAssetId`/`placementId` answers where the editor put it.

These values must never be assignable to one another without an explicit compatibility classifier or server resolution result.

## Canonical asset contracts

```ts
type CanonicalAssetScope =
  | { kind: "workspace_global"; workspaceId: string }
  | { kind: "workpiece"; workspaceId: string; workpieceId: string };

type CanonicalAssetAuthority = {
  canonicalAssetId: CanonicalAssetId;
  scope: CanonicalAssetScope;
  assetKind: CanonicalAssetKind;
  contentHash: MediaContentHash;
  storageBucket: string;
  storageObjectKey: StorageObjectKey;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  durationMs?: number;
  provenance: CanonicalAssetProvenance;
  readiness: CanonicalAssetReadiness;
};
```

`workspace_global` is explicit. A nullable workpiece ID must not mean both global and unknown.

```ts
type CanonicalAssetReadiness =
  | { state: "ready" }
  | { state: "processing" }
  | { state: "unresolved"; reason: string }
  | { state: "invalid"; code: CanonicalAssetErrorCode }
  | { state: "relationship_mismatch"; code: CanonicalAssetErrorCode };
```

Readiness states are not fallbacks. A missing asset cannot become a different asset; a relationship mismatch cannot become unresolved; processing cannot be treated as ready.

## Script derivative contracts

```ts
type ScriptDerivativeBasis = {
  workspaceId: string;
  workpieceId: string;
  scriptApprovalId: string;
  scriptApprovalRevision: number;
  scriptContentHash: string;
};

type ScriptDerivativeAssetReference = {
  derivativeId: ScriptDerivativeId;
  derivativeBasis: ScriptDerivativeBasis;
  canonicalAssetId: CanonicalAssetId;
  expectedContentHash: MediaContentHash;
  validation: CanonicalAssetReadiness;
};
```

Derivative freshness and asset validity are independent:

- A canonical asset can remain valid while its derivative basis is stale relative to a newer approval.
- A current derivative can fail readiness because its asset is processing, invalid, missing, or relationship-mismatched.
- Approval change never mutates the old derivative or its canonical asset reference.

## Hammer placement contract

```ts
type HammerVisualPlacementAuthority = {
  placementId: HammerTimelineAssetId;
  canonicalAssetId: CanonicalAssetId | null;
  unresolvedLegacyAssetId?: LegacyDerivedAssetId;
  derivativeBasis?: ScriptDerivativeBasis;
  sourceDerivativeId?: ScriptDerivativeId;
  assetReadiness: CanonicalAssetReadiness;
  timelineStart: number;
  timelineEnd: number;
  laneId: string;
};
```

- Moving a placement changes placement state only.
- Duplicating a placement creates a new placement ID pointing to the same canonical asset.
- Deleting a placement does not delete or mutate canonical media.
- A legacy path-derived reference can be displayed or migrated, but cannot satisfy canonical readiness.

## Authoritative resolution operation

Conceptual operation: `resolveCanonicalAssetAuthority`.

Input:

- workspace ID;
- canonical asset ID;
- optional expected workpiece ID;
- required purpose/kind when the operation restricts it;
- optional expected path/storage key/hash as contradiction evidence only.

Output:

- canonical identity and explicit scope;
- canonical storage identity and content hash;
- intrinsic metadata, readiness and provenance;
- relationship validation result.

The server resolves from canonical asset ID. New production operations cannot supply a path, URL, filename, hash, local ID, or storage key instead of the ID.

## Error taxonomy

```ts
type CanonicalAssetErrorCode =
  | "canonical_asset_missing"
  | "canonical_asset_workspace_mismatch"
  | "canonical_asset_workpiece_mismatch"
  | "canonical_asset_kind_mismatch"
  | "canonical_asset_hash_mismatch"
  | "canonical_asset_not_ready"
  | "derivative_approval_mismatch"
  | "legacy_asset_unresolved"
  | "asset_relationship_unverified";
```

User-facing messages must explain the failed relationship or readiness state rather than surface only a database code.

## Non-substitution rules

The following are forbidden for new production writes and readiness decisions:

- match by path, filename, URL, storage key, or guessed hash;
- use the first candidate because no canonical selection exists;
- reuse a prior placement's media;
- choose the newest or only surviving asset;
- follow `supersedes_asset_id` to rewrite an existing reference;
- treat a cached browser object or local Hammer asset entry as canonical proof.

When identity cannot resolve, preserve the intended reference and return an unresolved or mismatch state.

## Historical classification contract

Every legacy reference is classified as exactly one of:

- `canonical_proven`;
- `legacy_resolved`;
- `legacy_unresolved`;
- `conflicting_evidence`.

Only exact evidence may produce `canonical_proven` or `legacy_resolved`: an existing canonical ID, exact workspace/workpiece relationship, unique storage object identity, exact content hash, exact historical asset record, and compatible intrinsic metadata as required. Filename, title, prompt similarity, latest asset, nearest timestamp, or ambiguous reused path are never sufficient.

## S4-1 gate

S4-1 may design SQL only after this contract and the S4-0 inventory are accepted. It must decide from observed relationships—not field names—whether migrations split into asset-authority schema and derivative-relationship enforcement. S4-0 deliberately makes no such decision.
