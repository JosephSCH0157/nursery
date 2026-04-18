# HAMMER - Workspace Panel System Specification

Editor Frame and Panel Behavior Contract  
Derived from Forge Design Session - March 21, 2026

## Purpose

This document defines the structure and behavior of Hammer's primary editing workspace panels.

It ensures:

- a stable professional layout
- predictable panel behavior
- correct hierarchy of information
- absence of dashboard-style clutter
- compatibility with canonical composition authority and timeline control-surface behavior
- resistance to UI drift during development

Hammer must feel like operating a production console, not arranging floating windows.

## 1. Fixed Editor Frame

Hammer uses a fixed, full-viewport workspace frame.

Properties:

- occupies the full application viewport
- does not scroll vertically as a whole
- internal panels manage their own overflow
- maintains consistent spatial relationships

Hammer is not a scrolling page.

## 2. Primary Workspace Regions

The editor frame is divided into four major regions:

- A. Left Workspace - Source Desk
- B. Center - Preview Monitors
- C. Right Workspace - Tool Rack
- D. Bottom - Timeline Control Board

Additionally:

- E. Far Right - Patch Bay (Tool Selector)

## 3. Left Workspace - Source Desk

This panel contains materials the user edits or draws from.

Typical contents:

- Transcript
- Images
- Assets
- B-roll
- Source media lists
- Supporting data

Behavior:

- contains tabbed interfaces
- supports internal scrolling
- expands when source-focused
- contracts when tool-focused
- never disappears

This is where raw content is inspected and manipulated.

## 4. Center - Preview Monitors

Displays the result of the timeline at the current playhead.

Behavior:

- bounded size
- stable dimensions
- does not dominate the workspace
- does not shrink to unusable size
- maintains aspect ratio

Preview is verification, not primary editing space.

## 5. Right Workspace - Tool Rack

Displays the currently selected tool's interface.

Behavior:

- content changes based on patch bay selection
- contains tabbed or sectional tool UIs
- supports internal scrolling
- expands when tool-focused
- contracts when source-focused
- never disappears

This panel hosts processing and adjustment tools.

## 6. Far Right - Patch Bay

Permanent vertical tool selector.

Properties:

- full height of workspace
- fixed width
- always visible
- does not scroll with other panels
- does not resize dynamically

Function:

Selects the active tool displayed in the Tool Rack.

It does not host tool content itself.

### Terminology Clarification

`Patch Bay` and `Toolbar` refer to the same element.

- It is a fixed far-right rail and not part of the adaptive top-workspace panel sizing.
- It spans the full editor height.
- It only routes tool selection.
- It never hosts full tool controls.
- The timeline ends at its left edge.
- It must remain fixed and must not be centered or clipped.

## 7. Bottom - Timeline Control Board

Spans the width of the workspace except the patch bay.

Behavior:

- anchored to the bottom
- independent horizontal scrolling
- supports zoom and density adjustments
- can expand vertically within limits
- remains visible at all times

The timeline is the primary structural control surface.

## 8. Panel Resizing Model

Panels adjust size based on focus but remain present.

Focus-driven resizing:

When source-focused:

- left panel expands
- right tool panel contracts

When tool-focused:

- right panel expands
- left panel contracts

Preview remains largely stable.

Timeline remains unaffected.

## 9. Minimum Viable Sizes

No panel may shrink below usability thresholds.

This prevents:

- collapsed unreadable panes
- accidental loss of functionality
- unusable preview

Exact minimums may be defined in CSS rules.

## 10. Tab Systems

Tabbed interfaces exist inside panels, not at the global layout level.

Examples:

Left panel tabs:

- Transcript
- Images
- Assets

Right panel tabs:

- Tool sub-features
- Inspector views
- Settings for active tool

Switching tabs does not alter overall layout.

## 11. Panel Independence

Panels operate independently.

Actions in one panel should not cause unrelated panels to disappear or relocate.

## 12. No Floating Windows

Hammer does not use detachable or floating panels.

All work occurs within the fixed frame.

## 13. No Auto-Rearrangement

Hammer must not dynamically rearrange panel positions.

Only sizes may change due to focus.

Spatial memory is important for professionals.

## 14. Internal Scrolling Only

Scrollable content must be confined to panel interiors.

The overall editor frame does not scroll.

## 15. Persistent Infrastructure

Critical structural elements remain visible at all times:

- Patch bay
- Timeline
- Preview
- Source panel
- Tool panel

Nothing essential vanishes during normal editing.

## 16. Multi-Monitor Considerations

While Hammer runs in a single window, the layout should behave predictably across screen sizes.

The structure must degrade gracefully on smaller displays without violating core principles.

## 17. State Persistence

Panel states such as:

- selected tabs
- scroll positions
- focus state

should persist during the session where feasible.

## 18. Interaction Priority Hierarchy

From most authoritative to least:

- Timeline
- Patch bay selection
- Active tool panel
- Source panel
- Preview

Preview reflects results, not decisions.

## 19. Forbidden Layout Behaviors

Hammer must avoid:

- dashboard-style widget grids
- collapsing core panels entirely
- overlaying full-screen tools over the workspace
- hiding the timeline during editing
- moving the patch bay
- turning the preview into a dominant viewer

## 20. Professional Mental Model Alignment

Workspace mirrors a production environment:

- Left = material
- Center = output
- Right = controls
- Bottom = structure
- Far right = routing

## 21. Implementation Guidance for Codex/Copilot

When modifying layout:

- Preserve fixed frame architecture.
- Keep patch bay stationary.
- Maintain timeline visibility.
- Avoid panel disappearance.
- Support focus resizing only.
- Contain scrolling within panels.
- Preserve spatial consistency.

## 22. Canonical Summary

Hammer's workspace is a console, not a canvas.

It is designed for deliberate shaping of content, not casual browsing.

## 23. Final Principle

The user should feel seated at a station, not navigating a website.
