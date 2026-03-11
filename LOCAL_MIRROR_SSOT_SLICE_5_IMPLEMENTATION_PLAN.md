# Local Mirror SSOT Slice 5 Implementation Plan

Implementation plan only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Slice 5 cross-tool handoff rules are locked in `LOCAL_MIRROR_SSOT_SLICE_5_CROSS_TOOL_HANDOFF_LOCK.md`.

Slice 5 status: completed on 2026-03-11. Completion note: `LOCAL_MIRROR_SSOT_SLICE_5_COMPLETION.md`.

**Cross-tool handoff payloads may carry canonical references and advisory context, but receiving truth is established only after receiver-side canonical revalidation.**

## Purpose

Implement Slice 5 so cross-tool transitions no longer depend on cached launch payloads, sender-side residue, stale route params, or remembered local resume state as authority.

This slice should make cross-tool handoff surfaces tell the same truth across direct launch, deep-link reopen, second client, stale payload replay, and canonical context changes after a handoff payload was first created.

## Scope

In scope:

- Hearth -> Anvil open flows
- planner/session entry into recording surfaces
- reopen and resume flows that restore another tool's last context
- handoff payload validation for canonical workspace/workpiece/session/package references
- rejection and degraded-state behavior when revalidation fails
- reconciliation of short-lived optimistic launch UI against receiver-side canonical validation

Out of scope:

- new lifecycle policy outside handoff truth
- redesign of derived artifact truth already covered by Slice 4
- broader collaboration or permissions redesign unrelated to handoff validation
- speculative new handoff protocols for tools not yet in active use
- long-term offline handoff behavior beyond honest blocked/degraded handling

## Core Decisions

### 1. Canonical Payload

Question:

- What is the minimum lawful payload that a sender may hand to another tool?

Slice 5 rule:

- handoff payloads may include canonical identifiers and advisory context only
- lawful payload members include canonical `workspace_id`, `workpiece_id`, and session/package/artifact references only where those can be revalidated by the receiver
- advisory context may improve UX, but it may not determine identity, attachment, eligibility, or freshness without revalidation

Primary seams to audit:

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/nursery/src/routes/Anvil.tsx`
- `apps/nursery/src/routes/TongsRecordingSessions.tsx`
- any route-context helpers currently used for handoff or resume

Preferred implementation bias:

- keep payloads minimal and reference-based
- avoid adding new persistent handoff state unless current seams cannot express lawful handoff cleanly
- if current routes or DTOs cannot express canonical references without ambiguity, stop and call out the required API change explicitly

### 2. Ratifier

Question:

- Who decides that a received handoff is valid now?

Slice 5 rule:

- Tongs/cloud state is the canonical ratifier
- the receiving tool may trust only what it has revalidated against canonical state
- sender cache, local residue, and remembered receiver state must not ratify the handoff by themselves

Planning questions to answer before coding:

1. Which current handoff surfaces still trust sender-side assumptions without a receiver-side canonical read?
2. Can current receiver-side canonical read seams fully validate identity, attachment, and context without a new API route?
3. Are any current resume flows effectively using locally remembered context as a substitute for receiver-side validation?

### 3. Receiver Revalidation

Question:

- What exact checks must the receiver perform before opening or resuming the target?

Slice 5 rule:

- receiver must confirm entity existence, workspace/workpiece/session/package alignment, and any relevant attachment or version markers
- receiver must reject stale or mismatched payloads rather than silently substituting remembered context
- canonical revalidation must happen before the receiving surface treats the target as current truth

Receiver-validation questions to answer before coding:

1. Does Anvil already re-read canonical workpiece/script state before opening a Hearth-provided target?
2. Do planner/session entry paths still trust client-held candidate or session residue instead of canonical revalidation?
3. Are any receiver surfaces missing a clear blocked/degraded state for failed validation?

### 4. Rejection Path

Question:

- How do we prevent stale or mismatched handoff residue from replaying obsolete truth?

Slice 5 rule:

- stale or mismatched payloads must be rejected cleanly
- late async handoff validation responses must not overwrite newer receiver context
- receiver should prefer "cannot validate" over "probably fine"

Rejection-path questions to answer before coding:

1. Which current handoff flows silently fall back to last-known local context when validation fails?
2. Can late async handoff resolution repaint obsolete receiver state after workspace/workpiece changed?
3. Do current error states tell the user to reopen or reselect from canonical state instead of pretending success?

## Backend Decisions

Primary canonical seams:

- current Tongs-backed workpiece/script/session read routes already used by receiver surfaces

Expected backend posture:

- receiver surfaces should rely on existing canonical read seams where possible
- handoff validity should derive from current canonical reads, not from a self-certifying handoff blob
- any needed route changes should be narrow and reference-oriented, not a new shadow handoff state store

Preferred first implementation:

- use existing canonical reads first
- only expand server DTOs or add a thin route helper if a receiver cannot otherwise validate the handed-off identifiers cleanly

## Receiver UI Decisions

Primary files:

- `apps/nursery/src/routes/Anvil.tsx`
- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/nursery/src/routes/TongsRecordingSessions.tsx`
- route-context helpers used by these entry paths

Slice 5 UI rule:

- receivers may show a short-lived opening or validating state
- receivers must replace that with canonical target truth or an explicit blocked/degraded state as soon as validation resolves

Required UI outcomes:

- direct handoff opens the intended canonical target when validation succeeds
- stale or mismatched payloads do not silently reopen unrelated or last-known local context
- resume flows do not bypass canonical revalidation
- users see clear messaging when a target must be reopened or reselected from canonical state

## Verification Plan

### Handoff / Receiver Regressions

- targeted regressions prove handoff payload contains references only, not self-authorizing truth
- targeted regressions prove receiver revalidates canonical identity, attachment, and context before trusting the handoff
- targeted regressions prove stale or mismatched handoff payloads are rejected cleanly
- targeted regressions prove late async handoff validation cannot repaint obsolete receiver context

### Cross-Tool Proofs

- direct Hearth -> Anvil handoff resolves from canonical state alone
- reopen/resume cannot replay obsolete context after canonical target changed
- second client or second tool opens converge on the same canonical destination

### Wrapper / Smoke

- run `pnpm --filter nursery typecheck`
- run affected Hearth and Nursery confidence/regression suites
- run targeted cross-tool handoff regressions
- run `pnpm smoke:core`

## Implementation Order

1. audit current cross-tool handoff seams for any self-authorizing payload or sender-side residue authority
2. patch receiver-side validation so canonical reads ratify handoff truth
3. patch rejection/degraded states so failed validation does not silently fall back to local context
4. patch async/race handling so late validation responses cannot repaint obsolete receiver truth
5. add targeted regressions and confidence proofs
6. verify package and smoke paths
7. write `LOCAL_MIRROR_SSOT_SLICE_5_COMPLETION.md`

## Exit Criteria

Slice 5 is complete when all of the following are true:

- handoff payload carries references, not self-authorizing truth
- receiver-side canonical validation determines whether a handoff is accepted
- stale or mismatched handoff payloads are rejected cleanly
- cross-tool reopen and resume cannot replay obsolete context as current truth
- late async handoff validation cannot overwrite newer receiver context
- second client or second tool opens converge on the same canonical outcome
- a completion note records what shipped, how it was verified, and any wrapper caveats honestly

Slice 5 meets these exit criteria on the currently active handoff seam via `LOCAL_MIRROR_SSOT_SLICE_5_COMPLETION.md`.
