# HearthShell Refactor Phase 4B3 Report

## Baseline

- Branch: `codex/hearthshell-refactor`
- Phase 4B2 checkpoint: `40772e5b1999076327d64b7ccae0d4bf085ee99e`
- Initial worktree: clean
- HearthShell: 7,050 lines, 137 imports, 280 direct hooks
- Expanded sequence: 347 hooks
- Expanded SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 Hearth JS chunks, 1,504,208 bytes total, 756,945-byte
  largest chunk

## 1. Presence responsibilities extracted

Phase 4B3 moves presence state, active-identity loading, heartbeat publication,
polling, cleanup, retry, degraded-state projection, participant filtering,
current-user treatment, activity mode, badges, and indicator classes behind
one typed presence controller.

## 2. Controller composition

`useHearthPresenceController.ts` contains narrow state, projection, lifecycle,
badge, and pure assembly boundaries. The existing presence repository remains
the sole network implementation. `buildHearthPresenceViewModel.ts` contains
pure load-state and order-preserving projection. The public contract is in
`hearth-presence-contracts.ts`.

The state, memo, effect, and callback fragments remain at their original
HearthShell positions so hook timing and order are preserved.

## 3. HearthShell dependency changes

HearthShell no longer imports or calls the presence repository directly. It
consumes presence fragments and one assembled controller contract. Episode
indicators receive badge/class functions through the controller surface.

The workspace-session lifecycle now requests the explicit `clearPresence`
transition instead of receiving the raw participant setter.

## 4. Polling and heartbeat proof

The existing immediate publish/load followed by
`PRESENCE_HEARTBEAT_MS` interval remains unchanged. Each cycle publishes local
presence before loading participants, matching the previous order. Identity
change and unmount set the cancellation flag, remove the explicit retry
listener, and clear the interval in the same effect cleanup.

Repository response normalization and any server-side participant expiry
remain unchanged. Participant order from the repository is preserved.

## 5. Identity and stale-operation proof

The lifecycle receives normalized Phase 2 workspace/workpiece inputs and
captures them for one effect generation. It now combines the existing
cancellation check with the Phase 2 operation-authority token before every
state update, user-ID acceptance, and follow-up load. A completion for A cannot
update B. A retry is handled by the currently mounted identity-scoped effect.

Every publish uses the workspace/workpiece values captured by that lifecycle;
it cannot be redirected to a subsequently active identity.

## 6. Ephemeral authority proof

Presence remains advisory operational awareness. The controller contains no
content write, identity resolution, locking, ownership lease, conflict
resolution, approval, Ready, scheduling, recording, publication, or durable
history command. Editing/viewing signals affect display only and never block
editing.

Script, conversation, sources, collections, and production authority are
unchanged. Anvil handoff remains in HearthShell.

## 7. Hook metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Direct HearthShell hook/custom-hook sequence | 280 | 276 | -4 |
| Semantically expanded hook sequence | 347 | 347 | 0 |

Semantic expansion maps the presence state fragment to the original two state
hooks, the projection to three memos, the lifecycle to one effect, and the
badges to two callbacks.

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
| Lines | 7,050 | 7,011 | -39 |
| Import declarations | 137 | 137 | 0 |

The direct repository import was replaced by the controller-fragment import.

## 10. Bundle

No budget changed. All six Phase 3.5 optional production surfaces remain lazy.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Verifier-counted Hearth JS chunks | 8 | 8 | 0 |
| Verifier total | 1,504,208 | 1,507,453 | +3,245 |
| Largest Hearth chunk | 756,945 | 760,190 | +3,245 |

The eager increase is the typed controller, explicit status projection,
operation-authority checks, and retry event wiring. No optional production
module entered the eager graph.

## 11. Tests and build

- Focused Phase 4B3 and degradation tests: pass (17/17)
- `pnpm --filter @nursery/hearth typecheck`: pass
- `pnpm --filter @nursery/hearth test`: pass (92 test files)
- `pnpm --filter @forge/tongs test:commit-api`: pass (135/135)
- `pnpm --filter nursery build`: pass
- `pnpm --filter nursery verify:hearth-bundle`: pass
- `git diff --check`: pass

## 12. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/hooks/useHearthWorkspaceSessionLifecycle.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-presence-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/buildHearthPresenceViewModel.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthPresenceController.ts`
- `apps/hearth/tests/hearth-shell-phase-4b3-presence-controller.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_4B3_REPORT.md`

## 13. Restored unrelated changes

The build-generated `apps/nursery/public/forge-nav.json` change was restored.
No generated artifacts, screenshots, credentials, caches, temporary files, or
unrelated source changes remain.

## 14. Recommended Anvil-handoff boundary

Anvil handoff should be a separate controller that accepts immutable identity,
the Phase 4A approved/current script projection, and existing format/read-mode
signals. It should own handoff eligibility, URL construction, validation
presentation, and the explicit open command only. It must not absorb presence,
navigation, approval, autosave, recording state, or Anvil runtime ownership.

## 15. Branch and worktree

Phase 4B3 remains uncommitted on `codex/hearthshell-refactor`, as required.
The branch tracks `origin/codex/hearthshell-refactor`. Nothing was committed,
pushed, merged, or deployed.
