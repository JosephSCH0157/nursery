# Local Mirror SSOT Slice 3 Completion

Slice: 3 - Candidacy surfaces

Status: engineering-complete on 2026-03-11.

Lock source: `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`

Slice lock source: `LOCAL_MIRROR_SSOT_SLICE_3_CANDIDACY_LOCK.md`

Plan source: `LOCAL_MIRROR_SSOT_SLICE_3_IMPLEMENTATION_PLAN.md`

## Scope

This slice removed mirror authority from candidate truth only:

- Hearth Ready list membership and ordering display
- planner/session candidate membership display
- stale-vs-active determination after canonical refresh
- workspace-switch and late-response candidate residue

This slice does not cover derived asset freshness, cross-tool handoff assumptions, or broader offline behavior.

## Authority Leaks Removed

The following candidate-truth leaks were removed:

- Hearth no longer displays Ready candidates from a prior workspace while canonical candidate state for the current workspace is unresolved.
- Late Ready-query responses can no longer overwrite current candidate state after a workspace change.
- Planner/session candidate surfaces no longer display candidate rows from a prior workspace simply because the client still held them in memory.
- Hearth Ready restore/reorder actions no longer operate against stale non-current candidate arrays after a workspace change.

## Shipped Behavior

Candidate surfaces now behave as follows:

- canonical Ready query results are bound to the workspace that produced them
- Hearth shows Ready candidates only when the loaded candidate set belongs to the active workspace
- planner/session candidate views show candidates only when the loaded set belongs to the active workspace
- workspace changes clear candidate display state until canonical query results for the new workspace arrive
- out-of-order async responses are ignored if a newer candidate request has superseded them
- optimistic candidate display remains transient and is overwritten by canonical refresh

No new DB seam or server-side persistence change was required for this slice; the existing canonical query routes were sufficient.

## Verification

Passed:

- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`

Targeted proofs added in Hearth confidence:

- canonical Ready query results override prior client residue across refresh
- second client sees the same canonical Ready candidate set and order without inherited local readiness state
- canonical refresh removes candidates cleanly when the canonical payload changes

## Caveats

The direct Hearth TypeScript/build wrappers did not complete cleanly in this environment:

- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit` timed out
- `pnpm --filter @nursery/hearth build` timed out

This slice is therefore verified through Hearth confidence, nursery typecheck, and smoke core, not by claiming those two Hearth wrappers are green.

No Tongs package code changed in this slice, so no new Tongs-specific regression suite was required beyond the existing canonical-query behavior already relied on by these surfaces.

## Deferred To Later Slices

Still open after Slice 3:

- derived asset presence and freshness
- cross-tool handoff assumptions
- local-only optimistic residue that survives canonical settle outside candidate surfaces

## Compliance Statement

Slice 3 brings candidate surfaces into compliance with the mirror SSOT lock:

- candidate existence is determined by canonical query results
- candidate eligibility is determined by canonical query results
- candidate ordering is determined by canonical query results
- local/session residue may accelerate display briefly, but it no longer determines candidate truth once canonical query state resolves
