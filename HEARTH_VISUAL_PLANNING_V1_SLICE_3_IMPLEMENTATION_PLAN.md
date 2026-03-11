# Hearth Visual Planning v1 Slice 3 Implementation Plan

> Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Phase 5 production-prep direction is defined in `HEARTH_TONGS_PHASE_5_PLAN.md`. Slice 3 candidate-generation rules are locked in `HEARTH_VISUAL_PLANNING_V1_SLICE_3_CANDIDATE_LOCK.md`.

Date: March 11, 2026  
Theme: `Hearth Visual Planning v1`  
Slice: `Slice 3 - still-image candidate generation`

## Purpose

Implement Slice 3 so an existing canonical image-map entry can request still-image candidate generation and persist those candidate refs canonically without introducing free-floating generated-image truth.

The core Slice 3 sentence is:

**Generated previews do not become candidate truth until Tongs has canonically persisted and attached them to the correct image-map entry.**

The quality bar for this slice is:

**Hearth consistently produces two strong, distinct, usable still candidates for each visual beat.**

## Scope

Slice 3 covers only:

- generating at least two still-image candidates for an existing canonical image-map entry
- persisting those generated images through the current Tongs asset/file spine
- canonically attaching the resulting asset refs to the correct image-map entry
- ensuring reread of the canonical image map returns the same candidate refs
- preventing stale, mismatched, or failed candidate state from appearing attached

Slice 3 does not cover:

- candidate selection
- Hammer-facing reads
- transcript alignment
- B-roll or motion generation
- text-in-image
- broad style-system design
- a large new asset architecture

## Implementation Bias

Use current canonical seams first:

- existing Hearth workpiece image-map seam
- existing Tongs workpiece asset/file persistence spine
- existing canonical reread/roundtrip pattern
- existing image generation lane/runtime where it can be reused without breaking attachment truth

Do not add a new DB migration or new persistence table unless code audit proves that current asset persistence cannot lawfully represent generated still candidates and their attachment metadata.

If implementation hits that wall, stop and say:

**This requires a DB migration / RLS update.**

## Current Canonical Baseline

Available canonical seams today:

- image-map read/write:
  - `GET /tongs/workpieces/:id/image-map`
  - `PUT /tongs/workpieces/:id/image-map`
- current image generation seam:
  - `POST /tongs/workpieces/:id/generate-thumbnail`
- current asset spine:
  - canonical workpiece files
  - `tongs.assets`
  - canonical asset/file registration in Tongs

Slice 3 should reuse those patterns before inventing anything broader.

## Decision Buckets

### 1. Candidate Generation

The lawful generation request should originate from one existing canonical image-map entry.

Preferred request inputs:

- `workspace_id`
- `workpiece_id`
- `image_map_entry_id`
- `visual_intent`
- `prompt_basis`
- structured anchor context:
  - `section_id`
  - `paragraph_id`
  - sentence range
  - `span_text`
- optional adjacent sentence context for disambiguation only

Preferred behavior:

- generate at least two stills per request
- use the canonical entry prompt basis and exact beat context to build generation prompts
- keep any style control minimal and optional
- intentionally differentiate the two candidates instead of issuing the same prompt twice

Prompt-construction rule:

- start from the exact anchored beat span
- include limited nearby context only when it improves clarity
- do not use the whole paragraph blob as the base prompt unless the beat itself spans the whole paragraph

Preferred v1 generation metadata:

- generation prompt used
- image-map entry id
- visual mode used
- simple variant label

Guardrail:

- do not allow a client-only unsaved preview entry to request candidate generation as if it were canonical

#### Mode Classification

Slice 3 should classify each beat into a likely visual mode when helpful.

Preferred v1 mode set:

- `comparison`
- `map`
- `location`
- `event_scene`
- `concept_illustration`
- `person_figure`
- `object_detail`

This classification should improve prompt quality, not create a second authority system.

Not every beat should default to a dramatic scene. Some beats should intentionally produce clearer explanatory stills.

#### Variant Strategy

The two candidates should be distinct on purpose.

Preferred variant pattern:

- Candidate A: clearer / more explanatory / diagrammatic bias
- Candidate B: more cinematic / illustrative bias

The implementation should avoid near-duplicate prompt variants.

#### Quality Bias

V1 quality should favor:

- relevance
- clarity
- distinctness
- editorial usefulness

Preferred visual bias:

- clean composition
- obvious subject
- strong silhouette
- readable geography or relationship where relevant
- restrained clutter
- contextually grounded visuals when relevant

Explicitly avoid:

- text-in-image
- over-stylized fantasy mush
- hyper-busy collage chaos
- vague symbolism unless the beat truly calls for it

### 2. Canonical Persistence

Slice 3 needs a focused canonical save path for candidate stills.

Preferred output shape:

- generated image assets are stored canonically through the existing Tongs asset/file spine
- returned canonical asset refs are written into the target entry's `candidate_assets`
- the updated entry set is then saved through the current image-map write seam

Preferred path:

1. read canonical current image map
2. locate the requested canonical entry by id
3. generate two stills through the existing image-generation runtime/persistence path
4. normalize returned asset refs
5. write the updated `candidate_assets` array back through `PUT /tongs/workpieces/:id/image-map`
6. reread or trust the canonical response from that write path

Preferred candidate ref shape remains the current entry field:

```ts
candidate_assets: Array<{
  asset_id: string;
  path?: string | null;
}>
```

No separate client-owned candidate store should be introduced in Slice 3.

### 3. Attachment Truth

Attachment must be explicit and canonical.

The implementation should ensure each generated candidate is tied to:

- the current `workspace_id`
- the current `workpiece_id`
- the target image-map entry id

Preferred storage of attachment metadata:

- asset row metadata in `tongs.assets.metadata_json`
- image-map entry `candidate_assets`
- optional event payloads for audit/history

Preferred attachment metadata in the asset row:

```ts
{
  image_map_entry_id: string;
  paragraph_id: string | null;
  sentence_start: number | null;
  sentence_end: number | null;
  prompt_basis: string;
  visual_mode: string | null;
  variant_label: string | null;
}
```

Preferred asset-kind direction:

- use a distinct candidate-image kind such as `image_map_candidate_image` if the current asset model accepts it cleanly

If the current asset schema/checks do not lawfully accept that kind or required metadata, stop and call out the DB change rather than smuggling candidate semantics through a misleading existing kind.

### 4. Rejection / Residue

Slice 3 must not let stale or failed generation look attached.

The implementation should explicitly reject or ignore:

- failed generations
- candidates returned for the wrong workpiece
- candidates returned after the active workpiece or selected entry changed
- stale local candidate arrays after canonical reread
- mismatched image-map attachment context

Basic candidate sanity checks should include:

- image returned successfully
- canonical asset/file registration succeeded
- returned asset belongs to the intended workpiece
- image-map entry attachment metadata matches the requested entry
- sibling candidates are not trivially identical

UI rule:

- previews may appear transiently as progress feedback
- previews must not be treated as owned candidates until canonical persistence succeeds
- if canonical save fails, the UI must fall back to canonical reread or explicit failure state, not preserve fake attached candidates

## Preferred First-Class Seam

The narrowest lawful seam for Slice 3 is likely:

- one focused Hearth client method for "generate still candidates for this image-map entry"
- one focused Tongs route that:
  - validates workpiece/workspace/entry
  - generates stills
  - persists canonical asset rows/files
  - rewrites the target entry's `candidate_assets`
  - returns the updated canonical image-map view

Preferred route shape:

- `POST /tongs/workpieces/:id/image-map/generate-candidates`

Preferred request shape:

```ts
type GenerateImageMapCandidatesRequest = {
  workspace_id: string;
  image_map_entry_id: string;
  candidate_count?: number; // default 2 for Slice 3
}
```

Preferred response shape:

```ts
type GenerateImageMapCandidatesResponse = {
  image_map: WorkpieceImageMapResponseData["image_map"];
  generated_assets: Array<{
    id: string;
    path: string;
    asset_kind: string;
    status: "ready";
    visual_mode?: string | null;
    variant_label?: string | null;
  }>;
}
```

If code audit proves the current thumbnail-generation route can be cleanly refactored into this seam without blurring thumbnail and image-map candidate semantics, reuse that machinery. If not, add the narrow route above instead of overloading thumbnail behavior.

## Hearth UI / Shell Scope

Hearth UI work in Slice 3 should stay minimal.

Allowed:

- a per-entry action to generate still candidates
- loading/progress/error state for generation
- rendering the returned candidate refs as attached alternates for that entry

Not allowed:

- candidate selection
- timeline semantics
- second authority object for generated candidates

The shell should always replace local candidate display state from the canonical response when generation finishes.

## Proof Plan

Slice 3 proof should stay narrow and direct.

### Tongs / API proof

- generation request for a canonical entry produces two persisted candidate assets
- the two generated candidates are labeled as intentionally distinct variants
- returned canonical image-map state includes the correct `candidate_assets`
- attachment metadata matches the requested entry/workpiece/workspace
- stale or mismatched entry/workpiece requests are rejected

### Hearth confidence proof

- an image-map entry can request candidate generation and round-trip the returned refs cleanly
- beat-specific generation input is derived from the anchored span rather than only whole-paragraph text
- a canonical reread returns the same candidate refs
- failed or stale generation does not leave fake attached candidates in entry state

### Optional browser proof

Not required for initial Slice 3 code closeout unless the code path becomes UI-heavy.

If browser proof is added later, it should prove only:

- generate candidates
- refresh
- same candidate refs still attached canonically

## Implementation Order

1. Audit current thumbnail-generation seam and current image-map repo for the smallest lawful reuse path
2. Add the focused Tongs candidate-generation route/service method if required
3. Add or extend a focused Hearth image-map candidate-generation repo method
4. Rewire Hearth entry actions to call that focused canonical seam
5. Add targeted Tongs and Hearth proofs
6. Verify package build/typecheck/smoke
7. Write a Slice 3 completion note only after proofs are green

## Exit Criteria

Slice 3 is complete only when all of these are true:

- an existing canonical image-map entry can request still-image candidate generation
- at least two still candidates are produced for that entry
- the two candidates are intentionally distinct and editorially usable
- those candidates are canonically persisted through the Tongs asset path
- the entry rereads with the correct candidate asset refs attached
- stale, failed, or mismatched generated outputs do not appear as owned candidates
- no selection logic is required for the slice to function
- no local preview or optimistic residue is required for correctness
