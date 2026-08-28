# S5-0 Quench Release Authority Completion Record

Status: complete for repository discovery and contract lock. Findings must be reviewed before S5-1 begins.

## Scope completed

Inspected:

- Hammer prepared-release navigation and handoff query construction.
- Nursery route parsing, AppShell workspace cache/selection, workspace bootstrap, and Quench route hydration.
- Prepared package, Hammer release manifest, canonical Quench projection, and legacy packet ingest contracts.
- Tongs immutable manifest snapshots, destination scopes/capability revisions, release-decision revisions/assignments/sequences, applicability, idempotent decision commits, RLS, grants, and immutable triggers.
- Quench case selection, candidate/experiment decisions, destination selection, runtime capability loading, publish-board orchestration, readiness guard, YouTube/RSS adapter calls, retries, and receipts.
- Hammer-to-Quench canonical visual references and primary audio/video identity transformations.
- Contract and architecture tests covering projection shape, decision persistence, ingest, and publish-readiness denial.

## Principal findings

1. The immutable release manifest authority already exists: `tongs.quench_release_manifest_snapshots`.
2. Candidate decisions are already durable, revisioned, immutable, and bound to exact manifest/candidate/capability evidence.
3. Those authorities stop before publication execution. The live publish board builds a weaker `ReleasePacket` and invokes adapters from mutable React state.
4. There is no durable publication-operation authority, unique publication idempotency key, or publication receipt with full lineage.
5. Reviewed Tongs destination capabilities are provider-neutral `intent_only` records and are not linked to runtime adapter account/channel/configuration authority.
6. Prepared handoff identity uses package/handoff/shell precedence and permits some disagreement with warnings.
7. An open Quench session can adopt a current/newer Hammer manifest through projection refresh rather than retaining one reviewed open snapshot.
8. S4 canonical visual identity survives in the exact raw manifest snapshot but is dropped by Quench's stale typed ingest and simplified adapter packet.
9. Adapter retry is not provably replay; it accepts a prior receipt plus current context without the original immutable publication authority.
10. “Receipt” currently names two unrelated artifacts: durable decision-mutation evidence and ephemeral adapter output.

## Unresolved questions preserved

- What durable authority owns the executable destination account/channel and configuration revision?
- Whether a future publication operation should reference a separately registered rendered artifact in addition to canonical source assets.
- Whether release metadata should be frozen inside the existing manifest snapshot or remain a separately hashed revision joined by operation authority; current decisions bind it separately.
- What provider request/idempotency evidence each live adapter can return and persist.
- How historical adapter results, if any exist outside the inspected repository paths, can be correlated to exact manifests. No such durable store was found.
- The canonical master-video identity for the current Quench adapter packet; canonical cases set `video_export_id` to null.

These are intentionally `unresolved`; S5-0 did not invent identities or backfill evidence.

## Design result

The target chain is supported by existing upstream pieces but is not connected end to end:

```text
Hammer prepared package
  -> existing immutable Tongs manifest snapshot
  -> existing immutable release decision
  -> existing reviewed capability revision
  -> MISSING immutable publication operation
  -> MISSING authoritative publication receipt
```

The Slice 5 ratchet emerging from the evidence is:

> A publication operation releases one exact reviewed manifest through one exact reviewed destination capability under one immutable operation authority. Navigation, current pointers, caches, and later revisions cannot silently retarget it.

## Proposed next boundary

S5-1 should be Release Manifest Authority only:

- reuse `quench_release_manifest_snapshots` as the canonical immutable manifest;
- bind Quench open authority to exact snapshot ID/hash and require workspace/workpiece agreement;
- distinguish the reviewed snapshot from the mutable current Hammer file;
- require explicit review/rebase to adopt a newer manifest;
- preserve S4 canonical media references in the manifest projection.

It should not implement adapters, publication operations, receipts, destination connection authority, or retry changes.

## Verification

- Repository-wide targeted searches covered route/handoff/package/manifest/candidate/decision/destination/capability/adapter/operation/retry/receipt/media identifiers and fallbacks.
- Every cited primary symbol/file was confirmed present.
- Existing contract tests were inspected for their actual guarantees; no test was treated as proof beyond its assertions.
- Working-tree state was inspected before documentation changes to avoid overwriting unrelated S4 and user changes.
- Only these five S5-0 Markdown artifacts were added.
- No production source, test, generated type, migration, RLS policy, RPC, schema, field name, or runtime behavior was changed.

## Artifact index

1. `S5_0_QUENCH_AUTHORITY_FIELD_INVENTORY.md`
2. `S5_0_QUENCH_AUTHORITY_FLOW_MAP.md`
3. `S5_0_QUENCH_PRECEDENCE_CONFLICT_REGISTER.md`
4. `S5_0_QUENCH_CONTRACT_LOCK_PROPOSAL.md`
5. `S5_0_QUENCH_COMPLETION_RECORD.md`
