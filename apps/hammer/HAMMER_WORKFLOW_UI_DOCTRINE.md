# HAMMER - Canonical Workflow and UI Architecture Specification

Derived from Forge Design Session - March 21, 2026
Version: v1

## 1. Purpose

Hammer is not:

- a media player
- a recording tool
- a compiler
- a distribution engine

Hammer is:

A professional editing suite that shapes raw recordings into polished stems.

Anvil records.
Hammer edits.
Quench compiles and distributes.

Hammer has one editorial source of truth: the canonical composition.
Transcript, timeline, preview, tool state, export plans, and handoff packets are derived from that composition.

## 2. Forge Pipeline Position

Bar Stock -> Hearth -> Tongs -> Anvil -> Hammer -> Quench -> Ledger

### Hammer Output

Hammer produces:

- Edited timeline structure
- Clean dialogue
- Visual placements
- Audio polish
- Metadata for compilation
- Exportable stems

Hammer does not produce:

- Final encoded deliverables
- Shorts
- Platform uploads
- Publishing actions

Those belong to Quench.

## 3. User Mental Model

Hammer emulates a professional studio.

| Real Studio | Hammer Equivalent |
| --- | --- |
| Mixing console | Timeline |
| Studio monitors | Preview |
| Patch bay | Tool selector |
| Rack gear | Active tool panel |
| Track sheets | Transcript/assets |

This metaphor is intentional and must remain consistent.

## 4. Splash Page Behavior

Current state: approved.

Required change:

When recordings exist:

- Show a thumbnail preview for each recording.

No other redesign required.

## 5. Automatic Ingest Phase

### Trigger

User selects a ready-to-edit recording.

### Behavior

System performs background preparation:

- Transcription
- Audio polish
- Visual placement
- Timeline assembly
- Asset linking

A progress indicator (Forge wheel/waiting bar) is displayed.

Status: approved.

Existing progress UI is acceptable.

## 6. Post-Ingest Entry Panel

### Current Problem

Existing popup is:

- fragmented
- box-heavy
- unclear in state communication
- cognitively expensive

### Required Replacement

A conversational readiness panel.

### Required Content Format

Plain-language summary of system work completed.

Example:

- Transcript is ready for editing.
- Images have been placed on the timeline.
- Audio has been professionally polished.

Each item must be:

- clickable
- launches relevant tool
- no technical jargon
- no deep reading required

### Tool Prioritization

Automatic editing tools are primary:

- Polish (AI cleanup)
- Visual review
- Manual transcript editing (fallback)

Manual editing is supported but not emphasized.

### Panel Lifecycle

The readiness panel:

- appears once after ingest
- disappears after the user chooses a path
- is not recallable
- does not persist as UI clutter

## 7. Core Editor Layout

Hammer uses a three-zone working surface plus fixed structures.

### 7.1 Top Region - Adaptive Panels

- Left panel
- Center panel
- Right tool panel

### 7.2 Left Panel - Source Workspace

Contains tabbed views:

- Transcript
- Images
- Assets
- B-roll
- Other source materials

Focus behavior:

When the user interacts with this panel, it becomes the primary workspace.

- Expands to occupy more horizontal space
- Indicates editing focus
- Enables detailed manipulation

### 7.3 Center Panel - Preview

Purpose:

Validation, not consumption.

The preview exists to confirm edits, not to watch content.

Required constraints:

- Bounded size
- Stable footprint
- Does not dominate screen
- Does not auto-expand excessively

The preview should behave like studio monitors:

Always visible, never the main tool.

### 7.4 Right Panel - Active Tool Rack

This panel displays the currently selected tool's controls.

Examples:

- Polish controls
- Visual placement tools
- Audio adjustments
- Metadata editors

Behavior:

- Changes based on selected tool
- Always present
- Shares space adaptively with left panel
- Does not disappear

## 8. Fixed Right Toolbar (Patch Bay)

This is the tool selector, not the tools themselves.

Characteristics:

- Docked to far right
- Full vertical height of page
- Never clipped by other UI elements
- Never auto-hidden
- Persistent across all editor states

Function:

Selecting an item here changes the contents of the active tool panel.

It does not:

- resize the layout drastically
- push panels off-screen
- open modal workflows

## 9. Bottom Region - Timeline (Console)

Concept:

The timeline is the primary control surface.

The timeline is the board.

Spatial rules:

- Extends across the screen
- Stops at the right toolbar boundary
- Does not overlap or hide the toolbar
- Occupies bottom region only

## 10. Timeline Capabilities

### Horizontal Behavior

Standard timeline navigation:

- Scrubbing
- Playhead movement
- Segment arrangement

### Vertical Channel Visibility

User can expand or collapse visible tracks.

Examples:

- Minimal: dialogue and video
- Expanded: full multi-track view
- Custom combinations

### Zoom Modes

- Zoom to fit
- Zoom to focus
- Micro precision zoom

Studio analogy:

Zooming equals leaning into a console channel to adjust parameters.

## 11. Composition Authority Over Timeline and Preview

The canonical composition is the source of truth.

The timeline is the temporal control surface projected from that composition.
The preview is a verification surface projected from that composition.

If timeline shows:

- a cut -> preview shows the cut
- a gap -> preview shows blank space
- repositioned media -> preview updates accordingly

The preview never overrides the timeline.

## 12. Timeline Media Manipulation

Media items must support:

- Drag to reposition
- Resize to change duration
- Visual alignment feedback
- Direct manipulation without modal dialogs

## 13. Panel Focus Mechanics

Adaptive resizing behavior:

| User Focus | Result |
| --- | --- |
| Left panel | Expands |
| Tool panel | Expands |
| Preview | Mostly constant |

The system prioritizes editing surfaces over viewing surfaces.

## 14. Export Philosophy

Hammer does not finalize media.

Hammer prepares work for Quench.

## 15. Hammer Output (Pre-Quench State)

When editing is complete, Hammer produces:

- Structured timeline
- Cleaned audio tracks
- Visual placements
- Metadata
- Editable project package
- Exportable stems

## 16. Quench Role

Quench performs:

- Final compilation
- Encoding
- Short generation
- Distribution
- Platform publishing

## 17. Forge Metaphor Mapping

| Forge Stage | Meaning |
| --- | --- |
| Hammer shaping | Editing process |
| Quenching | Final compilation |
| Sharpening | Optimization/encoding |
| Distribution | Deployment |

The metaphor is coherent and intentional.

## 18. Design Principles (Non-Negotiable)

### 18.1 Editing-First Philosophy

Hammer is not a playback environment.

Editing tools take precedence over viewing comfort.

### 18.2 Stability Over Flash

Persistent structures:

- Patch bay
- Timeline
- Preview anchor
- Workspace panels

Avoid dynamic rearrangements that disorient the user.

### 18.3 Conversational System Feedback

Status messages must be human-readable.

Avoid technical dashboards during editing.

Clear system communication reduces cognitive load.

### 18.4 Single Source of Truth

Canonical composition governs media state.

Avoid multiple conflicting representations.

## 19. Current Status Assessment

Based on discussion, Hammer is:

- Functionally promising
- Structurally incomplete
- UI-inconsistent
- Dev-centric
- Not yet production-usable

## 20. Implementation Priority

Before adding features:

Lock structure, then refine visuals.

UI built without workflow grounding risks fragmentation and maintenance issues.
