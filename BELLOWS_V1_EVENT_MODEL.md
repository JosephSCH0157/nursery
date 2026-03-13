# Bellows V1 Event Model

This document defines the canonical vocabulary of Bellows events.

Purpose:

Events drive:

- state transitions
- logs
- recovery
- analytics
- debugging
- automation
- integrations

If something matters later, it should be represented as an event now.

## Core Event Categories

### Session Lifecycle Events

- `session_created`
- `session_configured`
- `session_started`
- `session_stopped`
- `session_sealing_started`
- `session_sealed`

### Participant Events

- `participant_joined`
- `participant_ready`
- `participant_disconnected`
- `participant_reconnected`
- `participant_removed`
- `participant_role_changed`

### Recording Events

- `recording_started`
- `recording_segment_started`
- `recording_segment_ended`
- `recording_stopped`

### Sync Events

- `sync_emitted`
- `sync_detected`
- `drift_estimated`

### Broadcast Events

- `broadcast_started`
- `broadcast_degraded`
- `broadcast_disconnected`
- `broadcast_resumed`
- `broadcast_ended`

### Upload Events

- `upload_started`
- `upload_chunk_received`
- `upload_paused`
- `upload_resumed`
- `upload_completed`

### Failure Events

- `connection_lost`
- `storage_low`
- `artifact_missing`
- `integrity_warning`

### User Action Events

- `host_command_issued`
- `participant_exit_attempted`
- `safeguard_triggered`

## Event Integrity Rules

Events must be:

- timestamped relative to `T0`
- ordered per source
- immutable once recorded
- attributable to an actor

## Event Principle

If it matters later, it must be an event now.
