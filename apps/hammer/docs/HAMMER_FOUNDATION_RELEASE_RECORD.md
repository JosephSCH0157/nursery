# Hammer Foundation Release Record

Recorded: 2026-07-11
Scope: stabilization foundation through Step 9 placement lifecycle hardening

## Release posture

Hammer's stabilization foundation and first production visual-analysis consumer are complete.
Automatic image placement now fails closed until the integration supplies current canonical matte
evidence, exact-current shared face evidence, and an explicitly safe resolver candidate. Accepted
placement commits use the existing canonical history mutation and durable persistence boundary.

## Foundation changes

| Step | Commit | Closed uncertainty |
| --- | --- | --- |
| Shared matte prerequisite | `1c6e7653` | One refined canonical foreground matte preserves every credible subject. |
| Shared face prerequisite | `9e03f9fd` | Immutable frame-bound multi-face results and exact freshness evaluation. |
| Neutral face ownership repair | `26a3beb4` | Eye contact consumes shared analysis instead of owning it. |
| 1 | `05366e8b` | Complete current baseline restored and classified. |
| 2 | `bb62c969` | Canonical persistence and recovery precedence made executable. |
| 3 | `ed5fa3fc` | Discovered, executed, and strict-compiled test manifests made equal. |
| 4 | `d06024e6` | Authority-critical unsafe types eliminated and total debt ratcheted. |
| 5 | `4ebd2979` | Real Hammer production build and scoped lint gates established. |
| 6 | `64ec60a1` | All production sources instrumented with global and critical coverage floors. |
| 7 | `81627720` | Automatic placement dependency and commit-refusal policy frozen. |
| 8 | `25b846c6` | Exact-frame matte/face analysis integrated into one production placement commit path. |
| 9 | This change | Analysis lifecycle, display-frame revalidation, owned captures, and live editor behavior hardened. |

## Frozen authority contracts

The following contracts are executable and may not be weakened after Step 9:

1. Supabase-backed canonical persisted truth defeats local caches and legacy projections.
2. Canonical visual timeline data defeats usable legacy visual migration data.
3. Source media identity is immutable during editorial operations.
4. `ForegroundMatte.alphaMask` is the only production foreground-mask authority.
5. The matte refiner preserves every credible subject; only downstream speaker extraction limits
   itself to two components.
6. Shared face analysis is owned by the neutral preview analysis boundary, retains every
   geometrically valid face, and is evaluated current or stale by exact frame reference.
7. Eye contact consumes eligible landmark evidence without truncating the canonical face list.
8. Placement remains one resolver authority. Current rectangle-derived upper-head estimates are
   conservative heuristics and are not face detection.
9. Persistence, recovery, history, undo, preview, and render assembly continue to consume canonical
   editorial state rather than whichever representation is available first.

## Automatic placement commit policy

`evaluateAutomaticPlacementAuthority()` is the mandatory pre-commit policy for Step 8.

Automatic commit is allowed only when all of these are true:

- the canonical matte is current for the requested analysis frame;
- shared face analysis is current for that frame;
- the resolver completed evaluation;
- the resolver returned an explicitly safe candidate after configured scale fallback.

Automatic commit is refused with a stable reason when:

- matte evidence is unavailable, failed, stale, or belongs to another frame;
- face evidence is unavailable, failed, stale, or belongs to another frame;
- current face analysis is structurally malformed;
- candidate evaluation did not run;
- no safe candidate remains after fallback.

A correctly sized all-background matte remains valid current evidence. A current successful
zero-face result also remains valid and is reported as `successful_zero_faces`; it is not relabeled
as provider failure or presented as proof that face safety is guaranteed.

Diagnostics availability never changes production authority. Every refusal preserves manual
placement and existing editorial controls.

## Verification record

| Gate | Recorded result |
| --- | --- |
| Hammer production/test source manifests | 202 production files; 119 discovered and strict-compiled tests |
| Stable complete Hammer tests | 119/119 passed on Node 20.20.0 |
| Recorded shuffled Hammer tests | 119/119 passed with seed `260710` on Node 20.20.0 |
| Coverage | 37.92% lines/statements, 67.35% branches, 78.75% functions |
| Critical coverage | 22 authority-critical files have individual no-regression floors |
| Type safety | Critical `any=0`, critical suppressions `=0`; total debt remains ratcheted |
| Hammer lint | Zero errors; 84 pre-existing Hook dependency warnings remain per-file ratcheted |
| Hammer production integration | TypeScript plus real Vite route/CSS/artifact build passed |
| Repository build | Passed independently of the Hammer-specific build result |
| Repository lint | Still fails only on the recorded non-Hammer Anvil, Henry, and Tongs findings |
| Worktree hygiene | Verification commands leave no tracked generated changes |

## Step 8 closure

- The neutral capture owner creates an independent immutable pixel snapshot for segmentation with
  the exact same opaque frame reference used by shared face analysis.
- Production placement is exposed only when the latest requested capture has matching matte and
  face results. Timestamp proximity is not freshness authority.
- `ForegroundMatte.alphaMask` supplies pixel-accurate foreground and alpha-weighted overlap through
  a summed-area index built once per candidate evaluation.
- Every current `headSafeBoundsPx` is a hard exclusion. Speaker-derived upper-head rectangles remain
  only as backward-compatible resolver heuristics for callers that omit semantic face evidence.
- The matte preserves every credible foreground component while the downstream speaker analyzer
  alone retains at most the two largest qualifying components.
- A structurally valid all-background matte and successful zero-face result remain valid evidence.
- The force-preview UI path was removed. Refusal leaves manual placement available and cannot be
  converted into a persisted automatic edit.
- Accepted geometry uses `commitImagePlacementTransform`, preserving history, undo, canonical
  timeline persistence, and reload behavior.

## Remaining deliberate limits

- Production automatic placement is offered only while preview playback is paused. Moving playback
  never commits placement against a frame that has already advanced.
- The global coverage percentage is intentionally a baseline, not a quality target. Authority files
  have stronger individual floors while unmounted UI/provider surfaces remain visible as zero.
- Peripheral type debt and Hook dependency warnings remain bounded by their ratchets.

## Step 8 completed lineage

Step 8 integrates placement only through this lineage:

```text
requested placement frame
        -> current canonical ForegroundMatte.alphaMask
        -> exact-current shared multi-face/head-safe result
        -> existing deterministic candidate generation
        -> hard rejection against every head-safe bound
        -> pixel-accurate matte overlap scoring
        -> configured scale fallback
        -> evaluateAutomaticPlacementAuthority
        -> one explicit placement commit or explicit refusal
        -> canonical history and persistence
```

Step 8 did not create another segmentation provider, face detector, frame clock, freshness
evaluator, final-placement resolver, or persistence path.

## Step 9 closure

- Matte and face evidence are retained in one bounded lifecycle keyed only by the opaque capture
  epoch and revision. Requesting a newer frame immediately invalidates an older completed pair,
  including when both captures have the same source timestamp.
- Face-provider unavailability is associated with the exact requested frame and becomes an
  explicit fail-closed placement refusal instead of an indefinite waiting state.
- The commit boundary re-reads the displayed source, presentation time, dimensions, coordinate
  space, geometry revision, and playback state immediately before mutation. Any mismatch clears
  the cached result and preserves manual placement.
- Captured frame ownership is explicit: superseded pending frames are released, an in-flight frame
  remains owned by its consumer, and later captures cannot overwrite its pixels.
- A deterministic development-only visual fixture exercises the real editor, shared MediaPipe
  providers, canonical placement command, and existing history controller without introducing a
  persistence authority.
- Live browser verification found and fixed an aggregate-object effect dependency that caused a
  React update loop during continuous analysis. Result publication now depends on the stable
  callback and semantic placement inputs.
