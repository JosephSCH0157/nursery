# Forge Episode Workspace P4 QA Notes

## Objective

Verify that loader-native episode context overrides bootstrap/session fallback across real Forge flows.

## Target Flows

- Hearth episode opened from the rail
- Hearth -> Start Recording -> Anvil
- Kept take -> Hammer
- Hammer -> Prepare Release -> Quench
- Direct entry into Hammer with an existing workpiece
- Direct entry into Quench with a prepared handoff packet
- Reload inside Hearth, Hammer, Bellows, Anvil, and Quench with active episode context present

## Execution Status

- Nursery TypeScript typecheck: passed
- Shared package build: passed
- Workspace smoke test: passed
- Manual interactive flow validation: not executed in this session

Reason:
This environment supports code edits, typecheck, and smoke execution, but it does not provide a reliable interactive browser flow runner for authenticated multi-app manual QA in this turn.

## Manual Verification Focus

- Confirm the episode title upgrades from bootstrap fallback to loader-native title in Hearth, Hammer, Bellows, and Quench.
- Confirm loader-derived display status wins over bootstrap/session fallback after each tool finishes loading.
- Confirm a weaker bootstrap payload does not overwrite an already-populated title or status during cross-tool navigation.
- Confirm routes with a workpiece but no resolved loader data render a loading workspace state rather than a half-populated header.
- Confirm routes without workpiece context do not show a stale episode header from prior navigation.