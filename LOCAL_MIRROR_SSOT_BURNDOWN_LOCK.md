# Local Mirror SSOT Burndown Lock

Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. SSOT persistence policy is defined in `AGENTS.md` and `README.md`.

Date locked: 2026-03-11

Execution plan:

- `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`

## Decision

The local mirror SSOT burndown is locked to the following rule:

- No product behavior may require local mirror presence to function correctly.
- Local state may cache or stage, but canonical state must be recoverable from SSOT alone.
- Mirrors may accelerate access; they may not determine reality.

## What Counts As A Mirror Dependency

A mirror dependency exists when any product behavior requires one of the following to be present or current in order to behave correctly:

- local mirror files on disk
- `localStorage`
- non-canonical in-memory residue from a prior session
- stale local fallback state treated as present-tense truth

Common examples:

- a surface only shows sparks, workpieces, or candidate rows if a local mirror was populated first
- refresh or second-client behavior fails because the active workpiece cannot be reconstructed from canonical state alone
- derived asset presence or freshness is inferred from local file existence instead of canonical metadata
- cross-tool handoff depends on last local selection instead of explicit canonical identifiers

## Allowed Local State

The following remain allowed:

- transient optimistic UI state that is replaced by canonical results
- local staging before canonical commit
- explicit fallback caches used only when canonical read fails
- disposable performance caches that can be deleted without changing product truth
- mirror-folder ingestion flows where Tongs assumes ownership after upload

Allowed local state must not become authoritative simply because it is faster to read.

## Prohibited Local Authority

The following are forbidden:

- mirror-only discovery of sparks, workpieces, Ready candidates, or derived assets
- local fallback state presented as canonical without canonical revalidation
- deep-link or handoff behavior that depends on prior local selection state
- local Ready/session/planner candidacy flags that outrank canonical query results
- local file presence treated as current derived-asset truth when canonical metadata exists or should exist

## What Authoritative Means

For this burndown, a behavior is authoritative only if:

- it is recoverable from canonical SSOT alone after refresh
- it is recoverable on a second client without prior local context
- it is stable under direct deep-link to explicit identifiers such as `workspace_id` and `workpiece_id`
- deleting local mirrors, `localStorage`, or transient in-memory residue does not change the canonical result

## Acceptance Test For Mirror Removal

A mirror dependency is considered removed only when all of the following are true:

- the product still behaves correctly with empty `localStorage`
- the product still behaves correctly with no local mirror file present
- refresh reconstructs the same canonical state
- a second client can reach the same result from SSOT alone
- direct deep-link entry works without prior local warmup

## Required Seams For The Burndown

The implementation plan must treat these seams explicitly:

- entry-surface bootstrap
- active workpiece hydration
- draft/session attachment recovery
- Ready/session candidate derivation
- derived asset presence and freshness
- cross-tool handoff assumptions
- local-only optimistic residue

## UX Rule

If canonical state is unavailable, the UI may degrade honestly. It must not quietly substitute local mirror truth and pretend nothing happened.

## Non-Goals

This lock does not require:

- removing every local cache from the product
- redesigning offline authoring
- eliminating mirror-folder ingestion entirely
- performance tuning unrelated to authority removal

