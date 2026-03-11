# Workpiece Deletion Policy Plan

Implementation planning reference only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`.

Concrete execution plan:

- `WORKPIECE_DELETION_IMPLEMENTATION_PLAN.md`

Slice 1 completion note:

- `WORKPIECE_DELETION_SLICE_1_COMPLETION.md`

Slice 2 restore reintegration lock:

- `WORKPIECE_DELETION_SLICE_2_RESTORE_REINTEGRATION_LOCK.md`

Slice 2 execution plan:

- `WORKPIECE_DELETION_SLICE_2_IMPLEMENTATION_PLAN.md`

This document does not claim that full workpiece archive or hard-delete semantics are already implemented in product code.

## Purpose

Define the implementation plan for workpiece archive, hard delete, and purge behavior so the product can remove clutter without destroying lineage, recording truth, scheduling references, or downstream asset integrity.

## Scope

In scope:

- user-facing archive behavior for workpieces
- restore behavior for archived workpieces
- eligibility rules for hard delete and purge
- dependency cleanup requirements across Hearth, Tongs, Anvil, Calendar, and derived assets
- audit and logging expectations
- migration and rollout sequencing

Out of scope:

- Spark deletion rules, except where Spark cleanup depends on workpiece completion
- day-to-day ready-queue hiding behavior
- low-level asset supersession policies that do not affect deletion eligibility
- downstream Quench or Ledger product semantics beyond reference blocking rules

## Terminology

### Archive

The default user-facing "delete" posture for workpieces.

- Removes the workpiece from default views.
- Preserves metadata, script history, derived assets, scheduling references, and take receipts.
- Allows restore.

### Hard Delete

Destructive removal of a workpiece when the workpiece is eligible and the system can cleanly remove dependencies without violating lineage or audit requirements.

### Purge

The most destructive administrative path. Purge is reserved for exceptional cases where a hard delete must also remove or sever retained dependencies under explicit authority.

## Current Product Gap

Today the system has lifecycle cleanup for Sparks and editorial send-back flows from Ready, but it does not yet expose a fully canonical workpiece archive or hard-delete implementation. This requires canonical Tongs-backed lifecycle handling rather than draft-local or UI-only hiding.

This requires a DB migration / RLS update.

## Recommended Policy

1. Archive should be the default user-facing delete action.
2. Hard delete should be exceptional and availability-gated.
3. Purge should be admin-only.
4. Recorded lineage should be preserved by default.
5. Active scheduling references should block destructive deletion.

## Eligibility Rules

### Archive Eligibility

Archive should be allowed when:

- the user has sufficient workspace authority
- the workpiece exists in the active workspace
- the workpiece is not already archived

Archive should remain allowed even when the workpiece has:

- ready-state history
- scheduling history
- kept takes
- derived assets

### Hard Delete Eligibility

Hard delete should be allowed only when all of the following are true:

- the user has elevated workspace authority
- the workpiece is not referenced by an active recording session
- the user confirms destructive deletion
- dependency cleanup can complete atomically or fail safely
- the workpiece has no kept takes, or policy explicitly allows destructive removal of kept-take lineage

### Purge Eligibility

Purge should require:

- admin-only authority
- an explicit reason
- confirmation that destructive removal of historical lineage is intended
- dependency cleanup and audit capture rules that are stricter than hard delete

## Blocked Conditions

Hard delete or purge should be blocked when any of the following remain unresolved:

- active recording session references
- retained kept-take receipts that policy requires to survive
- published downstream artifacts that still depend on the workpiece
- unresolved dependency cleanup failures
- workspace mismatch or insufficient authority

Archive should not be blocked by those conditions unless product policy later introduces specific legal or compliance exceptions.

## Dependency Cleanup Rules

### For Archive

Archive should:

- hide the workpiece from default workpiece listings
- preserve workpiece metadata and primary script state
- preserve revision history
- preserve ready-queue lineage while removing the archived workpiece from normal ready surfaces
- preserve scheduling history and take receipts
- preserve derived asset rows and supersession lineage

### For Hard Delete

Hard delete should:

- remove the canonical workpiece row only after dependency checks pass
- remove or tombstone canonical package files owned exclusively by the workpiece
- remove ready-queue state owned by the workpiece
- remove or sever session references only when policy explicitly allows it
- remove or tombstone derived asset rows owned exclusively by the workpiece
- preserve audit events describing the deletion action

### For Purge

Purge may additionally:

- remove retained lineage that hard delete would preserve
- sever or delete kept-take references if explicitly allowed by policy
- perform deeper cleanup across dependent tables and files

## Audit And Logging Requirements

Every archive, restore, hard delete, and purge action should append a canonical event with:

- actor identity
- workspace id
- workpiece id
- action type
- timestamp
- reason, if provided
- deletion mode (`archive`, `restore`, `hard_delete`, `purge`)

User-visible destructive flows should also capture confirmation intent in the UI before the canonical write is attempted.

## UI Wording Recommendations

Use explicit labels:

- `Archive Workpiece`
- `Restore Workpiece`
- `Delete Permanently`
- `Admin Purge`

Avoid ambiguous UI labels such as:

- `Delete` for archive
- `Remove` when the action is actually hide-only

Recommended helper copy:

- Archive: "Hide this workpiece from normal views while preserving its history."
- Hard delete: "Permanently delete this workpiece if no protected recording or scheduling references remain."
- Purge: "Administrative destructive cleanup that may remove retained lineage."

## Migration And Rollout Notes

This requires a DB migration / RLS update.

Recommended rollout order:

1. Add canonical archive fields or lifecycle representation for workpieces in Tongs-backed persistence.
2. Update default workpiece queries so archived workpieces are excluded unless explicitly requested.
3. Add canonical archive and restore API routes.
4. Add Hearth UI for archive/restore before any hard-delete UI.
5. Add hard-delete eligibility checks and server-side enforcement.
6. Keep purge out of normal UI until the policy is proven and audited.

Recommended database direction:

- add canonical archive metadata to the workpiece model
- enforce workspace-scoped access through existing RLS posture
- ensure listing APIs default to non-archived workpieces
- preserve event logging for destructive lifecycle actions

## Recommended First Implementation Slice

The safest first slice is:

- canonical archive fields and API
- archive/restore in Hearth
- archived workpieces hidden from default episode lists
- no hard delete UI yet

That gives the product a safe everyday cleanup posture before introducing irreversible deletion behavior.
