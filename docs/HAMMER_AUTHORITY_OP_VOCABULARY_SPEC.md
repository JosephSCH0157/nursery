# HAMMER AuthorityOp Vocabulary Spec

Status: Draft  
Scope: Proven governed editing mutation families in Hammer  
Updated: 2026-04-18

## Purpose

Freeze the current proven Hammer editing vocabulary from implementation evidence, not theory.

This document defines the official governed editing language currently validated through:

- composition-gated mutation wiring
- persistence and reload sync tests
- live editor smoke checks where environment permits

This is not the full future taxonomy.
It is the current canonical vocabulary Hammer may rely on today.

## Canonical Rule

- Authority operation first.
- Projection second.
- Transcript, timeline, preview, edit plan, and persisted editor surfaces must derive from canonical authority intent and must never become parallel authorities.

## Proven Families

The currently frozen proven mutation families are:

- `TRANSCRIPT_DELETE_RANGE`
- `MUTE`
- `TRANSCRIPT_SPLIT`
- `TRANSCRIPT_TRIM`

Current editor-gate discriminants map to these canonical families as follows:

- `TRANSCRIPT_DELETE_RANGE` -> canonical delete range family
- `TRANSCRIPT_TOGGLE_MUTE_SEGMENTS` -> canonical mute family
- `TRANSCRIPT_SPLIT` -> canonical split family
- `TRANSCRIPT_TRIM_SEGMENT` -> canonical trim family

The gate discriminant names may evolve.
The canonical family semantics defined here must not drift.

## Family Classes

The frozen families cover four editing classes:

- destructive edit: delete
- reversible state edit: mute / enable
- structural topology edit: split
- timing edit: trim

This is the minimum evidence base required before broader vocabulary formalization.

## Operation Semantics

### `TRANSCRIPT_DELETE_RANGE`

Canonical intent:
- Remove one or more selected transcript-linked spans from the working composition and ripple downstream timing accordingly.

Required fields:
- source segment ids or canonical selection range reference
- resolved removed time span

Current gate fields:
- `segmentIds`

Deterministic identity rules:
- Delete does not mint child transcript identities.
- Canonical delete intent must append a stable authority operation id.

Projection expectations:
- Transcript segment count may shrink.
- Downstream transcript timing must ripple.
- Timeline-linked visual placements must remap or be removed when the deleted span invalidates them.
- Audio edit must gain matching cut selections for the removed span.

Persistence expectations:
- Canonical authority graph stores the delete operation.
- Compatibility edit plan projection includes the equivalent delete instruction family.
- Persisted transcript snapshot reflects the derived post-delete result.

Reload expectations:
- Reload restores the same canonical delete operation ordering.
- Reload reproduces the same derived transcript/timeline/audio result.

Interaction notes:
- Delete is destructive and timing-compressing.
- Delete may cascade into visual remap and audio cut updates.

### `MUTE`

Canonical intent:
- Mark a transcript segment as excluded from active playback/output interpretation without deleting its source identity.

Required fields:
- `segmentId`

Current gate fields:
- `segmentIds`
- `disabled`

Deterministic identity rules:
- Mute does not create child identities.
- Enable is represented by superseding active mute operations for the same segment rather than inventing a separate opposite operation family.

Projection expectations:
- Transcript segment identity remains stable.
- Derived transcript state marks the segment disabled or enabled.
- Preview and playback selectors treat muted segments as excluded according to current playback rules.
- Timeline geometry does not ripple solely from mute.

Persistence expectations:
- Canonical authority graph stores active mute operations for muted segments.
- Re-enable supersedes prior active mute operations for those segments.
- Compatibility edit plan projection includes only active mute instructions.

Reload expectations:
- Reload restores the same muted/enabled posture from active authority state.
- Superseded mute operations must not reappear as active effect.

Interaction notes:
- Mute is reversible.
- Mute stacks with structural families because it targets the same base segment identity rather than deleting it.

### `TRANSCRIPT_SPLIT`

Canonical intent:
- Add structural interpretation to one base segment by introducing a split boundary at a resolved time inside that segment.

Required fields:
- `segmentId`
- `splitTimeSec`

Current gate fields:
- `segmentId`
- `splitTimeSec`

Deterministic identity rules:
- Split creates deterministic derived child identities.
- Required child id scheme:
  - left: `${segmentId}::split:${opId}:L`
  - right: `${segmentId}::split:${opId}:R`
- `opId` is the appended canonical authority operation id.
- Replay and reload must reproduce the same child ids, not merely equivalent timing.

Projection expectations:
- Transcript projection replaces one visible segment with two derived children around the split boundary.
- Left child timing: `source.start -> splitTimeSec`
- Right child timing: `splitTimeSec -> source.end`
- Selection moves to the right derived child.
- Playhead resolves to the split boundary.
- Timeline and transcript-facing surfaces must use the derived children consistently.

Persistence expectations:
- Canonical authority graph stores the split instruction for the base segment.
- Compatibility edit plan projection includes the split instruction.
- Persisted transcript snapshot reflects the derived left/right children with deterministic ids.

Reload expectations:
- Reload restores the same canonical split instruction.
- Reload reproduces the same derived child ids and timing.

Interaction notes:
- Split is structural, not destructive.
- In composition truth, the source segment remains the base reference; split changes interpretation, not historical source existence.

### `TRANSCRIPT_TRIM`

Canonical intent:
- Narrow the effective playable bounds of one segment by declaring canonical kept timing for that segment.

Required fields:
- `segmentId`
- one or both of:
  - `trimStartSec`
  - `trimEndSec`

Current gate fields:
- `segmentId`
- `trimStartSec`
- `trimEndSec`

Deterministic identity rules:
- Trim does not create child identities.
- A later trim for the same segment supersedes prior active trim operations for that segment.

Projection expectations:
- Derived transcript timing updates to the kept timing window for the target segment.
- Preview and transcript timing views reflect the narrowed range.
- Non-overlapping timeline elements remain stable unless a future explicit remap rule says otherwise.
- Audio alignment must remain synchronized with the same kept timing interpretation.

Persistence expectations:
- Canonical authority graph stores the active trim operation.
- Prior trim operations for the same segment may remain in history but must be marked superseded when no longer authoritative.
- Compatibility edit plan projection includes only the active trim instruction.

Reload expectations:
- Reload restores the same active trim timing.
- Derived transcript timing after reload must match the committed kept range.

Interaction notes:
- Trim is a timing family, not a delete family.
- Trim narrows interpretation; it does not mint child segments.

## Stacking And Supersession Rules

Current evidence-backed stacking rules:

- delete stacks by operation order and changes downstream timing
- mute stacks on base segment identity and is reversed by superseding prior active mute operations
- split mints deterministic children using the split operation id
- trim supersedes prior active trim operations for the same base segment

Current evidence-backed supersession rules:

- enable supersedes prior active mute operations for the same segment
- a newer trim supersedes prior active trim operations for the same segment

Split child identity requires deterministic derivation.
Delete, mute, and trim do not mint child identity in the current frozen vocabulary.

## Persistence And Reload Contract

For every frozen family:

- canonical authority graph is the persisted intent artifact
- compatibility edit plan is a derived projection only
- persisted transcript/editor snapshots may assist current hydrate behavior but must not redefine canonical intent
- reload correctness means canonical intent and its derived visible result are restored together

## Current Non-pure Caveat

Hammer is not yet a full raw-base transcript replay engine.

Current-state caveat:

- transcript projection still relies partly on persisted structured transcript snapshot assistance
- canonical authority is the source of edit intent, but transcript hydrate is not yet rebuilt from raw-base segment truth alone for all families
- this is acceptable during the current migration phase only if canonical intent remains primary and reload reproduces the committed derived state truthfully

This caveat must remain explicit until Hammer can replay transcript structure solely from raw base transcript truth plus canonical authority operations.

## Evidence Basis

These families are frozen because they now have implementation evidence behind them:

- composition-gated editor wiring
- save/reload composition sync tests
- live stub-backed editor smoke evidence for visible behavior

Authenticated reload persistence smoke remains an environment-dependent follow-up, not a blocker to freezing the current proven vocabulary.

## Non-goals

This document does not yet:

- freeze the complete future AuthorityOp taxonomy
- define merge, move, gain, visual placement, or audio polish authority families
- define raw-base-only transcript replay semantics for every future stack combination
- replace the broader editorial authority and render chain spec