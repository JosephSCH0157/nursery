# Hearth + Tongs Phase 5 Slice 1 Fixture Note

Status: required for formal Slice 1 browser-proof closeout.

## Workspace

- Canonical fixture workspace: `2980fc39-8c8b-489a-a900-8d3bd3248432`

This is the currently reachable member-owned workspace already used by the dedicated Hearth Phase 4 browser suite.

## Current Blocker

Slice 1 browser proof in [hearth.phase5.image-map.spec.ts](/d:/nursery/nursery/apps/nursery/playwright/hearth.phase5.image-map.spec.ts) is failing because the current seeded workspace does not contain a workpiece that reliably mounts the Image Map surface in Hearth.

The current Phase 4 handoff workpiece:

- `cf464ad0-8745-43df-99ee-7bfca5dddcd8`

is a valid Phase 4 fixture, but it is not a qualified Slice 1 image-map fixture.

## Qualification Rule

A Slice 1 browser fixture workpiece is valid only if all of the following are true:

1. The workpiece belongs to workspace `2980fc39-8c8b-489a-a900-8d3bd3248432`.
2. The workpiece opens in Hearth focus mode through the normal workpiece-first path.
3. The active draft is in a production-ready state for Hearth visuals:
   - approved script surface is available, or can be reached deterministically without AI
   - the workpiece is not stuck behind unresolved script-tag validation in normal browser flow
4. The Image Map surface mounts visibly in browser:
   - `Image map panel` is present
   - entry create/edit controls are usable
5. Save -> reload -> canonical readback is possible against that same workpiece.

## Fixture Policy

Slice 1 should use a permanent dedicated Phase 5 fixture workpiece, not a borrowed generic Ready item.

Reason:

- Phase 4 fixtures prove cross-tool flow correctness.
- Slice 1 needs a richer production-prep workpiece shape.
- Reusing arbitrary Ready rows makes the browser proof exploratory and brittle.

## Required Fixture Values

Before formal Slice 1 closeout, lock and record:

- `FORGE_TEST_WORKSPACE_ID=2980fc39-8c8b-489a-a900-8d3bd3248432`
- `FORGE_TEST_WORKPIECE_ID=<qualified slice-1 image-map workpiece>`

The second value is still pending nomination or reseeding.

## Rerun Condition

Once a qualified workpiece exists, rerun:

```powershell
$env:FORGE_TEST_WORKSPACE_ID="2980fc39-8c8b-489a-a900-8d3bd3248432"
$env:FORGE_TEST_WORKPIECE_ID="<qualified slice-1 image-map workpiece>"

pnpm --filter nursery preflight:hearth-phase4
pnpm --filter nursery test:playwright:hearth-phase5-slice1
```

## Closeout Meaning

Slice 1 moves from:

- code-complete, migration-complete, proof-harness-complete

to:

- formally closed

only after a qualified fixture workpiece is locked and the dedicated browser proof passes against it.
