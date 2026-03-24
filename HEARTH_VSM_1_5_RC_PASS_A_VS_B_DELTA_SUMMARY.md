# HEARTH - VSM-1.5 RC Delta Summary (Pass A vs Pass B)

Version: v1.0
Date: 2026-03-24
Purpose: One-page comparison of deterministic baseline (AI disabled) vs AI-enabled mirror run

## Comparison Identity

Pass A Run Sheet: HEARTH_VSM_1_5_RC_PASS_RUN_2026-03-24.md
Pass B Run Sheet: HEARTH_VSM_1_5_RC_PASS_AI_ENABLED_RUN_2026-03-24.md

Commit Hash (A): 41007dfeecb81afcd060eda8794ef025b5dde5b0
Commit Hash (B): 41007dfeecb81afcd060eda8794ef025b5dde5b0
Environment (A): Local RC rehearsal (command-line automation lane)
Environment (B): Local RC rehearsal (command-line automation lane)
Only Intended Variable Difference Confirmed: Yes (runtime AI token balance lane only)

If No, comparison is invalid and must be rerun.

## Executive Delta Verdict

Deterministic Baseline Preserved?
- [x] Yes
- [ ] No
- [ ] Unclear

Trust Envelope Preserved?
- [ ] Yes
- [ ] No
- [x] Partially

Calm UX Preserved?
- [ ] Yes
- [ ] No
- [x] Partially

Top-line Recommendation:
- [ ] GO with AI enabled
- [ ] GO with AI enabled limitations
- [x] HOLD AI-enabled path, keep baseline only
- [ ] NO-GO

## Section 1 - Anchor Behavior Delta

Anchor Integrity Differences:
- Unclear (not executed)

Observed Differences:
- No interactive anchor integrity scenarios were executed in either automation pass.

Status Transition Differences (attached / weak match / orphaned / global):
- Unclear (not executed)

Unexpected Relocation or Silent Movement:
- No observed in executed command lane

Deterministic Repair Behavior Parity:
- Unclear (not executed)

Evidence Links:
- HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_A_2026-03-24.md
- HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_B_2026-03-24.md

## Section 2 - Noise and Friction Delta

Unexpected Prompts or Interruptions:
- None observed in executed runtime tests

Perceived Pushiness Increase:
- None observed in executed runtime tests

Flow Interruptions Introduced by AI-enabled pass:
- None observed in executed runtime tests.

Notes:
- Calm UX and flow checks from manual VSM script were not executed; this section reflects only command-lane evidence.

## Section 3 - Trust Score Delta

Trust Confidence (Pass A): Maybe
Trust Confidence (Pass B): Maybe

Trust Delta:
- Unchanged

Why:
- Runtime contract parity is strong, but interactive VSM evidence is incomplete in both passes.

## Section 4 - Calm UX Delta

Cognitive Load Delta:
- Unclear (manual UX scenarios not executed)

UI Clutter Delta:
- Unclear (manual UX scenarios not executed)

Predictability Delta:
- Same in executed runtime tests

Non-destructive Feel Delta:
- Unclear (interactive VSM operations not executed)

Notes:
- This section cannot be fully evaluated without full manual script execution.

## Section 5 - Export Contract Parity

Export Schema Parity:
- Fail (not executed)

Export Content Parity (except permitted AI-contextual metadata):
- Fail (not executed)

Status/Scope Representation Parity:
- Fail (not executed)

Deterministic Ordering Parity:
- Fail (not executed)

UI-only Field Leakage Delta:
- Unclear (not executed)

Notes:
- No export artifacts were produced in either pass due missing interactive/fixture-backed run conditions.

## Section 6 - Release Gate Impact

Any Release Gate Criteria Changed by AI-enabled Pass?
- No (same evidence gaps in both passes)

If Yes, list affected gate sections:
1. N/A
2. N/A
3. N/A

Gate Outcome Delta:
- No change

## Final Recommendation

Decision:
- [ ] Proceed with both lanes (A and B acceptable)
- [ ] Ship baseline lane only (A)
- [ ] Ship AI-enabled lane with limitations
- [x] Hold release pending fixes

Required Follow-ups:
1. Execute HEARTH_VSM_1_5_QA_TEST_SCRIPT.md end-to-end in interactive lane.
2. Execute long-project drift scenario T7.1 and capture evidence.
3. Produce export artifacts and re-run parity checks.

Decision Owner: GitHub Copilot (GPT-5.3-Codex)
Date: 2026-03-24
