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

## Summary Table

| Episode | Hammer Verdict | Packet Verdict | Quench Verdict | Match | Failure Class | Fix / Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| `EP01` | `ready` | `ready` | `ready` | `yes` |  | Phase 6 contract held cleanly in calibration run |
| `EP10` | `blocked` | `blocked` | `blocked` | `yes` |  | Canonical blocked verdict preserved end to end |
| `EP02` |  |  |  |  |  |  |
| `EP03` |  |  |  |  |  |  |
| `EP04` |  |  |  |  |  |  |
| `EP05` |  |  |  |  |  |  |
| `EP06` |  |  |  |  |  |  |
| `EP07` |  |  |  |  |  |  |
| `EP08` |  |  |  |  |  |  |
| `EP09` |  |  |  |  |  |  |
