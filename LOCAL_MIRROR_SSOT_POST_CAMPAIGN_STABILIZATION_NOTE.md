# Local Mirror SSOT Post-Campaign Stabilization Note

Informational note only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`.

Date recorded: 2026-03-11

## Purpose

Record what changed across the completed local-mirror SSOT burndown campaign, what local state remains legal, what must not be reintroduced, and what future contributors must do when a feature appears to need local authority.

## Campaign Result

The mirror-SSOT burndown campaign is complete.

Canonical truth in Forge is now established by Tongs/cloud state plus receiver-side canonical revalidation where applicable. Local mirror and client residue remain allowed only for intake, staging, short-lived optimism, and non-authoritative acceleration.

## What Changed Across Slices 1-5

### Slice 1 - Entry Truth

- Hearth entry surfaces no longer require mirror-seeded discovery.
- Sparks and initial workpiece discovery now bootstrap from canonical workspace/Tongs state.
- Direct entry and deep-link flows wait for canonical discovery before declaring absence.

Reference:

- `LOCAL_MIRROR_SSOT_SLICE_1_COMPLETION.md`

### Slice 2 - Active Identity Truth

- Active workpiece hydration no longer depends on planning-session or local draft residue as identity authority.
- Canonical workpiece and canonical draft/script reads now determine active context first.
- Session state remains an accelerative hint only.

Reference:

- `LOCAL_MIRROR_SSOT_SLICE_2_COMPLETION.md`

### Slice 3 - Candidate Truth

- Ready and planner/session candidate membership, eligibility, and ordering no longer derive from stale client residue.
- Workspace changes clear stale candidate arrays.
- Late async candidate responses can no longer overwrite newer canonical truth.

Reference:

- `LOCAL_MIRROR_SSOT_SLICE_3_COMPLETION.md`

### Slice 4 - Derived Artifact Truth

- Derived artifact presence, attachment, and freshness now follow canonical state.
- Stale package, thumbnail, and image-map residue no longer survives workpiece changes as fake current truth.
- Canonically misattached artifact payloads are rejected.

Reference:

- `LOCAL_MIRROR_SSOT_SLICE_4_COMPLETION.md`

### Slice 5 - Cross-Tool Handoff Truth

- Hearth -> Anvil handoff payloads are now treated as canonical references plus advisory context only.
- `/app/anvil` revalidates canonical workspace/workpiece/script state before trusting a handoff.
- Stale or mismatched handoff residue is blocked instead of replayed as current truth.

Reference:

- `LOCAL_MIRROR_SSOT_SLICE_5_COMPLETION.md`

## Local State Still Allowed

The following remain legal:

- local mirror folders as intake surfaces for new user-supplied artifacts
- transient optimistic UI state that is replaced by canonical settle
- explicit fallback caches used only when canonical reads fail
- disposable performance caches that can be deleted without changing truth
- local UI preference memory
- session hints that accelerate reopen but do not determine identity, attachment, eligibility, freshness, or handoff validity

## Local State That Must Not Be Reintroduced

The following are prohibited:

- mirror-only discovery of sparks, workpieces, candidates, or derived artifacts
- local/session residue nominating active workpiece identity before canonical reads
- cached candidate arrays determining Ready or session truth after canonical query state changes
- stale thumbnails, image maps, package snapshots, or derived outputs appearing current because the client saw them earlier
- handoff payloads or route params treated as self-authorizing truth without receiver-side revalidation
- local presence alone overwriting, replacing, reattaching, or refreshing an already-canonical artifact

## Tests And Checks That Protect The Law

The following checks now form the practical guardrail set:

- `pnpm --filter @nursery/hearth test:confidence`
- `pnpm --filter nursery test:handoff`
- `pnpm --filter nursery typecheck`
- `pnpm smoke:core`
- package build/type wrappers where they are healthy for the touched seam

Future slice or feature work should extend targeted regression coverage at the exact seam being changed rather than relying on prose or generic smoke alone.

## What To Do If A Future Feature Seems To Need Local Authority

Use this decision order:

1. Ask whether the behavior can be expressed through existing canonical Tongs/cloud reads or receiver-side revalidation.
2. If yes, use the canonical seam and keep local state accelerative only.
3. If no, ask whether the behavior is actually a lawful intake/staging exception rather than a truth-bearing exception.
4. If it is an intake case, keep it in the `Detect -> Stage -> Canonicalize -> Attach -> Confirm` flow and do not let local presence ratify truth.
5. If the feature still needs new persisted truth, relationships, lifecycle, or query behavior, stop and call out that this requires a DB migration / RLS update, then provide the migration and exact code changes.

Future contributors must not solve canonical gaps by teaching local state to impersonate cloud truth.

## Working Rule

Mirrors may introduce, stage, or accelerate.

They may not determine reality.
