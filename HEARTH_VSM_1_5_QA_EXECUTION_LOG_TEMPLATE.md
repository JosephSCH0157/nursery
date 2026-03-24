# HEARTH - VSM-1.5 QA Execution Log Template

Template Version: v1.0
Date: 2026-03-24
Scope: Hearth only
Linked Test Script: HEARTH_VSM_1_5_QA_TEST_SCRIPT.md

## 1. Test Run Identity

Test Suite: HEARTH_VSM_1_5_QA  
Build Version:  
Commit Hash:  
Environment:  
Tester:  
Date:  
Session ID:  
AI Enabled: Yes / No  
Notes:

## 2. Global Observations (Quick Scan)

- [ ] No crashes
- [ ] No data loss observed
- [ ] No UI corruption
- [ ] Performance acceptable
- [ ] Export generated successfully
- [ ] Save/reload integrity maintained

Quick Notes:

## 3. Test Case Execution Blocks

Use one block per test case from HEARTH_VSM_1_5_QA_TEST_SCRIPT.md.

---

Test ID:  
Category:  
Scenario:

Steps Completed: Yes / No  
Expected Result Observed: Yes / No

Status:
- [ ] PASS
- [ ] FAIL
- [ ] PASS WITH ANOMALY
- [ ] BLOCKED

Observed Behavior:

Anchor Status Changes:

Repair Actions Used:

Unexpected Side Effects:

Reproducible: Yes / No

Severity:
- [ ] Cosmetic
- [ ] Minor
- [ ] Major
- [ ] Critical

Attachments:
- Screenshot(s):
- Video:
- Export JSON snippet:
- Console errors:

---

## 4. Script Rail Diagnostics

Rail Indicators Accurate: Yes / No  
Counts Correct: Yes / No  
Density Behavior Correct: Yes / No  
Performance Issues: None / Minor / Severe  
Scroll Sync Issues: Yes / No

Notes:

## 5. Editorial Metadata Persistence Check

Priority Preserved: Yes / No  
Type Preserved: Yes / No  
Section Notes Preserved: Yes / No  
After Reload: Yes / No  
After Script Edits: Yes / No  
After Export/Import: Yes / No

Notes:

## 6. Export Validation Summary

Export File Generated: Yes / No  
JSON Valid: Yes / No  
Anchors Resolved: Yes / No  
Statuses Correct: Yes / No  
Metadata Complete: Yes / No  
UI Fields Leaked: Yes / No  
Deterministic Ordering: Yes / No

Export File Name:

Export Schema Seen:

Notes:

## 7. Critical Long-Project Drift Test Log

Anchors Added:  
Script Edits Performed:  
Repair Actions Used:

Data Loss Observed: Yes / No  
Silent Relocation Observed: Yes / No  
Status Changes Accurate: Yes / No  
Persistence Across Sessions: Yes / No

Overall Stability Rating:
- [ ] Excellent
- [ ] Good
- [ ] Degraded
- [ ] Unstable

Notes:

## 8. Calm UX Evaluation (Hearth Promise)

Mode Felt Calm/Non-Intrusive: Yes / No  
Cognitive Load Acceptable: Yes / No  
UI Clutter Acceptable: Yes / No  
Confusing Behavior Observed: Yes / No

Describe Any Friction:

## 9. Trust Confidence (Required)

Would you trust this feature on a real project?
- [ ] Yes
- [ ] Maybe
- [ ] No

Why:

## 10. Final Test Run Verdict

Overall Result:
- [ ] PASS - Ready for Release Candidate
- [ ] PASS - Minor Issues
- [ ] HOLD - Fix Required
- [ ] FAIL - Not Production Ready

Top Issues Identified:
1.
2.
3.

Recommendations:
1.
2.
3.

## 11. Optional Machine-Readable Summary (JSON Stub)

Copy and fill this after run completion.

```json
{
  "suite": "HEARTH_VSM_1_5_QA",
  "buildVersion": "",
  "commitHash": "",
  "environment": "",
  "tester": "",
  "date": "",
  "sessionId": "",
  "aiEnabled": false,
  "global": {
    "noCrashes": true,
    "noDataLoss": true,
    "noUiCorruption": true,
    "performanceAcceptable": true,
    "exportGenerated": true,
    "saveReloadIntegrity": true
  },
  "summary": {
    "pass": 0,
    "fail": 0,
    "passWithAnomaly": 0,
    "blocked": 0
  },
  "drift": {
    "dataLossObserved": false,
    "silentRelocationObserved": false,
    "statusChangesAccurate": true,
    "persistenceAcrossSessions": true,
    "stability": "Excellent"
  },
  "calmUx": {
    "nonIntrusive": true,
    "cognitiveLoadAcceptable": true,
    "uiClutterAcceptable": true,
    "confusingBehaviorObserved": false
  },
  "trustConfidence": "Yes",
  "overallResult": "PASS - Ready for Release Candidate",
  "topIssues": [],
  "recommendations": []
}
```
