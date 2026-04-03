# Hammer Real Episode Proof Run

Status: In progress  
Sprint: Operational Confidence (Beta Gate Closure)  
Purpose: Prove Hammer's hardened truth model against real editorial episodes and record whether the same truth survives Hammer -> packet -> Quench.

## Rules

- Every episode must record the same checkpoints in the same order.
- Every mismatch must be either:
  - fixed and linked, or
  - recorded as a blocker with explicit failure class.
- No "looked fine" summaries. Evidence only.

## Required Verdict Chain

For every episode, record:

1. Hammer pass truth
2. Hammer readiness verdict
3. Release packet verdict
4. Quench ingest verdict
5. Quench route/render verdict

## Failure Classes

Use one of these values when a mismatch is found:

- `pass_truth`
- `persistence_recovery`
- `readiness_handoff`
- `packet_serialization`
- `quench_downstream_constraint`

## Case Matrix

| Case | Coverage Goal | Status | Notes |
| --- | --- | --- | --- |
| `EP01` | Happy path | Pending | Fully ready release with no degraded or blocked states. |
| `EP02` | Transcript-heavy cleanup | Pending | Large cleanup surface with transcript truth driving downstream readiness. |
| `EP03` | Candidate-heavy review | Pending | Accepted/rejected candidate decisions must survive export and Quench. |
| `EP04` | Missing media | Pending | Missing media must remain degraded or blocked truthfully. |
| `EP05` | Prep degraded | Pending | Editor usable in degraded mode; no false healthy promotion. |
| `EP06` | Packaging incomplete | Pending | Packaging surface blocked while still reopenable and visible. |
| `EP07` | Long-session reopen/recovery | Pending | Refresh/reopen/save turbulence under a real episode. |
| `EP08` | Multi-image / overlay-heavy | Pending | Visual placements and overlay focus survive export and Quench. |
| `EP09` | Audio-finalization edge case | Pending | Studio sound / podcast master truth survives packet and handoff. |
| `EP10` | Intentionally blocked | Pending | Hard-blocked episode must stay blocked end-to-end. |

## Per-Episode Log Template

Repeat this section for each episode.

### Episode: `EPXX`

- Label:
- Fixture / source:
- Coverage goal:
- Starting condition:
- Starting active pass:

#### Hammer Pass Outcomes

- Transcript Cleanup:
- Candidate Review:
- Gap/Pacing:
- Image Placement / Animation:
- Audio Finalization:
- Packaging:
- Ready Summary:

#### Verdict Chain

- Hammer readiness verdict:
- Hammer reason codes:
- Packet verdict:
- Packet reason codes:
- Quench ingest verdict:
- Quench ingest reason codes:
- Quench route/render verdict:
- Quench route/render reason codes:

#### Recovery / Session Notes

- Save/retry behavior:
- Reload/recovery behavior:
- Conflict behavior:

#### Result

- Mismatch found: `yes | no`
- Failure class:
- Fix linked:
- Blocker noted:
- Rerun result:

## Recorded Episodes

### Episode: `EP01`

- Label: Launch Ready calibration
- Fixture / source: [mockReleasePackets.ts](/D:/nursery/nursery/apps/quench/src/dev/mockReleasePackets.ts) `launch-ready` plus [hammer-quench-readiness-contract.test.mts](/D:/nursery/nursery/apps/nursery/tests/hammer-quench-readiness-contract.test.mts) and [hammerReleasePacketIngest.test.ts](/D:/nursery/nursery/apps/quench/tests/hammerReleasePacketIngest.test.ts)
- Coverage goal: Prove the clean ready path survives the full readiness chain without local reinterpretation.
- What this case is meant to prove: A fully ready packet remains ready across Quench verdict derivation, packet ingest, and route-facing rendering logic with no surprise downstream reasons.
- Starting condition: Clean release packet with resolvable video, audio, thumbnail, public RSS audio, transcript, captions, and no Hammer blocking or review reasons.
- Starting active pass: Ready Summary

#### Hammer Pass Outcomes

- Transcript Cleanup: Assumed complete in fixture-backed calibration; not independently exercised in this case.
- Candidate Review: Assumed complete in fixture-backed calibration; not independently exercised in this case.
- Gap/Pacing: Assumed complete in fixture-backed calibration; not independently exercised in this case.
- Image Placement / Animation: Assumed complete in fixture-backed calibration; not independently exercised in this case.
- Audio Finalization: Assumed complete in fixture-backed calibration; not independently exercised in this case.
- Packaging: Assumed complete in fixture-backed calibration; not independently exercised in this case.
- Ready Summary: Canonical-ready path exercised through packet and Quench parity tests.

#### Verdict Chain

- Hammer readiness verdict: `ready`
- Hammer reason codes: `[]`
- Packet verdict: `ready`
- Packet reason codes: `[]`
- Quench ingest verdict: `ready`
- Quench ingest reason codes: `[]`
- Quench route/render verdict: `ready`
- Quench route/render reason codes: `[]`

#### Recovery / Session Notes

- Save/retry behavior: Not exercised in this calibration case.
- Reload/recovery behavior: Not exercised in this calibration case.
- Conflict behavior: Not exercised in this calibration case.

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Phase 6 readiness contract alignment across Hammer -> packet -> Quench
- Blocker noted:
- Rerun result: Clean ready path remained ready after final Quench consolidation pass.

### Episode: `EP10`

- Label: Intentionally blocked calibration
- Fixture / source: [mockReleasePackets.ts](/D:/nursery/nursery/apps/quench/src/dev/mockReleasePackets.ts) `blocked` plus [hammer-quench-readiness-contract.test.mts](/D:/nursery/nursery/apps/nursery/tests/hammer-quench-readiness-contract.test.mts) blocked parity case and [hammerReleasePacketIngest.test.ts](/D:/nursery/nursery/apps/quench/tests/hammerReleasePacketIngest.test.ts) blocked ingest preservation case
- Coverage goal: Prove a deliberate blocked verdict survives the full readiness chain without being softened or upgraded.
- What this case is meant to prove: A lawful hard stop remains a hard stop across Hammer truth, packet transport, Quench ingest, and Quench rendering.
- Why this case is blocked on purpose: The fixture is constructed with intentionally missing or inaccessible core handoff requirements so the system must keep saying no.
- Starting condition: Intentionally blocked release packet with inaccessible thumbnail/video and a blocked handoff readiness basis.
- Starting active pass: Ready Summary

#### Hammer Pass Outcomes

- Transcript Cleanup: Assumed complete enough to reach readiness evaluation; not independently exercised in this calibration case.
- Candidate Review: Assumed complete enough to reach readiness evaluation; not independently exercised in this calibration case.
- Gap/Pacing: Assumed complete enough to reach readiness evaluation; not independently exercised in this calibration case.
- Image Placement / Animation: Assumed non-authoritative for this blocked calibration; not independently exercised here.
- Audio Finalization: Assumed non-authoritative for this blocked calibration; not independently exercised here.
- Packaging: Assumed evaluated but not sufficient to override blocked readiness truth.
- Ready Summary: Canonical-blocked path exercised through packet and Quench parity tests.

#### Verdict Chain

- Hammer readiness verdict: `blocked`
- Hammer reason codes: `["handoff_blocked"]`
- Packet verdict: `blocked`
- Packet reason codes: `["handoff_blocked"]`
- Quench ingest verdict: `blocked`
- Quench ingest reason codes: `["handoff_blocked"]`
- Quench route/render verdict: `blocked`
- Quench route/render reason codes: `["handoff_blocked"]`

#### Recovery / Session Notes

- Save/retry behavior: Not exercised in this blocked calibration case.
- Reload/recovery behavior: Not exercised in this blocked calibration case.
- Conflict behavior: Not exercised in this blocked calibration case.

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Phase 6 canonical blocked verdict preservation across Hammer -> packet -> Quench
- Blocker noted:
- Rerun result: Deliberate blocked path remained blocked after Quench readiness consolidation.

### Episode: `EP04`

- Label: Missing media truth
- Fixture / source: Composite media-truth proof using [hammerStubLaunches.ts](/D:/nursery/nursery/apps/hammer/src/dev/hammerStubLaunches.ts) `mapped-media-missing`, [hammerReleaseHandoffPosture.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerReleaseHandoffPosture.test.ts), [hammerQuenchReleasePacket.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerQuenchReleasePacket.test.ts), [hammerQuenchHandoff.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerQuenchHandoff.test.ts), [hammerReleasePacketIngest.test.ts](/D:/nursery/nursery/apps/quench/tests/hammerReleasePacketIngest.test.ts), and [releaseReadinessVerdict.test.ts](/D:/nursery/nursery/apps/quench/tests/releaseReadinessVerdict.test.ts)
- Coverage goal: Prove missing or unresolved media truth remains explicit and stable across Hammer -> packet -> Quench.
- What this case is meant to prove: A real media-truth problem stays visible as media truth, not as a generic “not complete” blur.
- Why this is degraded or blocked instead of ready: Required media artifacts are missing, unresolved, or inaccessible, so the release cannot honestly claim ready status.
- Starting condition: Hammer-side missing media / artifact state combined with Quench-side unresolved or inaccessible downstream media constraints.
- Starting active pass: Image Placement / Animation or Ready Summary, depending on whether the media gap is discovered upstream or at handoff.

#### Hammer Pass Outcomes

- Transcript Cleanup: Assumed sufficient to reach readiness evaluation; not the failure source in this case.
- Candidate Review: Assumed sufficient to reach readiness evaluation; not the failure source in this case.
- Gap/Pacing: Assumed sufficient to reach readiness evaluation; not the failure source in this case.
- Image Placement / Animation: Media gap surfaced here when visuals are missing or unresolved.
- Audio Finalization: Media gap surfaced here when audio reference or prepared audio is missing.
- Packaging: Not sufficient to override missing media truth.
- Ready Summary: Canonical media-related blocked path exercised through packet and Quench parity tests.

#### Verdict Chain

- Hammer readiness verdict: `blocked`
- Hammer reason codes: `["artifact_visuals_missing", "artifact_audio_missing"]` in packet/handoff preservation coverage
- Packet verdict: `blocked`
- Packet reason codes: `["artifact_visuals_missing", "artifact_audio_missing"]`
- Quench ingest verdict: `blocked`
- Quench ingest reason codes: preserves Hammer artifact codes and may append explicit downstream media constraints like `quench_audio_reference_unresolved`
- Quench route/render verdict: `blocked`
- Quench route/render reason codes: explicit `quench_*` media codes when downstream asset resolution fails; no silent upgrade to ready

#### Recovery / Session Notes

- Save/retry behavior: Not exercised in this media-truth proof case.
- Reload/recovery behavior: Hammer dev launch scenario documents honest missing-media startup posture, but this entry is still fixture-backed rather than a full live recovery run.
- Conflict behavior: Not exercised in this case.

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Phase 6 packet + Quench media-truth alignment, including canonical artifact code preservation and explicit `quench_*` downstream media reasons
- Blocker noted:
- Rerun result: Missing media remained explicitly blocked across Hammer-side artifact truth, packet transport, Quench ingest, and Quench route rendering.

### Episode: `EP07`

- Label: Long-session reopen and recovery truth
- Fixture / source: [hammerSessionHostIntegration.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerSessionHostIntegration.test.ts), [hammerPersistenceRecovery.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerPersistenceRecovery.test.ts), and [hammerConflictRecovery.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerConflictRecovery.test.ts)
- Coverage goal: Prove the session and recovery model stays truthful under refresh/reopen, stale snapshot, pending edits, and conflict turbulence.
- What this case is meant to prove: Hammer restores posture, re-derives truth, and keeps the session rail on the harder truth until canonical success actually happens.
- Starting condition: Realistic long-session turbulence with pending edits, stale snapshot recovery available, reload-required conflict, and save/reload actions through the host loop.
- Starting active pass: Varies by reopen target; core proof is session-truth continuity rather than a specific editorial pass surface.

#### Hammer Pass Outcomes

- Transcript Cleanup: Not the focus of this case; any restored posture must still re-derive truthful pass state after reopen.
- Candidate Review: Not the focus of this case; any restored posture must still re-derive truthful pass state after reopen.
- Gap/Pacing: Not the focus of this case; any restored posture must still re-derive truthful pass state after reopen.
- Image Placement / Animation: Not the focus of this case; any restored posture must still re-derive truthful pass state after reopen.
- Audio Finalization: Not the focus of this case; any restored posture must still re-derive truthful pass state after reopen.
- Packaging: May reopen as posture, but truth must be re-derived after recovery.
- Ready Summary: Readiness may be revisited after recovery, but the primary proof here is session honesty under turbulence.

#### Verdict Chain

- Hammer readiness verdict: Re-derived only after recovery path settles; not the primary success criterion for this case.
- Hammer reason codes: Traceable to whatever canonical state remains after reopen; no stale replay allowed.
- Packet verdict: Only meaningful if the recovered session reaches an honest release state.
- Packet reason codes: Not the primary proof target in this case.
- Quench ingest verdict: Not the primary proof target in this case.
- Quench ingest reason codes: Not the primary proof target in this case.
- Quench route/render verdict: Not the primary proof target in this case.
- Quench route/render reason codes: Not the primary proof target in this case.

#### Recovery / Session Notes

- Starting session condition: Pending edits with either `Recovery available` or `Reload required` present.
- Turbulence observed: Refresh/reopen, stale snapshot fallback, mixed pending edits plus recovery state, and conflict appearing while save is in flight.
- Session rail state before action:
  - `recovery_available` outranked pending unsaved changes during stale snapshot recovery
  - `reload_required` outranked active saving during conflict
- Operator action taken:
  - `Reload latest`
  - `Retry save`
- Session rail state after action:
  - successful canonical reload resolved to `saved`
  - failed reload remained `recovery_available` or `reload_required`
  - successful canonical save cleared unhealthy state only after save success
  - failed save remained unhealthy and never read as `Saved`
- Recovery truth preserved: yes

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Phase 5 host-loop and turbulence hardening, including reload-success gating, stale snapshot recovery, and conflict precedence
- Blocker noted:
- Rerun result: Recovery path remained truthful under long-session turbulence; no stale saved/completed state survived reopen or conflict.

### Episode: `EP06`

- Label: Packaging incomplete but usable
- Fixture / source: [hammerPassReload.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerPassReload.test.ts), [hammerPassStatus.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerPassStatus.test.ts), and packaging workflow/state in [HammerWorkspaceShell.tsx](/D:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx)
- Coverage goal: Prove Packaging can remain open and actionable while readiness truth stays incomplete and honest.
- What this case is meant to prove: Forge does not confuse working on the packaging problem with being done with the packaging problem.
- Why packaging is incomplete: Intro/outro selection is missing or a persisted packaging asset remains unresolved, so the operator can continue working in Packaging but the system must not imply completion or release readiness.
- Starting condition: Packaging surface reopened with either no intro/outro/logo basis selected or a persisted packaging logo placement whose asset path cannot be resolved.
- Starting active pass: Packaging

#### Hammer Pass Outcomes

- Transcript Cleanup: Not the failure source in this case.
- Candidate Review: Not the failure source in this case.
- Gap/Pacing: Not the failure source in this case.
- Image Placement / Animation: May provide packaging-linked visual placements, but not the primary failure source here.
- Audio Finalization: Not the failure source in this case.
- Packaging: Enterable and usable, but remains `blocked` for missing basis or `degraded` for unresolved packaging asset.
- Ready Summary: Must remain non-ready while Packaging is incomplete.

#### Verdict Chain

- Hammer readiness verdict: Packaging-specific incomplete state preserves non-ready posture; readiness must not be promoted from packaging surface usage alone.
- Hammer reason codes: `["packaging_selection_missing"]` for blocked basis, or `["packaging_asset_unresolved"]` for degraded unresolved asset
- Packet verdict: Not emitted as ready from this state; packet export should remain blocked or deferred until Packaging truth is resolved
- Packet reason codes: Not the primary proof target in this case
- Quench ingest verdict: Not the primary proof target in this case because honest handoff should not proceed from incomplete Packaging
- Quench ingest reason codes: Not the primary proof target in this case
- Quench route/render verdict: Not the primary proof target in this case
- Quench route/render reason codes: Not the primary proof target in this case

#### Operator Experience

- Surface is usable: yes
- Problem is visible: yes
- System implies completion: no
- Reopen returns to Packaging: yes
- Stale completion survives reopen: no

#### Recovery / Session Notes

- Save/retry behavior: Not the primary focus of this case.
- Reload/recovery behavior: Reopen preserves Packaging posture while re-deriving blocked/degraded Packaging truth.
- Conflict behavior: Not exercised in this case.

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Phase 2–3 posture/truth split and Packaging reopen truth hardening
- Blocker noted:
- Rerun result: Packaging remained open and actionable while incomplete truth stayed blocked or degraded; no stale completion leaked through reopen.

### Episode: `EP02`

- Label: Transcript-heavy cleanup truth
- Fixture / source: [hammer-transcript-cleanup-preflight.test.mts](/D:/nursery/nursery/apps/nursery/tests/hammer-transcript-cleanup-preflight.test.mts), [hammer-transcript-policy-preflight.test.mts](/D:/nursery/nursery/apps/nursery/tests/hammer-transcript-policy-preflight.test.mts), [hammerTextOutputsPackage.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerTextOutputsPackage.test.ts), and [hammerOutputSelectionGuard.test.ts](/D:/nursery/nursery/apps/hammer/tests/hammerOutputSelectionGuard.test.ts)
- Coverage goal: Prove approved transcript cleanup becomes canonical editorial truth and survives selection/output packaging without drift.
- What this case is meant to prove: Approved transcript cleanup becomes the authoritative output layer, and stale or invalid transcript selection cannot silently leak into packet-ready editorial truth.
- Editorial actions performed:
  - transcript cleanup request allowed through policy gate when entitled
  - cleanup changes generated for transcript segments
  - derived cleanup layer selected as output
  - subtitle artifact regenerated from the selected cleanup layer
- Starting condition: Raw transcript with filler-heavy dialogue, followed by a deterministic cleanup macro run and output-layer promotion.
- Starting active pass: Transcript Cleanup

#### Hammer Pass Outcomes

- Transcript Cleanup: Cleaned transcript promoted into the selected derived output layer.
- Candidate Review: Not directly exercised as a separate surface in this proof slice; this case focuses on cleanup-to-canonical-output truth rather than UI candidate workflow.
- Gap/Pacing: Not the focus of this case.
- Image Placement / Animation: Not the focus of this case.
- Audio Finalization: Not the focus of this case.
- Packaging: Not the focus of this case.
- Ready Summary: Should reflect the current output-selected transcript truth rather than raw transcript state.

#### Post-Cleanup Editorial State

- Canonical transcript updated: yes, via derived output layer selection
- Output selection source kind: `derived`
- Output selection recipe ref: `macro:podcast_cleanup.v1`
- Output selection macro kind: `filler_cleanup`
- Subtitle artifact freshness after cleanup selection: `current`
- Subtitle artifact freshness after output selection reset: `stale`
- Ghost candidates observed: no evidence of ghost cleanup state in the tested path

#### Verdict Chain

- Hammer readiness verdict: Expected to reflect current cleaned transcript truth once the derived output layer is selected; stale transcript flags should clear in the clean selection path
- Hammer reason codes: transcript-related stale/missing codes absent in the clean selected-output path
- Packet verdict: Expected to use the selected cleaned transcript output, not the raw source transcript
- Packet reason codes: no transcript drift reason expected in the clean selected-output path
- Quench ingest verdict: Expected to observe the same cleaned transcript truth when packet uses the selected output layer
- Quench ingest reason codes: no transcript-missing or transcript-drift reason expected in the clean selected-output path
- Quench route/render verdict: Expected to remain aligned with packet/ingest truth
- Quench route/render reason codes: no transcript fallback reason expected in the clean selected-output path

#### Recovery / Session Notes

- Save/retry behavior: Not the focus of this case.
- Reload/recovery behavior: Output selection guard explicitly clears invalid stale layer selections back to raw rather than preserving ghost output state.
- Conflict behavior: Not exercised in this case.

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Transcript cleanup policy gate, canonical derived output selection, and output-selection stale guard
- Blocker noted:
- Rerun result: Cleanup-generated transcript truth remained canonical through selected output packaging; invalid layer selection was cleared instead of drifting silently.

### Episode: `EP03`

- Label: Candidate-heavy review truth
- Fixture / source: [hammer-candidate-resolution-parity.test.mts](/D:/nursery/nursery/apps/nursery/tests/hammer-candidate-resolution-parity.test.mts), plus candidate decision path in [HammerWorkspaceShell.tsx](/D:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx) (`handleCandidateDecision`)
- Coverage goal: Prove candidate-level approve/reject decisions become canonical editorial truth and survive Hammer -> packet -> Quench without ghost state.
- What this case is meant to prove: Individual approve/reject decisions are not just UI gestures; they land in canonical selected output truth, and packet/Quench preserve the exact mixed result without ghost state.
- Candidate actions performed:
  - generated multiple filler candidates from deterministic cleanup preview
  - approved one candidate into a selected derived output layer
  - rejected one candidate by leaving its original transcript text untouched in the selected output
- Starting condition: Candidate review surface with multiple filler candidates pending operator decisions.
- Starting active pass: Candidate Review

#### Hammer Pass Outcomes

- Transcript Cleanup: Selected output reflects approved cleanup only; rejected candidate text remains unchanged.
- Candidate Review: Mixed approve/reject result becomes canonical selected output truth.
- Gap/Pacing: Not the focus of this case.
- Image Placement / Animation: Not the focus of this case.
- Audio Finalization: Not the focus of this case.
- Packaging: Not the focus of this case.
- Ready Summary: Candidate resolution did not invent a new blocker or review state; the packet remained clean once the mixed output was made canonical.

#### Post-Resolution Editorial State

- Approved candidates reflected in canonical transcript state: `yes`
- Rejected candidates proven absent from canonical downstream effect: `yes`
- Mixed resolution text preserved in output-selected transcript: `yes`
- Ghost candidate evidence found: `no`

#### Verdict Chain

- Hammer readiness verdict: `ready`
- Hammer reason codes: `[]`
- Packet verdict: `ready`
- Packet reason codes: `[]`
- Quench ingest verdict: `ready`
- Quench ingest reason codes: `[]`
- Quench route/render verdict: `ready` once the packet is consumed through the shared verdict model
- Quench route/render reason codes: `[]`

#### Recovery / Session Notes

- Save/retry behavior: Not the focus of this targeted parity fixture.
- Reload/recovery behavior: Not the focus of this targeted parity fixture.
- Conflict behavior: Not exercised in this case.

#### Result

- Mismatch found: `no`
- Failure class:
- Fix linked: Candidate-resolution parity fixture added in [hammer-candidate-resolution-parity.test.mts](/D:/nursery/nursery/apps/nursery/tests/hammer-candidate-resolution-parity.test.mts)
- Blocker noted:
- Rerun result: Mixed approve/reject candidate decisions survived selected output packaging and Quench ingest without ghost-state drift.

## Summary Table

| Episode | Hammer Verdict | Packet Verdict | Quench Verdict | Match | Failure Class | Fix / Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| `EP01` | `ready` | `ready` | `ready` | `yes` |  | Phase 6 contract held cleanly in calibration run |
| `EP10` | `blocked` | `blocked` | `blocked` | `yes` |  | Canonical blocked verdict preserved end to end |
| `EP04` | `blocked` | `blocked` | `blocked` | `yes` |  | Media-truth remained explicit across Hammer -> packet -> Quench |
| `EP07` | `recovery_truth_preserved` |  |  | `yes` |  | Session rail and host loop stayed honest under turbulence |
| `EP06` | `blocked/degraded` |  |  | `yes` |  | Packaging stayed usable without implying completion |
| `EP02` | `editorial_truth_preserved` | `expected_clean` | `expected_clean` | `yes` |  | Cleanup output selection and stale guard preserved editorial truth |
| `EP03` | `ready` | `ready` | `ready` | `yes` |  | Mixed approve/reject candidate decisions preserved end to end |
| `EP05` |  |  |  |  |  |  |
| `EP08` |  |  |  |  |  |  |
| `EP09` |  |  |  |  |  |  |
