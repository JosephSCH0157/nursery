# HEARTH - VSM-1.5 Release Gate Checklist

Version: v1.0
Date: 2026-03-24
Scope: Hearth only
Gate Type: Go/No-Go contract
Linked artifacts:
- HEARTH_VSM_1_5_IMPLEMENTATION_SPEC.md
- HEARTH_VSM_1_5_QA_TEST_SCRIPT.md
- HEARTH_VSM_1_5_QA_EXECUTION_LOG_TEMPLATE.md

## Release Identity

Release Candidate Tag:  
Build Version:  
Commit Hash:  
Environment:  
Decision Owner:  
Date:  

## How To Use This Gate

- Mark each criterion as Pass or Fail.
- Any hard-stop failure forces HOLD.
- Evidence link or note is required for each section.

## 1) Scope Conformance Gate (Hard Stop)

All must be Pass:

- [ ] No media editing capability added.
- [ ] No timeline constructs introduced.
- [ ] No capture behavior introduced.
- [ ] No publishing/distribution logic introduced.
- [ ] No storage ownership change introduced.
- [ ] No Hammer-specific coupling introduced.
- [ ] Core VSM workflow operates with AI disabled.

Result: Pass / Fail  
Evidence:

Hard-stop rule:
- If any item fails -> HOLD.

## 2) Data Integrity Gate (Hard Stop)

All must be Pass:

- [ ] No anchor loss across save/reload.
- [ ] Anchor ids remain stable across edits and repairs.
- [ ] visual_priority, visual_type, and section_intent_note persist.
- [ ] No duplicate-entry corruption observed.
- [ ] No silent overwrite observed.
- [ ] Export round-trip safe (if import path exists in environment).

Result: Pass / Fail  
Evidence:

Hard-stop rule:
- If any item fails -> HOLD.

## 3) Anchor Reliability Gate (Hard Stop)

All must be Pass:

- [ ] Status transitions are correct: attached, weak match, orphaned, global.
- [ ] Orphan detection is reliable and visible.
- [ ] Repair actions are deterministic.
- [ ] No auto-relocation without explicit user action.
- [ ] Weak matches are surfaced clearly and repairable.

Result: Pass / Fail  
Evidence:

Hard-stop rule:
- If any item fails -> NO-GO.

## 4) Long-Project Stability Gate

All must be Pass:

- [ ] Drift test shows no cumulative corruption.
- [ ] Repeated edit/save/reopen cycles remain stable.
- [ ] Performance acceptable with high anchor counts.
- [ ] No exponential slowdown observed.
- [ ] No observable memory growth issue during extended session.

Result: Pass / Fail  
Evidence:

## 5) UX Calmness Gate (Hearth Promise)

All must be Pass:

- [ ] Mode does not overwhelm normal script writing flow.
- [ ] Mode toggle is reversible without confusion.
- [ ] No UI noise explosion.
- [ ] Cognitive load acceptable to testers.
- [ ] Non-destructive behavior is preserved.

Result: Pass / Fail  
Evidence:

## 6) Export Contract Gate (Hard Stop)

All must be Pass:

- [ ] Export ordering is deterministic.
- [ ] Schema value is valid and expected.
- [ ] Status/scope representation is correct for all entries.
- [ ] Metadata fields are complete.
- [ ] No UI-only transient fields leak into export.
- [ ] Output is stable across sessions.

Result: Pass / Fail  
Evidence:

Hard-stop rule:
- If any item fails -> HOLD.

## 7) QA Coverage Gate

All must be Pass:

- [ ] QA test script executed in full.
- [ ] Execution log completed.
- [ ] Critical scenarios have no coverage gaps.
- [ ] Known issues documented with severity.

Result: Pass / Fail  
Evidence:

## 8) Trust Gate (Human Judgment)

Required:

- [ ] Tester trust-confidence prompt completed.
- [ ] Trust-confidence threshold met.

Suggested threshold policy:
- >= 80% Yes -> Pass
- Majority Maybe -> Conditional GO only with documented limitations
- Any No with critical reasoning -> HOLD

Trust-confidence summary:
- Yes:  
- Maybe:  
- No:  

Result: Pass / Fail  
Evidence:

## 9) Known Issues Review Gate

All must be Pass:

- [ ] All known issues categorized by severity.
- [ ] Workarounds documented where applicable.
- [ ] No unresolved critical blockers.
- [ ] Regression risk assessed and accepted.

Result: Pass / Fail  
Evidence:

## 10) Future Compatibility Gate

All must be Pass:

- [ ] Current model does not block VSM-2 expansion.
- [ ] Naming remains future-safe.
- [ ] No hidden assumptions that force migration rework.
- [ ] UI/state coupling remains manageable.

Result: Pass / Fail  
Evidence:

## Hard-Stop Summary

Auto HOLD triggers:
- Scope Conformance fail
- Data Integrity fail
- Export Contract fail

Auto NO-GO trigger:
- Anchor Reliability fail

## Final Go/No-Go Decision

Release Decision:
- [ ] GO - Ready for Production
- [ ] GO - With Documented Limitations
- [ ] HOLD - Fix Required
- [ ] NO-GO - Rework Needed

Decision Owner:  
Date:  

Top Blocking Issues:
1.  
2.  
3.  

Release Notes / Limitations:
1.  
2.  
3.  

Sign-off:
- Product:  
- Engineering:  
- QA:  
