# HAMMER_EDITORIAL_AUTHORITY_AND_RENDER_CHAIN_SPEC

## Purpose
Define Hammer as the canonical editorial authority between Anvil capture and Quench handoff so every known edit is truthful, previewable, reversible, renderable, and handoff-safe.

## Canonical Composition Law
- Hammer has one and only one editorial source of truth: the canonical composition.
- All editing actions mutate the canonical composition.
- Transcript, timeline, preview, staged edit UI, plans, packets, and handoff artifacts are derivations of the canonical composition and must never become parallel authorities.

## Ownership Boundaries
- Hammer owns canonical composition truth and declared execution truth.
- Preview, export, and handoff consume Hammer assembly outputs derived from canonical composition; they do not reinterpret edits privately.
- Quench consumes declared packet truth; it does not infer editorial meaning from side effects.

## Canonical Composition Truth
- Canonical source: the Hammer canonical composition, currently serialized through `HammerEditorialAuthorityGraph` and its compatibility projections during migration.
- Composition truth includes operation identity, ordering, lifecycle, capability posture, provenance, timing, editorial structure, and declared intent.
- No hidden truth rule: UI state, transcript views, timeline views, preview state, and export state are projections over canonical composition.
- The currently frozen proven governed editing vocabulary is defined in `docs/HAMMER_AUTHORITY_OP_VOCABULARY_SPEC.md`.

## Intent vs Execution
- Intent is represented inside canonical composition through operation identity and operation parameters.
- Execution status is represented separately via capability and truth posture metadata.
- Operations may exist canonically even when current runtime cannot execute them fully.

## Preview Truth Contract
Preview is always one of:
- `authoritative`: preview fully reflects declared operation behavior.
- `degraded`: preview reflects partial behavior and must be labeled as such.
- `unavailable`: no truthful preview exists for at least one active operation.

No silent fallback is allowed.

## Render Assembly Truth
Render assembly compiles one canonical composition into three plans:
- preview plan
- export plan
- handoff plan

All plans are produced from one compiler seam and include resolved operations plus degraded/unavailable markers.

## History / Undo / Replay Truth
- Canonical composition deltas are first-class history payloads.
- Undo/redo must preserve canonical composition identity and canonical operation identity.
- Replay and reload rebuild from serialized canonical composition before compatibility projections.

## Quench Handoff Truth
Hammer handoff packet declares:
- active canonical composition operations
- per-operation capability/degradation status
- preview/export posture summary
- deferred and unsupported operations
- artifact linkage back to canonical composition

Legacy packet fields remain for compatibility during migration.

## Capability / Degradation Model
- Capability: `executable | degraded | unavailable`
- Truth posture target: `preview | export | handoff`
- Each operation carries explicit reasons when degraded or unavailable.
- Assembly aggregates operation posture into output-level posture.

## Non-goals
- Shipping new editing feature execution in this slice.
- Building advanced UI authoring surfaces.
- LUT suite, background replacement AI, advanced compositing, multi-cam, or transition catalog expansion.
