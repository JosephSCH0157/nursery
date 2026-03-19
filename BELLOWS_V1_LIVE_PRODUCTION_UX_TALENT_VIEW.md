# Bellows V1 Live Production UX Talent View

This document defines the canonical participant-facing live production experience for Bellows V1.

Purpose:

Describe what talent experiences moment-to-moment during the show.

Core principle:

Performers should forget the software exists.

If talent is thinking about the tool, the tool has failed.

## The Bellows Talent Experience

Bellows should not feel like:

- a dashboard
- a meeting app
- a UI playground

Bellows should feel like:

- a studio window

## Pre-Show: Green Room State

Before recording starts, participants should see:

- their own camera preview
- other participants, if present
- microphone activity meter
- camera toggle
- microphone toggle
- connection indicator
- Host status, such as Waiting for host

Tone:

- professional
- calm
- not social
- not playful
- not corporate

Psychological goal:

Reduce awkwardness.

Silence should feel normal rather than uncomfortable.

## Countdown State

When the Host starts recording, Bellows should show a full-screen countdown overlay.

The countdown should be:

- clear
- dramatic
- impossible to miss

Example:

```text
Recording begins in
5
4
3
2
1
● REC
```

### Sync Signal

Bellows should emit a visual flash and tone at countdown start or completion.

All participants should receive the same timing cue.

## Live Recording State

Once recording begins, everything extraneous disappears.

The screen becomes a focused performance surface.

### Participant Panes

Bellows should show one to three large video panes depending on session composition.

Rules:

- no clutter
- no tiny thumbnails
- no busy grid unless required by participant count

### Script Subtitle Band

If enabled, Bellows may show a script band at the bottom of the screen.

The script band should be:

- scrolling
- readable at distance
- teleprompter-like in pacing
- subtle rather than dominant

It should support performance without taking over the screen.

### Persistent Top Banner

If applicable, Bellows may show a thin persistent non-recorded banner such as:

- Recording in progress - do not close this window

This banner should be:

- calm
- thin
- always visible
- never recorded into media

### Recording Indicator

Bellows should show an unmistakable recording indicator that is not obnoxious.

Example:

```text
● REC   00:18:32
```

## What Is Not On Screen

Bellows must resist over-helping during recording.

The talent view should avoid:

- control clutter
- production dashboards
- chat spam unless explicitly enabled
- technical stats overload

Talent should feel like they are on camera, not trapped in software.

## Live Chat Overlay

For live shows, audience prompts may be visible only to Host and Co-Host unless intentionally shared.

Default behavior:

- collapsed or subtle
- does not dominate the screen
- scrolls smoothly
- does not spam notifications

### Highlight Behavior

When the Host or Co-Host highlights a message:

- it appears clearly for talent
- guests see content only
- moderation UI stays hidden
- nothing is burned into the recording

## Visual Composition Philosophy

Bellows should feel like:

- a TV control room view simplified for humans

Bellows should not feel like:

- a Zoom grid with accessories

## Audio Experience

Participants should hear:

- clean audio mix
- no echo
- no UI sounds during recording
- no system noise bleed

All cues should occur before recording or outside captured audio when possible.

## Layout Adaptation

Bellows should adapt automatically by participant count.

Examples:

- 1 participant: single full-frame view
- 2 participants: balanced split
- 3 participants: optimized tri-layout

No manual rearranging should be required for baseline use.

## Disruption Notifications During Recording

If something goes wrong, notifications should be:

- minimal
- calm
- non-blocking
- non-recorded

Example:

- Guest connection unstable

Bellows must avoid flashing warnings or panic-inducing overlays.

## Flow Preservation Doctrine

Nothing in the live talent view should:

- steal focus
- interrupt speech
- obscure faces
- cause panic

## Recording Stop State

When the Host stops recording, the live UI should fade into upload mode.

Participants should immediately see a message such as:

- Recording complete. Securing files...

## Upload State

During upload, Bellows should show green progress bars to all participants.

Visible progress should include:

- per-participant progress
- overall session progress

The progress phase begins when:

- the Host ends the session
- the Host leaves and shutdown begins
- a participant disconnects and safeguard activates
- the session transitions into upload mode

## Close Attempt During Upload

If a user attempts to close the window during upload, Bellows should show a warning such as:

- Please wait until upload completes to avoid data loss.

Bellows cannot always fully prevent exit, but it must strongly discourage it.

## Safe-To-Close State

The final message should be unmistakable:

- All recordings secured. It is safe to close this window.

This moment should feel like relief.

## Emotional Arc

Bellows should guide participants through:

- preparation
- focus
- performance
- release
- assurance

If anxiety appears anywhere in that arc, the talent UX needs refinement.

## V1 Success Condition

After a session, guests should say:

- That was easy.

They should not say:

- What platform was that?

## Canonical Insight

Great studio gear disappears.

The performer feels present.
The audience feels authenticity.
The technology fades into the background.

Bellows should achieve that same invisibility.
