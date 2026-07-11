# Hammer Step 9 Validation Record

Recorded: 2026-07-11

## Objective

Prove the Step 8 automatic-placement path under real preview lifecycle churn, then harden only
failures demonstrated by that proof. Placement scoring, persistence contracts, serialized state,
MediaPipe provider contracts, and database schema remain unchanged.

## Defects closed

1. A completed placement result could remain exposed after the paused preview sought or changed
   source, until a later analysis capture replaced it.
2. A frame whose face provider returned `unavailable` could remain in an implicit waiting state
   because unavailable results have no producer-owned frame reference.
3. Pending owned captures could be replaced without one neutral queue making release ownership
   executable.
4. Continuous shared analysis could republish a semantically unchanged placement result because a
   React effect depended on the aggregate view-model object, producing a maximum-update-depth loop.

## Executable proof

- `PlacementAnalysisLifecycle` pairs matte and face evidence only for the latest exact frame,
  bounds retention to eight frames by default, and erases all authority on reset.
- `evaluatePlacementFrameAgainstDisplay` rejects active playback, source changes, seeks, resize,
  coordinate-space changes, and geometry changes at the final commit boundary.
- `LatestOwnedAnalysisFrameQueue` releases superseded pending captures while leaving in-flight
  release to the consumer that took ownership.
- Focused tests cover same-timestamp recapture, unavailable analysis, bounded retention, reset,
  every display mismatch, and capture release ordering.
- The integration contract test prevents the unstable aggregate-object effect dependency from
  returning.

## Live editor proof

The Nursery development editor was run with a deterministic visual-timeline fixture and a local
synthetic 640x360 video. The committed repository contains the fixture builder, not the temporary
media file.

Observed through the real editor UI:

- shared MediaPipe segmentation and face analysis initialized against the placement source plane;
- `Apply Auto Position` committed `lower_right` at 74% X and 77% Y;
- the edit entered canonical history as one undo step;
- undo restored 0% X and 0% Y;
- redo restored the automatic placement;
- a paused seek produced a new presentation time and continued only with refreshed evidence;
- after the dependency fix, a fresh analysis session and placement commit produced zero additional
  React maximum-update-depth errors.

The unauthenticated development stub predictably refused Tongs requests and emitted MediaPipe's
normal initialization diagnostics. Those messages did not grant persistence, alter authority, or
mask application errors.

## Scope locks

- No placement score or candidate-generation change.
- No persistence, database, RLS, migration, or wire-contract change.
- No new segmentation, face-analysis, freshness, frame-clock, history, or resolver authority.
- No production logging added per frame.
- Manual placement remains available for every automatic-placement refusal.

## Final gates

- 202 production sources were coverage-instrumented; 119 discovered tests were strict-compiled.
- Stable and seed-`260710` shuffled runs both passed 119/119 on the repository-pinned Node 20.20.0.
- Coverage passed at 37.92% lines/statements, 67.35% branches, and 78.75% functions; all 22
  authority-critical per-file floors passed.
- Hammer source types, strict test-boundary types, Nursery types, the type-safety ratchet, scoped
  lint, Hammer production integration build, and independent repository build passed.
- The Node 24 shell was rejected before product execution because its extensionless ESM behavior is
  incompatible with the repository's pinned runtime; all authoritative gates were rerun on Node 20.
- Repository lint remains blocked only by the three pre-existing non-Hammer findings already
  recorded for Anvil, Henry, and Tongs.
