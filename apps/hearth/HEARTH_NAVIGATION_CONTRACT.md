# Hearth Navigation Contract

Status date: 2026-03-10
Baseline release: Forge `v1.2.0` (`forge-v1.2.0`)

This document defines the canonical boundary between Hearth navigation and Hearth persistence.

## Primary Rule

The left rail shows only first-class containers:

- Sparks
- Episodes / Workpieces
- Ready
- Series

## Default Attachment Rule

Anything produced while shaping a script remains attached to the active workpiece shell unless the user explicitly promotes it.

## Attached-By-Default Artifacts

- approved sources
- source review outcomes
- draft fragments
- planning notes
- revision proposals
- AI ops
- chat turns

## Allowed Surfaces For Attached Artifacts

- tab state inside the active workpiece
- in-shell activity / timeline
- explicit promotion flows only

## Promotion Rule

Persistence is not navigation.

A stored artifact gets a left-rail slot only if the user intentionally promotes it to a durable standalone object.

## Implementation Rule

Fix this at the view-model boundary, not by hiding rows in the UI.

Intermediate editorial artifacts must never enter the collection that powers the left rail.

## Collection Rule

- left rail collection = true workpieces / episodes + top-level containers only
- intermediate artifacts = workpiece-scoped tab / activity data only

## Acceptance Criteria

- no source approval, proposal, fragment, review, or AI event creates a left-rail row
- those actions update only the current workpiece context
- the left rail remains stable while shaping a script
- standalone creation requires explicit user action such as Promote

## Likely Implementation Seam

- tighten the collection feeding the left rail in `apps/hearth/src/routes/HearthShell.tsx`
- keep intermediate persistence in workpiece-scoped repo / storage paths
- prevent `tongs-store.ts` or draft / event inputs from being treated as peer nav entities

## North Star

Stop modeling intermediate editorial artifacts as peer navigation entities.

That is the boundary.
