# Local Mirror SSOT Slice 2 Completion

Slice: 2 - Active hydration

Status: engineering-complete on 2026-03-11.

Lock source: `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`

Plan source: `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`

## Scope

This slice removed mirror authority from Hearth active hydration only:

- refresh and reopen behavior for active workpieces
- selected workpiece recovery from session state
- attached draft buffer recovery for an explicit workpiece
- planning-session cache influence over active identity

This slice does not cover Ready/session candidacy, derived asset freshness, or cross-tool handoff assumptions.

## Authority Leaks Removed

The following mirror-backed active-hydration leaks were removed:

- Hearth no longer requires a cached local workpiece mapping before it can hydrate an attached draft buffer for an explicit workpiece.
- Session recovery no longer depends only on `activeDraftId` and local draft residue to recover the current workpiece.
- Planning-session cache no longer nominates `workspaceId` or `workpieceId` as if cached local residue were authoritative identity.
- Active workpiece reopen flows no longer skip canonical draft snapshot reads when an explicit workpiece is known.

## Shipped Behavior

Active hydration now behaves as follows:

- Hearth persists `activeWorkpieceId` in local session state as an accelerative hint that points at the canonical workpiece identity.
- When an explicit workpiece opens, Hearth reads the canonical `hearth/drafts.v1.json` snapshot for that workpiece before regenerating a draft buffer from the primary script.
- Canonical workpiece draft hydration can succeed on a clean client without any pre-existing local workpiece mapping.
- Session restore prefers `activeWorkpieceId` over draft-only inference when recovering the current workpiece.
- Planning-session cache may restore planner content, but it no longer sets active workspace/workpiece identity by side effect.

## Verification

Passed:

- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`

Targeted proofs added in Hearth confidence:

- canonical workpiece draft hydration succeeds without cached workpiece mapping
- explicit canonical draft hydration seeds the workspace draft cache after canonical read
- session state round-trips `activeWorkpieceId` so workpiece recovery no longer relies solely on draft residue

## Caveats

The direct Hearth TypeScript/build wrappers did not complete cleanly in this environment:

- `pnpm --filter @nursery/hearth exec tsc -p tsconfig.json --noEmit` timed out
- `pnpm --filter @nursery/hearth build` timed out

This slice is therefore verified through Hearth confidence, nursery typecheck, and smoke core, not by claiming those two Hearth wrappers are green.

## Deferred To Later Slices

Still open after Slice 2:

- Ready/session candidate derivation
- derived asset presence and freshness
- cross-tool handoff assumptions
- local-only optimistic residue that survives canonical settle

## Compliance Statement

Slice 2 brings Hearth active hydration into compliance with the mirror SSOT lock:

- active workpiece hydration resolves from canonical Tongs truth first when a workpiece is known
- attached draft recovery can succeed without local mirror material or cached workpiece mapping
- local session state now accelerates canonical workpiece recovery instead of defining it through draft residue
- planning-session cache no longer acts as authority for active identity
