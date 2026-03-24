# HEARTH VSM-2 Feature Review Matrix

Purpose: classify proposed Hearth features quickly without eroding the non-regression constitution.

Scope: Hearth only. This matrix is a pre-flight gate, not a replacement for implementation specs.

References:
- `HEARTH_VSM_1_5_TO_VSM_2_EVOLUTION_PLAN.md`
- `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`
- `docs/HEARTH_ANVIL_SCRIPT_TAG_CONTRACT.md`

## How To Use (Under 1 Minute)
1. Fill one row per feature idea.
2. If `Expansion Lane` is unclear, stop and redesign before coding.
3. If `Constitutional Impact` is `Direct`, require RC trigger and explicit acceptance criteria.
4. If `Deterministic Baseline Preserved?` is `No` or `Unclear`, do not proceed.

## Allowed Expansion Lanes
- `suggestion_scaffolds`
- `ai_assistance`
- `organization_navigation`
- `style_systems`
- `other_requires_justification`

## Matrix
| Feature Summary | Expansion Lane | Constitutional Impact | Trust Envelope Risk | Deterministic Baseline Preserved? | AI Dependency | Backward Compatibility | RC Trigger Required? | Downstream Tool Dependency | Recommendation | Notes / Constraints |
|---|---|---|---|---|---|---|---|---|---|---|
| Compose mode setup modal (outline / single speaker / full all) | organization_navigation | Indirect | Medium | Yes | Optional | Fully compatible | No | None | Proceed | Keep mode contract typed and shared through request model. |
| Canonical script-tag validator at all gates (Ready / Approve / Open in Anvil) | other_requires_justification | Direct | High | Yes | None | Fully compatible | Yes | Anvil interaction | Proceed with constraints | Must use shared validator package only; no Hearth-local validator forks. |
| Auto-repair ambiguous crossed speaker tags | ai_assistance | Direct | High | No | Required | Migration needed | Yes | Anvil interaction | Reject | Violates deterministic repair policy; manual correction required. |
| Save-as-default promotion in Compose modal | organization_navigation | Indirect | Low | Yes | None | Fully compatible | No | None | Proceed | Promotion must be explicit and default-off. |
| Full script generation that silently changes speaker count from defaults | ai_assistance | Direct | High | Unclear | Required | Breaking change | Yes | Anvil interaction | Reject | Must require explicit setup override before generation. |
| Header badge: `Standard: 2 speakers · S1 + S2 · Outline` | organization_navigation | None | Low | Yes | None | Fully compatible | No | None | Proceed | Display-only trust aid; no lifecycle semantics change. |
| Timeline editing controls inside Hearth | other_requires_justification | Direct | High | Unclear | Optional | Breaking change | Yes | Hammer interaction | Reject | Out of Hearth scope; belongs to Hammer. |

## Gate Semantics
- `Proceed`: Lane-aligned, deterministic baseline preserved, no constitutional violation.
- `Proceed with constraints`: Allowed only with explicit guardrails and tests called out before merge.
- `Defer`: Potentially valid but not in current VSM-2 scope window.
- `Reject`: Violates constitution, boundary charter, or deterministic baseline.

## Hard Non-Goals (VSM-2)
- Hearth is not a timeline editor.
- Hearth must not absorb Hammer media-editing responsibilities.
- Hearth must not bypass shared canonical validator contracts for convenience.
- Hearth must not convert one-off compose overrides into production defaults without explicit promotion.
