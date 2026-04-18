# HAMMER - Interaction Model Specification

Behavioral Contract for the Editing Workspace  
Derived from Forge Design Session - March 21, 2026

## Purpose

This document defines how Hammer behaves, independent of visual styling or implementation details.

It prevents:

- tool-mode confusion
- hidden state changes
- unexpected layout shifts
- modal workflow traps
- ambiguous authority between panels
- AI/dev improvisation about "what the user probably meant"

Hammer must feel deterministic, professional, and legible at all times.

## 1. Core Interaction Philosophy

Hammer is an editing console, not a wizard, not a dashboard, not a content viewer.

The user is assumed to be:

- intentional
- task-focused
- in control
- working toward a finished artifact

Therefore:

Hammer must behave like equipment:

- actions are explicit
- state is visible
- nothing important happens invisibly
- the system assists but does not hijack
- layout reflects work focus
- authority flows from the canonical composition

## 2. Session Entry Flow

When a user selects a ready-to-edit recording:

### Step 1 - Automatic Ingest Begins

Hammer performs background preparation, including:

- transcript generation
- filler word detection
- retake detection
- audio polish
- visual placement
- timeline construction
- preview readiness

A progress indicator communicates that work is underway.

This behavior is already acceptable and requires no redesign.

### Step 2 - Readiness Briefing Panel

Once ingest completes, Hammer shows a temporary readiness briefing.

This panel must be:

- conversational
- scan-friendly
- short
- actionable
- non-technical
- not a dashboard
- not a permanent UI element

It communicates:

What was done and what is ready.

Example structure:

- Transcript is ready for editing
- Images have been placed
- Audio has been polished
- Timeline is assembled
- Preview is ready

Each item may link to the relevant workspace area.

### Step 3 - Briefing Dismissal

As soon as the user begins working:

- the briefing disappears
- it does not linger
- it does not become a panel
- it is not expected to be reopened

The editor is now the primary environment.

Hammer does not repeatedly remind the user of ingest status.

## 3. No Wizard Model

Hammer does not force a step-by-step flow.

Users may begin anywhere:

- transcript cleanup
- visual placement
- timeline edits
- tool adjustments
- preview verification

There is no mandatory order of operations.

## 4. Focus Model

Hammer supports contextual focus, not modal modes.

Focus determines which work bay expands, not what actions are allowed.

Two primary focus domains:

### Source-focused

User is working with:

- transcript
- assets
- images
- B-roll
- source materials

Result:

- left work bay expands
- right tool bay contracts
- preview remains stable

### Tool-focused

User is working with:

- cleanup tools
- adjustments
- processors
- inspectors
- review panels

Result:

- right tool bay expands
- left work bay contracts
- preview remains stable

Focus does not:

- hide panels
- lock the user into a mode
- change tool availability
- alter canonical composition authority
- move patch bay
- create full-screen states

Focus is emphasis, not restriction.

## 5. Patch Bay Interaction Model

The patch bay selects which tool is active, not where the user is in a workflow.

Selecting a tool:

- updates the right tool bay content
- does not open a modal
- does not navigate away
- does not hide source materials
- does not change timeline behavior

Patch bay interaction is routing, not navigation.

## 6. Composition and Timeline Authority Model

The canonical composition is the authoritative representation of the edit.

The timeline is a temporal projection of that composition.

Timeline controls:

- playback position
- clip order
- clip timing
- gaps
- durations
- layering
- structure

Therefore:

- moving the playhead must update preview immediately
- if a gap exists in the timeline, preview must reflect blank output
- dragging, trimming, or resizing timeline elements must update preview
- preview cannot contradict the composition as projected through the timeline

## 7. Preview Role

The preview is verification, not primary interaction.

Preview allows:

- checking results of edits
- confirming placement
- reviewing transitions
- monitoring timing

Preview does not:

- define the edit structure
- control clip ordering
- own authoritative playback state
- replace the timeline

Controls on the preview are subordinate to the canonical composition and its timeline projection.

## 8. Direct Manipulation Rules

Hammer favors direct manipulation over indirect configuration.

Users should be able to:

- drag timeline elements
- resize clips
- reposition images
- adjust durations visually
- scrub through time

Wherever feasible, edits occur directly on the timeline.

Tool panels exist to assist, not replace manipulation.

## 9. Timeline Zoom and Density Model

Users control how much detail they see.

Horizontal zoom:

- zoom to fit
- zoom to focus
- micro zoom

Vertical density:

- show few tracks
- show all tracks
- expand a specific channel
- compress unused channels

This mirrors focusing on channels of a mixing board.

These adjustments affect visibility, not underlying data.

## 10. Editing Does Not Require Playback

Users must be able to edit without running the video continuously.

Hammer is not a playback-driven editor.

Edits should be precise and deterministic.

## 11. No Hidden Automation Overrides

Automatic features may suggest or prepare changes, but must not silently override the user's intent.

Examples:

- filler cleanup suggestions
- retake tightening
- visual placements
- audio polish

User actions take precedence.

Automation assists, not dominates.

## 12. Tool Activation Model

Tools are persistent utilities, not disposable dialogs.

A tool:

- remains available once selected
- can be revisited instantly via patch bay
- does not reset unexpectedly
- does not vanish after a single action

Hammer avoids fire-and-forget tools.

## 13. State Transparency

Hammer should make it clear:

- what the current edit state is
- what part of the project is being affected
- what tools are active
- where the playhead is
- what will be exported

Ambiguous system state is unacceptable.

## 14. No Modal Lock-In

Critical editing tasks must not trap the user in modal interfaces.

Modals may be used for:

- confirmations
- destructive actions
- short dialogs

They must not become alternate workspaces.

## 15. Error Handling Philosophy

Errors should:

- preserve user work
- explain what failed
- offer recovery options
- not eject the user from the editor

Hammer must never feel fragile.

## 16. Undo Expectations

Editing actions should be reversible where technically feasible.

Undo behavior must be predictable and consistent.

## 17. Export/Handoff Model

Hammer does not finalize the product.

Hammer prepares the workpiece.

When editing is complete:

User initiates a handoff to Quench.

## 18. Handoff to Quench

Handoff represents:

- completion of shaping
- readiness for compilation
- readiness for distribution

Quench performs:

- final assembly
- platform encoding
- short generation
- distribution

Hammer does not embed Quench workflows.

## 19. Persistence Expectations

The canonical composition state should remain intact across sessions.

Users should not fear losing work due to normal navigation or closing the editor.

## 20. Performance Expectations

Interaction must feel responsive enough to support deliberate editing.

Lag that undermines precision is unacceptable.

## 21. Professional Mental Model Alignment

Hammer's interaction model intentionally mirrors professional equipment:

- timeline = control board
- preview = monitors
- patch bay = routing
- tool bay = outboard rack
- source bay = media desk

Users should feel they are operating a system, not clicking through a website.

## 22. Forbidden Interaction Patterns

Hammer must avoid:

- wizard-driven editing
- autoplay takeover behavior
- dashboard clutter during editing
- content-consumption layouts
- hidden mode switches
- disappearing infrastructure
- smart guesses that change structure
- multi-step flows for basic operations

## 23. Implementation Guidance for Codex/Copilot

When adding features:

- Preserve canonical composition authority.
- Treat timeline, transcript, preview, and packets as derived surfaces.
- Do not introduce hidden states.
- Do not modalize core editing.
- Keep patch bay as routing, not navigation.
- Maintain focus model.
- Avoid preview dominance.
- Do not assume a linear workflow.
- Prefer direct manipulation.
- Make state legible.
- Keep Hammer deterministic.

## 24. Canonical Summary

Hammer is the shaping stage.
Hammer edits canonical composition.
Timeline, transcript, preview, export plans, and handoff packets derive from that composition.

It should feel like:

- sitting at a console
- working material directly
- seeing immediate results
- controlling structure deliberately
- preparing something to be finalized elsewhere

Not like:

- filling out forms
- watching content
- following a wizard
- fighting the UI
