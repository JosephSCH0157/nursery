# Hammer UI Manifest

## Canonical User Interface Layout and Editor Flow

This document defines the canonical user interface layout and workflow for the Hammer editor inside Podcasters Forge.

Hammer is a transcript-first editing tool with a real timeline.
The interface must support spoken-content editing workflows without turning into a consumer creator app or a developer diagnostics panel.

These rules define the canonical Hammer interface.

Companion interaction architecture:

- [`docs/HAMMER_EDITOR_ARCHITECTURE.md`](./HAMMER_EDITOR_ARCHITECTURE.md)

---

# 0. Hammer Law

Hammer opens an episode into a prepared editing workspace, not a blank editor.

On load, Hammer automatically prepares the project by:

- loading episode and workpiece context
- loading related media assets plus script and transcript inputs
- running transcription with speaker diarization
- aligning transcript timing to the timeline
- comparing transcript against script where applicable
- placing visuals by script and transcript alignment
- applying baseline audio polish
- assembling the initial rough cut

Hammer MUST visibly explain this prep while it runs.

Hammer prep MUST remain non-destructive.

Hammer MAY assist heavily during prep, but it MUST stop for user direction before stronger creative or stylistic transformations are applied.

Hammer MUST NOT assume creative consent.

Canonical prep constraints:

- speaker labels default to `S1`, `S2`, `S3`, `G1`, `G2`
- Hammer MUST NOT guess human names by default
- aggressive cleanup steps are macro-driven and opt-in
- prep progress MUST remain visible through a dedicated progress surface, not a hidden background action

---

# 1. Entry Flow

Hammer MUST NOT open directly into the editor.

Hammer opens to a Project Library screen.

The Project Library screen MUST include:

- New Project
- Open Project
- a visible Project Library grid of existing Hammer projects

Each project card MUST display:

- project thumbnail or poster frame
- project title

The Project Library MUST remain visually minimal.

The following MUST NOT appear on the Project Library screen:

- template stores
- stock media libraries
- AI media generators
- advertisements
- marketplace links
- unrelated side navigation

Selecting a project opens the Hammer editor.

Opening a project begins Hammer prep.

Hammer SHOULD enter the editing workspace only after prep has reached a reviewable state.

---

# 2. Top Bar

The Hammer editor MUST use the standard Forge tool chrome.

The Hammer top bar MUST include:

- hamburger menu (far left)
- Hammer label and version
- project title
- project title dropdown
- workspace identifier
- AI indicators
- logged-in user
- logout control

The project title dropdown MUST allow switching between related project outputs such as:

- main edit
- clips
- shorts
- alternate cuts
- trailers

This dropdown is part of the editing workflow and MUST remain visible.

---

# 3. Editor Layout Regions

The Hammer editor consists of the following layout regions:

- Top bar
- Left work panel
- Center preview panel
- Right content panel
- Far-right tool menu strip
- Bottom full-width timeline

Hammer MUST present itself as a production workspace, not a diagnostics console.

---

# 4. Resizable Upper Panes

The three main upper panes MUST be horizontally resizable by dragging the dividers between them.

The resizable panes are:

- left work panel
- center preview panel
- right content panel

The far-right vertical tool strip is fixed width and MUST NOT participate in pane resizing.

Resizing changes width only. It MUST NOT change height.

The top bar and bottom full-width timeline remain structurally fixed.

Hammer MUST enforce sensible minimum and maximum pane widths so the editor does not collapse into unusable states.

Hammer SHOULD preserve pane sizes for at least the current session.

---

# 5. Left Work Panel

The left panel is a switchable work panel.

It MUST support switching between:

- Script
- Assets

If Assets is subdivided, the subdivisions MUST be:

- Video
- Images
- Music

These may appear as sub-tabs within the Assets panel.

---

## 5.1 Script View

Script view displays the working transcript or script for the project.

Script view supports transcript-based editing actions such as:

- segment selection
- split
- merge
- delete
- mute
- trim
- transcript navigation

Script editing is a primary Hammer editing surface.

During prep, transcript output MUST open grouped by speaker turn rather than raw machine fragments.

---

## 5.2 Assets View

Assets view displays media associated with the project via Tongs.

Assets view MUST display only project-linked assets.

Assets view MUST NOT behave like:

- a stock library
- an AI generator
- a marketplace
- an unrelated upload interface

Assets in this panel represent project-linked media.

---

# 6. Center Preview Panel

The center panel is the preview monitor.

The preview monitor MUST remain moderate in size.

Hammer is not a full-screen compositor.

The preview monitor supports:

- playback
- edit verification
- timing confirmation
- visual confirmation
- audio confirmation

The preview monitor MUST NOT dominate the interface.

---

# 7. Right Content Panel and Tool Menu Strip

Hammer uses a two-part tool system on the right side:

- Right Content Panel
- Far-Right Tool Menu Strip

These two regions have separate responsibilities.

---

## 7.1 Far-Right Tool Menu Strip

The far-right vertical strip is the tool selector.

Selecting a tool changes the contents of the right content panel.

The order of tools MUST follow the real editing workflow.

Tool order MUST NOT be alphabetical or arbitrary.

---

# 8. Canonical Tool Order

The canonical tool order is:

1. Polish
2. Audio
3. Video
4. Captions
5. Details
6. Export

This order reflects the editing workflow and MUST be preserved unless the manifest is intentionally revised.

---

# 9. Tool Categories

## 9.1 Polish

Polish contains early cleanup and enhancement tools.

Examples include:

- Studio Sound
- filler-word cleanup
- retake cleanup
- gap tightening
- blur background
- eye contact

Polish represents the first editing pass.

Aggressive cleanup remains opt-in and belongs to reusable macros or explicit user-directed actions.

---

## 9.2 Audio

Audio contains audio-related editing tools and adjustments.

---

## 9.3 Video

Video contains video-related editing tools and adjustments.

---

## 9.4 Captions

Captions contains subtitle and caption management tools.

---

## 9.5 Details

Details contains project metadata and project-level editing settings.

---

## 9.6 Export

Export contains final rendering and delivery controls.

---

# 10. Timeline

Hammer uses a full-width bottom timeline.

The timeline MUST span the full width of the editor.

The timeline MUST support multiple tracks, including:

- main video
- additional video tracks
- picture-in-picture
- main audio
- music or audio bed
- text
- captions

The timeline MUST support standard editing tools such as:

- select
- hand or move
- cut or split
- marker
- comment
- text insertion

Hammer is transcript-first but remains a real timeline editor.

---

# 11. Transcript and Timeline Relationship

Hammer is a hybrid editor.

Hammer combines:

- transcript editing
- timeline editing
- project-linked asset handling

Transcript editing is primary for spoken-content editing.

Timeline editing is primary for layered media and track placement.

Both editing surfaces operate on the same project state.

---

# 12. Design Boundaries

Hammer MUST NOT include:

- template stores
- stock marketplaces
- ads
- unrelated side navigation
- AI-generated media gimmicks
- creator-app clutter

Hammer MUST NOT silently apply stronger stylistic or creative transformations without user direction after prep completes.

Hammer is a focused Forge editing tool.

---

# 13. Design Intent

Hammer intentionally combines the strengths of:

- transcript-first editing tools
- practical multi-track timeline editors
- simple project asset organization

Hammer should feel like a professional spoken-content editing workspace.

Hammer MUST NOT resemble:

- a debug console
- a toy editor
- a marketplace
- an AI media toybox

---

# 14. Change Discipline

If a proposed change:

- removes the Project Library entry flow
- collapses the tool strip and content panel distinction
- removes the full-width timeline
- converts project assets into a generic media browser
- makes preview dominate the editor
- introduces marketplace or generator clutter

STOP.

That change is not a tweak.
It is a design change and MUST be evaluated against this manifest.
