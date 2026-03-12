# Local Mirror SSOT Slice 3 Candidacy Lock

Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Campaign sequencing is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`.

Date locked: 2026-03-11

Execution plan:

- `LOCAL_MIRROR_SSOT_SLICE_3_IMPLEMENTATION_PLAN.md`

## Decision

Slice 3 is locked to the following rule:

- Canonical query state alone determines Ready/session candidate existence, eligibility, and ordering.

Everything else is non-authoritative:

- cached readiness is display acceleration only
- optimistic residue is short-lived and must reconcile against canonical state
- local or session memory is UI convenience only, never candidate truth
- prior client-side derivations are invalid once canonical query resolution completes

## Operational Rules

- A candidate exists only if it is returned by the canonical query seam for the active workspace and current product state.
- A candidate is eligible only if canonical state says it is currently eligible; prior local knowledge that it was once eligible does not matter.
- Candidate ordering comes from canonical query state and canonical queue/order metadata, not from prior local lists that survived a workspace change, refresh, or rerender.
- Once canonical query results resolve, any locally derived candidate rows that disagree must be removed, reordered, or marked stale in favor of canonical truth.
- A second client with the same canonical workspace state must observe the same candidate set and order without prior local warmup.

## Explicit Demotions

The following are forbidden as candidate authority:

- local Ready caches
- stale planner/session candidate arrays
- client-held remembered ordering from a previous workspace or earlier query result
- optimistic candidates that outlive canonical settle
- inferred eligibility from local file presence or local draft/session residue

The following remain allowed:

- transient optimistic display while a canonical mutation is in flight
- cached rows rendered as placeholders only until canonical query resolution completes
- local UI preferences that do not change candidate existence, eligibility, or order

## Required Proofs

Slice 3 implementation must prove all of the following:

- candidate list derives correctly with no cached readiness material present
- candidate ordering comes from canonical state, not prior client residue
- ineligible items do not appear merely because a cache remembered them
- a second client sees the same candidate set and order from SSOT alone
- canonical refresh can overwrite optimistic display without candidate identity confusion

## UX Rule

If canonical candidate state is still loading, the UI may show loading or transient optimistic placeholders. It must not present local residue as the real Ready/session candidate truth.

If canonical state removes an item from candidacy, the UI must remove or stale-mark it honestly rather than quietly preserving it because the client had seen it earlier.

## Implementation Intent

Slice 3 should make the following seams obey canonical candidate truth:

- Hearth Ready list surfaces
- planner/session candidate surfaces
- stale-vs-active determination
- candidate ordering and regrouping after canonical refresh

The implementation should prefer removing local authority rather than inventing new client-side reconciliation categories unless canonical state actually needs a new server-side seam.

## Non-Goals

Slice 3 does not itself require:

- new lifecycle policy outside candidate derivation
- broader offline redesign
- derived-asset freshness redesign
- cross-tool handoff redesign outside candidate truth
