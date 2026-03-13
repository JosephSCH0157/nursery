# Bellows V1 Onboarding Flow Doctrine

This document defines the canonical Bellows onboarding flow for V1.

Purpose:

Bellows must earn trust before a single word is recorded.

Core goal:

Remove anxiety faster than the user can feel it.

People launching a remote session are already worried about:

- tech failing
- guests struggling
- sound issues
- looking unprofessional
- losing the recording

Bellows must neutralize that anxiety immediately.

## Guiding Principle

Setup should feel like preparing a studio, not configuring software.

Bellows must avoid:

- jargon
- wizard fatigue
- technical dead ends

## Phase 1: Opening The Bellows Tool

Audience:

- Host

Emotional target:

"Oh... this is simpler than I expected."

Screen:

- Session Setup Console

All important information should be visible without scrolling.

Required inputs should remain minimal:

- session title, optional but encouraged
- destination
- participant count
- script selection, optional
- scheduled time, optional

Supported destination examples:

- YouTube
- Rumble
- local recording only

### Design Rules

Bellows must avoid configuration labyrinths.

If something can default safely, it should default automatically.

Bellows must avoid irreversible decisions before recording starts.

Everything should remain editable until recording begins.

Labels must be plain language.

Avoid:

- RTMP endpoint
- bitrate profile

Prefer:

- Where are you broadcasting?
- How many people are joining?

## Phase 2: Preflight Check

When the Host clicks Continue, Bellows runs silent diagnostics.

Bellows should check:

- camera availability
- microphone availability
- storage permission
- network viability
- browser compatibility

### Result Presentation

Bellows should not show a technical report.

Instead, results should be framed as simple human states:

- Ready to record
- Needs attention
- Cannot proceed

Example helpful copy:

- Your microphone is not selected.

### Critical Rule

Bellows must never blame the user.

The tone must remain:

- calm
- helpful
- non-technical

## Phase 3: Invite Distribution

The Host receives:

- secure session link
- copy button
- future email send option

Primary message:

"Guests don't need to install anything."

This message should be highly visible because it reduces Host anxiety quickly.

## Phase 4: Guest Join Experience

The guest flow must be radically simpler than the Host flow.

Guest steps:

1. Open link.
2. Enter display name.
3. Approve camera, microphone, and storage permissions.
4. Enter session.

That is all.

Guests should not need:

- accounts
- downloads
- a settings maze

## Phase 5: Waiting Room / Green Room

Participants should see:

- who is present
- their own camera preview
- audio meter
- connection indicator

Tone:

Professional but calm.

This is not a lobby and not a social space.

It is a studio green room.

Optional Host controls may include:

- admit participants
- remove participants
- adjust layout
- confirm readiness

## Phase 6: Recording Countdown

When the Host starts recording, Bellows should present a visible and audible countdown.

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

Bellows should include a sync signal for post alignment.

Possible forms:

- short tone
- visual flash
- optional spoken cue

## Phase 7: Live Recording State

After countdown:

- setup disappears
- the studio remains

Bellows should present:

- no clutter
- no surprises
- only performance-relevant information

Participants should focus on performing.

## Phase 8: Post-Recording Upload State

Bellows transitions automatically after recording ends.

Clear message example:

"Recording complete. Uploading your tracks."

Visible progress should show:

- per-participant progress
- overall session progress

### Safe-To-Leave Gate

Until upload completes:

- close attempts should show warning
- a persistent banner should remain visible
- the tone should stay calm

## Final State: Safe To Close

When finished, Bellows should say:

"All recordings secured. It is safe to close this window."

This message must be unmistakable.

## Emotional Journey Map

Bellows should guide the Host through:

- curiosity
- relief
- confidence
- focus
- control
- assurance
- closure

If any phase creates panic, confusion, or doubt, the onboarding flow is broken.

## Anti-Patterns Bellows Avoids

Bellows should avoid:

- OBS-style chaos
- Riverside-style uncertainty
- Zoom-style ambiguity

Examples of what that means:

- no sliders, panels, sources, and scenes overload
- no unclear local-recording truth
- no ambiguity about whether capture actually happened

## Success Metric

After first use, the Host should think:

"I don't have to worry about recording anymore."

Bellows must not leave the Host thinking:

"I hope that worked."

## V1 Non-Goals

The following are not required at launch:

- fancy layouts
- branding tools
- automation
- social features
- analytics dashboards

Trust comes first.

## Onboarding Mantra

Make the creator feel like a professional before they say a word.
