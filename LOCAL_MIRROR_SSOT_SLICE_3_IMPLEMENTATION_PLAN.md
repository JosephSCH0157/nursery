# Local Mirror SSOT Slice 3 Implementation Plan

Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Slice 3 candidate-truth rules are locked in `LOCAL_MIRROR_SSOT_SLICE_3_CANDIDACY_LOCK.md`.

Slice 3 status: completed on 2026-03-11.

Completion note:

- `LOCAL_MIRROR_SSOT_SLICE_3_COMPLETION.md`

**Canonical query state alone determines Ready/session candidate existence, eligibility, and ordering.**

## Purpose

Implement Slice 3 so candidate truth no longer depends on local derivations, stale client residue, or optimistic state that survives canonical resolution.

This slice should make Ready/session candidate surfaces tell the same truth across refresh, second client, workspace switch, and post-mutation reconcile.

## Scope

In scope:

- canonical Ready list membership
- canonical session/planner candidate membership
- stale-vs-active determination after canonical query resolution
- candidate ordering and regrouping after canonical refresh
- reconciliation of transient optimistic candidate display against canonical results

Out of scope:

- new lifecycle policy outside candidate derivation
- derived-asset freshness redesign
- broader offline redesign
- cross-tool handoff redesign outside candidate truth
- archive/restore policy changes already settled elsewhere

## Core Decisions

### 1. Existence

Question:

- Which workpieces appear as candidates, and only by what canonical query?

Slice 3 rule:

- a candidate exists only if it is returned by the canonical server query for the active workspace
- no local remembered list may add candidate rows after canonical query resolves
- workspace changes invalidate prior candidate lists immediately until the new canonical query returns

Primary canonical seams to audit:

- `packages/tongs/src/workpiece-commit-api.ts`
- `apps/hearth/src/lib/hearth-ready-scripts.ts`
- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/nursery/src/routes/TongsRecordingSessions.tsx`

Preferred implementation bias:

- do not add a new persistence seam unless current canonical query surfaces cannot express active candidate truth cleanly
- if a new server-side seam is required, stop and call out the DB/API change explicitly before coding

### 2. Eligibility

Question:

- What exact canonical conditions make a workpiece Ready/session-eligible?

Slice 3 rule:

- eligibility must come from current canonical state only
- prior local knowledge that a workpiece was once ready or once candidate-eligible does not matter after canonical resolution
- stale planner/session references may remain historically visible, but they must not be treated as active candidate truth

Planning questions to answer before coding:

1. Is `GET /tongs/workspaces/:id/ready-scripts` already the complete canonical source for active Hearth Ready candidacy?
2. Do planner/session surfaces need an additional canonical projection, or can they derive stale-vs-active entirely from current Ready query results plus preserved references?
3. Are any current UI decisions still driven by locally cached candidate arrays instead of the canonical query result?

### 3. Ordering

Question:

- What canonical source decides rank/order, and when does that supersede local optimism?

Slice 3 rule:

- canonical queue/order metadata determines final candidate order
- optimistic reorders may appear transiently while mutation is in flight
- once canonical query resolves, local ordering residue must snap to canonical order without preserving stale rows or stale rank

Ordering questions to answer before coding:

1. Which surfaces still reuse prior client order after canonical refresh?
2. Does any planner/session candidate view sort from remembered client residue instead of canonical order?
3. Are hidden/ineligible rows ever preserved in visible order because a prior local list survived canonical settle?

## Backend Decisions

Primary file:

- `packages/tongs/src/workpiece-commit-api.ts`

Expected backend posture:

- canonical candidate routes return the full present-tense truth for membership, eligibility, and order
- archived, hidden, or otherwise inactive rows are excluded from active candidate responses unless a route explicitly requests them for historical/stale display
- server ordering remains authoritative even after optimistic client mutations

Preferred first implementation:

- keep candidate truth derived from existing canonical Ready/query seams if they are already sufficient
- only expand server DTOs if a planner/session surface needs canonical stale markers or explicit active/inactive projection

## Hearth UI Decisions

Primary files:

- `apps/hearth/src/lib/hearth-ready-scripts.ts`
- `apps/hearth/src/routes/HearthShell.tsx`

Slice 3 UI rule:

- Hearth may show transient loading or optimistic candidate state
- Hearth must replace that state with canonical candidate truth as soon as canonical query resolves

Required UI outcomes:

- empty local readiness material does not block or change candidate discovery
- canonical candidate refresh overwrites stale local rows and stale local order
- ineligible workpieces do not remain visible as active candidates because the client had seen them earlier
- stale references are marked stale, not left in the active candidate lane

## Planner And Session Decisions

Primary file:

- `apps/nursery/src/routes/TongsRecordingSessions.tsx`

Slice 3 planner/session rule:

- active planner/session candidates derive from canonical current state
- stale references remain historically visible only if the product already preserves them for context
- planner/session UI must not silently convert stale historical references back into active candidates because of local residue

Preferred first implementation:

- preserve historical reference visibility where it already exists
- derive active-vs-stale from canonical current candidate results
- block or warn on actions that assume active candidacy when canonical state disagrees

## Verification Plan

### Tongs

- regression tests prove canonical candidate query excludes ineligible rows even with no client cache assumptions
- regression tests prove canonical ordering reflects server state, not prior client order
- regression tests prove hidden/archived/non-candidate rows do not reappear through stale derivation

### Hearth

- confidence tests prove candidate discovery works with empty local readiness material
- confidence tests prove canonical refresh overwrites stale local candidate rows and order
- confidence tests prove second client sees the same candidate set/order from SSOT alone
- confidence tests prove optimistic display collapses cleanly to canonical candidate truth

### Planner / Session

- targeted regressions prove planner/session surfaces use canonical active candidate truth
- stale references remain stale and do not present as active candidates after canonical refresh

### Wrapper / Smoke

- run `pnpm --filter nursery typecheck`
- run affected Hearth confidence/regression suites
- run targeted Tongs regression suites
- run `pnpm smoke:core`

## Implementation Order

1. audit current canonical candidate routes and identify any remaining local candidate authority paths
2. patch Tongs candidate/query seams if server DTO or filtering changes are required
3. patch Hearth Ready/candidate surfaces so canonical query results replace local residue decisively
4. patch planner/session surfaces so active-vs-stale derives from canonical current candidate truth
5. add targeted regressions and confidence proofs
6. verify package and smoke paths
7. write `LOCAL_MIRROR_SSOT_SLICE_3_COMPLETION.md`

## Exit Criteria

Slice 3 is complete when all of the following are true:

- candidate lists can render with zero cached readiness material
- canonical query result fully determines candidate membership
- canonical query result fully determines candidate eligibility
- canonical query result fully determines candidate ordering
- local optimism appears only transiently and is overwritten cleanly on canonical resolve
- cross-client candidate views converge on the same truth
- a completion note records what shipped, how it was verified, and any wrapper caveats honestly

Slice 3 meets these criteria.
