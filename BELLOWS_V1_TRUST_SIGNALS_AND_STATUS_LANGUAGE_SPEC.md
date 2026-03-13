# Bellows V1 Trust Signals And Status Language Spec

This document defines the canonical meaning of Bellows status signals, visible state language, and trust promises.

Purpose:

Ambiguous signals destroy trust. Bellows must use status language and colors that mean exactly what they claim.

## Signal Hierarchy

### Recording Active

Visual meaning:

- red

Semantic meaning:

- capture is in progress
- data is being stored locally
- the session is protected by active recording

This signal must never be shown if recording is not actually happening.

### Safe To Close

Visual meaning:

- green

Semantic meaning:

- all recordings are uploaded
- the session is sealed
- no further user action is required

This does not mean:

- probably safe
- likely safe
- maybe complete

It is a hard promise.

### Warning

Visual meaning:

- yellow

Semantic meaning:

- something is degraded
- recording is still safe
- user attention may be helpful, but immediate panic is not required

### Informational

Visual meaning:

- blue

Semantic meaning:

- non-critical update only

### No Signal

This is never acceptable during live mode.

Absence of information creates anxiety and uncertainty.

## Icon Rule

Icons may reinforce state, but they must not replace plain-language status text.

The user must not be forced to decode meaning from iconography alone.

## Forbidden Signals

Bellows must never display:

- vague "Processing..." messages during critical phases
- technical error codes in core live workflow
- spinner-only states without explanation
- ambiguous statuses such as "Connected?"

## Status Language Rules

Status language must:

- use plain language
- state whether recording is safe
- avoid jargon
- avoid speculation

Bad example:

"Upload thread stalled."

Good example:

"Upload paused - recording already saved locally."

## Promise Discipline

If Bellows says something, it must be true.

Trust broken by false reassurance is difficult to regain.

Bellows should therefore prefer:

- fewer promises
- stronger verification

over:

- optimistic wording
- speculative reassurance
