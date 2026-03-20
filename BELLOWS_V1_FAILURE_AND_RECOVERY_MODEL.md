# Bellows V1 Failure And Recovery Model

This document defines the canonical Bellows failure and recovery model for V1.

It answers how Bellows behaves when reality goes wrong:

- internet drops
- browser crashes
- laptop sleeps
- battery dies
- someone rage-quits
- platform disconnects
- partial uploads occur
- tracks become corrupted

Core goal:

No usable recording is lost unless the physical device is destroyed.

## Fundamental Design Rule

Bellows is local-first capture, cloud-assisted preservation.

Bellows is not:

- cloud-first
- stream-only

This is the primary reliability advantage over stream-only or platform-first pipelines.

## Failure Domains

Bellows should treat failures as independent layers:

- participant device failure
- network failure
- browser or app failure
- platform failure
- host failure
- storage failure
- multi-failure scenarios

Each domain must degrade gracefully.

## Participant Device Failure

Examples:

- laptop power loss
- OS crash
- tab killed
- phone overheats
- camera app conflict

Expected behavior for other participants:

- recording continues
- broadcast continues, if applicable
- a participant disconnected indicator is shown

Expected Bellows behavior:

- finalize the last uploaded chunk that already reached the server
- flag the affected track as partial
- preserve all existing uploaded data

## Network Failure

This is the most common real-world failure mode.

### Short Outage

Local recording continues offline.

Upload pauses.

On reconnect:

- upload resumes
- no user action is required

### Long Outage

Recording still remains local-first.

The user should see a warning such as:

"Connection lost - recording locally."

When connection returns:

- upload backfill begins
- session integrity is maintained

## Browser Or App Crash

This is a critical case.

If local files survive, Bellows should:

- detect the incomplete session on reopen
- offer a resume or recover flow
- resume upload of existing local files

Example recovery prompt:

"We found an unfinished recording. Upload and restore session?"

## Host Failure

The host disappears mid-session.

V1 behavior:

- the session continues for remaining participants
- Bellows promotes a Co-Host to acting Host authority when a valid Co-Host is present
- broadcast may end depending on platform behavior
- recording continues locally for each participant

If the host reconnects:

- control may resume
- session continuity is maintained

If the host does not return and no Co-Host is available:

- the session becomes orphaned
- the session remains recoverable

## Rage Quit Or Manual Close

Before closing, Bellows should show a persistent warning such as:

"Recording in progress - closing now may cause data loss."

Bellows should attempt graceful shutdown by:

- finalizing local files
- flushing the upload queue
- sealing the participant track as partial if necessary

Bellows cannot force compliance, but it must protect data as far as possible.

## Broadcast Platform Failure

If YouTube, Rumble, or another platform drops connection:

- recording remains unaffected
- Bellows may attempt reconnect
- the host is notified
- the session capture remains valid

Bellows prioritizes recording over streaming.

## Upload Failure

If cloud upload is interrupted during recording:

- local recording continues
- upload retries automatically

After recording:

- the safeguard progress phase handles completion

The upload system should support:

- resume
- chunk verification
- partial recovery

The session must not be sealed until upload completes or the session is explicitly marked incomplete.

## Local Storage Exhaustion

This is rare but high impact.

Bellows should monitor available local space.

Early warning example:

"Low storage - recording may stop."

If storage is exhausted:

- recording stops for that participant only
- existing data is preserved
- failure is flagged in the manifest or session status

## Multi-Failure Scenario

Example:

Guest loses internet, then laptop crashes, then reconnects later.

Bellows V1 expectation:

- previously uploaded chunks are preserved
- resumed upload continues from recoverable local state
- the resulting track is sealed as partial if continuity is broken
- sync data is recalculated as needed

No manual repair should be required for the common recovery path.

## Safe-To-Exit Guarantee

The safe-to-close progress bar is the canonical exit rule:

Do not leave until upload is complete.

Bellows must still tolerate violation of that rule.

If a user leaves early:

- a local recovery path should exist
- the session is marked incomplete
- the data remains salvageable later when possible

## Session Integrity States

Useful downstream states for Tongs and Hammer include:

### Recording Phase

- `recording_active`
- `recording_offline_local`
- `participant_disconnected`

### Upload Phase

- `uploading`
- `upload_paused`
- `upload_resuming`
- `upload_failed_partial`

### Completion Phase

- `captured`
- `sealed`
- `incomplete_capture`
- `corrupted_capture`

`corrupted_capture` should be rare and reserved for verified data corruption.

## Data Loss Conditions

Bellows cannot recover data if:

- the device is destroyed before upload
- local storage is wiped
- the user denies recovery access
- recording never actually started

These boundaries should be documented explicitly in product behavior and support guidance.

## Trust-Building Feature

Bellows may optionally show two separate assurances:

- Recording secured locally
- Cloud backup complete

These are distinct states and should not be conflated.

## Canonical Reliability Principle

Every participant is a recorder of last resort.

There is no single point of failure.

This is the defining reliability property of the Bellows architecture.

## V1 Success Criteria

The Bellows failure model is acceptable only when all of the following are true:

- no single participant failure destroys the session
- broadcast failure does not affect recording
- network loss does not stop capture
- upload is resumable
- partial sessions remain usable
- users are warned but not blocked

## Architectural Note

This model is what separates a consumer call tool from a production system.

Bellows achieves that through:

- local-first recording
- chunked upload
- deterministic capture structure
- canonical storage
- post-session sealing
