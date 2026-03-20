# Bellows V1 Failure And Recovery Doctrine

This document defines the canonical Bellows failure and recovery doctrine for V1.

Purpose:

Remote recording is not tested by perfect sessions.

It is tested by:

- Wi-Fi drops
- browser crashes
- power loss
- rage quits
- platform outages
- microphone failures
- host panic
- compound failure scenarios

Core principle:

No single failure is allowed to destroy the session.

Bellows assumes things will break.

Its job is not perfect prevention. Its job is survival.

## Architectural Truth

Local recording is sacred.

Every participant records:

- their own camera
- their own microphone
- at full quality
- independent of network continuity

Cloud upload is secondary to preservation.

## Failure Classifications

Bellows should categorize failures so it can respond intelligently.

### Class 1: Minor Disruption

The session continues normally.

Examples:

- brief network lag
- dropped frames
- temporary audio glitch

User perception:

"Something hiccuped."

### Class 2: Participant Disruption

One person is affected, but the session continues.

Examples:

- guest disconnects
- guest browser crashes
- camera failure
- microphone failure

### Class 3: Critical Disruption

Core session conditions are compromised.

Examples:

- Host disconnects
- broadcast platform failure
- multiple participants drop
- recording failure

Bellows enters recovery-oriented behavior.

## Participant Drop Handling

When a guest disconnects, Bellows should immediately:

- preserve local recording
- initiate upload of completed segments
- show upload progress where appropriate
- mark the participant as offline
- allow rejoin via the same link

### Rejoin Behavior

The participant may return with:

- the same identity
- the same seat
- recording resuming into a new segment

Hammer can stitch later. Bellows should preserve truth rather than pretending continuity.

## Mid-Recording Rage Quit

Bellows should:

- warn before closing
- accept that it cannot physically prevent exit
- secure data already captured
- begin upload safeguard behavior

## Host Disconnect Scenario

This is one of the most dangerous cases.

Immediate Bellows priorities:

- preserve all recordings
- pause broadcast if possible
- promote a Co-Host when available
- display recovery status clearly

If no Co-Host exists:

- Bellows becomes the temporary steward
- recording remains locally protected
- session state remains recoverable
- the Host may rejoin and resume control

## Broadcast Failure

If YouTube, Rumble, or another platform fails:

- recording continues
- participants are informed calmly
- the stream may be restarted
- nothing already captured is lost

Bellows prioritizes capture over distribution.

## Browser Crash Or Tab Close

On reload, Bellows should attempt session recovery.

If local recording still exists, Bellows should offer clear re-entry messaging such as:

"We found your session. Rejoin?"

Recovery should feel competent rather than fragile.

## Power Loss Scenario

If a device shuts down hard:

- unsaved local data may be lost
- uploaded chunks remain preserved
- the session continues without that participant

Worst case should not equal catastrophic session loss.

## Upload Failure Handling

If upload stalls:

- Bellows retries automatically
- the user is notified without blame
- manual retry remains available

## Safe-To-Leave Gate

Bellows must not claim safety until all of the following are true:

- all local recordings are secured
- all uploads are complete
- session metadata is finalized

## Panic Stop Scenario

If the Host triggers an emergency stop:

- recording stops cleanly
- all tracks are secured
- upload begins
- corruption is actively avoided

## Psychological Doctrine

Users should feel:

"Even if everything goes wrong, my show is safe."

Users should not feel:

"I hope this didn't ruin everything."

## Gold Standard Outcome

After a chaotic session, the Host should be able to say:

"That was a mess, but at least we got it."

That is the mark of a professional system.

## What Bellows Never Does

Bellows must never:

- fail silently
- use cryptic error messages in operator flow
- blame the user
- lose confirmed recordings
- require technical intervention mid-show when recovery can be automated

## Canonical Design Insight

The show can improvise.

The foundation cannot.
