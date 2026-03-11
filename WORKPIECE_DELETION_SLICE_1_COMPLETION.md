# Workpiece Deletion Slice 1 Completion

Informational completion note only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Planning intent is defined in `WORKPIECE_DELETION_POLICY_PLAN.md`. Execution scope is defined in `WORKPIECE_DELETION_IMPLEMENTATION_PLAN.md`.

Date closed: 2026-03-11

## Slice Name

Slice 1 - Canonical archive / restore foundation

## Outcome

Slice 1 is complete.

Archive changes visibility, not lineage. Archived workpieces are non-destructive hidden records; restoring reverses visibility state without reconstructing lineage.

## What Shipped

- Canonical archive state on `tongs.episodes` via:
  - `supabase/migrations/20260311153000_tongs_episodes_archive_state.sql`
- Canonical Tongs archive/read behavior in:
  - `packages/tongs/src/workpiece-commit-api.ts`
- Canonical archive / restore client wiring in:
  - `apps/hearth/src/lib/hearth-workpieces.ts`
- Hearth workpiece archive / restore UI and draft-buffer relabeling in:
  - `apps/hearth/src/routes/HearthShell.tsx`
- Archived workpieces excluded from default Ready and recording-candidate flows unless restored first:
  - `packages/tongs/src/workpiece-commit-api.ts`
  - `apps/nursery/src/routes/TongsRecordingSessions.tsx`

## Behavioral Truth After Slice 1

- workpiece archive is canonical Tongs state
- default episode lists exclude archived workpieces
- archived workpieces appear only when explicitly requested
- archived workpieces are restore-first in Hearth
- archived workpieces are not silently treated as active recording candidates
- draft-buffer cleanup is no longer mislabeled as workpiece deletion

## Verification

Verified at package and wrapper level with:

- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter @nursery/hearth build`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`
- `pnpm --filter @forge/tongs build`
- targeted regression:
  - `node --test --test-name-pattern "listWorkspaceReadyScripts hides hidden and archived" tests/workpiece-commit-api.test.mjs`

## Verification Note

The full `pnpm --filter @forge/tongs test:commit-api` wrapper still times out in this environment. Slice 1 correctness was verified through the targeted regression plus package build instead of claiming the whole wrapper is healthy.

## Recommended Next Slice

Restore reintegration policy.

That slice should lock the post-restore rules:

- when restored workpieces re-enter Ready surfaces
- when restored workpieces re-enter session-candidate surfaces
- how stale archived session-plan references recover after restore
- whether restore should preserve prior ready-state visibility immediately or require explicit editorial re-ready

Locked in:

- `WORKPIECE_DELETION_SLICE_2_RESTORE_REINTEGRATION_LOCK.md`
