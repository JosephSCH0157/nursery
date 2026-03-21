# 🔨 Hammer — Canonical Scope

## Purpose

Hammer is the Forge editing suite.

It transforms raw recordings into a coherent, polished edit ready for compilation and distribution. Hammer shapes the content but does not finalize or publish it.

Hammer operates after recording (Anvil) and before compilation and distribution (Quench).

## Pipeline Position

Anvil -> Hammer -> Quench

- Anvil captures raw material.
- Hammer shapes and refines the material.
- Quench compiles, generates derivatives, and distributes.

Hammer produces a finished edit, not a finished product.

## Responsibilities

Hammer is responsible for:

- Structural editing of recorded content.
- Removal of mistakes, retakes, and filler.
- Placement of visuals and supporting media.
- Timing and narrative coherence.
- Audio cleanup and polish.
- Preparation of a distribution-ready project package.
- Non-destructive editing workflows.
- Maintaining a single authoritative timeline.

Hammer outputs an editable master project that Quench can compile into final deliverables.

## Non-Responsibilities

Hammer explicitly does not:

- Encode final media for distribution.
- Upload content to platforms.
- Generate platform-specific deliverables.
- Schedule releases.
- Manage analytics.
- Perform final mastering or distribution tasks.
- Replace the recording stage.

These responsibilities belong to Quench and Ledger.

## Editing Model

Hammer uses a timeline-driven editing model.

The timeline is the authoritative representation of the content.

All playback, preview, and editing operations derive from the timeline state.

## UI Conceptual Model

Hammer's interface represents a production control surface rather than a document editor.

### Timeline (Control Board)

Located along the bottom of the workspace.

- Represents the structure of the content over time.
- Supports zooming, density changes, and track visibility.
- Directly controls playback position and preview output.
- Gaps in the timeline produce gaps in playback.

The timeline is the primary authority for what the content is.

### Preview (Monitors)

Displays the current output of the timeline.

- Has no independent authority.
- Used to verify results, not to control editing.
- Size is bounded and stable.

### Left Workspace (Source Desk)

Provides source material for editing decisions.

Typical contents include:

- Transcript.
- Images.
- Assets.
- B-roll.
- Supporting materials.

### Right Patch Bay (Tool Selector)

Permanent vertical rail.

- Full height.
- Always visible.
- Selects editing tools.
- Does not perform processing itself.
- Never scrolls or disappears.

### Right Tool Workspace (Outboard Rack)

Displays the active tool selected from the patch bay.

- Used for processing, cleanup, analysis, and adjustments.
- Changes content based on selected tool.
- Remains within the fixed editor frame.

### Editor Frame

Hammer uses a fixed workspace frame.

- Not a scrolling webpage.
- Panels adjust within the frame.
- Focus may shift between panels.
- Global layout remains stable.

## Ingest Handoff

When a recording is opened:

- Hammer performs automatic preparation.
- The user receives a brief conversational summary of what was done.
- The summary links to relevant tools.
- The summary disappears once editing begins.
- It is not intended to be revisited.

## Handoff to Quench

Hammer does not produce distributable media.

Instead, Hammer sends the completed edit to Quench.

Quench:

- Compiles the project into final outputs.
- Generates derivatives (such as shorts).
- Distributes the content.

## Editing Philosophy

Hammer emphasizes:

- Non-destructive workflows.
- Clear authority of the timeline.
- Predictable behavior.
- Stability over spectacle.
- Professional production concepts.
- Separation of creative shaping from technical delivery.

## Terminology

- Hammer shapes the workpiece.
- Quench sets the workpiece.

## 🧭 What We Do Next (Important)

Now that the canon exists, the next deliverable should be:

🔧 **HAMMER LAYOUT IMPLEMENTATION RULES**

This will convert the philosophy into enforceable constraints like:

- Editor must occupy full viewport height.
- No vertical scrolling in the main workspace.
- Right patch bay must be fixed, full height.
- Timeline must be bottom-anchored.
- Preview size limits.
- Panel focus behavior.
- etc.

That becomes the Codex marching-orders doc.

## 🏁 Why this step matters so much

From now on:

If something feels wrong, you do not argue taste - you check scope.

"Does this violate the canonical model?"

If yes -> change the code, not the doctrine.