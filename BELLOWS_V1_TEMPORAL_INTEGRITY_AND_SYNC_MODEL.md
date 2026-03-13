# Bellows V1 Temporal Integrity And Sync Model

This document defines the canonical Bellows temporal integrity and sync model for V1.

Its purpose is simple:

Make independently recorded feeds cuttable no matter what happens.

Bellows must guarantee that recorded feeds can be aligned into a coherent timeline even if:

- devices start late
- device clocks disagree
- drift occurs
- participants reconnect
- frame rates differ
- chunks arrive out of order
- sessions run for long durations

Core goal:

Hammer must always be able to reconstruct what happened when.

## Fundamental Principle

Bellows must not rely on wall-clock time for synchronization.

Bellows must never trust:

- system clocks
- browser time
- NTP accuracy
- timezone data
- device timestamps

Instead, Bellows establishes its own session timebase.

## Session Timebase

At recording start, Bellows creates a canonical timeline anchor:

- `T0 = session start reference`

All events are expressed relative to `T0` in monotonic time.

This is not real-world time.

Monotonic time means:

- it never jumps backward
- it is unaffected by clock adjustments
- it is internally consistent within each device process

## Primary Sync Anchor

Bellows formalizes a start marker at recording start.

Bellows emits a sync signal such as:

- an audible tone
- a clap
- an optional visual flash
- a timestamped session event

This signal should be captured by every recorder.

The purpose is to create a shared observable event across all tracks.

## Why The Start Marker Matters

Even if:

- one device starts recording two seconds late
- another participant experiences buffering
- clocks disagree by minutes

Hammer can still align tracks using the captured signal rather than trusting reported device time.

This is the same principle used by production slates and clap markers in film workflows.

## Drift Management

Consumer hardware drifts over time.

Long recordings can desync by seconds if drift is ignored.

Bellows V1 should measure drift when possible using mechanisms such as:

- periodic heartbeat signals
- audio correlation
- frame timestamp analysis in future versions

At minimum, Bellows must record enough temporal data for Hammer to correct drift later.

## Rejoin Handling

When a participant disconnects and reconnects mid-session, Bellows treats the rejoin as a new segment of the same logical participant track.

Conceptually:

```text
participant_track
  segment_1
  segment_2
  segment_3
```

Each segment must include:

- start offset from `T0`
- duration
- continuity flag

Bellows must not fake continuity where continuity did not actually exist.

## Variable Frame Rate

Browser capture often produces variable frame rate output.

Bellows must record:

- nominal frame rate
- actual timestamps when available
- encoder details

This allows Hammer to conform tracks correctly during reconstruction.

## Audio As Ground Truth

Audio timing is often more reliable than video timing.

Bellows should preserve:

- raw audio streams
- sample rates
- channel count
- timing metadata

This allows downstream waveform alignment or audio-led sync correction when needed.

## Chunk Timestamp Integrity

Upload order must not define timeline order.

Bellows must label each chunk with:

- `participant_id`
- `segment_id`
- `start_offset_from_T0`
- `duration`
- `sequence_number`
- `checksum`

This makes deterministic reassembly possible even when uploads arrive out of order.

## Identity Integrity

Bellows must bind recorded media to persistent participant IDs rather than display names.

Required rule:

- display names are UI-only
- participant IDs are the canonical identity for tracks and segments

This prevents ambiguity when names or roles change during a session.

## Layout And Timeline Separation

What the live studio looked like must remain separate from the timing truth of recorded media.

Bellows stores layout snapshots independently from track timing.

Hammer decides final editorial composition.

## Broadcast Latency Isolation

Public live latency must not affect session timing.

Viewers may be seconds behind the studio.

Bellows ignores public playback delay for synchronization purposes.

Studio capture timing and public broadcast timing are separate domains.

## End-Of-Session Anchor

Bellows may optionally emit a closing marker such as:

- a closing tone
- a final clap
- a terminal sync event

This helps validate whole-session drift from start to finish.

It is optional but strongly useful.

## Corruption Detection

Bellows should detect and flag:

- missing segments
- duration mismatches
- checksum failures
- discontinuities

Bellows must never silently repair or reinterpret media without surfacing the condition.

## Minimal Required Sync Data For Hammer

Bellows must provide, at minimum:

- `T0` reference
- per-track start offset
- segment boundaries
- sync marker timestamps
- frame and audio metadata
- drift estimates when available

With that information, deterministic reconstruction remains possible.

## Temporal Principle

Bellows records reality as observed, not as reported by devices.

## Reconstruction Principle

Professional multicam systems assume:

- time will lie
- hardware will drift
- networks will fail
- people will do unpredictable things

Bellows therefore designs for reconstruction rather than perfection.

## V1 Acceptance Criteria

The Bellows temporal model is sufficient only when all of the following are true:

- any subset of available tracks can be aligned
- late starts are recoverable
- rejoins do not corrupt the timeline
- long sessions remain syncable
- synchronization does not depend on system clock accuracy
