# HearthShell Refactor Phase 4C Report

## 1. Baseline

- Branch: `codex/hearthshell-refactor`
- Commit: `2b605637e6346a36e3a84fbcd760d6813c14ffcd`
- Baseline worktree: clean

## 2. Responsibilities extracted

Phase 4C gives Anvil handoff one route-level typed owner for eligibility
projection, selected active-script projection, validation presentation,
deterministic destination construction, Step-mode presentation, and the
explicit creator-triggered open command.

## 3. Controller and helper boundaries

- `useHearthAnvilHandoffController.ts` preserves the original hook positions
  through a narrow projection hook and aliases the existing open-action hook.
- `buildHearthAnvilHandoffViewModel.ts` is the pure eligibility derivation.
- `hearth-anvil-destination.ts` is the pure route builder over the existing
  Forge navigation helper.
- `hearth-anvil-handoff-contracts.ts` defines state, commands, status, and the
  surface contract without raw domain setters.

## 4. HearthShell imports removed

`HearthShell.tsx` no longer directly imports:

- `useHearthAnvilOpenAction`
- `getHearthAnvilStepModeHint`
- `buildOpenInAnvilHref`

It imports no new repository.

## 5. Canonical-script selection proof

The existing handoff authority was preserved exactly: the active Phase 4A
draft is validated, saved through the existing Phase 4A transition/autosave
path, and published as the canonical primary script only after the explicit
creator action. Phase 4C does not search revision history, infer approval,
select by recency, duplicate approval state, or import a script repository.
The existing workflow did not select an approved revision for this action, so
Phase 4C does not invent such a rule.

## 6. Eligibility and validation-state proof

The pure view model keeps no workspace, no workpiece, archived, no draft, no
script, invalid formatting, unavailable destination, and ready as distinct
states. Validation still uses the existing Anvil gate and script-tag
validation path; Phase 4C neither duplicates nor mutates it. Validation is
read-only and consumes no AI credits.

The current workflow exposes canonical-read/approval authority before this
handoff boundary rather than as an Anvil-button state. Phase 4C preserves that
behavior instead of fabricating new loading or approval semantics.

## 7. Destination proof

The pure destination helper delegates to the existing route contract. It
requires workspace and workpiece identity, returns no destination for an
archived workpiece, produces deterministic URL-encoded parameters, preserves
`open=script` and `script_path=script/script.md`, and never includes script
content or introduces a new route parameter.

## 8. Identity and stale-operation proof

The explicit open command captures a generation from the Phase 2 operation
authority. It rechecks that token after both asynchronous save and canonical
publication. A late completion for identity A therefore cannot navigate or
continue the handoff for identity B. Destination and validation projections
are synchronous derivations of the current immutable identity inputs, so
there is no asynchronous result capable of crossing identities.

## 9. Explicit-open proof

No controller construction, projection, validation, or retry invokes browser
navigation. Only `commands.openInAnvil`, wired to the existing creator click,
can run the existing same-tab `window.location.assign` behavior. Browser-open
exceptions now remain local and explicit as
`Unable to open Anvil. Try again.`

The pre-existing explicit-click save/publish behavior remains intact; no
automatic mount, identity-change, or validation path saves or publishes.

## 10. Anvil runtime authority

No recording session is created, recording is not started or stopped, no
device or teleprompter state is owned, no take is selected, no receipt is
emitted, and no workpiece is marked recorded.

## 11. Other domain boundaries

Ready, presence, route/navigation state, script revisions and approval,
conversation, sources, collections, and production remain with their existing
owners. Presence neither authorizes nor blocks handoff. Phase 4C does not
control Anvil after navigation.

## 12. Direct hook metrics

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Direct HearthShell hook/custom-hook sequence | 276 | 275 | -1 |

The two direct destination/Step-mode `useMemo` calls became one projection
hook at the same location. The existing open-action hook remains at its
original location under its Phase 4C name.

## 13. Expanded hook proof

| Metric | Before | After |
| --- | ---: | ---: |
| Semantically expanded hook sequence | 347 | 347 |
| SHA-256 | `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448` | `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448` |

Expansion maps the projection hook back to the same two ordered memos and the
open-command alias back to the same callback. No hook was added, removed, or
reordered semantically.

## 14. HearthShell size

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Physical lines | 7,011 | 7,026 | +15 |
| Imports | 137 | 136 | -1 |

The temporary line increase is typed assembly; handoff implementation and
direct helper coordination left the shell.

## 15. Bundle

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Verifier-counted JS chunks | 8 | 8 | 0 |
| Total bytes | 1,507,453 | 1,509,387 | +1,934 |
| Largest chunk | 760,190 | 762,124 | +1,934 |

The verifier passes with unchanged thresholds. The six optional production
surfaces remain lazy: Thumbnail, Visual Plan, Episode Images, B-roll,
Reference Clips, and Metadata.

## 16. Validation results

- Focused Phase 4C and existing Anvil characterization: 14/14 passed.
- Hearth typecheck: passed.
- Full Hearth suite: 93 test files passed.
- Tongs commit API: 135/135 passed.
- Nursery production build: passed.
- Hearth bundle verification: passed.
- `git diff --check`: passed.

## 17. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/hooks/useHearthAnvilOpenAction.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthAnvilHandoffController.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-anvil-handoff-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/buildHearthAnvilHandoffViewModel.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-anvil-destination.ts`
- `apps/hearth/tests/hearth-shell-phase-4c-anvil-handoff-controller.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_4C_REPORT.md`

## 18. Restored files

The build-generated `apps/nursery/public/forge-nav.json` was restored to the
baseline. No generated output, screenshot, cache, credential, temporary file,
schema, migration, RPC, query, RLS, or unrelated change is included.

## 19. Recommended Phase 5A boundary

Extract thumbnail orchestration only: thumbnail canonical projection,
direction/candidate generation commands, selection and finalization, stale
operation authority, and the existing lazy Thumbnail surface contract.
Exclude Episode Images, Visual Plan, B-roll, reference clips, metadata, and
release so production leaves the shell one surface at a time.

## 20. Final repository state

Phase 4C remains uncommitted on `codex/hearthshell-refactor` for review.
Nothing was pushed, merged, or deployed.
