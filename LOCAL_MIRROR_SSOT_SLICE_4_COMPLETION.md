# Local Mirror SSOT Slice 4 Completion

Completion note only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Slice 4 rules were locked in `LOCAL_MIRROR_SSOT_SLICE_4_DERIVED_ARTIFACT_LOCK.md`. Implementation scope was defined in `LOCAL_MIRROR_SSOT_SLICE_4_IMPLEMENTATION_PLAN.md`. Mirror intake transition rules are defined in `LOCAL_MIRROR_INGEST_STATE_MACHINE.md`.

Slice 4 completed on 2026-03-11.

## Shipped Behavior

Slice 4 removed mirror authority from derived artifact truth on the current Hearth/Tongs seams.

What now holds:

- artifact presence no longer survives a workpiece switch just because a prior package or preview was still in memory
- late package and thumbnail preview responses no longer repaint obsolete workpiece artifact state after context change
- image-map payloads are rejected if their canonical attachment does not match the requested workpiece or workspace
- same-workpiece artifact refresh still works without clearing the panel unnecessarily
- mirror intake remains staged input until canonical confirmation; local presence alone does not become current artifact truth

## Main Changes

### Hearth

Files:

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/lib/hearth-image-map-repo.ts`

Behavioral changes:

- artifact state is cleared immediately when the active workpiece target changes
- `refreshEpisodePackage()` now ignores late async responses from older workpiece loads
- thumbnail preview loading now ignores late responses for stale workpiece/version combinations
- image-map repo normalization now rejects mismatched canonical attachment instead of trusting the payload

### Tongs / Verification Path

File:

- `packages/tongs/src/workpiece-commit-api.ts`

Supporting change:

- the Bar-Stock list query path now uses explicit untyped schema access for legacy tables missing from generated DB types, so the Tongs build and smoke path can validate the slice instead of failing in predev on unrelated type holes

## Verification

Verified:

- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`
- `pnpm --filter @forge/tongs build`
- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @nursery/hearth build`

Targeted proof added:

- `apps/hearth/tests/hearth-confidence.test.ts`
  - rejects mismatched canonical image-map attachment

## Result

Slice 4 is engineering-complete and verified on the intended seam.

Derived artifact presence, attachment, and freshness now obey the same authority ladder as the earlier slices:

- canonical state determines reality
- local previews remain transient
- stale residue is cleared or ignored on context change
- mirror-detected artifacts remain staged until canonical confirmation
