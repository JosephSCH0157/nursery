# Workpiece Deletion Slice 2 Completion

Informational completion note only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Planning intent is defined in `WORKPIECE_DELETION_POLICY_PLAN.md`. Execution scope is defined in `WORKPIECE_DELETION_SLICE_2_IMPLEMENTATION_PLAN.md`.

Date closed: 2026-03-11

## Slice Name

Slice 2 - Restore reintegration without silent candidacy reinstatement

## Outcome

Slice 2 is complete.

Restore now returns visibility while canonically clearing active Ready eligibility. History remains preserved in events, and recording candidacy must be intentionally re-established.

## What Shipped

- Canonical restore demotion of active Ready eligibility in:
  - `packages/tongs/src/workpiece-commit-api.ts`
- Restore event payload now records that revalidation is required and captures cleared ready paths in:
  - `packages/tongs/src/workpiece-commit-api.ts`
- Hearth restore messaging now states the real post-restore posture in:
  - `apps/hearth/src/routes/HearthShell.tsx`
- Planner/session references remain preserved and surface as stale because restored workpieces no longer re-enter active Ready candidates by side effect

## Behavioral Truth After Slice 2

- archive preserves history and stored editorial state
- restore reverses visibility only
- restore does not silently reinstate Ready or session-candidate status
- restored workpieces must be explicitly re-readied before recording candidacy resumes
- planner/session references remain intact and appear stale rather than silently reviving
- restore UI now says review and re-ready before recording instead of implying workflow resurrection

## Verification

Verified with:

- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter @nursery/hearth build`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`
- targeted Tongs regression:
  - `node --test --test-name-pattern "restoreWorkpiece clears active ready eligibility" packages/tongs/tests/workpiece-commit-api.test.mjs`

## Verification Note

The full `pnpm --filter @forge/tongs build` wrapper still times out in this environment. Slice 2 correctness was verified through the exact changed regression plus downstream typecheck and smoke coverage instead of claiming that wrapper is healthy.

## Resulting Rule

Restore reopens access by removing archive visibility, but it also clears active Ready eligibility.

## Recommended Next Slice

The next deletion/archive slice should answer broader post-restore product policy outside this shipped seam, such as:

- whether restored workpieces should receive additional UI guidance in planner/session surfaces
- whether archive/restore needs stronger cross-tool messaging in Anvil-facing handoff paths
- whether later hard-delete/purge groundwork should begin now that archive and restore semantics are stable
