# Hammer Foundation Release Record

Recorded: 2026-07-11
Scope: stabilization foundation through Step 7, before production placement-resolver integration

## Release posture

Hammer's stabilization foundation is approved for Step 8 integration. This is not approval to
commit automatic placements from incomplete analysis. The production commit boundary is now
executable and fails closed until the integration supplies current canonical matte evidence,
exact-current shared face evidence, and an explicitly safe resolver candidate.

The existing auto-position feature remains a dev-only, unsaved preview override. It is not a
second persisted placement authority.

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
| 7 | This change | Automatic placement dependency and commit-refusal policy frozen. |

## Frozen authority contracts

The following contracts are executable and may not be weakened during Step 8:

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
| Hammer production/test source manifests | 196 production files; 117 discovered and strict-compiled tests |
| Stable complete Hammer tests | 117/117 passed |
| Recorded shuffled Hammer tests | 117/117 passed with seed `260710` |
| Coverage | 37.51% lines/statements, 66.90% branches, 78.31% functions |
| Critical coverage | 19 authority-critical files have individual no-regression floors |
| Type safety | Critical `any=0`, critical suppressions `=0`; total debt remains ratcheted |
| Hammer lint | Zero errors; 84 pre-existing Hook dependency warnings remain per-file ratcheted |
| Hammer production integration | TypeScript plus real Vite route/CSS/artifact build passed |
| Repository build | Passed independently of the Hammer-specific build result |
| Repository lint | Still fails only on the recorded non-Hammer Anvil, Henry, and Tongs findings |
| Worktree hygiene | Verification commands leave no tracked generated changes |

## Known limitations carried into Step 8

- The canonical matte runtime currently tracks source presentation time and bounded reuse age; it
  does not independently mint the opaque face-analysis frame token. Step 8 must prove the adapter
  marks matte evidence current only for the requested placement frame. Timestamp proximity alone
  must not be promoted to exact frame identity.
- Production placement does not yet consume `ForegroundMatte.alphaMask` for pixel-accurate overlap.
- Production placement does not yet consume every current `headSafeBoundsPx` result.
- Existing speaker-derived upper-head rectangles remain heuristic until Step 8 replaces their
  face-safety role with current detected head-safe bounds.
- The global coverage percentage is intentionally a baseline, not a quality target. Authority files
  have stronger individual floors while unmounted UI/provider surfaces remain visible as zero.
- Peripheral type debt and Hook dependency warnings remain bounded by their ratchets.

## Step 8 entry conditions

Step 8 may integrate placement only through this lineage:

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

Step 8 must not create another segmentation provider, face detector, frame clock, freshness
evaluator, final-placement resolver, or persistence path.
