# HAMMER -> QUENCH Handoff Specification

Compilation Boundary Contract  
Derived from Forge Design Session - March 21, 2026

## Purpose

This document defines the formal boundary between Hammer (editing) and Quench (compilation and distribution).

It ensures:

- no responsibility overlap
- no duplicated encoding logic
- clear ownership of final outputs
- consistent pipeline behavior
- stable interchange format
- predictable user expectations

Hammer shapes the workpiece.  
Quench sets the workpiece.

## 1. Pipeline Relationship

Hammer and Quench are sequential stages.

Anvil -> Hammer -> Quench -> Ledger

- Anvil records raw material
- Hammer edits and prepares
- Quench compiles and distributes
- Ledger analyzes outcomes

Hammer never performs Quench functions.

## 2. Nature of the Handoff

The handoff transfers a prepared project package, not a rendered video.

This package contains:

- structural blueprint of the edit
- references to media assets
- timing information
- transformation data
- output intent metadata

It must contain everything required to reconstruct the edit deterministically.

## 3. Handoff Trigger

The user initiates handoff explicitly.

Handoff represents:

- completion of editing
- readiness for compilation
- confidence in structure

Hammer should not auto-send projects to Quench.

## 4. Hammer Output - Prepared Release Package

Hammer produces a structured release package that includes:

### 4.1 Timeline Blueprint

- complete timeline state
- track structure
- clip placements
- durations
- gaps
- layering order
- transforms

This is the authoritative edit definition.

### 4.2 Media References

References to all required source assets:

- video recordings
- images
- B-roll
- audio tracks
- overlays
- graphics

Assets are referenced, not embedded.

### 4.3 Audio Preparation Data

Information about audio treatments applied:

- cleanup
- leveling
- noise reduction
- balancing

Hammer prepares; Quench may finalize mastering.

### 4.4 Visual Placement Data

Includes:

- positioning
- scaling
- timing
- overlay relationships
- transitions (if applicable)

### 4.5 Text Outputs

Such as:

- subtitles or captions
- transcript variants
- title overlays

### 4.6 Export Intent Metadata

High-level intent for compilation:

- primary output type
- orientation (landscape/vertical)
- project duration
- content classification

Not platform-specific encoding instructions.

## 5. What Hammer Does Not Include

Hammer does not provide:

- encoded video files
- platform-ready uploads
- distribution packaging
- delivery scheduling
- analytics hooks
- CDN instructions

Those belong to Quench.

## 6. Quench Responsibilities

Upon receiving the release package, Quench performs:

### 6.1 Compilation

Transforms the blueprint into concrete media outputs:

- renders final video
- mixes audio
- applies final mastering
- resolves compositions

### 6.2 Derivative Generation

Creates additional deliverables:

- shorts
- clips
- alternate formats
- thumbnails
- preview assets

### 6.3 Platform Encoding

Produces versions suitable for specific platforms.

### 6.4 Distribution

Handles:

- uploads
- scheduling
- publishing
- platform integration

## 7. Immutable Boundary

Once handed off:

Hammer does not modify Quench's outputs.

If edits are required:

- the project returns to Hammer
- a new package is produced

No live editing of compiled media.

## 8. Versioning

Each handoff should be versioned.

This allows:

- revisions
- rollback
- comparison
- auditability

Quench must know which version it compiled.

## 9. Determinism Requirement

Quench must be able to reconstruct the edit solely from the package.

No hidden dependencies on Hammer runtime state.

## 10. Persistence Model

Release packages should remain accessible after compilation for:

- re-export
- corrections
- alternative outputs
- archival

## 11. User Mental Model

Hammer = shaping  
Quench = setting

Analogy:

Blacksmith shapes hot iron on the anvil.  
Then plunges it into water to set the structure.

After quenching, changes require reheating (return to Hammer).

## 12. Error Handling at Boundary

If Quench cannot compile the package:

- the user must be informed clearly
- the package must remain intact
- actionable feedback should be provided
- the project can return to Hammer

Silent failures are unacceptable.

## 13. Partial Compilation

Quench may allow selective output generation (for example, only shorts).

However, the package remains the single authoritative source.

## 14. Security and Integrity

Quench must verify package integrity before processing.

Corrupt or incomplete packages should be rejected safely.

## 15. Performance Considerations

Compilation may be resource-intensive and asynchronous.

Hammer should not block while Quench processes.

## 16. Forbidden Behaviors

Hammer must not:

- encode final deliverables
- perform distribution tasks
- maintain parallel export pipelines
- silently auto-handoff
- depend on Quench availability to function

Quench must not:

- alter project structure
- reinterpret ambiguous timeline data
- inject edits

## 17. Cross-Tool Consistency

Terminology and mental model must remain coherent across Forge:

- Anvil produces raw material
- Hammer shapes
- Quench sets
- Ledger evaluates

## 18. Implementation Guidance for Codex/Copilot

When implementing handoff features:

- Treat Hammer output as a blueprint, not media.
- Maintain strict separation of responsibilities.
- Preserve versioning.
- Ensure determinism.
- Do not leak Quench logic into Hammer.
- Keep user control explicit.
- Provide clear feedback loops.

## 19. Canonical Summary

Hammer prepares the workpiece for finalization.  
Quench transforms it into finished deliverables.

The boundary is intentional and must remain sharp.
