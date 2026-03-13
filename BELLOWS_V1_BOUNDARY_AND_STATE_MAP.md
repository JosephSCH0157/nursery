# Bellows V1 Boundary And State Map

This document defines the canonical package boundary and the user-visible state model for Bellows V1.

Bellows is the live studio and capture orchestrator for remote shows inside Podcaster's Forge.

## Package Boundary

### Canonical Role

Bellows owns live session orchestration for remote shows.

That means Bellows is responsible for the real-time studio experience of a multi-location session:

- pre-show setup
- participant joining
- role-aware live session composition
- live broadcast initiation to supported platforms
- local-first remote capture coordination
- session-state signaling during the show
- safeguard/upload completion flow after recording stops
- session-level metadata needed to hand clean assets to downstream tools

Bellows is the live studio and capture orchestrator.

It is not the writer, not the editor, not the asset vault, and not the teleprompter authority.

### What Bellows Owns

#### 1. Session Creation And Authority

Bellows owns:

- live session creation
- host authority model
- invite link generation
- role assignment for session participants
- participant admission and removal
- session start and end rules
- host-disconnect termination behavior

#### 2. Pre-Show Setup

Bellows owns the host-facing setup workflow for:

- stream targets
- record-only vs live mode
- participant count and roles
- script selection reference
- audience prompt source selection
- readiness/device checks
- live show metadata needed for start

#### 3. Remote Join Flow

Bellows owns participant join behavior:

- secure role-linked session links
- mic/camera permission acquisition
- local device recording readiness
- pre-show waiting/readiness state

#### 4. Live Studio Runtime

Bellows owns the on-air session experience:

- multi-pane participant canvas
- participant presence state
- live session status indicators
- role-aware audience prompt visibility
- optional subtitle-style script strip display
- host-only operational actions during show

#### 5. Local-First Capture Orchestration

Bellows owns the orchestration of:

- per-participant local recording start
- sync cue/countdown behavior
- chunked upload during session
- safeguard mode on stop/disruption
- safe-to-close confirmation

#### 6. Broadcast Connection Layer

Bellows owns:

- authenticated platform connection
- starting/stopping live transmission to supported destinations
- multi-destination broadcast selection for supported platforms
- high-level go-live lifecycle

Bellows does not need to expose encoder jargon or OBS-style controls in V1, but it does own the "go live from here" behavior.

#### 7. Session Handoff Package

Bellows owns creation of the session output envelope handed downstream:

- participant track references
- role mapping
- sync metadata
- session events
- completeness flags
- broadcast/session summary metadata

### What Bellows Does Not Own

#### Bellows vs Anvil

Anvil owns:

- teleprompter behavior
- script reading authority
- pacing/read-progress authority
- spoken-performance reading UX
- full script display and reading ergonomics
- recording-oriented presenter guidance for in-studio use

Bellows may:

- display a limited subtitle-style script strip
- show role-aware performable text excerpts
- reflect script context already chosen upstream

Bellows must not:

- become a full teleprompter
- allow script editing
- own script progression semantics as the primary authority
- expose full Anvil reading controls

Boundary sentence:

Bellows may surface script awareness, but Anvil remains the canonical script-performance interface.

#### Bellows vs Hammer

Hammer owns:

- editorial assembly
- sync interpretation and fine correction
- timeline editing
- cut decisions
- reframing
- source selection in post
- final visual composition
- export/editing workflows

Bellows owns:

- live session composition
- clean isolated source capture
- session-time pane model
- sync cue generation
- session metadata and handoff integrity

Bellows must not:

- become an editor
- expose timeline manipulation
- promise frame-accurate final composition
- replace Hammer's post-production judgment

Boundary sentence:

Bellows captures the show and defines live session structure; Hammer determines final editorial construction.

#### Bellows vs Tongs

Tongs owns:

- canonical persistence
- asset storage
- session/workpiece linkage
- metadata durability
- file references
- archive/retrieval
- cloud-side canonical record of completed artifacts

Bellows owns:

- runtime session state
- in-session orchestration
- temporary live operational data
- upload progress logic
- completion signaling before persistence finalization

Bellows must not:

- become the storage authority
- define canonical long-term asset layout independently
- own archival policy
- own cross-tool persistence contracts by itself

Boundary sentence:

Bellows runs the live session; Tongs remains the canonical home of Bellows outputs and associated metadata.

#### Bellows vs Hearth

Hearth owns:

- script generation
- editorial shaping
- creative drafting
- research-supported content development

Bellows may:

- consume a selected script reference
- show a limited performer-facing excerpt

Bellows must not:

- draft or revise show content
- become a writing surface

#### Bellows vs Quench

Quench owns:

- publishing workflows after the fact
- distribution metadata finalization
- multi-platform upload/scheduling for completed assets
- release packet execution

Bellows owns:

- live transmission during performance
- in-session broadcast state only

Boundary sentence:

Bellows handles going live now; Quench handles publishing finished work later.

### Package Boundary Law

If a feature answers one of these questions, it likely belongs to Bellows:

- How does the live remote session start, run, and end?
- How do participants join and perform together right now?
- How do we safely capture each participant during a live or record-only session?
- How does the host go live without leaving the studio?

If it answers one of these questions, it likely does not belong to Bellows:

- How is the script written or edited?
- How is the final episode cut?
- Where is the asset canonically stored long-term?
- How is a finished release packaged and distributed later?

## Screen / State Map

Bellows V1 should be treated as a finite set of major user-visible states:

- Host Setup
- Participant Join
- Pre-Show Ready
- Go-Live / Start Transition
- Live Studio
- Participant Safeguard
- Global Safeguard
- Session Complete

You can think of them as two lanes:

- Host lane
- Participant lane

with shared live-session states in the middle.

### 1. Host Setup Screen

Purpose:

The single pre-show control surface where the host configures the session before anything goes live.

Visible to:

Host only.

Contains:

- show title / optional metadata
- mode selection:
- live to YouTube
- live to Rumble
- multi-platform live
- record-only
- participant count
- role assignment slots:
- host/S1
- S2
- G1
- G2 as allowed by V1 cap
- regular participant picker
- invite link generation/copy controls
- script selection
- audience prompt source selection
- camera/mic preview and readiness checks
- readiness status for participants as they join
- primary CTA: Start Show

Forbidden here:

- active on-air UI clutter
- editing timeline controls
- teleprompter-style full script experience
- post-production functions

Exit condition:

Host clicks Start Show and required readiness conditions pass.

### 2. Participant Join Screen

Purpose:

Simple entry flow from secure link.

Visible to:

Invited participant.

Contains:

- session identity / title
- assigned role display
- name confirmation if needed
- mic permission request
- camera permission request
- local recording/storage readiness messaging
- local preview
- join/ready CTA

Behavioral rule:

This screen should be simple enough for a non-technical guest using a phone.

Exit condition:

Participant becomes ready and enters pre-show waiting/ready state.

### 3. Pre-Show Ready Screen

Purpose:

Holding state after join, before show start.

Visible to:

Host and connected participants.

Host sees:

- participant readiness list
- role assignments
- live preview of who is connected
- final readiness indicators
- start-show CTA

Participants see:

- connected session preview
- readiness confirmation
- waiting for host to start status
- top persistent instruction banner as needed

Optional script behavior:

No scrolling script yet, or only a minimal preloaded state. Keep it quiet.

Exit condition:

Host starts the show.

### 4. Go-Live / Start Transition

Purpose:

Short transition from ready state into active show state.

Visible to:

All connected participants.

Contains:

- brief countdown
- sync cue
- transition to live state
- platform start initiation if live mode is selected
- recording start initiation

Rules:

- no user choices here
- no extra controls
- this is a mode-change bridge, not a configurable screen

Exit condition:

Broadcast and/or recording successfully enter active state.

### 5. Live Studio Screen

Purpose:

Primary on-air performance surface.

Visible to:

All active participants, with role-based differences.

Shared core elements:

- persistent top status banner
- multi-pane session canvas
- participant presence indicators
- minimal live status indicators
- no setup controls

Pane model:

- 1 participant: full frame
- 2 participants: split
- 3 participants: stable three-pane composition

Script strip:

If a script is associated:

- appears as subtitle-style lower strip
- read-only
- no edit controls
- no full teleprompter UI
- never baked into recorded media

Audience prompt visibility:

Host / co-host see:

- curated audience prompt panel/feed
- ability to highlight one item

Guest sees:

- only highlighted prompt(s), not raw feed

Host-only controls in live studio:

Keep this very small:

- end show
- boot participant
- highlight prompt
- maybe mute/hide operational actions later if needed

Absolutely forbidden in live studio:

- platform switching
- role reassignment
- script swapping
- settings panels
- timeline/editor controls
- complex stream controls

Exit conditions:

- host ends session
- host disconnects
- participant disconnects individually
- catastrophic runtime failure requiring safeguard

### 6. Participant Safeguard Screen

Purpose:

Protect an individual participant's media when that participant leaves or drops while the wider session may continue.

Visible to:

Only that affected participant.

Trigger examples:

- participant closes window
- participant disconnects
- participant is booted
- participant voluntarily leaves mid-recording

Contains:

- clear securing your recording state
- progress bar from 0-100
- warning to keep window open
- safe-to-close message when complete

Rule:

This state is participant-scoped unless host/session authority ends globally.

Exit condition:

Upload protection completes or user abandons the page.

### 7. Global Safeguard Screen

Purpose:

Protect all participant media when the session ends or host authority is lost.

Visible to:

All connected participants.

Triggers:

- host ends show
- host disconnects
- global recording stop
- session collapse event

Contains:

- session ended / securing recordings messaging
- green upload completion bar
- keep-window-open warning
- safe-to-close state at 100%

Rule:

This is the canonical end-of-recording protection flow.

Exit condition:

All participant-local safeguards complete from each participant's perspective.

### 8. Session Complete Screen

Purpose:

Final calm terminal state after recording is secure.

Visible to:

Per user after their safeguard completes.

Contains:

- success confirmation
- safe to close
- optional return action for host
- no technical clutter

Host version may additionally show:

- session secured
- handoff pending/complete status at high level
- no editing UI yet

Exit condition:

User closes window or returns to Bellows home/setup area.

## State Transition Summary

Host path:

Host Setup
-> Pre-Show Ready
-> Go-Live Transition
-> Live Studio
-> Global Safeguard
-> Session Complete

Participant path:

Participant Join
-> Pre-Show Ready
-> Go-Live Transition
-> Live Studio
-> either Participant Safeguard or Global Safeguard
-> Session Complete

## Key State Laws

### Law 1: Setup And Live Are Separate Worlds

Anything configurable belongs before start.
Anything visible during live should support performance only.

### Law 2: Safeguard Is Not Optional

If recording has happened, Bellows must prefer media protection over quick exit.

### Law 3: Host Authority Governs The Session

If host ends or disappears, live session ends for all.

### Law 4: UI Overlays Are Never Source Media

Status bars, prompts, script strips, and warnings do not burn into captured media.

### Law 5: Bellows Is Capture-First, Not Call-First

Everything should bias toward preserving usable recordings.
