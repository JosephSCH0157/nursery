# HEARTH - VSM-1.5 to VSM-2 Evolution Plan

Version: v1.0
Date: 2026-03-24
Scope: Hearth only
Purpose: Expand VSM capability without breaking trust, calm UX, or deterministic behavior

## 1. Evolution Charter

VSM-2 must grow around a trusted VSM-1.5 core.

Decision principle:
- Power can increase.
- Surprise cannot increase.

Release principle:
- No VSM-2 scope is allowed to bypass the existing RC evidence loop.

## 2. VSM Constitution (Inviolable Guarantees)

The following guarantees are constitutional and cannot regress:

1. Deterministic manual mode remains available and authoritative.
2. Anchor integrity model remains explicit and inspectable.
3. Calm UX baseline remains a release blocker, not a nice-to-have.
4. Export contract remains stable and deterministic.
5. Core workflow remains fully usable with AI disabled.
6. Non-destructive behavior remains mandatory.
7. No silent auto-relocation or auto-application of anchor changes.
8. Hearth remains editorial authority, not execution authority.

Any proposed feature that weakens a constitutional guarantee is automatic HOLD.

## 3. Allowed Expansion Areas (VSM-2)

### 3.1 Suggestion Scaffolds (Non-binding)

Allowed:
- Visual intent templates.
- Context-aware suggestion prompts.
- Suggested phrasing blocks for section intent notes.

Guardrails:
- Suggestions must never auto-apply.
- Every applied change requires explicit user confirmation.

### 3.2 Optional AI Assistance (Strictly gated)

Allowed:
- Proposal generation for visual types/priorities.
- Proposal generation for section intent wording.
- Proposal-only anchor repair recommendations.

Guardrails:
- AI proposes only.
- User applies explicitly.
- Deterministic baseline parity must pass in mirrored RC lane.

### 3.3 Organization and Navigation Enhancements

Allowed:
- Grouping, filtering, search, and sorting of visual entries.
- Section-level navigation and anchor jump shortcuts.
- Density-aware navigation aids.

Guardrails:
- Must not mutate data without explicit action.

### 3.4 Style System Enhancements (Editorial only)

Allowed:
- Higher-level visual style taxonomies.
- Reusable style profiles for visual intent.

Guardrails:
- No render, execution, timing, or media transformation semantics.

## 4. Explicit Non-Goals for VSM-2

Not allowed in VSM-2:

1. Timeline editing metaphors or timeline authority.
2. Media preview engine.
3. Clip selection and placement execution.
4. Automatic visual placement behavior.
5. Publishing, capture, or Hammer responsibilities.
6. Any feature that redefines Hearth as execution surface.

## 5. Compatibility Requirements

VSM-2 must remain backward-compatible with VSM-1.5 artifacts.

Required compatibility:

1. Existing visual plan data remains readable without migration loss.
2. Existing anchor references remain stable or explicitly reclassified with evidence.
3. Existing metadata fields remain valid:
- visual_priority
- visual_type
- section_intent_note
4. Existing export contract remains valid:
- schema stability or versioned additive evolution only
- deterministic ordering preserved
5. Persistence model remains canonical and consistent.

Migration policy:
- Additive schema evolution only unless explicit migration package is provided.
- No silent destructive migration.

## 6. Governance and Risk Controls

A feature must trigger full RC discipline if it changes any of the following:

1. Automatic behavior that can alter anchors or metadata.
2. Any AI-generated proposal surface.
3. Any UX change that may increase noise or cognitive load.
4. Any export schema or ordering behavior.
5. Any flow that impacts non-destructive guarantees.

Required RC evidence for these changes:
- Baseline pass (AI disabled)
- Mirrored pass (AI enabled, single-variable delta)
- A-vs-B delta summary
- Evidence-only Go/No-Go review

## 7. Staged VSM-2 Roadmap

### VSM-2.1 - Guided Suggestions, Manual Apply

Goal:
- Add suggestion scaffolds while preserving deterministic manual authority.

Candidate scope:
- Template suggestions for visual type and priority.
- Section note starter suggestions.

Exit criteria:
- Baseline preserved.
- Trust confidence non-degraded.
- Calm UX non-degraded.

### VSM-2.2 - AI Proposal Lane (Controlled)

Goal:
- Introduce optional AI proposal lane with explicit apply controls.

Candidate scope:
- AI-generated proposal cards for non-binding edits.
- Diff-first review and selective apply.

Exit criteria:
- Deterministic baseline preserved in mirror pass.
- No auto-application pathways.
- Export parity maintained.

### VSM-2.3 - Advanced Organization and Team Readability

Goal:
- Improve large-project navigation without changing authority boundaries.

Candidate scope:
- Grouping, filtering, bookmarks, and section-level summaries.
- Better large-plan inspection ergonomics.

Exit criteria:
- No regression in persistence integrity.
- No increase in calm UX friction.

## 8. Trust Envelope Evaluation Rules

Each VSM-2 stage must answer:

1. Did trust confidence hold or improve?
2. Did calm UX hold or improve?
3. Was deterministic baseline preserved?
4. Did export remain deterministic and compatible?

If any answer is negative, release must be constrained or held.

## 9. Hammer Consumption Contract (Future-safe, Loose Coupling)

VSM remains Hearth-owned editorial intent.

Future Hammer consumption constraints:

1. Hammer consumes exported intent artifact passively.
2. Hammer must not mutate Hearth canonical intent directly.
3. Integration remains contract-based, not shared mutable state.
4. Any coupling change requires explicit interface versioning.

## 10. Candidate Differentiator Path (Strategic)

Potential flagship position for Forge:
- Deterministic, script-native visual intent planning that survives rewrites.

Differentiation focus:
- Producer trust over automation spectacle.
- Explicit, inspectable, reversible intent modeling.
- AI as optional assistant, never hidden authority.

## 11. Beta Rollout Guidance (When ready)

Suggested rollout pattern:

1. Internal dogfood with evidence-only review discipline.
2. Small creator cohort with baseline+mirror RC evidence.
3. Narrow default rollout with AI optional/default-off where needed.
4. Broader rollout only after trust/calm metrics remain stable.

## 12. Go/No-Go Criteria For Entering VSM-2

Entry to VSM-2 planning is allowed only when:

1. VSM-1.5 release gate outcome is GO or GO with documented limitations.
2. Long-project drift test is stable.
3. Deterministic baseline verdict is Yes.
4. Known issues are understood and non-critical.

If these are not true, prioritize VSM-1.5 hardening before new scope.
