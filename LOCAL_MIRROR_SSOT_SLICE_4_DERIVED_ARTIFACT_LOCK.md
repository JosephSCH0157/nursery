# Local Mirror SSOT Slice 4 Derived Artifact Lock

Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Campaign sequencing is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`.

Date locked: 2026-03-11

## Decision

Slice 4 is locked to the following rule:

- Canonical state alone determines derived artifact presence, attachment, and freshness.

Everything else is non-authoritative:

- cached thumbnails
- cached image maps
- cached metadata-derived outputs
- prior client-side package snapshots
- optimistic artifact previews
- stale local attachment mappings
- remembered "current artifact" UI state

These may accelerate display, but they may not answer whether a derived artifact is real, attached, or current.

## Core Questions

### Presence

- Does this artifact exist at all?

Slice 4 rule:

- an artifact exists only if canonical state says it exists
- a stale local copy or preview must not create artifact presence by itself

### Attachment

- What workpiece, draft, or package does this artifact belong to?

Slice 4 rule:

- attachment is determined by canonical relationship only
- client-held remembered pairing must not reattach a derived artifact to the wrong workpiece or package

### Freshness

- Is this the current artifact, or just the last one the client happened to see?

Slice 4 rule:

- freshness/currentness is determined by canonical recency, version, or package truth
- the client must not treat "most recently seen locally" as current truth

## Operational Rules

- A derived artifact may render only as canonical truth or as an explicitly transient preview awaiting canonical settle.
- Workspace or workpiece changes invalidate prior derived artifact display state until canonical artifact state for the new target resolves.
- Once canonical artifact state resolves, stale local artifact residue that disagrees must be cleared, replaced, or marked degraded.
- Late async artifact responses must not overwrite newer canonical attachment or freshness truth.
- A second client must converge on the same derived artifact state from canonical sources alone.

## Explicit Demotions

The following are forbidden as derived artifact authority:

- local thumbnail previews treated as present canonical thumbnails after canonical resolve
- stale image-map entries shown as current because a prior client snapshot still had them
- metadata-derived outputs shown as current from prior package residue
- remembered artifact selection state used to imply current attachment or freshness
- local file presence treated as proof that a canonical derived artifact exists or is current

The following remain allowed:

- transient preview UI while canonical generation/save is in flight
- cached artifact placeholders that are explicitly overwritten by canonical results
- local UI preferences that do not change artifact existence, attachment, or freshness

## Required Proofs

Slice 4 implementation must prove all of the following:

- no cached artifact material still yields correct canonical derived artifact state
- stale artifact residue is cleared or ignored on workspace/workpiece change
- attachment follows canonical state, not prior client memory
- freshness/currentness is determined canonically
- late async artifact responses cannot overwrite newer truth
- second client converges on the same derived artifact state

## UX Rule

If canonical artifact state is still loading, the UI may show loading or an explicitly transient preview. It must not present stale local artifact residue as if it were canonical current truth.

If canonical state disagrees with a preview or cached artifact, the UI must snap to canonical truth or surface an honest degraded state.

## Implementation Intent

Slice 4 should make the following seams obey canonical derived-artifact truth:

- thumbnail presence and current-version display
- image-map presence, attachment, and freshness
- metadata-derived output display and package-derived readbacks
- package-vs-asset reconciliation after save, refresh, and second-client open

The implementation should prefer correcting client authority behavior at existing canonical seams before inventing new persistence or server-side projection unless the code proves those seams are insufficient.

## Non-Goals

Slice 4 does not itself require:

- new lifecycle policy outside derived artifact truth
- broader offline redesign
- cross-tool handoff redesign outside artifact truth
- generic asset-system expansion unrelated to the concrete artifact seams already in product use
