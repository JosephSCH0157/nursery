# Bellows V1 Hammer Handoff Contract

This document defines the canonical Bellows -> Hammer handoff for V1.

This is the critical seam where:

- Bellows produces raw recording reality
- Hammer consumes it to produce a finished show

If this boundary is fuzzy, everything downstream gets brittle.

## Purpose

Define the deterministic package Bellows delivers to Hammer after a session.

This document is not about:

- publishing
- editing
- storage policy

It is only about this statement:

"Here is a complete multi-track recording session."

## Ownership Model

Bellows owns:

- capture
- participant layout
- local recordings
- upload completion
- session timing
- sync alignment data
- basic session metadata

Hammer owns:

- timeline editing
- cuts
- visual composition
- final layout decisions
- exports
- shorts
- b-roll
- audio processing beyond capture

Bellows must not pre-edit anything.

## Output Type

Bellows produces a Session Capture Package (SCP).

The SCP is a deterministic, edit-ready bundle.

Conceptually, it should be treated like a multicam shoot folder from a production truck.

## Canonical Package Structure

This structure is conceptual. Exact storage location and path authority remain Tongs concerns.

```text
session/
  manifest.json
  participants.json
  tracks/
    p_host/
      video.mp4
      audio.wav
    p_cohost/
      video.mp4
      audio.wav
    p_guest1/
      video.mp4
      audio.wav
  sync/
    clap_marker.json
    time_offsets.json
  layout/
    pane_geometry.json
  script/
    script_ref.json
```

## Required Manifest Fields

### Core Identity

The package manifest must include:

- `session_id`
- `workspace_id`
- `host_user_id`
- `start_time_utc`
- `end_time_utc`
- `duration_ms`
- `recording_mode`
- `session_type`

Expected value domains:

- `recording_mode`: `local-first` or `cloud-assisted`
- `session_type`: `remote`, `hybrid`, or `solo`

### Participants

Each participant entry must include:

- `participant_id`
- `role`
- `display_name`
- `joined_at`
- `left_at`
- `track_refs`
- `camera_resolution`
- `audio_sample_rate`

Allowed V1 role examples include:

- `HOST`
- `S2`
- `G1`
- `G2`

### Track Metadata

Each participant track entry must include:

- `file_ref`
- `codec`
- `resolution`
- `frame_rate`
- `audio_channels`
- `duration`
- `continuity_flag`

Required `continuity_flag` values:

- `complete`
- `partial`
- `dropped`

## Sync Data

Bellows must supply alignment information.

Required sync outputs:

- `clap_time_per_track`
- relative time offsets
- drift estimate, if measured

Hammer should not have to guess alignment.

## Layout Snapshot

Bellows captures what the studio looked like during recording.

This is not for locking the edit. It is only a starting point for Hammer.

Recommended layout fields:

- pane positions
- active speaker indicators, optional
- camera enable states
- screen-share flags, reserved for future use

## Script Reference

If a script was used, Bellows may include a script reference record.

Required fields when present:

- `script_id`
- `revision_id`
- `speaker_mapping`

Optional future field:

- `scroll_timestamps`

Bellows must not duplicate full script content inside the capture package.

## Explicit Non-Responsibilities

Bellows V1 must not:

- mix tracks into one video
- apply visual layout permanently
- normalize audio
- remove silence
- cut dead air
- insert graphics
- export publish-ready media

Hammer owns those concerns.

## Failure Handling

Bellows must still produce a package even when the session is imperfect.

The package must surface explicit flags for degraded conditions such as:

- `participant_dropout`
- `partial_upload`
- `missing_track`
- `degraded_quality`
- `resync_required`

Hammer decides how to respond editorially.

## Completion Condition

Bellows may hand off only when all of the following are true:

- all available local recordings are uploaded
- manifest data is complete
- sync data is computed
- the package is sealed

This completion condition is equivalent to the green safe-to-close state in Bellows.

## Canonical Design Principle

Bellows produces truth, not polish.

Hammer transforms truth into story.
