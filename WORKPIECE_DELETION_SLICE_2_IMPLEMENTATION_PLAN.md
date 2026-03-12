# Workpiece Deletion Slice 2 Implementation Plan

Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Policy intent is defined in `WORKPIECE_DELETION_POLICY_PLAN.md`. Slice 2 restore semantics are locked in `WORKPIECE_DELETION_SLICE_2_RESTORE_REINTEGRATION_LOCK.md`.

Slice 2 status: completed on 2026-03-11.

Completion note:

- `WORKPIECE_DELETION_SLICE_2_COMPLETION.md`

**Restore returns access, not active recording eligibility.**

## Purpose

Implement restore reintegration according to the locked Slice 2 policy:

- archive preserves history and stored editorial state
- restore reverses visibility only
- restore does not silently reinstate Ready or session-candidate status
- anything affecting recording flow must be intentionally re-established

## Scope

In scope:

- Tongs restore-state semantics
- Hearth restore messaging and post-restore affordances
- stale planner/session reference treatment after restore
- verification of candidate filtering and restore-first UX

Out of scope:

- hard delete
- purge
- automatic re-ready
- automatic session reattachment
- automatic Anvil re-enable on restore
- broader lifecycle redesign outside restore reintegration

## Backend Decisions

### Canonical Restore Semantics

Restore must:

- clear archive visibility state on the workpiece row
- return the workpiece to visible/default listings
- preserve stored editorial state, provenance, revisions, and asset lineage
- preserve stale planner/session references as historical relationships

Restore must not:

- recreate active Ready candidacy
- recreate active session-candidate eligibility
- reopen recording flow participation by side effect

### Candidate Filtering Semantics

The canonical query posture after restore should remain conservative:

- default episode listings may show the restored workpiece because visibility has returned
- Ready/session candidate queries must continue to exclude restored workpieces until candidacy is intentionally re-established
- any query that powers recording flow should distinguish:
  - visible
  - archived
  - active candidate
  - restored-but-not-reinstated

Preferred implementation direction:

- do not add a speculative lifecycle field if current state plus restore semantics can express this cleanly
- if existing Ready metadata is insufficient to distinguish restored-but-not-reinstated from active Ready candidacy, stop and call out the DB change explicitly before coding

### Stale Reference Treatment

Pre-archive planner/session references should remain preserved but stale.

Canonical rule:

- restore does not silently reactivate those references
- planner/session surfaces must treat them as historical or stale until explicit user action re-establishes them

Preferred first implementation:

- preserve the reference
- surface it as stale
- require explicit requalification or reattachment

## Tongs API Changes

Primary file:

- `packages/tongs/src/workpiece-commit-api.ts`

Slice 2 planning questions to answer before coding:

1. Does restore response payload need an explicit `candidate_state` or equivalent field for consumer clarity?
2. Can current Ready/session candidate queries enforce the locked semantics without schema change?
3. Where should stale planner/session references be derived and surfaced: query layer, DTO layer, or consumer-side projection?

Likely route/query touchpoints:

- `POST /tongs/workpieces/:id/restore`
- `GET /tongs/workspaces/:id/ready-scripts`
- recording planner/session list/read seams

Preferred Slice 2 bias:

- keep restore route minimal
- enforce non-reinstatement primarily through candidate queries and planner/session DTO semantics

## Hearth UI Decisions

### Restore Messaging

Restore must present as visibility recovery, not workflow resurrection.

Recommended copy:

- toast/banner: `Restored. Review and re-ready before recording.`

Avoid:

- `Restored to Ready`
- `Recording-ready again`
- `Session restored`

### Post-Restore Action Set

Immediately after restore, Hearth should:

- allow opening and editorial review
- show non-recording-first messaging
- require explicit re-ready or equivalent action before recording candidacy returns

Immediately after restore, Hearth should not:

- show the workpiece as an active Ready candidate by default
- expose Anvil handoff as if recording candidacy were already restored
- silently clear stale planner/session warnings

### Affordance Rules

Recommended Hearth behavior:

- restored workpiece opens in review/edit posture
- Ready affordance is available as an explicit action
- session-related surfaces display stale/reference warnings until re-established

## Planner And Session Decisions

Primary surface:

- planner/session views that currently consume Ready candidates or preserved workpiece references

Slice 2 rule:

- stale references remain visible historically
- stale references are non-authoritative for active recording flow
- user must explicitly re-establish active participation

Preferred UX posture:

- badge or warning text indicating stale state
- block or warn on actions that assume active recording candidacy

## Verification Plan

### Tongs

- restore route tests prove restore clears archive visibility only
- Ready/session candidate tests prove restored workpieces do not silently re-enter active candidacy
- stale planner/session regression tests prove preserved references remain stale

### Hearth

- confidence/UI tests prove restore messaging is restore-first, not recording-first
- restored workpieces remain visible/editable
- restored workpieces do not appear in active recording-candidate surfaces until explicitly re-established
- Anvil/recording affordances remain suppressed until candidacy is re-established

### Wrapper / Smoke

- run `pnpm --filter nursery typecheck`
- run `pnpm --filter @nursery/hearth test:confidence`
- run targeted Tongs regression tests for restored-candidate filtering
- run `pnpm smoke:core`

## Implementation Order

1. lock backend candidate semantics and determine whether schema change is required
2. patch Tongs restore/candidate/planner DTO behavior
3. patch Hearth restore messaging and post-restore affordances
4. add stale planner/session warnings
5. add targeted tests
6. verify package and smoke paths

## Exit Criteria

Slice 2 is complete when all of the following are true:

- restored workpieces are visible again
- restored workpieces are not silently active recording candidates
- Ready/session candidate surfaces require explicit re-establishment
- stale planner/session references are surfaced as stale rather than revived
- restore UI copy consistently tells the truth
- verification proves the non-reinstatement rule end to end

Slice 2 meets these criteria. The remaining work belongs to later deletion/archive slices, not to restore reintegration.
