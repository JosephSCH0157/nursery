# Hearth Visual Planning v1 Slice 3 Candidate Lock

> Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Phase 5 production-prep direction is defined in `HEARTH_TONGS_PHASE_5_PLAN.md`. Existing canonical image-map persistence is defined by the shipped Tongs `/image-map` seam and `forge.episode.package.v2`.

Date: March 11, 2026  
Theme: `Hearth Visual Planning v1`  
Slice: `Slice 3 - still-image candidate generation`

## Decision

Slice 3 is locked to the following rule:

Canonical image-map entries may own generated still-image candidate references, but candidate existence and attachment derive from canonical asset persistence, not transient generation state, local preview residue, or client memory.

In practical terms:

- an image-map entry may request still-image generation
- the slice must produce at least two still candidates per generated request
- the two candidates must be intentionally distinct, not trivial prompt duplicates
- those candidates become real only after canonical persistence and attachment
- a generated preview is not a candidate asset until Tongs has ratified it as canonical asset state

## Scope

Slice 3 covers only:

- generating still-image candidates for existing canonical image-map entries
- persisting candidate asset references canonically on those entries
- preserving correct workpiece/workspace/image-map-entry attachment
- preventing stale, failed, or mismatched generated candidates from looking attached when canon does not say so

Slice 3 does not cover:

- candidate selection
- Hammer-facing reads
- transcript alignment
- B-roll or motion generation
- text rendered into images
- a large style system beyond whatever is trivially necessary to request usable stills

## Canonical Baseline

Slice 1 and Slice 2 already established:

- canonical image-map entry persistence through the Tongs `/tongs/workpieces/:id/image-map` seam
- structured exact script-span anchors in `episode.image_map.entries`
- candidate asset reference fields on image-map entries
- first-pass visual beat extraction from canonical script state

Slice 3 must build on that existing seam. It must not invent a second editable image-map source or a second client-side candidate authority object.

## Locked Questions

### 1. Candidate Generation

A lawful Slice 3 generation request must originate from an existing canonical image-map entry.

That means:

- the entry already exists in canonical workpiece image-map state
- the request is scoped by canonical `workspace_id` + `workpiece_id`
- the request is tied to one concrete image-map entry id
- the request uses the entry's canonical anchor and prompt basis as generation inputs
- the generation input is derived from the exact anchored beat context, not from the whole paragraph blob by default

The lawful generation input should pull from:

- `visual_intent`
- `prompt_basis`
- the exact `span_text`
- limited adjacent sentence context only when it improves clarity

No client-only preview row may request candidate generation as if it were already canonical.

### Candidate Quality Rule

Slice 3 must optimize for editorial usefulness, not generic image novelty.

For v1, a strong candidate is:

- relevant to the anchored beat
- visually clear
- distinct from the sibling candidate
- usable for later editorial selection

The quality bias should favor:

- clean composition
- obvious subject
- strong silhouette
- readable geography or relationship when relevant
- restrained clutter
- historically or contextually grounded visuals when relevant

Slice 3 must not optimize for:

- text rendered into the image
- over-stylized fantasy mush
- hyper-busy collage noise
- vague symbolic art unless the beat genuinely calls for it

### 2. Canonical Persistence

Generated stills become candidate truth only after canonical persistence.

Slice 3 must therefore:

- persist generated image assets through the current Tongs asset/file spine
- attach returned canonical asset refs to the correct image-map entry's `candidate_assets`
- persist that updated entry set through the canonical image-map write seam

Each candidate should preserve enough canonical metadata for later tuning and downstream use, including at minimum:

- source image-map entry id
- generation prompt used
- visual mode used
- simple variant label

The lawful result of generation is not "the browser saw an image." The lawful result is "the image-map entry now holds canonical candidate asset refs."

### 3. Attachment Truth

Candidate attachment must be canonical and unambiguous.

Each candidate must be tied to:

- the correct `workspace_id`
- the correct `workpiece_id`
- the correct image-map entry id

Local preview state, prior package snapshots, or remembered client mappings must not decide what entry a candidate belongs to.

### Mode-Aware Generation Rule

Slice 3 should classify the likely visual mode for a beat when helpful.

Useful v1 modes include:

- comparison
- map
- location
- event scene
- concept illustration
- person / figure
- object / detail

Not every beat should default to a cinematic scene. Some beats should be generated as clearer explanatory stills instead.

### 4. Rejection / Residue

Slice 3 must reject or ignore any candidate state that is not canonically valid.

This includes:

- failed generations
- stale candidate previews
- candidates returned for the wrong workpiece or wrong entry
- late async results that arrive after the active context changed
- locally remembered candidate lists that disagree with canonical rereads

The product must prefer "candidate not attached" over "probably attached."

### Variant Rule

The two candidates should be intentionally different.

Preferred variant pattern:

- one clearer / more explanatory option
- one more cinematic / illustrative option

Slice 3 must not treat "same prompt twice" as sufficient diversity.

## Explicit Demotions

The following are non-authoritative in Slice 3:

- generated preview blobs before canonical persistence
- optimistic candidate thumbnails
- local candidate arrays not yet ratified by Tongs
- remembered "current candidates" UI state
- stale client-side image-map snapshots
- client-side attachment mappings that outlive canonical reread

These may accelerate UI feedback, but they must not determine whether a candidate exists, is attached, or is current.

## Guardrails

Slice 3 must not:

- build candidate selection
- make UI state authoritative during generation
- create free-floating generated images with no canonical image-map entry attachment
- invent a second artifact path outside the existing Tongs workpiece asset spine
- start Hammer-facing reads
- generate text-in-image

Local presence or generated preview state alone MUST NOT overwrite, replace, reattach, or refresh a candidate that already has canonical identity.

### Canonical Quality Gate

A generated image does not count as a lawful candidate until it passes basic canonical sanity checks:

- the image returned successfully
- the persisted asset is valid for the intended aspect/size family
- it is attached to the correct image-map entry
- the sibling candidates are not trivially identical

If a candidate fails these checks, it must not be persisted as an attached canonical candidate.

## Proof Obligations

Slice 3 implementation must prove all of the following:

- a lawful image-map entry can request still generation
- at least two still candidates are produced for that entry
- the two candidates are intentionally distinct enough to provide a real editorial choice
- those candidates are canonically persisted
- rereading the canonical image map returns the same candidate refs on the same entry
- stale or mismatched candidate state is rejected or ignored instead of appearing attached
- a second client converges on the same candidate refs after canonical persistence

## Done Means

Slice 3 is complete only when all of these are true:

- an existing canonical image-map entry can request still-image candidate generation
- the system produces at least two candidate stills for that entry
- those candidates are relevant, clear, distinct, and selectable enough for editorial review
- the resulting candidate asset refs are canonically attached to that entry
- canonical reread preserves those refs cleanly
- no selection logic is required for the slice to function
- no local preview or optimistic residue is required for correctness

## Implementation Bias

Use existing canonical Tongs seams first.

Prefer:

- the current workpiece image-map seam
- the current Tongs asset/file persistence spine
- existing canonical reread/roundtrip patterns

Only introduce a new API or DB seam if code audit proves that current asset persistence cannot express candidate still generation and lawful attachment cleanly.

Implementation plan:

- `HEARTH_VISUAL_PLANNING_V1_SLICE_3_IMPLEMENTATION_PLAN.md`
