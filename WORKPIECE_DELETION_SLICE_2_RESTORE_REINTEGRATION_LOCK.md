# Workpiece Deletion Slice 2 Restore Reintegration Lock

Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Deletion policy intent is defined in `WORKPIECE_DELETION_POLICY_PLAN.md`. Slice 1 shipped behavior is recorded in `WORKPIECE_DELETION_SLICE_1_COMPLETION.md`.

Date locked: 2026-03-11

Execution plan:

- `WORKPIECE_DELETION_SLICE_2_IMPLEMENTATION_PLAN.md`

## Decision

Slice 2 restore reintegration is locked to the following policy:

- Archive preserves history and stored editorial state.
- Restore reverses visibility only.
- Restore does not silently reinstate Ready or session-candidate status.
- Any state that affects recording flow must be intentionally re-established after restore.

## Operational Rules

- A workpiece archived while in warming restores to warming.
- A workpiece archived while in ready restores to a visible but non-active state until it is revalidated or explicitly re-readied.
- Archived planner or session references are not silently revived on restore; they must surface as stale until intentionally re-established.
- Restore must not reopen Anvil eligibility, Ready candidacy, or planner/session participation by side effect alone.

## UX Rule

Restore is a visibility recovery action, not a workflow resurrection action.

Recommended immediate post-restore copy:

- `Restored. Review and re-ready before recording.`

## What State Is Preserved Through Archive

Archive preserves:

- stored editorial state
- workpiece provenance
- revision and event history
- prior lifecycle marker for audit/reference purposes
- linked metadata and derived asset lineage
- stale planner or session references as historical relationships

Archive does not destroy or rewrite lineage in Slice 2.

## What State Is Suppressed On Restore

Restore does not automatically reactivate:

- Ready candidacy
- session-candidate eligibility
- Anvil-openable recording intent
- active planner participation
- implicit live editing assumptions derived only from pre-archive status

## Does Restore Require Revalidation

Yes, for anything that affects recording flow.

Slice 2 rule:

- visibility returns immediately on restore
- recording-affecting eligibility must be revalidated or explicitly re-established

If a restored workpiece was previously ready, the system may preserve historical knowledge that it had once been ready, but it must not silently treat that as active present-tense candidacy.

## What Should The UI Say Immediately After Restore

The default restore posture should clearly communicate that the workpiece is visible again but not automatically back in the recording lane.

Recommended UI wording:

- `Restored. Review and re-ready before recording.`

Avoid wording that implies automatic workflow resurrection, such as:

- `Restored to Ready`
- `Recording-ready again`
- `Session restored`

## What Happens To Planner Or Session References Created Before Archive

Planner and session references created before archive remain as stale historical references unless and until they are intentionally re-established.

Slice 2 rule:

- no silent reattachment
- no automatic candidacy revival
- stale references must be surfaced as stale or non-active

## Implementation Intent

Any surface that depends on active recording candidacy must treat restored workpieces as inactive until explicit user action or canonical revalidation re-establishes that state.

## Non-Goals

Slice 2 does not implement:

- hard delete
- purge
- session detachment policy beyond stale-state treatment
- destructive cleanup of assets or receipts
- broader lifecycle redesign outside restore reintegration
