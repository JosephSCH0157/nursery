# Local Mirror SSOT Slice 1 Completion

Slice: 1 - Entry surfaces

Status: engineering-complete on 2026-03-11.

Lock source: `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`

Plan source: `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`

## Scope

This slice removed mirror authority from Hearth entry surfaces only:

- direct Hearth open
- Sparks mode bootstrap
- initial spark discovery for Bar-Stock intake
- workspace-switch spark discovery reset

This slice does not cover active workpiece hydration, draft/session recovery, Ready/session candidacy, derived assets, or cross-tool handoff.

## Authority Leaks Removed

The following mirror-backed entry leaks were removed:

- Hearth no longer seeds the `sparks` surface from `localStorage` on first render.
- Hearth no longer merges local Bar-Stock residue into canonical spark discovery for entry surfaces.
- Hearth no longer falls back to local Bar-Stock spark state as discovery truth when canonical spark fetch fails.
- Spark deep-link intake no longer declares a spark missing before canonical discovery for the current workspace has completed.
- Workspace switches no longer keep the previous workspace's spark list in memory as if it were current truth.

## Shipped Behavior

Entry surfaces now behave as follows:

- Sparks mode boots from canonical `/tongs/workspaces/:id/sparks`.
- Empty `localStorage` no longer blocks spark discovery.
- Local Bar-Stock residue may still exist for staging or write-through flows, but it is not consulted as authority for entry discovery.
- A Bar-Stock spark deep-link waits for canonical discovery of the current workspace before surfacing a missing-spark error.
- Workspace changes clear in-memory spark rows and re-resolve discovery from SSOT.

## Verification

Passed:

- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`

Targeted proofs added in Hearth confidence:

- canonical spark discovery ignores local mirror residue across clients
- second client sees the same canonical spark discovery result without mirror state
- spark deep-link intake waits for canonical discovery before declaring a spark missing

## Caveats

The direct Hearth TypeScript/build wrappers did not complete cleanly in this environment:

- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit` timed out
- `pnpm --filter @nursery/hearth build` timed out

This slice is therefore verified through Hearth confidence, nursery typecheck, and smoke core, not by claiming those two Hearth wrappers are green.

## Deferred To Later Slices

Still open after Slice 1:

- local write-through and outbox residue for spark updates
- active workpiece hydration and attached draft recovery
- session/planner attachment recovery
- Ready/session candidate derivation
- derived asset presence and freshness
- cross-tool handoff assumptions

## Compliance Statement

Slice 1 brings Hearth entry surfaces into compliance with the mirror SSOT lock:

- Hearth can boot without mirror material present.
- Sparks discovery derives initial truth from Workspace/Tongs, not local residue.
- Spark deep-link entry resolves against canonical cloud state.
- A second client can observe the same initial spark truth without mirror artifacts.
- Remaining local spark state is staging residue only, not required discovery authority.
