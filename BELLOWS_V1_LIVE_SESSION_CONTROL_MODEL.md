# Bellows V1 Live Session Control Model

This document defines what the Host can control while recording, and how control authority is distributed across a live Bellows session.

Core philosophy:

The Host runs the show. Everyone else participates.

Bellows is not democratic software.

Bellows is studio software.

## Control Authority Levels

### Host

The Host has absolute authority over the live session.

The Host can control:

- recording state
- participant permissions
- live chat visibility
- layout
- streaming output
- session termination

### Co-Host

The Co-Host has operational authority.

A Co-Host may assist without overriding Host intent.

Examples of allowed actions:

- mute participants
- highlight chat messages
- manage guest readiness
- adjust layout in non-destructive ways

### Guest

Guests are performance participants, not production operators.

Guests can:

- mute or unmute themselves
- toggle camera
- leave session, with warning

Guests should not worry about production controls.

## Host Control Categories

These control groups should feel like panels on a studio console.

### Recording Controls

Core controls:

- Start Recording
- Pause Recording, optional for V1
- Stop Recording

Behavioral rules:

- Start triggers countdown
- Stop triggers upload mode
- Recording state is visible to all participants

### Audio Controls

The Host can:

- mute any participant
- mute all except self
- disable participant unmute in stage mode
- monitor audio levels

Emergency mute concept:

- silence everyone except Host

This action should be one-click and obvious.

### Video Controls

The Host can:

- disable a camera
- spotlight a participant
- switch layout mode
- reserve hide participant from stream as a future concern

### Layout Controls

Even with simple V1 layouts, the Host controls composition.

Examples:

- equal grid
- Host focus
- speaker focus
- guest focus

### Live Chat Controls

For talent-facing prompt flow, the Host can:

- toggle chat visibility
- highlight messages
- clear highlights
- freeze chat display

Moderator assignment remains future scope.

### Participant Controls

The Host can:

- admit participants when waiting room is enabled
- remove a participant
- lock the session against new joins
- rename a participant, optional for V1

Boot behavior:

- recording continues
- upload safeguard activates for the removed participant
- other participants are unaffected

### Streaming Controls

For live sessions, the Host can:

- start broadcast
- stop broadcast
- monitor stream health

Switching platform outputs remains future scope.

### Emergency Actions

These actions must be fast and obvious.

Panic button concept:

- End Session Immediately

This triggers:

- recording stop
- upload mode
- broadcast termination
- safe shutdown behavior

## Host UI Philosophy

Controls should be present but unobtrusive.

Bellows should not become:

- a wall of buttons
- a hidden-menu hunt

Controls must remain accessible without breaking performance flow.

No accidental activation:

- destructive actions require confirmation
- emergency stop is the exception

## Co-Host Capabilities

Co-Hosts act like assistant producers.

Allowed:

- mute participants
- highlight chat
- admit guests
- adjust layout in non-destructive ways
- monitor session state

Not allowed:

- start or stop recording
- end the session
- remove the Host
- change broadcast destination

## Guest Controls

Guests should feel relaxed, not responsible.

Visible guest controls:

- microphone toggle
- camera toggle
- leave session

Everything else stays hidden.

## Host Drop Scenario

If the Host disconnects:

- Bellows preserves recording state
- Bellows promotes the Co-Host to acting Host authority, if a Co-Host is present
- upload safeguards begin when appropriate
- the session may continue or end under the acting Host or engine rules

If no Co-Host is present:

- the session enters degraded mode
- recording preservation remains the priority
- recovery and safe shutdown rules still apply

This behavior prevents authority collapse while preserving session integrity.

## Future: Studio Engineer Role

Bellows may later support a studio Engineer role.

Reserved design intent:

- technical controls only
- invisible to audience
- optional dedicated seat

This role is not required for V1.

## Visibility Rules

Everyone sees:

- recording indicator
- connection status
- participant presence

Only Host and Co-Host see:

- production controls
- chat moderation tools
- broadcast status

No studio-only overlay may appear in recorded output.

## Mental Model

Bellows should feel like:

- a broadcast control room
- a recording studio
- a secure capture system

Bellows should not feel like:

- Zoom plus OBS plus hope

## V1 Success Condition

The Host should never think:

"How do I control this thing?"

The Host should instead feel:

"I know exactly what to do."

## Control Model Mantra

Creators perform. Bellows protects.
