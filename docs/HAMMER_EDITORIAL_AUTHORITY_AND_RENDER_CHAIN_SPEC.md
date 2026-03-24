# HAMMER_EDITORIAL_AUTHORITY_AND_RENDER_CHAIN_SPEC

## Purpose
Define Hammer as the canonical editorial authority between Anvil capture and Quench handoff so every known edit is truthful, previewable, reversible, renderable, and handoff-safe.

## Ownership Boundaries
- Hammer owns canonical editorial intent and declared execution truth.
- Preview, export, and handoff consume Hammer assembly outputs; they do not reinterpret edits privately.
- Quench consumes declared packet truth; it does not infer editorial meaning from side effects.

## Canonical Edit Truth
- Canonical source: `HammerEditorialAuthorityGraph`.
- Graph truth includes operation identity, ordering, lifecycle, capability posture, and provenance.
- No hidden truth rule: UI state, transcript views, and timeline views are projections over canonical operations.

## Intent vs Execution
- Intent is represented in operation identity and operation parameters.
- Execution status is represented separately via capability and truth posture metadata.
- Operations may exist canonically even when current runtime cannot execute them fully.

## Preview Truth Contract
Preview is always one of:
- `authoritative`: preview fully reflects declared operation behavior.
- `degraded`: preview reflects partial behavior and must be labeled as such.
- `unavailable`: no truthful preview exists for at least one active operation.

No silent fallback is allowed.

## Render Assembly Truth
Render assembly compiles one canonical graph into three plans:
- preview plan
- export plan
- handoff plan

All plans are produced from one compiler seam and include resolved operations plus degraded/unavailable markers.

## History / Undo / Replay Truth
- Canonical operation deltas are first-class history payloads.
- Undo/redo must preserve canonical operation identity.
- Replay and reload rebuild from serialized canonical graph before compatibility projections.

## Quench Handoff Truth
Hammer handoff packet declares:
- active canonical operations
- per-operation capability/degradation status
- preview/export posture summary
- deferred and unsupported operations
- artifact linkage back to canonical operations

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
