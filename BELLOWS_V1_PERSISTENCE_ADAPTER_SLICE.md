# Bellows V1 Persistence Adapter Slice

## Purpose

Define the first concrete Bellows persistence-side runtime adapter implementation.

This slice makes the `persistence` adapter domain executable before Bellows writes
to Tongs or any canonical storage system.

## What This Slice Proves

- A Bellows session runtime can durably observe persistence-side engine effects.
- Persistence-side effects can be translated into structured observation records.
- Bellows session state can be snapshotted safely at persistence dispatch time.
- Persistence adapter code can dispatch follow-up engine actions back into the
  Bellows runtime.
- The engine remains authoritative; persistence code reacts and reports.

## Concrete Components

- A concrete `BellowsPersistenceAdapter`
  - Handles `resume_pending_uploads`
  - Handles `verify_integrity`
  - Handles `assemble_manifest`
  - Handles `seal_session_record`
  - Can auto-resolve or hold persistence outcomes in manual mode
- A `BellowsMemoryPersistenceStore`
  - Captures structured observations for tests and harness verification
  - Stores lifecycle snapshots derived from Bellows session state
- A `BellowsPersistenceHarness`
  - Instantiates a Bellows session runtime
  - Wires the concrete persistence adapter in front of no-op adapters for the
    untouched runtime domains
  - Exposes persistence observations and snapshots for verification

## Canonical Constraint

This slice does not establish canonical Bellows persistence.

Per workspace policy, persisted Bellows session truth ultimately belongs in Tongs
and Supabase. The in-memory persistence store in this phase is a test/runtime seam
tool only. It proves the adapter contract and effect translation path without
claiming SSOT authority.

## Phase Boundary

This is still not:

- Tongs writes
- Supabase persistence
- Upload transport
- Artifact storage
- Media capture
- WebRTC signaling
- React UI

It is the first Bellows persistence memory slice, not Bellows production storage
integration.
