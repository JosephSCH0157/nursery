# Local Mirror SSOT Slice 5 Completion

Completion note only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Slice 5 rules were locked in `LOCAL_MIRROR_SSOT_SLICE_5_CROSS_TOOL_HANDOFF_LOCK.md`. Implementation scope was defined in `LOCAL_MIRROR_SSOT_SLICE_5_IMPLEMENTATION_PLAN.md`.

Slice 5 completed on 2026-03-11.

## Shipped Behavior

Slice 5 removed mirror authority from the active cross-tool handoff seam in the current product: Hearth -> Anvil route handoff.

What now holds:

- handoff payloads are treated as reference-and-hint only, not self-authorizing truth
- `/app/anvil` now revalidates canonical workspace, workpiece, and script-path context before opening the teleprompter target
- invalid, archived, mismatched, or missing targets are blocked explicitly instead of silently replaying local or sender-side residue
- late validation results can no longer repaint obsolete handoff intent after receiver context changed
- cross-tool open now converges on canonical receiver truth instead of trusting route residue alone

## Main Changes

### Nursery / Receiver Validation

Files:

- `apps/nursery/src/routes/Anvil.tsx`
- `apps/nursery/src/lib/tongs-api.ts`
- `apps/nursery/src/lib/forge-handoff-validation.ts`

Behavioral changes:

- Anvil now parses handoff route state into canonical references plus advisory context only
- receiver-side validation re-reads canonical workspace episodes before trusting the target workpiece
- receiver-side validation checks script presence via canonical Tongs read-file behavior before opening
- invalid workpiece ids, invalid script paths, archived workpieces, missing workpieces, and missing script files now produce an explicit blocked state
- late async validation completions are ignored if a newer receiver resolution attempt supersedes them

### Planner / Recording Surface Audit

Files audited:

- `apps/nursery/src/routes/TongsRecordingSessions.tsx`

Result:

- no additional self-authorizing planner-specific handoff blob required patching in this slice
- current planner/session candidate surfaces remain reference-oriented and continue to rely on canonical query state rather than a separate remembered launch payload

### Supporting Tongs Build Repair

File:

- `packages/tongs/src/workpiece-commit-api.ts`

Supporting changes:

- removed unused image-map status constants and corrected `globalThis.crypto` typing so the real Nursery build and smoke path could validate the shipped handoff slice instead of failing on unrelated package build issues

## Verification

Verified:

- `pnpm --filter nursery test:handoff`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`
- `pnpm --filter nursery build`
- `pnpm --filter @forge/tongs build`
- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @nursery/hearth build`

Targeted proof added:

- `apps/nursery/tests/forge-handoff-validation.test.mts`
  - accepts valid canonical Anvil handoff
  - rejects archived workpiece handoff
  - rejects missing workpiece handoff
  - rejects missing script handoff
  - rejects invalid script path handoff

## Result

Slice 5 is engineering-complete and verified on the intended seam.

Cross-tool handoff truth now obeys the same authority ladder as the earlier slices:

- senders hand off canonical references, not self-authorizing truth
- receivers revalidate against canonical state before trusting the target
- stale or mismatched residue is rejected instead of replayed
- the current Hearth -> Anvil boundary no longer depends on local launch residue to decide reality
