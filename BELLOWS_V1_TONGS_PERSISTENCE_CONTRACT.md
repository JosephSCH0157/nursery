# Bellows V1 Tongs Persistence Contract

This document defines the canonical Bellows -> Tongs persistence contract for V1.

It answers three questions:

- what Bellows writes into canonical storage
- when Bellows writes it
- what remains runtime-only

This boundary exists to prevent:

- giant blob dumps
- accidental duplication
- orphaned recordings
- storage cost explosions
- broken downstream workflows
- ambiguity about source of truth

Tongs remains the canonical archive and coordination layer.

## Ownership Model

Bellows owns ephemeral runtime concerns such as:

- live session state
- WebRTC connections
- participant presence
- UI overlays
- temporary buffers
- local recording files until uploaded
- upload progress state

Tongs owns persistent canonical concerns such as:

- session identity
- metadata
- uploaded artifacts
- script linkage
- workspace association
- lifecycle tracking
- discoverability for Hammer and Quench

## Persistence Phases

Bellows should not write everything at once.

### Phase 1: Session Creation

When the host starts setup, before recording begins, Bellows writes a minimal session record.

Required fields:

- `session_id`
- `workspace_id`
- `host_user_id`
- `planned_participant_count`
- `intended_session_type`
- `creation_timestamp`
- `status`

Required status value:

- `setup` or `scheduled`

No media is written in this phase.

### Phase 2: Recording Started

When recording actually starts, Bellows updates the session record with:

- `status = recording`
- `start_time_utc`
- participant roster snapshot
- script reference, if known
- platform targets, if live

Large media artifacts are still not written as a final package here.

### Phase 3: Upload In Progress

As chunks upload, Tongs stores:

- artifact placeholders
- upload state
- per-participant progress
- resumable upload tokens
- incremental integrity hashes

Required status value:

- `uploading`

This phase exists to enable crash recovery and salvage.

### Phase 4: Capture Complete

Once uploads finish, Bellows writes the Session Capture Package defined by the Bellows/Hammer handoff contract.

Tongs stores metadata including:

- full manifest
- participant records
- sync data
- layout snapshot
- script linkage

Tongs stores media artifacts including, per participant:

- video track
- audio track, separate if available
- thumbnails, optional
- waveform previews, optional

Tongs stores integrity data including:

- checksums
- duration verification
- completeness flags

Required status value:

- `captured`

### Phase 5: Sealed Session

After validation completes, Tongs marks the session as:

- `status = sealed`

`sealed` means:

- ready for Hammer
- no further Bellows writes are expected
- the record is immutable except through explicit admin actions

This is the canonical done-recording state.

## Artifact Storage Rules

Required:

- one artifact per participant track
- no merged video
- no baked layout
- no transcoding by default

Bellows stores original capture quality.

Optional, when available:

- backup audio-only track
- camera-off placeholder metadata
- dropped-frame diagnostics

## Script Linkage

If a recording used a script, Tongs stores references only:

- `script_id`
- `revision_id`
- speaker mapping
- optional timestamps

Script content remains in Hearth/Tongs script storage.

No script content duplication is allowed in the Bellows persistence contract.

## Participant Records

Bellows must persist a canonical roster snapshot with:

- `participant_id`
- `role`
- `display_name`
- join and leave times
- track presence
- recording success flag

This data is required for credits, editing, analytics, and downstream traceability.

## Explicit Non-Persistence

Bellows V1 must not store any of the following in Tongs:

- live audience chat messages
- temporary UI state
- warning overlays
- upload progress history
- failed intermediate chunks
- platform-specific streaming buffers

These are runtime-only concerns.

## Recovery Behavior

If the host crashes mid-session, incremental upload means Tongs may already contain:

- partial tracks
- roster data
- timestamps
- upload state

The session can therefore be resumed or salvaged.

Recommended recovery status example:

- `incomplete_capture`

## Storage Philosophy

Tongs is not just a file dump.

It is the canonical structured archive of creative workpieces.

Everything stored through this contract should be:

- identifiable
- reusable
- auditable
- lifecycle-aware

## Access Model

After sealing, Hammer reads:

- full capture package
- artifacts
- metadata
- sync information

Later, Quench reads:

- exports produced by Hammer
- platform-ready media

Bellows does not publish directly in V1.

## Failure Flags

Tongs should persist downstream-visible failure flags including:

- `missing_track`
- `degraded_quality`
- `participant_dropout`
- `upload_interrupted`
- `resync_required`

Hammer can surface warnings and decide how to proceed.

## Canonical Design Principle

Tongs stores durable truth; Bellows streams fleeting reality.

## V1 Completion Criteria

The Bellows -> Tongs persistence contract is satisfied only when all of the following are true:

- session record created
- artifacts uploaded
- manifest stored
- integrity verified
- `status = sealed`

If the Bellows/Hammer contract defines what Bellows hands to the editor, this contract defines what becomes part of the Forge's permanent memory.
