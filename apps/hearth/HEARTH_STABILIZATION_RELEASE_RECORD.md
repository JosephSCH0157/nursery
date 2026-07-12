# Hearth Stabilization Release Record

Date: 2026-07-12

Decision: **GO**

## Scope

This record closes the nine-step Hearth stabilization campaign on branch
`HearthHammerJuly`. The campaign covers the range beginning with
`efd89ba9` (`test(hearth): establish complete stabilization proof`) and ending
with the release-record commit that contains this document.

## Closed authority boundaries

1. The complete Hearth test surface is discovered, strictly typechecked, and
   protected by a frozen baseline.
2. Asynchronous results are bound to immutable workspace, workpiece, draft,
   revision, and operation authority.
3. Browser and development caches are recovery evidence only; a save is
   successful only after an exact Tongs acknowledgement.
4. Approval state is derived from canonical Tongs revision history and cannot
   be promoted by local approval evidence.
5. Source reads, caches, hydration, and mutations are scoped by workspace and
   workpiece identity.
6. Image-map and media-map artifacts have singular canonical writers;
   metadata copies cannot overwrite canonical artifacts.
7. Dependency failure and unavailability remain distinct from successful empty
   results at workpiece, Spark, Ready, presence, attachment, and visual
   boundaries.
8. All new authority regression suites are frozen into the stabilization
   baseline.
9. The deterministic and shuffled closure gates pass without order dependence.

## Verification evidence

- `pnpm --filter @nursery/hearth gate:stabilization`
  - baseline before closure: 55
  - discovered tests: 62
  - result: 62/62 passed
- `pnpm --filter @nursery/hearth typecheck`
  - result: passed
- `pnpm --filter @nursery/hearth exec node scripts/run-stabilization-tests.mjs --shuffle-seed=8`
  - frozen baseline: 62
  - additions: 0
  - strict TypeScript boundary: 61/61
  - result: 62/62 passed
- `git diff --check`
  - result: passed

## SSOT and lifecycle decision

The implementation conforms to `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`:
the workpiece remains the cross-tool identity, Tongs remains canonical for
persisted editorial state, and local storage remains recovery-only evidence.

No schema, migration, trigger, query-semantic, or RLS change is part of this
campaign. No database migration or RLS update is required for this release
record.

## Release condition

Hearth stabilization is ready to publish from this branch. Any subsequent
change to a protected authority boundary must add or update a regression test;
the frozen baseline must never be reduced without an explicit replacement and
reviewed release decision.
