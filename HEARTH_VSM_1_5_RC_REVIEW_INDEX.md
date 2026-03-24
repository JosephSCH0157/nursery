# Hearth VSM 1.5 RC Review Index

**RC Identity:** RC-VSM-1.5-AUTO-2026-03-24  
**Evidence-bearing commit:** `41007dfeecb81afcd060eda8794ef025b5dde5b0` (branch: `codex/preview-video`, dirty)  
**Current decision:** **HOLD - Fix Required**  
**Decision confidence:** Low

---

## Scope

**This RC validates:**
- VSM 1.5 anchor management behavior within the Hearth AI runtime contract
- AI-enabled vs AI-disabled lane parity for the Hearth phase 4 runtime test suite
- Hammer provenance label consistency (provenance micro-pass, `41007dfe`)

**This RC does not certify:**
- Integration with downstream Hammer, Quench, or Anvil modules
- Interactive anchor flows, repair workflows, or calm UX behavior (not yet executed)
- Export contract conformance (not yet executed)
- Performance characterization or load behavior
- Production deployment readiness

---

## Final Decision Documents

| Document | Role | Decision |
|---|---|---|
| [HEARTH_VSM_1_5_EVIDENCE_ONLY_GO_NO_GO_REVIEW.md](HEARTH_VSM_1_5_EVIDENCE_ONLY_GO_NO_GO_REVIEW.md) | Evidence-only Go/No-Go review — primary release decision | HOLD - Fix Required (Red) |
| [HEARTH_VSM_1_5_RELEASE_GATE_CHECKLIST.md](HEARTH_VSM_1_5_RELEASE_GATE_CHECKLIST.md) | Release gate — 10 hard-stop sections | All sections Fail |
| [HEARTH_VSM_1_5_RC_PASS_A_VS_B_DELTA_SUMMARY.md](HEARTH_VSM_1_5_RC_PASS_A_VS_B_DELTA_SUMMARY.md) | Pass A vs B delta — baseline parity comparison | Hold AI-enabled path |

## Pass Run Sheets

| Document | Lane | Runtime Result |
|---|---|---|
| [HEARTH_VSM_1_5_RC_PASS_RUN_2026-03-24.md](HEARTH_VSM_1_5_RC_PASS_RUN_2026-03-24.md) | Pass A — AI disabled | HOLD - Fix Required |
| [HEARTH_VSM_1_5_RC_PASS_AI_ENABLED_RUN_2026-03-24.md](HEARTH_VSM_1_5_RC_PASS_AI_ENABLED_RUN_2026-03-24.md) | Pass B — AI enabled | HOLD - Fix Required |

## Execution Logs

| Document | Lane | Tests |
|---|---|---|
| [HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_A_2026-03-24.md](HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_A_2026-03-24.md) | Pass A — AI disabled | 11/11 pass; phase4 gate blocked (no CI fixtures) |
| [HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_B_2026-03-24.md](HEARTH_VSM_1_5_QA_EXECUTION_LOG_PASS_B_2026-03-24.md) | Pass B — AI enabled | 11/11 pass; phase4 gate blocked (no CI fixtures) |

---

## What the evidence proves

- Hearth AI runtime contract: **11/11 pass, both lanes, deterministic.**
- AI-enabled vs disabled parity: **preserved within the executed subset.**
- Anchor integrity, repair flows, export parity, calm UX, T7.1 drift: **not executed.**

## What is required to flip to GO

1. **Interactive VSM pass** — run categories T1–T6 from [HEARTH_VSM_1_5_QA_TEST_SCRIPT.md](HEARTH_VSM_1_5_QA_TEST_SCRIPT.md) against a fixture-backed workspace (`FORGE_TEST_WORKSPACE_ID` / `FORGE_TEST_WORKPIECE_ID`).
2. **T7.1 drift scenario** — 40+ anchors, 5+ save/reopen cycles, 10 mixed repair actions; produce a real execution result.
3. **Export artifact validation** — generate export output from both lanes, verify schema, ordering, and leakage against the export contract.
4. **Refill release gate and evidence-only review** from that new evidence only.

---

*Generated: 2026-03-24 | Commit: `41007dfe`*
