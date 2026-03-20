# Bellows V1 Technical Capture Model

This document defines how Bellows records reality in V1.

Purpose:

Bellows is not a streaming tool that also records.

Bellows is a professional capture system that can also stream.

Prime directive:

Capture first. Sync later. Never lose fidelity.

## Core Architecture

### Local-First Recording

This is non-negotiable.

Each participant records locally:

- their own camera feed
- their own microphone feed
- at full quality
- independent of network conditions

The cloud is a transport layer, not the source of truth.

## Track Model

### Per Participant

Bellows captures isolated tracks rather than a baked final mix.

### Video Track

The participant video track should contain:

- raw camera feed
- no overlays
- no UI artifacts
- no chat
- no script
- no unnecessary processing beyond encoding

### Audio Track

The participant audio track should contain:

- microphone only

It should exclude:

- system audio bleed
- echo
- cross-participant audio baked into the track

### Optional Future Tracks

Reserved future track types may include:

- room or system audio, opt-in
- screen capture
- additional sources

These are not required for V1.

## Container And Encoding Strategy

### Video

Preferred codec:

- H.264 / AVC

Reasons:

- universal compatibility
- hardware acceleration
- strong browser support
- editing-pipeline friendliness

### Audio

Preferred codec options:

- AAC for broad compatibility
- Opus when container and downstream pipeline support it cleanly

### Container

Preferred local recording container:

- MP4
- fragmented MP4 (`fMP4`) preferred for crash resilience

## Quality Targets

### Default Capture For V1

Video targets:

- 1080p resolution
- 30 fps
- adaptive but high-quality bitrate

Audio targets:

- 48 kHz sample rate
- 16-bit minimum
- mono or stereo depending on actual device path

### Future Upgrade Path

Future versions may support:

- 4K
- 60 fps
- high-end mezzanine profiles

These are not required for V1.

## Sync Strategy

### Initial Alignment

Bellows should emit:

- audible tone
- visual flash
- timestamp marker

All participants should receive the same sync cue.

### Continuous Sync

Bellows should also embed:

- timestamps
- drift metadata
- segment boundaries

Hammer uses these for stitching and correction.

## Segmentation Model

Recording is broken into chunks or segments that are:

- time-based
- independently uploadable
- recoverable after failure

### Why Segments Matter

Segmentation enables:

- resumable uploads
- crash recovery
- partial saves
- bandwidth tolerance

## Upload Model

### Background Chunk Upload

While recording:

- segments upload continuously
- the local copy remains authoritative
- upload status is tracked

### Post-Session Upload

After recording stops:

- any remaining segments continue uploading
- Bellows enters the green-bar safeguard phase

## Local Storage Behavior

Bellows requires permission to write locally.

Local storage is used for:

- temporary working files
- final segments until confirmed uploaded
- recovery data

### Cleanup Policy

After successful upload and confirmation:

- local copies may be deleted when the user or product policy allows
- local copies may also be retained as backup

V1 should preserve the option for backup retention.

## Crash Recovery Model

If the browser crashes mid-record:

- completed segments survive
- upload resumes on rejoin when possible
- session integrity remains preservable

## Network Independence

Network quality may affect:

- live stream quality
- preview quality

Network quality must not define:

- recording quality

Bellows treats local capture and network transport as separate concerns.

## Hammer Integration Assumptions

Bellows outputs a session package containing, per participant:

- ordered video segments
- ordered audio segments
- timing metadata
- identity information

Hammer assembles these into timeline assets.

## Recording Vs Broadcast Separation

Bellows treats recording and broadcast as separate pipelines.

Recording pipeline:

- local -> cloud -> Hammer

Broadcast pipeline:

- live mix -> platform

Failure of one pipeline must not automatically kill the other.

## Audio Quality Doctrine

Bellows prioritizes voice clarity over raw loudness.

Future features may include:

- noise suppression
- echo cancellation
- microphone conditioning

But Bellows must not bake destructive processing into the master track by default.

## V1 Success Condition

Even if the live show is chaotic, the final recording should remain:

- clean
- synchronized
- editable
