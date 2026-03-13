# Bellows V1 Studio Authority And Truth Resolution Model

This document defines the canonical Bellows authority and truth-resolution model for V1.

Its purpose is to answer one question:

Who is the boss of physics inside the session?

Bellows must resolve disagreements about:

- timing
- presence
- state
- layout
- recording status
- identity
- session control
- truth of events

In distributed recording, disagreements are guaranteed.

Core goal:

There must always be one canonical truth per session.

## Fundamental Principle

Bellows sessions have a single authoritative center:

- the Host defines the studio

Authority does not come from:

- the server alone
- the loudest participant
- the platform
- whoever joined first

The Host is the production authority.

## Authority Hierarchy

### Tier 1: Host

The Host has absolute control over:

- session lifecycle
- recording start and stop
- participant admission
- participant removal
- script selection
- live broadcast
- highlight decisions
- studio configuration

If the Host issues a valid command, it wins unless a higher safety rule blocks it.

### Tier 2: Session Engine

The Bellows session engine has autonomous safety authority.

It may override host intent only to protect integrity.

Examples:

- prevent closing while upload is incomplete
- prevent unsafe recording stop during a critical state
- enforce data preservation rules

This is the studio safety interlock.

### Tier 3: Co-Host

The Co-Host has delegated operational authority inside the session.

A Co-Host may:

- mute participants
- highlight audience prompts
- admit participants when allowed
- adjust layout in non-destructive ways
- monitor session state

A Co-Host may not:

- override Host intent while the Host is present
- end the session unilaterally
- change broadcast destination
- assume broad control unless Bellows explicitly promotes the Co-Host during Host loss

### Tier 4: Participants

Participants have limited authority to:

- control their own camera
- control their own microphone
- request actions
- leave session
- reconnect

Participants cannot alter session structure.

### Tier 5: External Platforms

Platforms have the lowest authority.

Platforms:

- cannot control recording
- cannot alter session structure
- cannot override host decisions

If YouTube, Rumble, or another destination disconnects, Bellows continues according to studio rules.

## Presence Truth Model

Different users may observe different participant states.

Bellows defines presence canonically as:

- connected to the session engine and transmitting

Presence is not defined by:

- visibility in UI
- browser tab openness
- participant self-report alone

## Ghost Conditions

Example:

A participant believes they are connected, but upstream network transport has failed.

Bellows resolves this using engine observation rather than self-report.

Canonical state example:

- `participant_state = disconnected`

Even if the participant UI has not updated yet.

## Start-Of-Recording Authority

Only the Host can start recording.

Participants cannot auto-start a session recording state.

Recording begins only when all of the following are true:

- Host command issued
- engine acknowledges the command
- `T0` is established

Recording does not begin merely because participants think it started.

## Conflicting Start Times

If devices capture different apparent start moments:

- canonical start = Host-issued `T0`

Late starts are treated as offsets from the canonical timebase, not alternate realities.

## Rejoin Identity Resolution

When a participant reconnects, Bellows must decide whether this is:

- the same participant returning
- a new entity attempting to join

Resolution should use:

- authenticated identity, if available
- join token
- `participant_id`
- role mapping

If uncertainty remains:

- treat the connection as the same participant with a new segment

Bellows must never silently create duplicate participant identities.

## Role Authority

Roles such as `HOST`, `S2`, `G1`, and `G2` are session-defined.

Participants cannot self-promote or self-assign roles.

The Host assigns roles during setup or through explicit host-authorized actions.

## Layout Authority

Studio composition is Host-controlled.

Participant-local UI preferences do not affect the canonical layout snapshot.

Rule:

- what a participant sees locally is not the same thing as the studio truth Bellows records

## Recording State Conflicts

If one participant believes recording stopped while others continue:

- canonical recording state = engine state

Truth is not determined by:

- majority vote
- local perception
- participant assumptions

## Mute And Camera State Truth

Local mute and actual transmitted/captured state may differ.

Bellows should track distinct states such as:

- device mute
- transmission mute
- capture mute

Canonical truth is what was actually recorded and transmitted according to engine-observed capture state.

## Broadcast Authority

Only the Host can initiate or end broadcast.

Platform-side actions must not terminate recording authority inside Bellows.

Broadcast state and recording state are related but not identical.

## Host Disappearance

If the Host drops:

- the session may continue
- Bellows may promote the Co-Host to acting Host authority if a valid Co-Host is present

This prevents authority chaos.

Canonical degraded state example:

- `host_status = absent`
- `session_mode = degraded` when no promoted Co-Host is available

If a Co-Host is promoted:

- the session remains under a single acting human authority
- recording preservation still takes precedence over convenience

The session remains recoverable until the Host returns, the promoted Co-Host concludes the session, or the engine finalizes the session under safeguard rules.

## Server Vs Client Authority

The Bellows engine acts as the arbiter.

Client claims are advisory.

Example:

A client may claim upload complete, but the engine verifies integrity before sealing.

## Metadata Truth Priority

When metadata conflicts, Bellows resolves truth in this priority order:

1. engine-generated data
2. verified capture metadata
3. participant-reported data
4. UI state

Lower-priority sources must not override higher-priority truth.

## Sealing Authority

Only the Bellows engine can mark a session as sealed.

Sealing authority does not belong to:

- the Host directly
- Hammer
- Tongs directly

Sealing requires:

- upload completion
- integrity checks
- manifest finalization

## Security Principle

Authority follows identity, not connection.

Reconnecting from a different device does not change role or session authority.

## Canonical Authority Principle

Bellows resolves truth from the studio center outward, not from participant consensus inward.

## Why This Matters

Without an authority model, distributed systems degrade into:

- race conditions
- phantom states
- duplicate identities
- lost control
- non-deterministic behavior

With an authority model, Bellows remains predictable under chaotic conditions.

## V1 Acceptance Criteria

The Bellows authority model is sufficient only when all of the following are true:

- no action depends on participant consensus
- Host commands deterministically control session behavior
- engine safeguards cannot be bypassed
- rejoins do not create identity confusion
- conflicting states resolve consistently
