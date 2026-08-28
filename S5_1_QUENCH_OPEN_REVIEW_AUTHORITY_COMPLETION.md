# S5-1 Quench Open & Review Authority Completion

Status: implemented. Destination execution and publication-operation authority remain explicitly deferred.

## Result

Quench review now opens through one idempotent Tongs authority bound to an existing immutable `tongs.quench_release_manifest_snapshots` row. Refresh replays the same open operation and reconstructs review state from that exact snapshot. A newer Hammer manifest is reported without replacing the open review.

The governing invariant is now represented in persistence, server projection, client hydration, decision mutation, and ratchet tests:

> An open Quench review remains bound to one exact immutable manifest snapshot until the creator explicitly chooses Review New Package.

## Persistence and RLS

Migration: `supabase/migrations/20260827210000_tongs_quench_open_authority_s5_1.sql`

The additive `tongs.quench_open_authority_receipts` table records:

- open operation ID and SHA-256 operation fingerprint;
- exact workspace and workpiece;
- optional explicitly requested snapshot;
- resolved manifest snapshot ID and content hash;
- state version, actor, and creation timestamp.

Rows are immutable. Composite foreign keys prove the snapshot belongs to the same workspace/workpiece. Authenticated viewers may read receipts through workspace RLS. Mutation is only through the security-definer `open_quench_authority` RPC.

The RPC checks an existing operation before resolving any current snapshot. Therefore the signature regression is preserved transactionally by design:

```text
open key K -> M1
Hammer creates M2
retry key K -> M1
```

The same key with different workspace, workpiece, or requested snapshot returns `quench_open_idempotency_conflict`.

## Server authority

`openQuenchAuthority` in Tongs:

- validates explicit workspace/workpiece membership and viewer access;
- opens or replays the immutable receipt;
- reads the exact snapshot named by that receipt;
- projects decisions only when their `manifest_snapshot_id` equals the review snapshot;
- reports `newer_manifest_available` by comparing current Hammer authority without substituting it;
- keeps the exact raw manifest, including S4 canonical package-media references.

Decision writes now carry the review manifest snapshot ID. If Hammer has advanced, the server returns `quench_review_manifest_advanced` instead of writing the decision against a newer manifest.

## Quench client behavior

- Explicit route workspace/workpiece are required.
- Shell workspace is no longer an episode-identity fallback.
- Route, Hammer handoff, and prepared package identities must agree.
- Package version/fingerprint disagreement blocks as Source Conflict rather than warning and continuing.
- Session storage retains only the open operation ID as a recovery hint.
- Refresh/reload replays that open operation.
- New Package Available leaves the current review unchanged.
- Review New Package explicitly creates a new open operation.
- Review projection retains S4 `media_reference` and `packaging_media_readiness`; paths remain access evidence.

## Public contracts

- `QuenchOpenAuthority`
- `OpenQuenchAuthorityRequest`
- `forge.quench-open-authority.v1`
- `isQuenchOpenAuthority`
- generated DB table/function typings for the new receipt and RPC

## Ratchets and tests

Added:

- `apps/quench/tests/quenchOpenAuthorityContract.test.ts`
- `apps/quench/scripts/check-open-authority-ratchet.mjs`
- `pnpm --filter @forge/quench check:open-authority`

The checks forbid the former package/handoff/shell workspace precedence, mutable latest-projection refresh, missing exact manifest binding on decision writes, and review-layer loss of S4 media evidence.

Verified:

- `pnpm --filter @forge/tongs typecheck`
- `pnpm --filter @forge/quench typecheck`
- `pnpm --filter nursery typecheck`
- `pnpm --filter @forge/quench test` — 11 tests passed plus the S5-1 ratchet
- `git diff --check` on the S5-1 change set

The migration was not applied to a live Supabase instance in this workspace, so transactional deployment proof remains a deployment-time check. The SQL contract and ordering are covered by repository tests.

## Explicit deferrals

S5-1 does not define or freeze:

- executable destination account or channel identity;
- adapter/configuration/credential authority;
- publication operation identity;
- external publication receipts;
- retry/resume publication semantics.

Those remain blocked on the focused destination-authority discovery/design unit requested after S5-1.
