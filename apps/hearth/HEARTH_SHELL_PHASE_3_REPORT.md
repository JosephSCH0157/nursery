# HearthShell Refactor Phase 3 Report

Status: implemented, verified, and intentionally uncommitted for review

Baseline:
`acd69f4fa7e8cc97cae0b538a0a9f763e49ba0ea`

## 1. Collection responsibilities extracted

The Phase 3 boundary now owns:

- Spark collection state, discovery composition, selection projection, and
  deterministic Spark/workpiece transition dependencies;
- Episode/workpiece summary state, canonical loading, filtering, sorting,
  archive visibility, active-row derivation, and one-row-per-workpiece
  projection;
- Ready collection state, scoped loading, visible/hidden projection, counts,
  labels, ordering, category changes, remove/restore/reorder commands, and
  send-back-to-edit composition;
- Series projection from the existing Ready label;
- archive/restore command composition;
- desktop and mobile collection view-model inputs.

No editorial or production hook moved.

## 2. Controller and supporting contracts

- `useHearthCollectionController.ts` is the collection orchestration owner.
  Its hook fragments stay at the original shell hook positions so effect and
  hook timing remain unchanged.
- `hearth-collection-contracts.ts` defines explicit `state`, `commands`, and
  `status` sections. Raw setters appear only on local filter fields in that
  public contract.
- `buildHearthCollectionViewModel.ts` is a pure projection builder with no
  hooks, storage, network access, Tongs calls, or mutation.

The shell-facing hook fragments retain internal state bindings only to
compose the pre-existing leaf hooks without reimplementing them or changing
their order.

## 3. Repository imports removed from HearthShell

`HearthShell.tsx` no longer imports runtime collection functions from:

- `hearth-workpieces`;
- `hearth-ready-scripts`;
- `hearth-workpiece`;
- the Hearth Bar-Stock collection repository.

Type-only imports remain where required. Collection runtime dependencies are
owned behind `useHearthCollectionController.ts`.

## 4. One workpiece / one row proof

The pure projection begins with canonical workpiece summaries and calls the
existing `selectWorkpieceNavItems` projection. Drafts, revisions, Ready
entries, and linked Sparks enrich a canonical workpiece row; they cannot
create rows.

Phase 3 characterization proves that multiple drafts/revisions and
production-like descendant records still produce exactly one row with the
same durable workpiece ID.

## 5. Workspace switch and stale-response proof

- Ready projections are shown only when their loaded workspace ID exactly
  matches the normalized active workspace.
- Workspace reset continues to clear Spark, Episode, and Ready projections at
  its original lifecycle position.
- Episode loads now begin an operation-authority token on the
  `collection:workpieces` lane and commit success, failure, and loading
  completion only while that token remains current.
- Existing Ready request sequencing and Spark effect cancellation remain in
  place.

Thus an in-flight workspace A response cannot overwrite workspace B.

## 6. Ready reversibility proof

Existing Tongs-backed hide/restore, reorder, remove, and send-back behavior is
composed behind the collection boundary. Characterization proves hide and
restore are inverse collection projections and preserve the workpiece ID.
Ready entries contain no approval, scheduling, recording, locking, or
publication authority.

The existing creation of a Ready entry remains attached to the approval
handoff. It was not moved because Phase 3 expressly forbids moving or changing
approval behavior.

## 7. Archive/restore identity proof

Archive changes visibility only. Restore returns the same canonical
workpiece ID. Existing downstream data is neither deleted nor reconstructed.
The confidence suite continues to exercise the Tongs-backed archive/restore
commands.

## 8. Hook metrics

| Metric | Phase 2 | Phase 3 | Change |
| --- | ---: | ---: | ---: |
| Direct shell hook/custom-hook sequence | 332 | 304 | -28 |
| Semantically expanded sequence | 347 | 347 | 0 |

The Phase 3 expansion maps the controller state fragments to their original
23 `useState` calls, collection projections to their original 10 `useMemo`
calls, the workpiece loader to its original `useCallback`, and collection
leaf-hook façades to the same existing leaf hooks.

## 9. Expanded hook-sequence hash

- Before SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- After SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Expanded length: `347` before and after
- Result: identical

## 10. HearthShell metrics

| Metric | Phase 2 | Phase 3 | Change |
| --- | ---: | ---: | ---: |
| Lines | 7,024 | 6,993 | -31 |
| Import declarations | 154 | 149 | -5 |

## 11. Bundle

| Metric | Phase 2 | Phase 3 | Change |
| --- | ---: | ---: | ---: |
| Hearth JS chunks | 8 | 8 | 0 |
| Total bytes | 1,653,176 | 1,657,197 | +4,021 |
| Largest chunk | 905,911 | 909,932 | +4,021 |
| Largest limit | 910,000 | 910,000 | unchanged |
| Total limit | 1,800,000 | 1,800,000 | unchanged |

Both configured limits pass. No threshold changed and no collection module
was made into a new eager entry boundary.

## 12. Verification

| Gate | Result |
| --- | --- |
| Focused Phase 3 tests | PASS: 12/12 |
| Phase 2, authority, and mode characterization | PASS: 14/14 |
| `pnpm --filter @nursery/hearth typecheck` | PASS |
| `pnpm --filter @nursery/hearth test` | PASS: 87 files |
| `pnpm --filter @forge/tongs test:commit-api` | PASS: 135/135 |
| `pnpm --filter nursery build` | PASS |
| `pnpm --filter nursery verify:hearth-bundle` | PASS |
| `git diff --check` | PASS |

## 13. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/routes/hearth-shell/useHearthCollectionController.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-collection-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/buildHearthCollectionViewModel.ts`
- `apps/hearth/tests/hearth-shell-phase-3-collection-controller.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_3_REPORT.md`

## 14. Existing unrelated changes

There were no unrelated working-tree changes at the Phase 3 baseline.
Generated `apps/nursery/public/forge-nav.json` timestamp churn from the build
was restored and is not part of this slice.

## 15. Recommended Phase 4 boundary

Extract editorial orchestration only:

- draft hydration and active-draft selection;
- draft buffer, autosave, and conflict lifecycle;
- revisions and revision restoration;
- planning-session and editorial chat/proposal state;
- approval state only as a separately reviewed editorial contract.

Keep collection identity inputs immutable, and keep production assets,
Visual Plan, image map, B-roll, thumbnails, and release preparation out of
Phase 4.

## 16. Branch and worktree

- Branch: `codex/hearthshell-refactor`
- Branch relation: one committed Phase 2 change ahead of origin
- Phase 3: uncommitted, as requested
- Merge, push, and deploy: not performed
