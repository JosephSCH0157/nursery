# Bellows V1 Session Data Ontology

This document defines the canonical nouns of a Bellows session.

Purpose:

Without canonical nouns, systems drift into mismatched assumptions, fragile integrations, ambiguous APIs, and schema confusion.

Core goal:

Every piece of Bellows data represents a well-defined real-world concept.

## Primary Entity: Session

Definition:

A Session is the complete lifecycle of a single recording event from setup through sealing.

A Session is not:

- a broadcast stream
- a meeting
- a file
- a workspace
- a project

A Session is the container for all capture activity.

Key properties:

- unique identity
- single host authority
- bounded start and end
- may include multiple recording segments
- may include broadcast activity
- produces exactly one canonical capture package

## Participant

Definition:

A Participant is a human, or future automated agent, actively connected to the session.

Participant properties:

- persistent `participant_id`
- role assignment
- presence timeline
- capture capability
- device context

Important distinction:

Participant does not equal user account.

A single user could theoretically appear multiple times in one session in future scenarios.

## Role

Definition:

A Role defines behavioral permissions within the session.

Examples:

- `HOST`
- `S2`
- `G1`
- `G2`
- `ENGINEER` (future)
- `OBSERVER` (future)

Roles are session-scoped, not global.

## Track

Definition:

A Track is a continuous media recording produced by one participant device.

Track examples:

- video track
- audio track
- composite track (future)
- screen-share track (future)

Tracks are raw capture sources.

## Segment

Definition:

A Segment is a portion of a track representing continuous recording without interruption.

Reasons a track may split into segments:

- reconnects
- device restarts
- permission resets
- storage rollover

Segments preserve truth instead of pretending continuity.

## Timeline

Definition:

The Timeline is the canonical time structure of the session.

It is defined relative to `T0`, the session start reference.

Timeline data includes:

- segment offsets
- sync markers
- event timestamps
- drift data

## Sync Marker

Definition:

A Sync Marker is an observable signal embedded in recordings to aid alignment.

Examples:

- clap
- tone
- flash (future)

Sync markers anchor tracks to shared reality.

## Layout Snapshot

Definition:

A Layout Snapshot is a representation of how participants were arranged visually at a given moment.

It is guidance for editing, not a binding editorial instruction.

## Script Reference

Definition:

A Script Reference links the session to external scripted content used during recording.

It contains:

- script identity
- revision identity
- speaker mapping
- optional timing hints

Script content lives elsewhere.

## Broadcast Event

Definition:

A Broadcast Event is an interval during which the session's program output was transmitted to an external platform.

A Broadcast Event is not required for a Session to exist.

Multiple broadcast events may occur within a single Session.

## Artifact

Definition:

An Artifact is a stored media file or derived asset produced by the session.

Examples:

- raw video track
- audio file
- thumbnails
- waveform previews
- logs

Artifacts are immutable once the session is sealed.

## Capture Package

Definition:

The Capture Package is the complete deterministic bundle of artifacts and metadata produced by Bellows for Hammer.

There is exactly one canonical capture package per session.

## Manifest

Definition:

The Manifest is structured metadata describing the capture package contents and relationships.

The Manifest acts as the authoritative index for the session package.

## Sealed Session

Definition:

A Sealed Session is a session whose data has been verified, finalized, and made immutable.

This is the canonical output state of Bellows.

## Ontology Principle

Bellows models reality as it happened, not how users wish it had happened.
