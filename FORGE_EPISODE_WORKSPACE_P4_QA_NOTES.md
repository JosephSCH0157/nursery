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

## Execution Status (P4 Initial)

- Nursery TypeScript typecheck: passed
- Shared package build: passed
- Workspace smoke test: passed
- Manual interactive flow validation: not executed in this session

Reason:
This environment supports code edits, typecheck, and smoke execution, but it does not provide a reliable interactive browser flow runner for authenticated multi-app manual QA in this turn.

## Stabilization Pass Results (Post-P4)

### Package-Level Typecheck

- `apps/hearth` standalone typecheck: **0 errors** (clean — pre-existing errors resolved between sessions)
- `apps/nursery` typecheck: **exit 0** (clean)
- `packages/shared` build: **exit 0** (clean)
- Workspace smoke: **[SMOKE] ok**

### Adapter Audit (automated, no browser)

All 5 tool adapters reviewed:

| Tool | Phase | Loading trigger | Title source | Issues found |
|------|-------|----------------|--------------|--------------|
| Hearth | script | isLoading \|\| isWorkpiecesLoading | activeWorkpiece.title | None |
| Hammer | edit | resolvingInferredWorkspace \|\| workpieceLabelLoading | workpieceLabel | None |
| Bellows | record | loadingRuntime | draftTitle \|\| snapshot.session.draft.title | None |
| Anvil | record | waitingForWorkspaceResolution \|\| handoffValidating | resolvedEpisodeTitle from episode list | None |
| Quench | release | preparedHandoffState.status === "loading" | selectedCase.packet.title | None |

Source-precedence model verified: `loader(2) > bootstrap(1) > session(0)` correctly applied field-by-field in `mergeEpisodeState`. No overwrite of stronger-sourced fields by weaker-sourced patches.

Nullable safety: all adapters guard against empty `episodeId` and empty `title` before emitting a read model (`return null` path prevents binding null/empty data into context).

`setEpisodeContextLoading` "active guard": when the same episode is already "active", loading is intentionally skipped to preserve existing loader-quality data. Correct behavior.

Cross-navigation stale header: `EpisodeWorkspaceShell` validates `requestedEpisodeId === ctx.episode.episodeId` before rendering header/loading overlay — routes without `workpiece_id` correctly suppress any stale context display.

### Known Gap (not a regression)

If a workpiece cannot be found (not in DB / soft 404), the loading header shows indefinitely because the read model requires a non-empty title. This is an edge case; no regression from pre-P4 behavior.

### P5 Readiness

Episode Workspace layer is **stable and ready for P5 visual finish work**. No structural changes required.

## Manual Verification Focus

- Confirm the episode title upgrades from bootstrap fallback to loader-native title in Hearth, Hammer, Bellows, and Quench.
- Confirm loader-derived display status wins over bootstrap/session fallback after each tool finishes loading.
- Confirm a weaker bootstrap payload does not overwrite an already-populated title or status during cross-tool navigation.
- Confirm routes with a workpiece but no resolved loader data render a loading workspace state rather than a half-populated header.
- Confirm routes without workpiece context do not show a stale episode header from prior navigation.