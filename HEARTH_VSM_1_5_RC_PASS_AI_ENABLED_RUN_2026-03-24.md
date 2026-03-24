# HEARTH - VSM-1.5 RC Pass Run Sheet (AI Enabled Mirror)

Date: 2026-03-24
Session Type: Release Candidate evidence pass (mirrored lane)

## Build Freeze (Must Match Baseline Pass)

Commit Hash: 41007dfeecb81afcd060eda8794ef025b5dde5b0
Working Tree State: Dirty (known local Hammer edits present)
Environment: Local RC rehearsal
Feature Scope: Hearth VSM-1.5 only
AI Enabled: Yes

Intentional variable change from baseline:
- AI lane state only (disabled -> enabled)

Hard rule:
- If commit, environment, or feature scope differs from baseline pass, invalidate this mirror and restart.

Baseline sibling artifact:
- HEARTH_VSM_1_5_RC_PASS_RUN_2026-03-24.md

## Evidence Pipeline

1. Spec baseline: HEARTH_VSM_1_5_IMPLEMENTATION_SPEC.md
2. Test scenarios: HEARTH_VSM_1_5_QA_TEST_SCRIPT.md
3. Evidence logging: HEARTH_VSM_1_5_QA_EXECUTION_LOG_TEMPLATE.md
4. Go/No-Go decision: HEARTH_VSM_1_5_RELEASE_GATE_CHECKLIST.md

## AI-Enabled Mirror Execution Order

1. Run one continuous producer-style session first.
- Goal: detect AI-on friction/noise before formal checks.

2. Run full formal QA script end-to-end.
- Use same structure and severity discipline as baseline pass.
- Record observations in real time.

3. Run long-project drift scenario.
- Compare stability under same stress profile used in baseline pass.

4. Complete calm UX and trust-confidence fields.
- Focus on trust envelope preservation, not novelty.

5. Fill release gate using recorded evidence only.

## A-vs-B Comparison Block (Baseline vs AI Enabled)

Baseline Pass Reference:
- Run Sheet: HEARTH_VSM_1_5_RC_PASS_RUN_2026-03-24.md
- Execution Log Reference: HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_A_2026-03-24.md

### Comparison Outcomes

Anchor Integrity Differences:
- Unclear (not executed in either automation lane)
- Notes:
  - No interactive anchor workflows were run.

UX Calmness Differences:
- Unclear (not executed in either automation lane)
- Notes:
  - No interactive UX pass was run.

Unexpected Prompts or Friction:
- No
- Notes:
  - Runtime contract lane produced no prompt-spam indicators.

Export Contract Differences:
- Unclear (not executed in either automation lane)
- Notes:
  - No export contract checks executed.

Trust-Confidence Delta:
- Baseline score/result: Maybe
- AI-enabled score/result: Maybe
- Delta summary: Unchanged in the executed automation subset.

Behavior that Felt More Magical Than Reliable:
- No
- Notes:
  - No non-deterministic runtime behavior observed in executed tests.

## Load-Bearing Verdict

Deterministic Baseline Preserved?
- [x] Yes
- [ ] No
- [ ] Unclear

Why:
- Executed runtime contract tests were 11/11 pass in both lanes with no observed delta.

## Exit Criteria For This Mirror RC Run

- Full QA script executed
- Execution log completed
- A-vs-B comparison block completed
- Deterministic baseline preserved verdict completed
- Release gate completed from evidence

## Final Decision Record

Decision: HOLD - Fix Required
Owner: GitHub Copilot (GPT-5.3-Codex)
Date: 2026-03-24
Execution Log Reference: HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_B_2026-03-24.md
Top blockers or limitations:
1. Full HEARTH_VSM_1_5_QA_TEST_SCRIPT.md interactive coverage not executed.
2. Drift scenario T7.1 not executed.
3. Export-contract/manual persistence checks not executed in this automation lane.
