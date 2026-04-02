# HAMMER Pass Verification Matrix

Status: Draft  
Sprint: Operational Confidence (Beta Gate Closure)  
Scope: Canonical pass truth contract for Hammer beta gate

## Purpose

This document defines the pass-by-pass truth contract for Hammer.

It exists to stop pass status from drifting into UI-local inference.

For every pass, Hammer must be able to answer five questions from canonical state:

1. Is the pass enterable?
2. If not, what exactly blocks entry?
3. What persisted artifact or canonical state proves completion?
4. What exact condition forces degraded behavior instead of completion?
5. After refresh or reopen, what truthful posture must be restored?

This matrix is the source contract for Phase 2 and beyond.

## Global Truth Rules

- Pass completion must never come from tab visitation, local-only booleans, or optimistic UI state.
- Pass completion must be earned by canonical persisted state or by a deterministic selector derived from canonical persisted artifacts.
- Blocked takes precedence over degraded.
- Degraded takes precedence over complete.
- If required canonical data is missing, stale, invalid, or contradictory, the pass must not show `completed`.
- Refresh or reopen must restore the last truthful pass posture from canonical state.
- Hammer must prefer explicit reason codes over inferred happy-path assumptions.

## Canonical State Surfaces

The current canonical Hammer state surfaces are:

- `tongs.hammer_workpiece_state.current_pass`
- `tongs.hammer_workpiece_state.pass_status`
- `tongs.hammer_workpiece_state.prep_status`
- `tongs.hammer_workpiece_state.alignment_status`
- `hammer/session/editor-state.v1.json`
- `hammer/transcript/structured.v1.json`
- `hammer/prep/visual-placements.v1.json`
- `hammer/prep/audio-polish.v1.json`
- `hammer/edit-plan/current.v1.json`
- canonical editorial authority artifact
- prepared release package and Quench release packet artifacts when present

Important current-state note:

- `HammerWorkspaceShell.tsx` currently owns `currentPass` and `passStatus` as local component state initialized from persistence.
- That is acceptable as an implementation detail only if the local view remains fully reconstructable from canonical state.
- It is not acceptable as the long-term authority for pass completion or readiness.

## Canonical Status Vocabulary

### Pass State

- `not_started`
- `in_progress`
- `completed`

### Supporting Runtime State

- `prep_status`: `idle`, `preparing`, `prepared`, `prep_failed`
- `alignment_status`: `not_started`, `pending`, `aligned`, `needs_review`

## Pass Matrix

### Transcript Cleanup

**Entry condition**

- Structured transcript exists in canonical state:
  - `structured_transcript.data != null`
- Hammer prep is not actively blocked from opening the editor:
  - `prep_status` is `prepared`, or
  - degraded editor mode is explicitly allowed with a persisted transcript basis

**Blocked reason**

- No structured transcript artifact exists
- Prep has not produced a reviewable transcript basis
- Canonical transcript artifact is invalid or unreadable

**Persisted pass state**

- `pass_status.transcript_cleanup`
- Canonical transcript artifact:
  - `hammer/transcript/structured.v1.json`
- Canonical edit projection:
  - edit plan and editorial authority graph when transcript deletions/mutes are committed there

**Completion invariant**

- Transcript Cleanup may show `completed` only when:
  - the canonical transcript basis exists, and
  - all transcript cleanup changes reflected in the current editing surface are represented in canonical persisted state or canonical derived edit output, and
  - no required cleanup review state remains unresolved for the pass contract

**Degraded invariant**

- Show degraded, not completed, when:
  - transcript exists but confidence or integrity flags require review
  - transcript artifact is present but cannot fully support cleanup truth
  - the UI can continue from last known good transcript state, but Hammer cannot claim full cleanup certainty

**Reload expectation**

- Refresh/reopen restores:
  - `current_pass = transcript_cleanup` if this was the active pass
  - canonical transcript-backed cleanup state
  - any truthful `blocked` or `degraded` reason
- Refresh must never convert missing transcript truth into `completed`

### Candidate Review

This pass currently maps to the `retakes` orchestration pass and transcript cleanup candidate review flows.

**Entry condition**

- Structured transcript exists
- Candidate generation input exists from the canonical transcript basis
- The pass is not blocked by missing transcript or invalid candidate source context

**Blocked reason**

- No structured transcript artifact exists
- Candidate generation cannot run because transcript basis is missing or invalid

**Persisted pass state**

- `pass_status.retakes`
- Canonical transcript/edit projection after approve/reject actions
- Canonical edit plan / authority graph if decisions create or remove editorial operations

**Completion invariant**

- Candidate Review may show `completed` only when:
  - the current canonical candidate set has been fully resolved for the active review mode, and
  - accepted/rejected decisions are reflected in canonical output state, and
  - no unresolved required candidate decisions remain for export truth

**Degraded invariant**

- Show degraded, not completed, when:
  - candidate preview exists but its source basis is stale or uncertain
  - candidate queue cannot be proven current against the canonical transcript basis
  - review can continue, but Hammer cannot truthfully claim all candidate decisions are current

**Reload expectation**

- Refresh/reopen restores:
  - active candidate-review pass posture
  - any resolved canonical decisions
  - unresolved candidate queue state if it can be regenerated truthfully
  - exact blocked/degraded reason if regeneration is not fully reliable

### Gap/Pacing

**Entry condition**

- Structured transcript exists
- Timing-bearing transcript segments are available

**Blocked reason**

- No structured transcript artifact exists
- Segment timing basis is missing or invalid

**Persisted pass state**

- `pass_status.gap_pacing`
- Canonical transcript/edit projection after pacing operations
- Canonical edit plan / authority graph when pacing changes affect exportable timing

**Completion invariant**

- Gap/Pacing may show `completed` only when:
  - applied gap edits are reflected in canonical state used for export truth, and
  - no required pacing operation remains UI-local only, and
  - pass summary reflects the current persisted timing state rather than the last local preview

**Degraded invariant**

- Show degraded, not completed, when:
  - gap preview can be shown but cannot be proven committed canonically
  - transcript timing basis is usable but incomplete or flagged
  - export timing truth cannot yet be guaranteed from current pacing state

**Reload expectation**

- Refresh/reopen restores:
  - canonical pacing result
  - active pass posture if this was the current pass
  - degraded state if pacing edits were previewed but not durably committed

### Image Placement

**Entry condition**

- Visual placements artifact exists or can be truthfully derived from canonical visual package state
- Transcript anchor basis exists

**Blocked reason**

- No structured transcript basis for anchors
- No usable visual placement state and no truthful way to derive one
- Visual package load is blocked rather than degraded

**Persisted pass state**

- `pass_status.image_placement`
- `hammer/prep/visual-placements.v1.json`
- Canonical editorial authority graph for placement-linked operations when applicable

**Completion invariant**

- Image Placement may show `completed` only when:
  - current placement geometry/timing state is persisted canonically, and
  - all required placement changes visible in the editor are represented in canonical visual placement data or canonical authority operations, and
  - no required media dependency is missing for the claimed completion state

**Degraded invariant**

- Show degraded, not completed, when:
  - placements exist but one or more items remain `uncertain`
  - required image media is unresolved
  - placement state is present but not trustworthy enough to claim complete visual placement

**Reload expectation**

- Refresh/reopen restores:
  - selected placement only if safely reconstructable
  - canonical placement geometry/timing
  - blocked or degraded reason for unresolved/missing media

### Image Animation

**Entry condition**

- Canonical visual placement exists for at least one image placement eligible for animation

**Blocked reason**

- No image placement exists
- Placement exists but is not an animatable image placement
- Canonical placement artifact is missing or invalid

**Persisted pass state**

- `pass_status.image_animation`
- `hammer/prep/visual-placements.v1.json` with animation preset fields
- Any supporting authority operations if animation is represented there

**Completion invariant**

- Image Animation may show `completed` only when:
  - chosen animation presets are persisted canonically with the placements they modify, and
  - the export-facing placement JSON reflects the same animation truth shown in preview, and
  - no required animated placement is still unresolved for the current pass contract

**Degraded invariant**

- Show degraded, not completed, when:
  - animation preview can be shown but export serialization is incomplete or uncertain
  - one or more image assets are unresolved
  - placement truth exists, but animation truth is not yet safely exportable

**Reload expectation**

- Refresh/reopen restores:
  - canonical animation preset assignments
  - truthful blocked/degraded reason
  - no loss of persisted animation decisions

### Audio Finalization

**Entry condition**

- Audio polish artifact exists or can be loaded in truthful current state
- Canonical media source is resolvable enough to support audio review

**Blocked reason**

- No usable audio basis exists
- Audio polish source media is unavailable and degraded editing is not viable
- Canonical audio artifact is invalid or unreadable

**Persisted pass state**

- `pass_status.audio_finalization`
- `hammer/prep/audio-polish.v1.json`
- Canonical audio edit state embedded in audio polish artifact

**Completion invariant**

- Audio Finalization may show `completed` only when:
  - canonical audio polish exists in a non-failed state sufficient for the pass contract, and
  - any audio cut/finalization decisions visible in the editor are persisted canonically, and
  - Hammer is not claiming a finalized audio posture while the canonical artifact remains `not_started`, `preparing`, or `failed`

**Degraded invariant**

- Show degraded, not completed, when:
  - audio polish artifact is failed but raw or partial editing can continue honestly
  - preview can continue but finalized audio truth is not available
  - media resolution or processing failure prevents a truthful final-audio claim

**Reload expectation**

- Refresh/reopen restores:
  - canonical audio polish state
  - any persisted audio edit state
  - explicit degraded reason for failed or partial audio processing

### Packaging

**Entry condition**

- Core editing basis exists:
  - transcript/edit state is present enough to prepare final packaging truth
- Intro/outro selection surface is available

**Blocked reason**

- Packaging-required source selections cannot be loaded
- Required packaging data for the chosen flow is missing and cannot be edited honestly

**Persisted pass state**

- `pass_status.packaging`
- persisted intro/outro selection artifact
- canonical placement/editorial state for intro, outro, and logo overlay decisions
- prepared release package, when present, must reflect the same packaging truth

**Completion invariant**

- Packaging may show `completed` only when:
  - intro/outro/logo choices shown in the UI are represented in canonical persisted state, and
  - export-facing package truth reflects those choices, and
  - required packaging inputs for the claimed packaging mode are present

**Degraded invariant**

- Show degraded, not completed, when:
  - packaging choices exist but required asset paths are unresolved
  - packaging truth is partially present but not fully exportable
  - intro/outro/logo state is visible but cannot be validated against canonical export truth

**Reload expectation**

- Refresh/reopen restores:
  - intro/outro/logo selections from canonical state
  - blocked/degraded packaging reason
  - no packaging completion state unless persisted inputs are still valid

### Ready Summary

**Entry condition**

- Ready is enterable only when Hammer can derive a readiness verdict from canonical state, not merely from local pass visitation

**Blocked reason**

- Required artifacts for release truth are missing
- Export posture is unavailable
- Handoff validator returns blocked

**Persisted pass state**

- `pass_status.ready`
- canonical readiness inputs:
  - transcript/edit truth
  - visual placements truth
  - audio polish truth
  - prepared release package or current release-prep package
  - Quench release packet validation inputs
- readiness authority output, whether computed at request time or later persisted, must come from canonical artifacts

**Completion invariant**

- Ready may show `completed` only when:
  - required canonical artifacts exist
  - export truth is valid
  - handoff validation passes without blocked or degraded contradiction
  - Quench would accept the packet without Hammer needing to silently promote degraded truth

**Degraded invariant**

- Show degraded, not completed, when:
  - export posture is degraded
  - handoff posture is `needs_review`
  - any required artifact exists but with degraded or stale truth

**Reload expectation**

- Refresh/reopen restores:
  - the same derived readiness verdict from canonical state
  - the same reason codes unless underlying canonical truth changed
  - no `Ready` status if Quench-facing truth would now block or degrade

## Test Translation Notes

This matrix is intended to map directly to test cases.

Minimum required test assertions per pass:

- blocked pass shows exact blocked reason
- pass cannot be complete without required canonical artifact
- degraded invariant overrides optimistic completion
- refresh restores truthful pass posture
- visiting a pass does not mutate completion

## Phase 2 Implication

The current local `currentPass` and `passStatus` state in `HammerWorkspaceShell.tsx` is a valid implementation detail only if:

- the values are initialized from canonical state,
- every mutation becomes durably canonical,
- and every visible pass verdict can be recomputed from canonical artifacts on reload.

If any pass still depends on UI-local completion logic after Phase 2, this matrix is not satisfied.
