# HEARTH - Visual Script Mode v1.5 Specification

Version: v1.5
Date: 2026-03-24
Scope: Hearth only
Status: Ready for implementation validation

## 1. Objective

VSM-1.5 makes manual visual intent durable, inspectable, and repairable.

Primary user outcome:
"I can mark up the script visually without Hearth freelancing or silently breaking structure."

## 2. Boundary Contract (Hearth-Only)

VSM-1.5 is editorial and deterministic.

Allowed:
- Manual anchor authoring and repair.
- Manual visual priority and visual type classification.
- Manual section-level visual intent notes.
- Script-native visual density indicators.
- Deterministic anchor health and repair tools.

Not allowed in VSM-1.5:
- Automatic visual generation.
- Candidate galleries.
- Video previews.
- Timing logic or timeline metaphors.
- Hammer-specific controls or execution semantics.

## 3. Canonical Data Contract

Canonical persistence remains in episode image map entries.

Required entry fields for VSM-1.5:
- anchor_scope: attached | orphaned | global
- visual_priority: primary | supporting | optional
- visual_type: b_roll | still_image | text_overlay | diagram | archival | motion_graphic
- section_intent_note: string | null

Compatibility rules:
- Existing entries without these fields must hydrate with deterministic defaults.
- No DB migration required for this slice.

Default hydration behavior:
- anchor_scope: attached if script_anchor exists, else orphaned
- visual_priority: supporting
- visual_type: still_image
- section_intent_note: null

## 4. Anchor Integrity Model

### 4.1 Anchor Status (UI-visible)

Every visual anchor must show exactly one status:
- attached: exact anchor match to current canonical script span
- weak match: exact span invalid, deterministic nearest repair target available
- orphaned: no valid exact span and no deterministic weak target (or intentionally left unresolved)
- global: intentional non-local visual intent, not bound to one script span

### 4.2 Deterministic Assessment Rules

Given canonical script + entry:
1. If anchor_scope == global: status = global
2. Else if script_anchor is null: status = orphaned
3. Else if exact span resolves: status = attached
4. Else if nearest deterministic paragraph repair target exists: status = weak match
5. Else: status = orphaned

No probabilistic ranking or model inference is allowed.

## 5. Repair Action Contract

Repair actions must be explicit user commands.

### 5.1 Reattach to nearest paragraph

Input:
- current script_anchor
- current canonical script

Deterministic rule:
- choose paragraph by same paragraph_id if present
- else nearest paragraph by absolute paragraph_order distance
- if overlap heuristic passes threshold, build paragraph-level anchor
- commit anchor_scope=attached and script_anchor=resolved anchor

Result:
- entry becomes attached
- status recomputes accordingly

### 5.2 Reattach to selected text

Input:
- explicit user selection from canonical script rail

Rule:
- build exact structured anchor from selection only
- no fuzzy reinterpretation

Result:
- entry becomes attached

### 5.3 Convert to global visual

Rule:
- set anchor_scope=global
- clear script_anchor

Result:
- status=global

### 5.4 Leave orphaned for review

Rule:
- set anchor_scope=orphaned
- clear script_anchor

Result:
- status=orphaned

## 6. Script Rail UX Contract

Visual Script Mode must expose paragraph-level chips beside the canonical script rail.

For each paragraph:
- show visual count for attached anchors mapped to that paragraph
- style density states:
  - none: 0 anchors
  - normal: 1-2 anchors
  - dense: 3+ anchors

Additional rail summary:
- global count
- orphaned count

Behavior constraints:
- indicators are read-only diagnostics
- indicators never mutate anchors
- indicators update immediately after save/repair actions

## 7. Editorial Fields UX Contract

Each entry editor must provide manual controls:
- Visual Priority dropdown: primary, supporting, optional
- Visual Type dropdown: B-roll, still image, text overlay, diagram, archival, motion graphic
- Section Intent Note: freeform textarea for producer intent

Behavior:
- field edits enter editing state
- autosave persists through canonical image map save path
- export includes current draft state when pending edits are present

## 8. Export Artifact Contract

VSM export artifact schema:
- schema: forge.hearth.visual-script-intent.v1
- workpiece_id (when available)
- anchors: array of canonical entries

Filename pattern:
- visual-script-intent-<workpieceSuffix>.json

## 9. State Machine (VSM-1.5)

Entry integrity states:
- attached
- weak_match
- orphaned
- global

Transitions:
- attached -> weak_match: script changed, exact span invalid, deterministic weak repair found
- attached -> orphaned: script changed, no deterministic repair target
- weak_match -> attached: reattach nearest paragraph or reattach selected text
- weak_match -> global: convert to global visual
- weak_match -> orphaned: leave orphaned
- orphaned -> attached: reattach selected text or deterministic nearest paragraph
- orphaned -> global: convert to global visual
- global -> attached: reattach selected text
- global -> orphaned: leave orphaned

## 10. Acceptance Criteria

### AC-1 Status Visibility
- Every entry shows one of: attached, weak match, orphaned, global.
- No entry can render without status.

### AC-2 Deterministic Repair
- Nearest paragraph repair always yields the same output for same input.
- Selected-text repair uses only explicit selection span.

### AC-3 Explicit User Agency
- No background auto-repair occurs without user action.
- Convert global and leave orphaned are explicit controls.

### AC-4 Script Rail Native Feel
- Paragraph chips render with counts and density states.
- Global/orphaned counters are visible in rail summary.

### AC-5 Editorial Metadata
- Priority/type/note fields persist and reload exactly.
- Defaults hydrate correctly for older entries.

### AC-6 Export Stability
- Export schema and filename match contract.
- Export reflects latest saved or actively edited intent payload.

### AC-7 Boundary Safety
- VSM-1.5 introduces no AI generation, candidate gallery, timeline metaphor, timing logic, or Hammer execution controls.

## 11. Test Matrix

Unit tests:
- anchor status classifier for all four statuses
- deterministic nearest paragraph selection
- global/orphan conversion behavior
- hydration defaults for new fields

Integration tests:
- end-to-end repair flow: weak match -> attached
- selected-text reattach flow
- orphan/global transitions
- script rail chip counts and density thresholds
- export payload shape and filename

Regression tests:
- legacy entries load without loss
- existing image map save flows remain valid
- no reintroduction of candidate-generation UI in manual-only mode

## 12. Out of Scope for v1.5

Deferred to later versions:
- suggestion scaffolds (VSM-2)
- media retrieval linkage
- execution readiness scoring
- Hammer ingestion semantics beyond passive fields

## 13. Release Readiness Checklist

- [ ] All AC-1 through AC-7 pass
- [ ] Typecheck passes
- [ ] Hearth tests pass
- [ ] No new persistence surface outside canonical episode image map
- [ ] Manual QA confirms no hidden anchor breakage
- [ ] Manual QA confirms deterministic repair repeatability
