# HearthShell Refactor Phase 4B2 Report

## Baseline

- Branch: `codex/hearthshell-refactor`
- Phase 4B1 checkpoint: `54dcaf721acd056a94673b49a34a766ee9542d90`
- Initial worktree: clean
- HearthShell: 7,059 lines, 139 imports, 281 direct hooks
- Expanded sequence: 347 hooks
- Expanded SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 Hearth JS chunks, 1,502,314 bytes total, 755,051-byte
  largest chunk

## 1. Source responsibilities extracted

Phase 4B2 moves source-library and active-workpiece source projection,
research-result presentation, source notes, provenance status, source
selection/detail loading, attach/detach, add/update, refresh/retry, and the
Sources surface behind one typed route-level controller.

## 2. Controller composition

`useHearthSourcesController` composes the existing `useSourcesState` leaf hook
and the existing local research-result state at their original hook position.
It exposes typed state, commands, status, and surface sections.

`buildHearthSourcesViewModel.ts` contains only pure status and notes projection.
`hearth-sources-contracts.ts` defines the public contract. Repository
implementation remains inside `useSourcesState`; it was not copied or
reimplemented.

## 3. HearthShell dependency changes

HearthShell no longer imports `useSourcesState`, `SourcesView`, or the research
result type directly. It consumes `useHearthSourcesController`, uses explicit
controller commands for AI-proposed source operations and draft source sync,
and passes the controller-rendered Sources surface into the shell.

The route retains only the source projections required by existing episode
context, badges, and Spark link construction.

## 4. Hydration and stale-response proof

Canonical workspace-index and workpiece-reference reads remain in the existing
leaf hook. Its workspace/workpiece scoped state, cancellation flag, operation
token, and `operationAuthority.isCurrent` checks are unchanged. Cache recovery
remains presentation-only and scoped by workspace/workpiece.

The focused source-scope test proves that a late hydration for identity A
cannot overwrite identity B and that B mutations post only to B. Successful
empty projection and explicit canonical-read failure are separate controller
statuses. The leaf hook now records that failure without changing visible copy
or treating cached/empty data as canonical success.

## 5. Provenance and attachment authority

The controller exposes workspace-index availability, cited source IDs, and the
latest research result as provenance. None is named or treated as
verification, approval, or script truth.

Detach continues to remove only the active workpiece reference; it does not
delete the underlying workspace-library source. Attach preserves the existing
source identity and association path. Tongs/Workspace remains canonical where
the leaf hook currently persists source records, indexes, and workpiece refs.

## 6. Script and conversation boundary

Research results remain presentation/context input. No script text, chat
history, compose state, approval state, revisions, or autosave state is
duplicated. Existing AI proposal source commands call the controller's
explicit source mutations, while script mutation continues through the Phase
4A path and conversation behavior remains owned by Phase 4B1.

## 7. Hook metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Direct HearthShell hook/custom-hook sequence | 281 | 280 | -1 |
| Semantically expanded hook sequence | 347 | 347 | 0 |

The controller expands to the original `useSourcesState` call followed by the
original research-result `useState` call. No hook moved relative to its
neighbors and no additional runtime hook was introduced.

## 8. Expanded hook hash

- Before:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- After:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Expanded length: 347 before and after
- Result: identical

## 9. HearthShell metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Lines | 7,059 | 7,050 | -9 |
| Import declarations | 139 | 137 | -2 |

## 10. Bundle

No budget changed. All six Phase 3.5 optional production surfaces remain lazy.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Verifier-counted Hearth JS chunks | 8 | 8 | 0 |
| Verifier total | 1,502,314 | 1,504,208 | +1,894 |
| Largest Hearth chunk | 755,051 | 756,945 | +1,894 |

The small eager increase is the typed controller/status projection and
route-level surface factory; no production module entered the eager graph.

## 11. Tests and build

- Focused Phase 4B2 and source-scope tests: pass (7/7)
- `pnpm --filter @nursery/hearth typecheck`: pass
- `pnpm --filter @nursery/hearth test`: pass (91 test files)
- `pnpm --filter @forge/tongs test:commit-api`: pass (135/135)
- `pnpm --filter nursery build`: pass
- `pnpm --filter nursery verify:hearth-bundle`: pass
- `git diff --check`: pass

Existing suites continue to cover source registry/repository semantics,
surface behavior, script authority, conversation authority, identity resets,
and production lazy boundaries.

## 12. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/hooks/useSourcesState.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-sources-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/buildHearthSourcesViewModel.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthSourcesController.ts`
- `apps/hearth/tests/hearth-shell-phase-4b2-sources-controller.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_4B2_REPORT.md`

## 13. Restored unrelated changes

The build-generated `apps/nursery/public/forge-nav.json` change was restored.
No generated artifacts, screenshots, credentials, caches, temporary files, or
unrelated source changes remain.

## 14. Recommended presence boundary

Presence should be a separate controller accepting immutable Phase 2 identity
and the existing session/user inputs. It should own presence polling,
upserting, stale-response rejection, cleanup, and creator-facing presence
projection only. It should not absorb Anvil handoff, sources, conversation,
script authority, or navigation.

## 15. Branch and worktree

Phase 4B2 remains uncommitted on `codex/hearthshell-refactor`, as required.
The branch still tracks `origin/codex/hearthshell-refactor`. Nothing was
committed, pushed, merged, or deployed.
