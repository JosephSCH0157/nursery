# HEARTH - VSM-1.5 QA Test Script

Version: v1.0
Date: 2026-03-24
Scope: Hearth only
Target: VSM-1.5 (manual visual intent durability)

## 1. Purpose

Validate trust behaviors for a stateful editorial system.

This script verifies that Visual Script Mode remains deterministic, non-destructive, and durable under realistic rewrite workflows.

## 2. Test Environment

Required:
- Hearth workspace with at least one editable episode/workpiece.
- Canonical script available in Hearth.
- Visual Script Mode enabled.
- AI lane disabled or unavailable for at least one full pass.

Recommended seed data:
- Script with 3-5 sections and 12-30 paragraphs.
- 10+ visual anchors distributed across paragraphs.
- Mix of anchor scopes: attached, orphaned, global.

Execution notes:
- Run all tests in order unless blocked.
- Record each case as Pass/Fail with evidence.
- Capture screenshots or JSON excerpts for failures.

## 3. Pass/Fail Rules

Pass only when all are true:
- No silent anchor relocation.
- No silent auto-repair.
- No metadata loss.
- Export contract is stable and deterministic.
- Mode remains calm and reversible.

Fail if any are observed:
- Anchor moved without explicit action.
- Anchor status missing/incorrect.
- Data disappears after save/reload.
- Export contains UI-only transient fields.

## 4. Category 1 - Anchor Integrity

Goal: Nothing silently detaches or relocates.

### T1.1 Edit script text before anchor
Steps:
1. Create/choose an attached anchor in paragraph P.
2. Edit text in paragraph immediately before P.
3. Save script and reopen VSM.
Expected:
- Anchor remains on original paragraph/span.
- Status remains attached.
- No auto-reattach action triggered.

### T1.2 Edit inside anchor span
Steps:
1. Choose attached anchor.
2. Modify words inside anchored span.
3. Save and reopen VSM.
Expected:
- Status transitions to weak match or orphaned deterministically.
- No auto-fix without explicit user action.
- Anchor record remains present (no deletion).

### T1.3 Delete anchored paragraph
Steps:
1. Choose attached anchor.
2. Delete the anchored paragraph.
3. Save and reopen VSM.
Expected:
- Status becomes orphaned (or weak match only if deterministic nearest repair target exists).
- Anchor entry still exists.
- No implicit conversion to global.

### T1.4 Split paragraph
Steps:
1. Choose attached anchor on multi-sentence paragraph.
2. Split paragraph into two.
3. Save and reopen VSM.
Expected:
- Status reflects exact/weak/orphaned correctly.
- Anchor does not jump across sections silently.

### T1.5 Merge paragraphs
Steps:
1. Choose two paragraphs where one has anchor and one does not.
2. Merge paragraphs.
3. Save and reopen VSM.
Expected:
- Anchor status recalculates correctly.
- Anchor remains deterministic and reviewable.

### T1.6 Reorder sections
Steps:
1. Move a full section to a new position.
2. Save and reopen.
Expected:
- Anchors remain stable by deterministic rules.
- Any broken mappings are visible via status (not hidden).

## 5. Category 2 - Repair Actions

Goal: Repairs are predictable and reversible.

### T2.1 Reattach nearest paragraph
Steps:
1. Force anchor into weak match/orphaned.
2. Trigger Reattach nearest paragraph.
Expected:
- Explicit action required.
- Anchor becomes attached when repair is valid.
- Entry id remains unchanged.
- visual_priority, visual_type, section_intent_note persist.

### T2.2 Manual rebind to selected text
Steps:
1. Enter reanchor mode.
2. Select explicit sentence/paragraph.
3. Save.
Expected:
- New exact structured anchor created from selection only.
- No fuzzy re-interpretation beyond selected range.

### T2.3 Convert to global visual
Steps:
1. Choose attached or weak/orphaned anchor.
2. Convert to global visual.
Expected:
- anchor_scope = global.
- script_anchor cleared.
- Status = global.
- Entry id and metadata preserved.

### T2.4 Leave orphaned for review
Steps:
1. Choose attached or weak/global anchor.
2. Leave orphaned.
Expected:
- anchor_scope = orphaned.
- script_anchor cleared.
- Status = orphaned.
- No entry deletion.

### T2.5 Reversibility checks
Steps:
1. Perform global -> attached rebind.
2. Perform orphaned -> attached rebind.
Expected:
- Deterministic transitions.
- No duplicated entries.
- No id churn.

## 6. Category 3 - Script Rail Chips

Goal: Script-native visibility feels reliable and calm.

### T3.1 Correct paragraph counts
Steps:
1. Add anchors to known paragraph ids/counts.
2. Verify rail chip values.
Expected:
- Per-paragraph counts match anchor distribution exactly.

### T3.2 Live updates after changes
Steps:
1. Add/remove/repair anchors.
2. Observe rail immediately and after save/reload.
Expected:
- Counts update correctly in-session.
- Counts persist after reload.

### T3.3 Density semantics
Steps:
1. Ensure paragraphs with counts 0, 1-2, and 3+.
2. Verify visual density class behavior.
Expected:
- 0 = none
- 1-2 = normal
- 3+ = dense

### T3.4 Scroll sync behavior
Steps:
1. Use long script with scrolling.
2. Navigate between editor and rail context.
Expected:
- Rail remains readable and coherent with current script context.
- No jitter, no jump loops.

### T3.5 Performance with many anchors
Steps:
1. Use 80-150 anchors.
2. Scroll and edit repeatedly.
Expected:
- UI remains responsive.
- No obvious frame drops or lockups.

## 7. Category 4 - Editorial Metadata

Goal: Metadata is durable through normal editorial flow.

Fields under test:
- visual_priority
- visual_type
- section_intent_note

### T4.1 Save and reload
Steps:
1. Set all three fields on multiple entries.
2. Save and reload page.
Expected:
- Values are unchanged.

### T4.2 Mode toggle
Steps:
1. Toggle in/out of Visual Script Mode.
2. Return to edited entries.
Expected:
- Values remain intact.

### T4.3 Export and import compatibility path
Steps:
1. Export visual intent JSON.
2. Rehydrate via existing import path if available in environment.
Expected:
- Metadata fields preserved or safely defaulted per contract.

### T4.4 Script edits after metadata set
Steps:
1. Heavily edit script.
2. Reopen entries.
Expected:
- Metadata unaffected by anchor status transitions.

## 8. Category 5 - Export Contract

Goal: Artifact is stable and machine-consumable.

### T5.1 Schema and top-level shape
Expected:
- schema = forge.hearth.visual-script-intent.v1
- anchors array present
- workpiece_id present when available

### T5.2 Status and scope fidelity
Expected:
- Entry data reflects current anchor status/scope semantics.
- attached/weak/orphaned/global state is representable via stored fields.

### T5.3 Metadata completeness
Expected:
- visual_priority present.
- visual_type present.
- section_intent_note present (nullable).

### T5.4 No UI-only leakage
Expected:
- No transient view state fields in export.
- No local-only flags, panel state, or temporary ids.

### T5.5 Deterministic ordering
Steps:
1. Export twice without edits.
2. Compare output.
Expected:
- Stable ordering and stable ids.

## 9. Category 6 - Calm UX Guarantees

Goal: Hearth remains focused and non-destructive.

### T6.1 Noise control
Expected:
- No alert spam.
- Status/repair UI remains informative but calm.

### T6.2 Mode reversibility
Steps:
1. Enter and exit VSM repeatedly.
Expected:
- No state corruption.
- No hidden irreversible transitions.

### T6.3 Non-destructive behavior
Expected:
- No unexpected script overwrite from VSM actions.
- No deletion of visual entries unless explicitly requested.

### T6.4 AI disabled run
Steps:
1. Disable AI lane/credits.
2. Execute categories 1-5.
Expected:
- All VSM-1.5 core operations still work.

### T6.5 Script editing outside VSM
Steps:
1. Exit VSM.
2. Edit script in normal draft/editor flow.
3. Return to VSM.
Expected:
- Script editing remains fully available outside mode.
- VSM state remains coherent.

## 10. Critical Long Project Drift Test

Goal: Validate durability under realistic production drift.

### T7.1 Drift Scenario
Steps:
1. Create 40+ anchors across a long script.
2. Perform repeated script rewrites over multiple sessions.
3. Save/close/reopen 5+ times.
4. Switch between Sparks/Episodes views repeatedly.
5. Rename episode/workpiece.
6. Archive and restore episode/workpiece (if supported).
7. Perform at least 10 repair actions (mixed types).
8. Export final visual intent artifact.
Expected:
- No silent relocation.
- No disappearing entries.
- No duplicated or corrupted ids.
- Metadata intact.
- Export valid and deterministic.

## 11. Defect Logging Template

For each failure, record:
- Test case id (example: T2.1)
- Build/commit hash
- Workspace + workpiece id
- Preconditions
- Exact steps
- Actual result
- Expected result
- Evidence (screenshot/json excerpt)
- Severity: blocker | major | minor

## 12. Exit Criteria for VSM-1.5

VSM-1.5 is release-ready only when:
- All test cases pass.
- Long Project Drift Test passes.
- No blocker/major unresolved defects remain.
- Behavior is boringly reliable under repeated use.
