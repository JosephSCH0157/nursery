# Hearth Visual Planning Later Candidate Selection Plan

> Future implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Phase 5 production-prep direction is defined in `HEARTH_TONGS_PHASE_5_PLAN.md`. Candidate selection rules are preserved in `HEARTH_VISUAL_PLANNING_LATER_CANDIDATE_SELECTION_LOCK.md`. Canonical Authority Slice 4 is defined by the S4-0 asset-authority artifacts.

Date: March 11, 2026  
Reclassified: August 27, 2026  
Theme: `Hearth Visual Planning - later candidate planning`  
Status: preserved future work; not canonical Authority Slice 4

## Purpose

Implement this later candidate-selection work so a user can choose one canonically attached still-image candidate for an image-map entry and persist that choice as the entry's authoritative `selected_asset_id`.

The core candidate-selection sentence is:

**A selected still is real only when the canonical image map names one canonically attached candidate asset id for that exact entry.**

## Scope

This later work covers only:

- selecting one canonically attached candidate for an existing canonical image-map entry
- persisting that selection through the current canonical image-map write seam
- validating that the selected asset id belongs to the current entry's `candidate_assets`
- replacing local selection display state from canonical save/reread
- rejecting stale, mismatched, or superseded selection attempts

This later work does not cover:

- generating new candidates
- Hammer-facing reads
- transcript alignment
- timeline placement
- B-roll or motion generation
- broad visual-planning workflow redesign

## Implementation Bias

Use the existing canonical image-map seam first:

- `GET /tongs/workpieces/:id/image-map`
- `PUT /tongs/workpieces/:id/image-map`
- current `candidate_assets`
- current `selected_asset_id`

Do not add a new DB migration or new persistence table unless code audit proves lawful selection validation cannot be expressed through the existing image-map save path.

If implementation hits that wall, stop and say:

**This requires a DB migration / RLS update.**

## Current Canonical Baseline

Available canonical seams today:

- canonical structured image-map entries in `forge.episode.package.v2`
- canonical candidate still refs already attached to entries from Slice 3
- canonical image-map read/write through Tongs
- canonical asset rows for generated candidate images in `tongs.assets`

This slice should stay on those seams. It should not create:

- a second selected-image registry
- a client-owned chosen-image cache
- a free-floating "hero still" object

## Decision Buckets

### 1. Selection Authority

The authoritative selected still for one image-map entry is `selected_asset_id` on that entry.

Preferred rules:

- `selected_asset_id` may be `null`
- `selected_asset_id` may point to exactly one member of `candidate_assets`
- selecting a new candidate replaces the prior selected id
- unselected candidates remain attached as alternates

Preferred behavior:

1. read current canonical entry
2. validate candidate membership
3. write updated entry set with one selected id
4. replace local UI state from the canonical response

UI rule:

- local highlighted card state may exist for hover/focus
- that state must not answer "which candidate is selected?"

### 2. Candidate Membership Validation

Selection must prove that the chosen candidate belongs to the current entry.

Preferred validation:

- candidate asset id exists in `entry.candidate_assets`
- candidate asset path, if present, belongs to the current workpiece image-map candidate path family
- current workpiece/workspace context matches the active entry
- candidate set has not changed canonically since the user last loaded it

Preferred rejection cases:

- selected asset id not present in `candidate_assets`
- entry id not found in current canonical image map
- candidate list changed before save completed
- candidate was superseded or removed by regeneration

The lawful response is rejection plus canonical reread, not best-effort attachment.

### 3. Supersession / Reselection Behavior

Candidate-selection work must define what happens when candidate truth changes after generation.

Preferred rules:

- selecting candidate B replaces candidate A as the single authoritative choice
- regenerating candidates clears `selected_asset_id` unless the exact selected candidate id still exists in the newly persisted `candidate_assets`
- if all old candidates were superseded, selection must reset to `null`
- if the user tries to select a superseded candidate, the save must reject and reread canonical state

This keeps selection downstream-safe:

- one selected id
- zero stale selected ids
- no silent carry-forward of dead candidate identity

### 4. Rejection / Residue

Candidate-selection work must not let stale client residue look like selected truth.

The implementation should explicitly reject or ignore:

- late save responses after active workpiece or selected entry changed
- local highlighted-card state that no longer matches canonical `selected_asset_id`
- stale selected ids after candidate regeneration
- selection attempts against preview-only or non-canonical images
- remembered selection from prior workpiece/entry context

UI rule:

- local optimism may style the clicked card briefly
- if canonical save fails or canonical reread disagrees, the UI must snap back to canonical truth

## Preferred First-Class Seam

The narrowest lawful candidate-selection seam is likely:

- one focused Hearth repo method for "select this candidate for this image-map entry"
- reuse of the existing canonical image-map save path rather than a new endpoint

Preferred client method shape:

```ts
selectWorkpieceImageMapCandidate({
  workpieceId,
  workspaceId,
  imageMapEntryId,
  candidateAssetId,
  expectedMetadataUpdatedAt,
})
```

Preferred implementation path:

1. fetch current canonical image map if the shell does not already hold a fresh copy
2. validate `candidateAssetId` against the entry's current `candidate_assets`
3. rewrite only the target entry's `selected_asset_id`
4. persist via `saveWorkpieceImageMap(...)`
5. return the canonical image-map response

Preferred no-new-route stance:

- reuse `PUT /tongs/workpieces/:id/image-map`
- keep selection validation in Hearth repo plus canonical save conflict handling

If code audit proves repeated whole-image-map saves are too blunt or cannot express lawful server-side validation, then add one narrow route instead of a broad new selection subsystem.

## Hearth UI / Shell Scope

Hearth UI work in this later unit should stay minimal.

Allowed:

- selecting one candidate card for the active entry
- selected/unselected visual treatment
- save progress/error state for selection
- canonical reread reconciliation after save

Not allowed:

- multi-select
- ranking candidates
- per-entry mini history system
- Hammer-facing selection export logic

The shell should always replace local selected state from canonical response or canonical reread after selection completes.

## Proof Plan

Candidate-selection proof should stay narrow and direct.

### Hearth confidence proof

- selecting one canonically attached candidate persists `selected_asset_id`
- canonical reread returns the same selected id
- selecting candidate B replaces candidate A for that entry
- selecting a non-member candidate id is rejected
- regeneration or supersession clears stale selected truth
- stale local selection residue is replaced by canonical response

### Tongs / API proof

No new Tongs route proof is required if this work stays on the existing image-map save seam.

If a new narrow selection route becomes necessary, add:

- dispatch proof
- membership-validation proof
- stale/conflict rejection proof

### Optional browser proof

Not required for initial candidate-selection closeout unless the UI path becomes materially more complex.

If browser proof is later added, it should prove only:

- select one candidate
- refresh
- same selected candidate still appears selected canonically

## Implementation Order

1. Audit current Hearth image-map repo and shell candidate display path for the smallest lawful selection seam
2. Add focused client-side selection helper on top of the current canonical image-map save path
3. Rewire the candidate cards in Hearth to select one canonically attached candidate
4. Clear or reject stale selected ids when candidate lists regenerate or diverge canonically
5. Add targeted Hearth confidence proofs
6. Verify package build/typecheck/smoke
7. Write a candidate-selection completion note only after proofs are green

## Exit Criteria

This later candidate-selection unit is complete only when all of these are true:

- a user can select one canonically attached candidate for an image-map entry
- the chosen candidate persists as canonical `selected_asset_id`
- canonical reread preserves the same selected truth
- only current members of `candidate_assets` are selectable
- regeneration or supersession cannot leave stale selected truth behind
- no local highlighted-card or remembered selection state is required for correctness
- Hammer consumption is still out of scope
