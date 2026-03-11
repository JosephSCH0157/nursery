# Forge Spark To Anvil Lifecycle Canon

This document supersedes all prior lifecycle descriptions of Sparks, Episodes, Workpieces, Script States, and Bar Stock cleanup behavior.

Companion operational reference: `STATE_MACHINE_DIAGRAM.md`.

Related implementation planning:

- `WORKPIECE_DELETION_POLICY_PLAN.md` for archive, hard-delete, and purge rollout planning.

## Purpose

This is the canonical lifecycle constitution for idea capture, editorial shaping, persistence ownership, recording handoff, and cleanup across:

- Bar-Stock
- Hearth
- Tongs
- Anvil

If any plan, lock, README, or agent note conflicts with this document, this document wins.

## Canonical Lifecycle

The real Forge lifecycle is:

`Bar-Stock Spark -> Workpiece -> Hearth editing -> Ready/Editorial states -> Anvil recording -> Recorded -> cleanup`

The durable production unit is the workpiece. Sparks are intake state, not the forever container.

## Canonical Entities

### Spark

- A Spark is an idea-capture object owned by Bar-Stock.
- A Spark persists while it is still useful as unfinished intake.
- A Spark is user-deletable.
- A Spark is not a permanent historical artifact.
- After successful lifecycle completion, the original Spark may be removed by the system as cleanup.

### Workpiece

- A workpiece is the canonical editorial and production container.
- A workpiece is the cross-tool identity used by Hearth, Tongs, and Anvil.
- A workpiece survives independently of the originating Spark.
- A workpiece is the durable unit that remains unless an explicit workpiece-deletion feature is added later.

### Ready

- Ready is a reversible editorial state.
- Ready is not approval.
- Ready is not a lock.
- Ready is not terminal.
- A workpiece marked ready must be able to return to editing.

### Recorded

- Recorded is the point where recording truth exists in the system.
- Recording state is downstream of editorial readiness.
- Cleanup behavior may occur after recording truth exists.

## Script State Semantics

Canonical editorial script states are:

- `warming`
- `ready`
- `scheduled`

These states are reversible before recording. A workpiece may move from ready back into edit without losing its identity.

## Ownership And Persistence

- Tongs is the canonical persisted source of truth for workspaces, sparks, workpieces, scripts, approvals, links, and recordings.
- Local storage and in-memory state are cache only.
- Mirror files are not competing truth. They are ingestion events.
- Once a local mirror is detected and uploaded into Tongs, Tongs owns the canonical persisted artifact.

## Handoff Rules

### Bar-Stock To Hearth

- Forging a Spark creates or resolves a workpiece.
- Hearth opens the workpiece, not a separate draft-first identity.

### Hearth To Tongs

- Hearth edits and commits canonical workpiece state through Tongs-backed paths.
- Revisions, ready-state behavior, metadata, and derived assets must resolve through canonical Tongs persistence.

### Hearth To Anvil

- Anvil opens a workpiece context.
- Script handoff is workpiece-scoped, not Spark-scoped and not draft-row-scoped.

## Cleanup Rules

- Hiding a Ready item is queue presentation only.
- Removing a workpiece from Ready is editorial lifecycle state, not mere UI hiding.
- Returning a workpiece to edit must preserve workpiece identity.
- Spark cleanup must not destroy the workpiece that superseded it.

## Local Mirror Rule

- Local mirror files never outrank cloud truth.
- Local mirrors exist to support ingestion, recovery, and convenience.
- They do not define lifecycle state and must not compete with Tongs authority.

## Constitution Rule

All lifecycle-sensitive plans, locks, tests, and agent instructions must defer to this document.
