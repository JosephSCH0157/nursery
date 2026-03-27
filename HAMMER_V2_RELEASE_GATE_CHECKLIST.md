# HAMMER_V2_RELEASE_GATE_CHECKLIST

Status: Draft (Strict Launch Bar)
Owner: Hammer Team
Last Updated: 2026-03-27

## Usage
- Every criterion is pass/fail.
- A stage cannot open unless all criteria in that stage are checked.
- Record evidence links for each check.
- Any failed item is a hard gate.

## Sign-Off
- Product Owner: [ ]
- Engineering Lead: [ ]
- QA Lead: [ ]
- Ops/Support Lead: [ ]
- Security/Privacy Reviewer: [ ]
- Final Decision: [ ] GO [ ] NO-GO
- Decision Date:

## Internal Beta Gate (Must-Pass)
| # | Criterion | Owner | Status | Evidence |
|---|---|---|---|---|
| 1 | Core pass flow is usable end-to-end (`transcript_cleanup` -> `ready`) with no blockers. |  | [ ] |  |
| 2 | Every pass can be entered/exited without crashes, lockups, or stuck state. |  | [ ] |  |
| 3 | Pass state persists/reloads correctly (`current_pass`, `pass_status`) after refresh/reopen. |  | [ ] |  |
| 4 | Subtractive-only transcript rule is enforced (delete allowed, additive typing blocked). |  | [ ] |  |
| 5 | Candidate review (fillers/retakes) approve/reject updates transcript + timeline deterministically. |  | [ ] |  |
| 6 | Gap/Pacing applies deterministically from one control (no per-gap queue). |  | [ ] |  |
| 7 | Image placement supports timeline drag/resize and preview bounding-box manipulation reliably. |  | [ ] |  |
| 8 | Image animation context menu supports one preset per clip with immediate preview feedback. |  | [ ] |  |
| 9 | Audio Finalization supports Apply Studio Sound + Warmth/Presence/Harshness/Output Level + Before/After compare. |  | [ ] |  |
| 10 | Packaging supports one-click intro/outro apply + logo overlay toggle with simple position/size presets. |  | [ ] |  |
| 11 | Ready pass summarizes completion areas and uses existing Send to Quench path. |  | [ ] |  |
| 12 | Hammer -> Quench handoff contract remains backward-compatible (no breaking schema drift). |  | [ ] |  |
| 13 | Hammer typecheck + core regression tests are green in CI. |  | [ ] |  |
| 14 | Open critical defects: P0 = 0 and P1 = 0 in orchestration/persistence/handoff. |  | [ ] |  |
| 15 | At least 10 internal episodes completed through full Hammer -> Quench workflow. |  | [ ] |  |

## Public Beta Gate (Must-Pass)
| # | Criterion | Owner | Status | Evidence |
|---|---|---|---|---|
| 1 | All Internal Beta criteria remain green for 2 consecutive weeks. |  | [ ] |  |
| 2 | Crash-free editor sessions >= 99.5%. |  | [ ] |  |
| 3 | Persistence write failure rate < 0.5% with zero silent data-loss incidents. |  | [ ] |  |
| 4 | Quench handoff success rate >= 98% for valid projects. |  | [ ] |  |
| 5 | Core action latency acceptable on target project sizes (pass switch, approve/reject, gap apply, studio sound, intro/outro apply). |  | [ ] |  |
| 6 | Recovery UX is clear for major failure modes (missing assets, stale prep, blocked readiness). |  | [ ] |  |
| 7 | Undo/redo integrity verified across multi-pass edits (no history corruption). |  | [ ] |  |
| 8 | Cross-browser target matrix validated (Chrome/Edge minimum for Windows-first rollout). |  | [ ] |  |
| 9 | Beta docs complete (pass model, constraints, known limitations, escalation path). |  | [ ] |  |
| 10 | No unacceptable preview/export mismatch for supported operations; degraded/unavailable signaling is visible and correct. |  | [ ] |  |
| 11 | Support readiness in place (triage SLA, reproducible bug template, rollback plan). |  | [ ] |  |
| 12 | Security/privacy baseline checks pass (auth boundaries, media URL handling, workspace scoping). |  | [ ] |  |

## v1.0 GA Gate (Must-Pass)
| # | Criterion | Owner | Status | Evidence |
|---|---|---|---|---|
| 1 | All Public Beta criteria sustained for one full release cycle. |  | [ ] |  |
| 2 | Open critical defects at release cut: P0 = 0 and P1 = 0. |  | [ ] |  |
| 3 | Expanded regression suite green and stable (navigation, persistence round-trip, readiness gate, Quench packet invariants, image placement/animation serialization). |  | [ ] |  |
| 4 | Preview/export/handoff parity validated for supported operation set; degradations explicitly documented and signaled. |  | [ ] |  |
| 5 | Performance thresholds pass on representative long-form, asset-heavy episodes. |  | [ ] |  |
| 6 | Operational readiness complete (dashboards, alert thresholds, on-call runbook, incident playbook). |  | [ ] |  |
| 7 | Data correctness guarantees verified (Supabase SSOT semantics, migration safety, no local cache as canonical). |  | [ ] |  |
| 8 | Backward compatibility verified for existing workpieces and current Quench contract. |  | [ ] |  |
| 9 | UX polish baseline met on target laptop resolutions (no forced extreme zoom workflows). |  | [ ] |  |
| 10 | Release governance complete (versioned notes, feature flags, kill-switches, formal go/no-go review). |  | [ ] |  |

## Hard Stop Rules
- Any unchecked must-pass item blocks stage launch.
- Any new P0 at any point reverts launch decision to NO-GO until resolved and re-verified.
- Any evidence marked stale must be re-run before sign-off.

## Notes
- Hammer scope ends at prep + handoff.
- Quench owns publishing/distribution.