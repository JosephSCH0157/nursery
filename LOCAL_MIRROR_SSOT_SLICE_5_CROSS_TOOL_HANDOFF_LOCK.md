# Local Mirror SSOT Slice 5 Cross-Tool Handoff Lock

Implementation lock only. Constitutional lifecycle semantics are defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`. Operational lifecycle behavior is summarized in `STATE_MACHINE_DIAGRAM.md`. Mirror-authority policy is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`. Campaign sequencing is defined in `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`.

Date locked: 2026-03-11

## Decision

Slice 5 is locked to the following rule:

- Cross-tool handoff payloads may carry canonical references and advisory context, but receiving truth is established only after receiver-side canonical revalidation.

Everything else is non-authoritative:

- cached launch payloads
- remembered "last opened in tool X" state
- stale cross-tool route params treated as truth
- prior package or session selections
- optimistic handoff previews
- locally reconstructed handoff objects
- replayed handoff state after canonical context changed

These may accelerate navigation or reduce friction, but they may not establish current truth after transfer.

## Core Questions

### Canonical Payload

- What is lawfully handed off?

Slice 5 rule:

- handoff payloads may include canonical identifiers and advisory context only
- lawful payload members include canonical `workspace_id`, `workpiece_id`, session/package references, and version or receipt markers when those can be revalidated
- a payload must not self-authorize claims like "this is definitely current" without receiver-side confirmation

### Ratifier

- Who is allowed to ratify the handoff?

Slice 5 rule:

- Tongs/cloud state is the canonical ratifier
- the receiving tool may trust only what it has revalidated against canonical state
- sender-side cache, local residue, or prior receiver memory must not ratify the handoff by themselves

### Receiver Revalidation

- What must the receiving tool confirm before trusting the handoff?

Slice 5 rule:

- referenced entity still exists
- workspace, workpiece, session, package, or asset attachment still aligns
- freshness or version markers are still acceptable where applicable
- access and context are still valid where product behavior depends on them

### Rejection Path

- How does the receiving tool treat stale or mismatched handoff residue?

Slice 5 rule:

- stale or mismatched handoff payloads must be rejected cleanly
- late-arriving handoff state must not replay obsolete truth after canonical context changes
- the receiver must prefer "cannot validate" over "probably fine"

## Operational Rules

- A handoff payload may point to canonical truth, but it is never canonical truth on its own.
- Cross-tool reopen and resume flows must resolve from canonical identifiers and receiver-side canonical reads, not remembered local launch residue.
- If canonical revalidation fails, the receiver must surface an honest degraded or blocked state instead of silently opening stale context.
- A second client or second tool open must converge on the same canonical destination from the same identifiers.

## Explicit Demotions

The following are forbidden as cross-tool handoff authority:

- remembered sender-side selection state used to bypass canonical lookup
- route params or cached payloads treated as self-proving current context
- locally reconstructed handoff state used to imply valid attachment or freshness
- optimistic cross-tool previews that survive canonical disagreement
- stale handoff payloads replayed after workspace or workpiece context changes

The following remain allowed:

- advisory UI hints carried with a handoff payload
- short-lived optimistic launch state while receiver-side canonical validation is in flight
- cosmetic resume memory that does not alter receiving-tool truth

## Required Proofs

Slice 5 implementation must prove all of the following:

- handoff payload contains references, not self-authorizing truth
- the receiving tool revalidates canonical identity, attachment, and context before trusting the handoff
- stale or mismatched handoff payloads are rejected cleanly
- cross-tool reopen and resume cannot replay obsolete context as current truth
- late-arriving handoff state cannot overwrite newer canonical context
- second client or second tool opens converge on the same canonical outcome

## UX Rule

If a handoff target cannot be canonically revalidated, the receiver must show an explicit blocked or degraded state. It must not silently substitute remembered local context and pretend the handoff succeeded.

If a handoff payload is stale or mismatched, the receiver should explain that the target must be reopened or reselected from canonical state.

## Implementation Intent

Slice 5 should make the following seams obey canonical handoff truth:

- Hearth -> Anvil handoff
- planner/session entry into recording surfaces
- reopen/resume flows that restore another tool's last context
- any remaining tool-entry assumptions that still rely on locally remembered sender state

The implementation should prefer strengthening receiver-side canonical validation at existing handoff seams before inventing new persistent handoff state unless the code proves that current seams are insufficient.

## Non-Goals

Slice 5 does not itself require:

- new lifecycle policy outside handoff truth
- redesign of artifact truth already covered by Slice 4
- broader collaboration or permissions redesign unrelated to handoff validation
- speculative new handoff protocols for tools not yet in active use
