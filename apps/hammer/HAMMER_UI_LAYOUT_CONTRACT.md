# HAMMER - UI Layout Contract

CSS-Level Structural Constraints  
Derived from Forge Design Session - March 21, 2026

## Purpose

This document defines the non-negotiable structural layout rules for Hammer's editor UI.

It exists to prevent:

- conflicting layout authority
- CSS drift
- panel clipping
- page-scroll behavior inside the editor
- responsive improvisation that breaks workflow
- AI/dev guesses that violate Hammer's intended operating model

This is a layout contract, not a visual style guide.

It governs:

- viewport usage
- panel hierarchy
- docking
- resizing behavior
- scrolling ownership
- panel boundaries
- focus resizing rules

## 1. Core Layout Principle

Hammer is a fixed-frame application workspace, not a scrolling webpage.

The editor must behave like a desktop production surface.

Therefore:

- the outer Hammer editor uses the available viewport height
- the main workspace does not vertically scroll as a document
- scrolling is owned by internal panels only
- the timeline, patch bay, preview, and work bays remain structurally anchored

## 2. Canonical Editor Frame

Hammer editor is composed of five structural regions:

- Top chrome
- Left work bay
- Center preview
- Right tool bay
- Far-right patch bay
- Bottom timeline dock

Conceptually:

```text
[ Top Chrome ]

[ Left Work Bay ] [ Preview ] [ Right Tool Bay ] | [ Patch Bay ]

[------------- Timeline / Control Board --------] | [ Patch Bay ]
```

The patch bay spans the full editor height beneath top chrome.  
The timeline stops at the left edge of the patch bay.

## 3. Outer Height Contract

The Hammer editor shell must resolve to a bounded height.

Required:

- root Hammer editor container must use available viewport height
- every parent in the layout chain must allow children to resolve bounded height
- no critical editor region may rely on unconstrained document flow height

Forbidden:

- height driven purely by content expansion
- timeline pushing the page taller
- patch bay clipped because parent height is based on preview block
- "just let the page scroll" as a fallback

## 4. Scroll Ownership Contract

Only internal panel bodies may scroll.

The following may scroll internally:

- left work bay body
- right tool bay body
- timeline internal track area
- any long inspector/tool content
- library/project lists where appropriate

The following must not be document-scroll driven:

- full editor frame
- patch bay
- overall workspace shell
- top-level panel structure

Rule:

Every scrollable region must have:

- a bounded parent
- a dedicated scroll body
- explicit overflow ownership

Do not place `overflow: auto` randomly on high-level wrappers to patch clipping bugs.

## 5. Top Chrome Contract

Top chrome is a persistent header region.

It may contain:

- project/workspace identity
- navigation
- handoff/export-to-Quench action
- global status
- global commands

It must:

- remain structurally separate from the editor workspace
- not collapse into the work bays
- not scroll with internal panel content

It must not:

- own timeline controls that belong on the timeline surface
- absorb patch bay behavior
- become a dumping ground for contextual tools

## 6. Patch Bay Contract (Far Right Rail)

The far-right vertical rail is the patch bay.

Structural rules:

- docked to the far right edge
- full height beneath top chrome
- always visible
- never clipped by timeline
- never clipped by preview or work bay height
- not conditionally hidden
- not width-collapsed by focus changes
- content inside may scroll only if truly necessary; rail itself remains fixed

Behavioral rules:

- selects active tool
- does not render the full tool UI itself
- does not disappear across modes
- does not move

Forbidden:

- placing the patch bay inside the same height box as preview
- allowing timeline height to truncate the rail
- modalizing core tool selection
- making patch bay responsive by disappearance

### Terminology Clarification

`Patch Bay` and `Toolbar` refer to the same UI element.

- It is a fixed far-right rail, outside top-workspace adaptive sizing.
- It spans the full editor height under top chrome.
- It never hosts tool controls.
- It only selects which tool appears in the right tool bay.
- The timeline stops at the patch bay's left edge.
- It must not be centered, clipped, or included in panel focus resizing.

## 7. Left Work Bay Contract

The left work bay is the source desk.

It contains tabbed source contexts such as:

- Transcript
- Images
- Assets
- B-roll
- other source materials

Structural rules:

- occupies the left side of the top workspace region
- has its own header/tab strip and body
- body scrolls internally
- does not push the full workspace taller
- participates in focus resizing

Behavioral rules:

- becomes primary when transcript/assets/source work is active
- expands when focused
- contracts when tool work is primary
- never disappears completely

Forbidden:

- converting the left bay into a floating panel
- letting tab bodies define page height
- requiring modal navigation for basic source switching

## 8. Preview Contract

The center preview is the studio monitors.

Purpose:

Verification, not consumption.

Structural rules:

- always visible within the editor
- bounded width
- bounded height within the top workspace
- stable size relative to the two work bays
- does not dominate the screen
- does not expand theatrically as if Hammer were a media player

Behavioral rules:

- remains mostly constant during focus changes
- reflects timeline state
- is not the authority for edits
- serves as a reference monitor

Forbidden:

- preview consuming most of the top workspace width
- preview resizing aggressively with every tool change
- preview becoming full-page by default
- layout designed around watching rather than editing

## 9. Right Tool Bay Contract

The right work bay is the outboard rack.

It contains:

- the active tool UI selected from the patch bay
- processing controls
- cleanup tools
- visual review tools
- adjustment interfaces

Structural rules:

- occupies the right side of the top workspace, immediately left of the patch bay
- has its own bounded header/body structure
- body scrolls internally
- participates in focus resizing
- remains present even when not primary

Behavioral rules:

- content changes based on patch bay selection
- expands when tool-focused
- contracts when source-focused
- does not disappear

Forbidden:

- rendering tools only in overlays/modals
- letting the tool bay collapse out of the frame
- mixing patch bay selection UI with tool bay contents structurally

## 10. Top Workspace Width Allocation Contract

The top workspace has three horizontal participants:

- left work bay
- preview
- right tool bay

And one fixed structure:

- patch bay

Required behavior:

- left and right bays trade emphasis
- preview remains comparatively stable
- patch bay remains fixed

Canonical focus states:

Source-focused state:

- left work bay = expanded
- preview = stable
- right tool bay = reduced
- patch bay = fixed

Tool-focused state:

- left work bay = reduced
- preview = stable
- right tool bay = expanded
- patch bay = fixed

Forbidden:

- equal-weight three-panel layout as the only state
- preview becoming dominant during normal editing
- hiding either work bay during focus changes

## 11. Focus Resizing Contract

Focus resizing must be driven by explicit UI state, not incidental CSS.

Required:

- a single source of truth for which side bay is primary
- resizing rules derived from that state
- transitions may exist, but structure must remain legible without them

Forbidden:

- local component hacks that resize based on tab labels or content height
- multiple independent booleans fighting over widths
- CSS overrides that silently change panel sizing per route

## 12. Timeline Dock Contract

The timeline is the control board.

Structural rules:

- docked across the bottom of the editor
- extends from the left workspace edge to the left edge of the patch bay
- always visible
- not clipped by the top workspace
- not part of document flow scrolling
- has bounded height
- may be resizable by the user within defined limits

Behavioral rules:

- user may expand or contract vertical track density
- user may zoom horizontally
- timeline remains the primary temporal projection and manipulation surface for previewed composition truth
- timeline is not replaced by a modal or separate route

Forbidden:

- timeline acting like a footer underneath a webpage
- timeline pushing the patch bay upward
- timeline hidden behind tabs or accordions
- timeline treated as an optional afterthought

## 13. Timeline Internal Scrolling Contract

The timeline itself may contain internal scroll regions.

Valid internal timeline behaviors:

- horizontal scrolling across time
- vertical scrolling across tracks, if track count exceeds visible space
- zoom-to-fit
- focus zoom
- micro zoom

Invalid behaviors:

- using document scroll as timeline scroll
- allowing track expansion to break the outer frame height
- letting timeline controls spill into unrelated shell regions

## 14. Timeline-to-Preview Authority Contract

Layout and interaction must reinforce that the canonical composition controls preview through the timeline.

Therefore:

- playhead movement updates preview
- visible gaps in timeline produce blank output in preview
- clip movement and trimming update preview timing
- preview does not own independent playback truth

CSS/layout implication:

Preview controls must not visually suggest independent authority over the edit structure.

## 15. Ingest Readiness Panel Contract

After automatic ingest, Hammer may show a temporary readiness briefing.

Structural rules:

- appears as an overlay or transient panel within the editor entry experience
- does not permanently consume layout real estate
- does not become a dashboard region

Behavioral rules:

- disappears once the user starts working
- is not expected to be reopened
- uses conversational scan-friendly content

Forbidden:

- permanent tile grids
- dense status dashboards at entry
- treating ingest summary as a long-lived panel

## 16. Project Splash/Library Contract

The project library or splash page is not the editor.

Required:

- it may show project cards and thumbnails
- it must remain distinct from the editing workspace
- selecting a project transitions into Hammer's fixed editor frame

Forbidden:

- reusing editor layout assumptions on the splash/library surface
- turning the library into an editor-lite screen

## 17. CSS Authority Rules

Hammer must have a clear ownership hierarchy for layout CSS.

Preferred rule:

One layer owns:

- global shell geometry
- top workspace grid
- bottom timeline dock
- patch bay docking
- panel overflow boundaries

Another layer may own:

- internal component styling
- tab visuals
- tool cosmetics
- typography
- decorative states

Forbidden:

- shell geometry split unpredictably across multiple distant files
- route CSS overriding editor frame geometry without being canonical
- dev mock CSS leaking into production frame ownership

## 18. Naming Discipline

CSS class names and component names should reflect structural role, not temporary appearance.

Prefer names like:

- `hammer-editor-shell`
- `hammer-top-workspace`
- `hammer-left-bay`
- `hammer-preview-panel`
- `hammer-right-tool-bay`
- `hammer-patch-bay`
- `hammer-timeline-dock`

Avoid names like:

- `left-box`
- `big-panel`
- `video-wrap-2`
- `secondary-right`
- `temp-shell`

Structure must remain understandable from the codebase.

## 19. Responsive Behavior Contract

Hammer is a pro tool, not a mobile-first content card app.

Required:

- preserve structural hierarchy at supported desktop widths
- degrade carefully when space is constrained
- maintain patch bay visibility
- maintain timeline visibility

Forbidden:

- collapsing core editor architecture into stacked mobile cards for desktop use
- hiding timeline or patch bay as the first responsive fallback
- letting responsiveness destroy the studio metaphor

If a narrower layout is ever supported, it must be intentionally designed, not emergent.

## 20. Visual Hierarchy Rules

This is not a style guide, but structure must support the following hierarchy:

Primary attention:

- currently focused work bay
- timeline during manipulation

Secondary attention:

- preview

Persistent infrastructure:

- patch bay
- top chrome

The UI must not visually imply that preview is the main experience.

## 21. Quench Boundary Contract

Hammer's layout must not be bent around compilation/distribution UI.

Therefore:

- no large embedded publishing dashboards in the editor
- no platform upload flows occupying structural editor space
- no final distribution wizard dominating Hammer's workspace

Handoff to Quench is a global action, not a core workspace panel.

## 22. Non-Negotiable Violations

Any of the following should be treated as structural bugs:

- patch bay clipped by timeline or preview region
- main editor scrolling as a webpage
- timeline disappearing or becoming footer-like
- preview dominating the workspace
- left or right work bay vanishing during normal focus changes
- multiple CSS layers competing for shell geometry
- tab contents forcing outer layout height expansion
- tool selection and tool rendering merged into the same structural region
- readiness panel becoming permanent UI clutter

## 23. Implementation Guidance for Codex/Copilot

When making changes:

- Preserve the fixed-frame model.
- Do not invent new panel regions without updating canon.
- Do not solve clipping by adding overflow to outer shells.
- Do not solve structural problems with visual hacks.
- Do not let preview become dominant.
- Do not hide the patch bay.
- Do not treat the timeline as optional.
- Keep layout authority centralized.
- Put tabs inside work bays, not across the whole app.
- Treat the timeline as the board, preview as the monitors, patch bay as routing, tool bay as outboard rack.

## 24. Canonical Summary

Hammer layout must behave like a professional editing suite:

- fixed frame
- source desk on the left
- monitors in the center
- outboard rack on the right
- patch bay on the far right
- control board across the bottom

Hammer is for shaping the workpiece.  
Quench is where the workpiece is set.
