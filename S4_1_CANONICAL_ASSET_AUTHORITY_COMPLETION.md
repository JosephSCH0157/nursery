# S4-1 — Canonical Asset Persistence & Resolution Authority

Status: implemented; local transactional database execution remains pending because the local Supabase Docker engine is unavailable.

## Boundary delivered

- `tongs.assets` has an explicit `workpiece | workspace` scope discriminator. A workpiece asset requires an exact workpiece; a workspace asset requires a null workpiece plus an explicit reuse policy.
- Canonical identity is selected only by asset ID. Hash, storage identity, path, kind, and expected scope are validation assertions and never alternate selectors.
- Canonical evidence includes workspace/scope, kind, storage object identity, content hash, intrinsic metadata, readiness, and provenance.
- Provenance distinguishes `canonical_native`, `legacy_resolved`, `legacy_unresolved`, and `conflicting_evidence`.
- Unresolved legacy references live in a separate evidence table and are not promoted into fake canonical asset rows.
- Script-derived visual revision basis fields are immutable.
- Proven canonical derivative asset relationships receive additive composite foreign keys; timeline-local and ambiguous identities are unchanged.
- Authenticated clients may resolve authority but may not directly mutate canonical asset rows. Exact legacy resolution is service-authority only.

## Authority seam

`tongs.resolve_canonical_asset_authority` accepts:

- workspace ID;
- canonical asset ID;
- optional expected workpiece;
- optional kind, content-hash, storage-object, and path assertions.

It returns a canonical authority envelope with one of `ready`, `processing`, `unresolved`, `invalid`, or `relationship_mismatch`. It does not search by path, URL, filename, storage key, or positional candidate.

The Tongs HTTP seam is:

`POST /tongs/workspaces/:workspaceId/assets/:assetId/resolve-authority`

## Conservative migration support

`tongs.asset_legacy_reference_evidence` preserves historical claims and their classification. `tongs.resolve_legacy_asset_reference_exact` requires exact storage identity or exact content hash; path is corroborating evidence only. `tongs.canonical_asset_ambiguous_evidence_report` exposes unresolved staging records and same-path/different-content collisions.

## Verification

- `pnpm --filter @forge/tongs build` — pass.
- `pnpm --filter @forge/tongs test:asset-authority` — 4/4 pass.
- `node tests/asset-variant-resolver.test.mjs` — 6/6 pass.
- `git diff --check` — pass (line-ending warnings only).
- `canonical-asset-authority-db.sql` supplies transactional scope, RLS, exact-evidence, ambiguity, and immutability proofs. It was not executed locally because Docker Desktop's Supabase engine was unavailable.

The broad `workpiece-commit-api.test.mjs` run completed 157/161 tests. Its four failures are in pre-existing workspace/storage query test doubles that lack chained `.in()` or `.schema()` methods; they are outside S4-1 and were not changed here.

## Deferred by design

No Hearth or Hammer caller migration is included. Path-derived Hammer IDs, positional candidate fallback, intro/outro hydration, placement reducers, manual Hearth visual IDs, and Hammer-to-Quench packet identity remain S4-2 through S4-4 work.
