# BELLOWS V1 - Phase One Domain File Plan

## Purpose

Map the Bellows domain inventory into a concrete Phase One file layout so Bellows nouns become compile-time truth before any engine, UI, or browser work begins.

## Phase One Win Condition

By the end of Phase One:

- Bellows domain modules exist under `apps/bellows/src/domain/`
- identifiers, value objects, unions, and aggregates are encoded in TypeScript
- exports compile cleanly at the package boundary

Still out of scope:

- React
- browser APIs
- media capture
- networking
- signaling
- engine transitions
- runtime side effects

## Proposed Domain Layout

```text
apps/bellows/src/
  index.ts
  domain/
    index.ts
    ids.ts
    primitives.ts
    roles.ts
    authority.ts
    participant.ts
    prompts.ts
    broadcast.ts
    segment.ts
    track.ts
    events.ts
    states.ts
    session.ts
```

## File Responsibilities

### `ids.ts`

Branded identifiers and shared brand helper.

Owns:

- session/workspace/user ids
- participant/track/segment ids
- script and artifact ids
- prompt and event ids

### `primitives.ts`

Branded value objects and reusable low-level shapes.

Owns:

- UTC timestamp strings
- millisecond offsets and durations
- frame rate
- checksum
- resolution
- audio format

### `roles.ts`

Session role codes and role assignment shape.

Owns:

- `S1`, `S2`, `G1`, `G2`
- role assignment record

### `authority.ts`

Authority tiers and acting-authority state.

Owns:

- host/co-host/guest/engine tiers
- acting host state
- authority aggregate

### `participant.ts`

Participant identity, presence, readiness, and runtime-facing participant records.

### `prompts.ts`

Audience prompt feed and highlighted prompt shapes.

### `broadcast.ts`

Broadcast platform, broadcast intent/state, and target definition.

### `segment.ts`

Segment continuity, segment boundaries, and sync marker types.

### `track.ts`

Track kind and track aggregate shape.

### `events.ts`

Domain event vocabulary plus action/effect type shells needed later by the engine.

### `states.ts`

Lifecycle, recording, upload, seal, integrity, and outcome states.

### `session.ts`

Session draft, session aggregate, timeline, script reference, and participant slot records.

### `index.ts`

Single export surface for all domain modules.

## Implementation Rule

Phase One defines nouns only.

Bellows verbs begin in Phase Two when the pure session engine is implemented.
