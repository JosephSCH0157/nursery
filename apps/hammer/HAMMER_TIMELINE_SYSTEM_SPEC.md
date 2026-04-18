# HAMMER - Timeline System Specification

Structural and Playback Authority Contract  
Derived from Forge Design Session - March 21, 2026

## Purpose

This document defines the timeline as Hammer's canonical temporal projection and primary manipulation surface for content structure, timing, and playback.

It prevents:

- preview desynchronization
- conflicting edit representations
- hidden structural state
- ambiguous track behavior
- tool-driven structural mutations
- non-deterministic playback

Everything the viewer ultimately sees originates from the canonical composition as expressed through the timeline.

## 1. Timeline as Temporal Projection and Control Surface

The canonical composition is the source of truth for the edit.

The timeline is the canonical temporal projection of the edit derived from the canonical composition.
It is the primary manipulation surface for editing that composition.

All other components derive from it:

- preview
- playback
- export preparation
- analytics of duration
- visual composition
- subtitle timing
- audio alignment

If the canonical composition expresses something at time T, the timeline must represent it faithfully.  
If the timeline shows no content at time T, nothing should play.

## 2. Temporal Coordinate System

The timeline defines a continuous time axis starting at project time zero.

Properties:

- Monotonic increasing time
- No negative time
- No hidden offsets
- No floating relative-only time models

All media placements are mapped to absolute project time.

## 3. Playhead Model

The playhead represents the current evaluation point on the timeline.

Movement sources:

- direct dragging
- clicking timeline
- keyboard navigation
- playback
- tool operations that reposition focus

Requirements:

- moving the playhead must update preview immediately
- preview must represent the timeline state at the exact playhead time

## 4. Playback Behavior

Playback is a traversal of the timeline from the current playhead position forward.

Playback must:

- follow timeline order
- respect gaps
- respect layering
- respect timing exactly
- not skip silent regions
- not auto-collapse empty space

Playback cannot invent content.

## 5. Gap Semantics

A gap is a region of time with no media on a track.

Gap behavior:

- produces silence in audio tracks
- produces blank output in visual tracks
- is intentional structural information
- must be visible in the timeline

Hammer must not auto-fill gaps.

Gaps are part of the edit.

## 6. Track Model

Tracks represent layered channels of content over time.

Tracks are ordered vertically but evaluated together at each time slice.

Typical track categories include:

- Primary video
- Secondary video/picture-in-picture
- Visual overlays/images
- Titles/graphics
- Dialogue audio
- Music
- Effects

Exact track taxonomy may evolve, but layering rules must remain deterministic.

## 7. Layering and Composition

At any time T, the output frame is the composition of all active tracks at T.

Composition rules must be deterministic:

- higher visual tracks overlay lower ones
- transparency is respected
- muted tracks contribute nothing
- disabled tracks contribute nothing

No hidden blending logic outside defined rules.

## 8. Clip Model

Clips represent media segments placed on tracks.

A clip has:

- start time
- duration
- source reference
- track assignment
- transform properties (if applicable)

Clips cannot exist without time placement.

## 9. Clip Manipulation

Users may:

- drag clips horizontally to change timing
- resize clips to change duration
- reposition clips across tracks (if allowed)
- trim start or end

These actions modify timeline state directly.

Those timeline edits are mutations of the canonical composition expressed through the timeline control surface.

Preview must update accordingly.

## 10. Resizing Behavior

Changing clip length affects:

- visibility duration
- overlap relationships
- downstream timing perception

Resizing does not alter source media, only its placement.

## 11. Overlap Rules

Clips on the same track may not occupy identical time unless explicitly allowed.

If overlaps are allowed, rules must be defined (for example, topmost wins).

Implicit conflict resolution is forbidden.

## 12. Scrubbing

Scrubbing is rapid playhead movement.

Preview should update continuously within performance constraints.

Scrubbing does not change structure.

## 13. Timeline Zoom - Horizontal

Horizontal zoom changes time scale representation.

It affects:

- visual density
- navigation precision
- perceived spacing

It does not change underlying timing.

## 14. Timeline Density - Vertical

Vertical adjustments control track visibility.

Users may:

- collapse tracks
- expand tracks
- focus on specific channels
- hide unused tracks

Hidden tracks still affect output.

Visibility is not existence.

## 15. Channel Focus Model

Expanding a track increases detail visibility for that channel.

This mirrors focusing on a mixing console channel.

Focus does not change playback behavior.

## 16. Timeline Navigation Independence

Navigation tools should not modify structure.

Examples:

- zooming
- scrolling
- panning

These change view, not data.

## 17. Timeline to Preview Synchronization

The preview must be a pure function of:

Timeline state plus playhead time.

Nothing else.

If preview shows something not represented in the timeline, it is a defect.

## 18. Timeline to Tool Interaction

Tools may propose or apply changes to timeline state.

However:

- tools do not become alternate structural models
- timeline remains the primary temporal manipulation surface, not a second source of truth
- changes must be reflected visibly

No hidden structural edits.

## 19. Non-Destructive Editing Principle

Hammer should preserve original media.

Timeline edits modify placement, not source data.

Reversibility is preferred where feasible.

## 20. Timeline Persistence

The timeline state must survive:

- navigation within Hammer
- temporary interruptions
- tool switching
- panel focus changes

Users should not lose structure accidentally.

## 21. Timeline as Export Blueprint

Hammer does not encode final media, but it prepares the structural blueprint.

Quench will compile outputs based on this blueprint.

Therefore the canonical composition, as expressed through the timeline, must contain sufficient information to reconstruct the edit.

## 22. Timing Precision Expectations

Edits should support fine-grained positioning suitable for professional work.

Sub-frame precision policies may be defined later, but the model must support accuracy.

## 23. Performance Expectations

Timeline interaction must remain responsive enough for deliberate editing.

Severe lag undermines precision and user trust.

## 24. Forbidden Timeline Behaviors

Hammer must not:

- auto-collapse gaps
- reorder clips implicitly
- hide structural conflicts
- maintain parallel hidden timelines
- allow preview-only edits
- create timing changes without visible representation

## 25. Professional Analogy

The timeline functions like:

- a multitrack recorder
- a mixing board timeline
- a film editing bench

It is the physical manifestation of the edit.

## 26. Canonical Summary

If Hammer is a shaping tool:

The timeline is the anvil face.

Everything strikes here.

## 27. Implementation Guidance for Codex/Copilot

When modifying timeline behavior:

- Preserve single-source authority.
- Ensure preview fidelity.
- Avoid hidden structural state.
- Maintain deterministic composition.
- Keep gap semantics intact.
- Favor direct manipulation.
- Ensure changes are visible.
- Do not create alternative timelines.

## 28. Final Principle

If it is not on the timeline, it is not part of the edit.
