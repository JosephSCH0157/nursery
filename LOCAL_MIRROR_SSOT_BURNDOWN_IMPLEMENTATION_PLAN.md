# Local Mirror SSOT Burndown Implementation Plan

Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. The mirror-authority rule is locked in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`.

Status: Slices 1, 2, and 3 complete on 2026-03-11. Remaining slices still planned.

Completion notes:

- `LOCAL_MIRROR_SSOT_SLICE_1_COMPLETION.md`
- `LOCAL_MIRROR_SSOT_SLICE_2_COMPLETION.md`
- `LOCAL_MIRROR_SSOT_SLICE_3_COMPLETION.md`
- `LOCAL_MIRROR_SSOT_SLICE_4_COMPLETION.md`

Execution locks:

- `LOCAL_MIRROR_SSOT_SLICE_3_CANDIDACY_LOCK.md`
- `LOCAL_MIRROR_SSOT_SLICE_4_DERIVED_ARTIFACT_LOCK.md`
- `LOCAL_MIRROR_SSOT_SLICE_5_CROSS_TOOL_HANDOFF_LOCK.md`
- `LOCAL_MIRROR_INGEST_STATE_MACHINE.md`

**Mirrors may accelerate access; they may not determine reality.**

## Purpose

Remove remaining product behaviors that still depend on local mirrors, local-only residue, or stale fallback state as authority when canonical SSOT should decide the outcome.

## Scope

In scope:

- Hearth entry-surface bootstrap
- active workpiece hydration and refresh recovery
- draft/session attachment recovery
- Ready/session candidate derivation
- derived asset presence and freshness checks
- cross-tool handoff assumptions
- local-only optimistic residue that outlives canonical settle

Out of scope:

- eliminating every cache or mirror optimization
- broader offline authoring redesign
- storage performance tuning unrelated to authority
- lifecycle policy changes already settled elsewhere

## Burn-down Seams

### 1. Entry-Surface Bootstrap

Target behaviors:

- Hearth opened directly
- Sparks mode on initial load
- initial workpiece and spark discovery

Old mirror-backed failure class:

- product opens to an empty or partial surface until a local mirror or prior local sync has populated data

Canonical replacement path:

- bootstrap from SSOT-backed list/read routes only
- treat local residue as fallback or optimistic decoration, never source-of-truth discovery

## 2. Active Workpiece Hydration

Target behaviors:

- refresh and reopen
- deep-link to `workspace_id` + `workpiece_id`
- selected workpiece recovery after rerender or second client

Old mirror-backed failure class:

- active workpiece can only be reconstructed if local draft/session residue still exists

Canonical replacement path:

- resolve active workpiece from canonical workpiece summary plus canonical script/package reads
- allow attached buffers to be re-created from canonical state

## 3. Draft And Session Attachment Recovery

Target behaviors:

- attached draft buffer recovery
- revision/history recovery
- session and planner attachment recovery

Old mirror-backed failure class:

- draft/session identity leaks into navigation or lifecycle truth
- local residue quietly re-attaches stale context as if it were canonical

Canonical replacement path:

- workpiece remains the cross-tool identity
- attached draft/session state is re-hydrated from canonical seams or honestly absent

## 4. Ready And Session Candidate Derivation

Target behaviors:

- Ready lists
- planner/session candidate surfaces
- stale-vs-active determination

Old mirror-backed failure class:

- local Ready/session residue affects present-tense candidacy

Canonical replacement path:

- derive candidacy only from canonical query state
- local state may cache display order or optimistic transitions only until canonical settle

## 5. Derived Asset Presence And Freshness

Target behaviors:

- image-map presence and freshness
- thumbnail/asset currentness
- package-derived output discovery

Old mirror-backed failure class:

- local file existence or stale local copies imply current derived-asset truth

Canonical replacement path:

- derived-asset presence and freshness come from canonical Tongs metadata and package state
- local mirrors remain ingestion or convenience only

## 6. Cross-Tool Handoff Assumptions

Target behaviors:

- Hearth -> Anvil
- any future Hammer / Quench / planner handoff

Old mirror-backed failure class:

- handoff relies on prior local selection or locally cached script context

Canonical replacement path:

- handoff resolves from explicit canonical identifiers and canonical script/package state

## 7. Local-Only Optimistic Residue

Target behaviors:

- optimistic UI that survives canonical failure or page transitions

Old mirror-backed failure class:

- optimistic residue becomes long-lived fake truth

Canonical replacement path:

- optimistic state must collapse to canonical result or explicit degraded-state messaging

## Slice Structure

Each burndown slice should document:

- dependency leak being removed
- old mirror-backed behavior
- canonical replacement path
- affected files and routes
- verification plan
- known caveats

Recommended completion-note naming:

- `LOCAL_MIRROR_SSOT_SLICE_1_COMPLETION.md`
- `LOCAL_MIRROR_SSOT_SLICE_2_COMPLETION.md`

## Recommended Slice Order

### Slice 1 - Entry Surfaces

- Hearth open
- Sparks list
- initial workpiece/spark discovery

Status: complete

### Slice 2 - Active Hydration

- refresh/reopen
- selected workpiece recovery
- attached draft buffer recovery

Status: complete

### Slice 3 - Candidacy Surfaces

- Ready lists
- planner/session candidates
- stale-vs-active determination

Lock source: `LOCAL_MIRROR_SSOT_SLICE_3_CANDIDACY_LOCK.md`

Execution plan: `LOCAL_MIRROR_SSOT_SLICE_3_IMPLEMENTATION_PLAN.md`

Status: complete

### Slice 4 - Derived Artifact Truth

- derived asset presence
- freshness checks
- canonical package-vs-asset reconciliation

Lock source: `LOCAL_MIRROR_SSOT_SLICE_4_DERIVED_ARTIFACT_LOCK.md`

Ingest reference: `LOCAL_MIRROR_INGEST_STATE_MACHINE.md`

Execution plan: `LOCAL_MIRROR_SSOT_SLICE_4_IMPLEMENTATION_PLAN.md`

Status: complete

### Slice 5 - Cross-Tool Handoff

- Anvil handoff
- any remaining tool-entry assumptions that still need prior local context

Lock source: `LOCAL_MIRROR_SSOT_SLICE_5_CROSS_TOOL_HANDOFF_LOCK.md`

Execution plan: `LOCAL_MIRROR_SSOT_SLICE_5_IMPLEMENTATION_PLAN.md`

## Verification Plan

For each slice:

- add a targeted regression proving the old mirror dependency is gone
- verify refresh and second-client reconstruction from SSOT alone
- verify direct deep-link behavior without prior local warmup
- run `pnpm --filter nursery typecheck`
- run affected package confidence/regression suites
- run `pnpm smoke:core`

Where a wrapper is known to be flaky or slow, record that caveat honestly in the slice completion note rather than laundering it into a fake green status.

## Exit Criteria

The burndown campaign is complete only when:

- no user-visible product behavior requires local mirror presence
- local fallbacks are explicitly degraded, not quietly authoritative
- refresh, second-client, and deep-link behavior reconstruct from SSOT alone
- completion notes exist for each slice that changed behavior
