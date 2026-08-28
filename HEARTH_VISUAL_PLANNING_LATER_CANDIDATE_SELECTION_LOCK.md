# Hearth Visual Planning Later Candidate Selection Lock

> Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Phase 5 production-prep direction is defined in `HEARTH_TONGS_PHASE_5_PLAN.md`. Existing canonical image-map persistence is defined by the shipped Tongs `/image-map` seam and `forge.episode.package.v2`.

Date: March 11, 2026  
Reclassified: August 27, 2026  
Theme: `Hearth Visual Planning - later candidate planning`  
Status: preserved future-work lock; not canonical Authority Slice 4

> This document was originally numbered Slice 4. S4-0 established that canonical asset identity must be locked first. The candidate-selection behavior remains useful, but it may execute only after Canonical Asset and Visual Derivative Authority is established.

## Decision

Later candidate-selection work is locked to the following rule:

Canonical image-map entries may designate one selected still-image candidate as the authoritative visual attachment for that beat, but selection truth exists only after canonical image-map persistence and canonical candidate attachment validation.

In practical terms:

- a user may review canonically attached candidate stills for one image-map entry
- exactly one candidate may become selected for v1 downstream use
- selection truth is the canonical entry's `selected_asset_id`, not local highlighted-card state
- a candidate cannot be selected unless it is already a canonically attached candidate for that same entry
- unselected candidates may remain attached as alternates, but they do not drive downstream use

## Scope

This later work covers only:

- selecting one canonically attached still-image candidate for an existing canonical image-map entry
- persisting that selection through the canonical image-map write seam
- validating that the selected candidate belongs to the correct entry, workpiece, and workspace
- preventing stale, mismatched, or locally remembered selection state from appearing authoritative

This later work does not cover:

- generating candidates
- Hammer-facing reads
- transcript alignment
- timeline placement
- B-roll or motion generation
- text-in-image
- broad visual-planning workflow redesign

## Canonical Baseline

Slice 3 already established:

- canonical candidate still generation through the Tongs image-map seam
- canonical candidate asset refs attached to image-map entries
- variant metadata sufficient for editorial review
- canonical reread of those candidate refs after persistence

This later work must build on that seam. It must not invent:

- a second selected-candidate store
- a client-only "chosen image" authority object
- a separate attachment registry outside the canonical image map

## Locked Questions

### 1. Selection Truth

The authoritative selected still for an image-map entry is the canonical `selected_asset_id` on that entry.

That means:

- the selected id must refer to one member of that same entry's `candidate_assets`
- there may be zero selected candidate during review
- there may be exactly one selected candidate when a choice is made
- there may not be multiple selected candidates for one entry in v1

Local UI state may indicate "currently focused card" or "pending choice," but that is not selection truth.

### 2. Canonical Persistence

Selection becomes real only after canonical image-map persistence.

Candidate-selection work must therefore:

- read the current canonical image-map entry set
- validate the chosen candidate id against the current entry's `candidate_assets`
- persist the updated `selected_asset_id` through the canonical image-map write seam
- replace local selection display state from the canonical response or canonical reread

The lawful result is not "the user clicked a card."  
The lawful result is "the entry now canonically names one selected candidate asset id."

### 3. Attachment Validation

The selected candidate must already be canonically attached to the target entry.

Selection must be rejected if any of the following are true:

- the candidate asset id is not present in the target entry's `candidate_assets`
- the current workpiece/workspace context does not match the image-map entry context
- the candidate belongs to a different entry
- the candidate list changed canonically before save completed

The system must prefer "selection rejected" over "best effort keep the old click."

### 4. Rejection / Residue

Candidate-selection work must reject or ignore:

- stale local remembered selection after canonical reread changed the candidate set
- late async save responses after the active workpiece or selected entry changed
- local highlighted-card state that no longer matches canonical `selected_asset_id`
- attempts to select previews or failed candidates that never became canonical assets

If canonical save fails or canonical reread disagrees, the UI must fall back to canonical truth, not preserve fake selection state.

## Explicit Demotions

The following are non-authoritative in candidate-selection work:

- highlighted candidate card UI state
- remembered "last selected" client memory
- optimistic selected styling before canonical save returns
- stale preview state
- stale candidate arrays after canonical reread changed
- any locally reconstructed selected-candidate object

These may improve responsiveness, but they must not determine which candidate is actually selected.

## Guardrails

Candidate-selection work must not:

- regenerate candidates as part of selection
- allow selection of free-floating preview images
- create a second selected-image store outside the canonical image map
- start Hammer consumption yet
- infer selection from visual ordering or local focus

Selection truth for v1 must remain:

- one canonical `selected_asset_id`
- attached to one canonical image-map entry
- persisted through the canonical image-map seam

## Proof Obligations

Candidate-selection implementation must prove all of the following:

- a canonically attached candidate can be selected for its own entry
- canonical reread returns the same `selected_asset_id`
- selecting candidate A clears candidate B from authoritative downstream status for that entry
- selection is rejected when the candidate id is not part of the current canonical `candidate_assets`
- stale local selection residue is replaced by canonical truth after reread
- a second client converges on the same selected candidate after canonical save

## Done Means

This later candidate-selection unit is complete only when all of these are true:

- a user can choose one canonically attached candidate for an image-map entry
- the chosen candidate is persisted as canonical `selected_asset_id`
- canonical reread preserves that selected id cleanly
- invalid or stale selections are rejected cleanly
- no local highlighted-card or remembered selection state is required for correctness
- Hammer consumption is still out of scope

## Implementation Bias

Use the existing canonical image-map seam first.

Prefer:

- current `candidate_assets` on the entry
- current `selected_asset_id` on the entry
- current `GET /tongs/workpieces/:id/image-map`
- current `PUT /tongs/workpieces/:id/image-map`

Only introduce a new API or DB seam if code audit proves that lawful selection validation cannot be expressed cleanly through the existing canonical image-map save path.

Later implementation plan:

- `HEARTH_VISUAL_PLANNING_LATER_CANDIDATE_SELECTION_PLAN.md`
