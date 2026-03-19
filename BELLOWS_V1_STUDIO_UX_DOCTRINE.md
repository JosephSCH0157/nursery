# Bellows V1 Studio UX Doctrine

This document defines the canonical human-facing behavior doctrine for Bellows V1.

It governs how Bellows must behave from the operator's perspective during:

- setup
- live performance
- failure conditions
- completion

This doctrine overrides aesthetics, novelty, and engineering convenience.

Core goal:

Bellows must feel safe to use when the stakes are real.

## Primary Doctrine

Bellows behaves like a studio, not software.

## Foundational Identity

Bellows is not:

- a meeting app
- a streaming dashboard
- a video chat tool
- a social platform
- a creative suite
- an embedded widget

Bellows is:

- a remote production studio

The interface should evoke equipment, not generic software.

## Top-Level Surface Doctrine

Bellows must run as its own top-level application surface.

Bellows must not run inside:

- an iframe
- an embedded panel
- an inline dashboard tile
- a nested tool shell pretending to be the studio

Bellows may be launched from Forge, but entering Bellows means entering Bellows proper.

This protects:

- camera and microphone permission reliability
- local recording and storage behavior
- leave-page and safe-to-close warnings
- full-screen studio presence
- trust and security expectations

## Design Laws

### 1. Control Without Chaos

Bellows should present powerful capabilities simply.

### 2. Focus Preservation

Nothing should interrupt performance unnecessarily.

### 3. Trust Over Features

Reliability beats novelty.

### 4. Calm Under Stress

Bellows must not induce panic through UI behavior.

### 5. Professional Tone

Bellows should feel:

- professional
- calm
- clear

Bellows should not feel:

- playful
- corporate
- sterile

### 6. Invisible Technology

The best compliment Bellows can receive is:

"It just worked."

## Prime Directive

The user must never wonder whether their show is being safely recorded.

If that condition is violated, the UX has failed regardless of feature completeness.

## Human Reality Principle

During a live show, the Host is:

- performing
- thinking about content
- monitoring guests
- managing timing
- managing audience interaction
- operating under cognitive load

Therefore, Bellows must demand as little attention as possible once live.

## Phase Separation Doctrine

Bellows operates in three distinct mental modes.

### 1. Setup = Planning Mode

Users may think, configure, and adjust.

The UI may expose options.

Mistakes are cheap.

### 2. Live = Performance Mode

Users are on stage.

The UI must:

- minimize decisions
- minimize motion
- maximize certainty
- avoid surprises

Setup controls must disappear or lock.

### 3. Post = Protection Mode

Users want reassurance.

The UI must communicate:

- upload status
- safety of recordings
- next actions
- when it is safe to leave

## Recording Truth Visibility

Recording state must always be obvious.

It must not be:

- implied
- subtle
- hidden in menus

Indicators must be:

- persistent
- unambiguous
- non-dismissable
- visible to all participants

## No Silent Failure Rule

Bellows must never fail quietly during Live mode.

If something important changes, the Host must be informed calmly and clearly.

Examples:

- connection loss
- broadcast drop
- participant disappearance
- storage risk

## Calmness Doctrine

Warnings must:

- inform, not alarm
- avoid technical jargon
- avoid blame language
- emphasize safety first

Bad example:

"ERROR: WebRTC transport failure"

Good example:

"Connection lost - recording continues locally."

## Host Primacy

The interface prioritizes the Host.

The Host view may contain controls hidden from others.

Participants see simplified views.

Guests should feel like they are on set, not piloting the system.

## Pane Stability Rule

Participant panes must not:

- jump
- resize unexpectedly
- reorder suddenly
- obscure faces
- disappear without explanation

Visual stability creates psychological stability.

## Overlay Non-Contamination Rule

Anything shown only to talent must never appear in:

- recordings
- broadcasts
- exports

This includes:

- scripts
- warnings
- chat prompts
- status bars
- internal controls

Bellows must separate studio information from program output.

## Script Presentation Doctrine

If a script is present:

- it supports performance
- it must not dominate attention
- it must not critically obscure speakers
- it must behave predictably

The model is subtitles, not teleprompter takeover.

## Audience Prompt Doctrine

Audience input is advisory, not authoritative.

Audience prompts must:

- support the Host
- be ignorable
- never interrupt speaking flow
- never demand response

Bellows helps talent notice the audience without surrendering control.

## Mid-Show Complexity Ban

During Live mode, Bellows must not ask the Host to:

- configure devices
- choose technical options
- interpret diagnostics
- resolve conflicts
- restart components

All complexity belongs either in Setup or in automatic handling.

## Safety Over Cleanliness

If forced to choose between:

- a clean interface
- a visible safety signal

Bellows must choose safety.

Persistent warnings are preferable to hidden risk.

## Safe-To-Close Guarantee

When Bellows says:

"Safe to close"

that must be a promise, not a suggestion.

Before that moment:

- exit should be discouraged
- risks should be explained
- data preservation must be prioritized

## Guest Experience Doctrine

Guests should require zero training.

Joining should feel like:

"Click link -> allow mic/camera -> you're on set."

Guests should never see system internals.

## Cognitive Load Minimization

Bellows should reduce mental effort by:

- grouping related information
- avoiding flashing elements
- minimizing moving parts
- using consistent layouts
- avoiding modal interruptions during Live mode

## Equipment Illusion Principle

Bellows should feel like:

- a console
- a switcher
- a recording deck
- studio hardware

Bellows should not feel like:

- a web form
- a productivity tool
- a social interface

## UX Benchmark

Bellows should feel closer to:

- a broadcast console
- a recording booth
- a studio control room

than to:

- meeting software
- a consumer app
- a web dashboard

## Predictability Doctrine

Users must be able to rely on muscle memory.

Same actions should produce the same results every time.

Surprise creates distrust.

## No Hidden Critical Controls

Critical actions must be:

- deliberate
- visible
- reversible when possible
- protected from accidental activation

## Broadcast Vs Recording Clarity

Users must always know:

- whether they are recording
- whether they are live
- whether broadcast failed but recording continues

These are separate truths and must not be conflated.

## Completion Reassurance

After recording ends, Bellows should transition from production tool to data guardian.

The interface should reassure users that their work is safe.

## Canonical UX Principle

Bellows protects the show first, the user second, and the interface last.

## Canonical Experience Goal

After using Bellows once, creators should stop worrying about recording forever.

## V1 Acceptance Criteria

The Studio UX Doctrine is satisfied only when all of the following are true:

- a first-time Host can run a show without training
- guests can join with minimal friction
- recording status is never ambiguous
- failures do not induce panic
- overlays never contaminate output
- users trust the safe-to-close signal
- the interface fades into the background during performance

## Doctrine Role

This doctrine should influence:

- layout decisions
- component design
- copywriting
- animation rules
- accessibility
- onboarding
- error handling
- testing priorities
- feature triage

It is a compass, not a feature list.
