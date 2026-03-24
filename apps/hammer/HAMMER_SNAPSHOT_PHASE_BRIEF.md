# Hammer Snapshot Phase Brief

## Purpose

Define the next Hammer resilience layer after transcript-boundary and preview-churn hardening:

1. periodic snapshots
2. faster recovery
3. longer-ledger resilience

This phase keeps the current SSOT contract intact: Tongs remains canonical persistence authority.

## Problem

Hammer currently persists a single history ledger (`hammer/history.v1.json`) and reconstructs state by replaying from the baseline on open.

As edit sessions become longer:

1. replay cost grows with ledger length
2. cold-open recovery gets slower and more fragile
3. single-artifact recovery has less fault tolerance

## Phase Goals

1. Reduce recovery time for long sessions.
2. Preserve non-destructive ledger semantics.
3. Improve crash/network recovery without blocking editing UX.
4. Add deterministic test coverage that prevents replay-regression drift.

## Non-Goals

1. Multi-user collaborative merges in this phase.
2. New DB tables or RLS policy changes.
3. Changing transcript/editor authority boundaries.
4. Replacing the history ledger model.

## Persistence Strategy (No DB Migration Required)

Use existing `tongs.workpiece_files` artifact storage via current Tongs `read-file` / `commit-file` seams.

No schema migration required for this phase.

## Artifacts

### 1) Snapshot Manifest

Path: `hammer/snapshots/manifest.v1.json`

Contains:

1. `version`
2. `workpieceId`
3. `activeSnapshotRef`
4. ordered snapshot refs (newest first)
5. retention metadata

### 2) Snapshot Payload

Path pattern: `hammer/snapshots/{snapshot_ref}.v1.json`

Contains:

1. `snapshotRef`
2. `createdAt`
3. `workpieceId`
4. `sessionId`
5. `baseRevisionId`
6. `headEntryId`
7. `undoDepth`
8. `redoDepth`
9. `editorState` (`HammerEditorStateSerializable`)

### 3) Existing Ledger (Unchanged Authority)

Path: `hammer/history.v1.json`

Remains authoritative event ledger and undo/redo source of truth.

## Snapshot Cadence

Create snapshot when any trigger fires:

1. Every 40 committed history entries.
2. Every 45 seconds while dirty and no snapshot written in that window.
3. Before unload if ledger changed since last snapshot attempt.

Retention:

1. Keep last 20 snapshots.
2. Always keep newest valid snapshot.
3. Prune older refs from manifest and best-effort delete old payload files.

## Recovery Flow

On editor open:

1. Load baseline inputs (existing behavior).
2. Load history ledger (`hammer/history.v1.json`).
3. Load snapshot manifest and referenced active snapshot.
4. Validate snapshot:
   1. matching `workpieceId`
   2. matching `baseRevisionId`
   3. `headEntryId` exists in ledger or is `null`
5. If valid:
   1. restore `editorState` from snapshot
   2. replay only entries after `headEntryId`
6. If invalid or unavailable:
   1. fallback to full replay from baseline (current behavior)
7. Never block UI open on snapshot read failure.

## Failure Model

1. Snapshot write fails:
   1. log warning
   2. continue editing
   3. keep ledger writes active
2. Snapshot corrupted:
   1. ignore corrupted snapshot
   2. fallback to full replay
3. Manifest missing:
   1. treat as no snapshots yet
   2. create on next snapshot write

## Implementation Slices

### Slice B1: Artifact APIs

Add:

1. `apps/hammer/src/lib/hammerSnapshotArtifactApi.ts`
2. read/write helpers for manifest and snapshot payload
3. validation helpers for snapshot compatibility

### Slice B2: Recovery Integration

Update:

1. `apps/hammer/src/editor/HammerWorkspaceShell.tsx`
2. bootstrap path to prefer snapshot-assisted recovery
3. fallback to current full replay path

### Slice B3: Periodic Writer + Retention

Update:

1. history persistence flow to emit snapshots on cadence triggers
2. retention pruning in manifest updates
3. non-blocking background writes

## Test Plan (Gate-Level)

Add focused tests:

1. snapshot key compatibility validation
2. snapshot-assisted replay starts from snapshot and applies only tail entries
3. invalid snapshot falls back to full replay
4. retention pruning keeps newest 20
5. snapshot write failure does not stop history persistence
6. repeated equivalent rerenders do not trigger snapshot storm

## Success Criteria

1. Recovery from long sessions no longer requires full replay in common path.
2. Editor state restores after refresh/crash with lower latency.
3. History ledger remains canonical and undo/redo-correct.
4. No new DB migrations or RLS changes introduced by this phase.
5. Core Hammer gate remains green with new snapshot tests added.

## Rollout Notes

1. Launch behind a Hammer feature flag (default off in first PR).
2. Enable in dev/staging first and compare recovery timings.
3. Promote to default once replay parity and crash recovery are stable.
