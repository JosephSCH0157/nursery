# HearthShell Refactor Phase 4B1 Report

## Baseline

- Branch: `codex/hearthshell-refactor`
- Phase 4A checkpoint: `ca57deb5`
- Worktree before Phase 4B1: clean
- HearthShell: 6,982 lines, 140 import declarations, 283 direct hooks
- Semantically expanded sequence: 347 hooks
- Expanded SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Hearth bundle: 8 verifier-counted JS chunks, 1,501,198 bytes total,
  753,935-byte largest chunk

## 1. Responsibilities extracted

Phase 4B1 introduces one typed conversation contract covering messages,
compose state, attachments, transcription, pending proposals, AI runtime,
creator commands, status, and the chat surface. Existing chat history,
submission, STT, proposal, and surface hooks are composed through the
conversation-controller module. Attachment repository access is routed through
the same boundary.

Research sources, presence, Anvil handoff, collections, Ready, navigation,
identity, revision/approval authority, production surfaces, and release
preparation remain outside this slice.

## 2. Controller and internal composition

`hearth-conversation-contracts.ts` defines the external state/command/status/
surface contract. `useHearthConversationController.ts` is the composition
boundary for the existing chat leaf hooks, attachment operations, grouped
attachment state, grouped AI-runtime state, and final typed assembly.

The leaf hooks retain their existing implementations and timing. The assembly
function adds no runtime hook, so the fragments can remain at their original
hook positions while HearthShell hands the view one controller surface.

## 3. HearthShell dependency changes

HearthShell no longer imports the attachment repository or
`useChatWorkspace` leaf hooks directly. It imports their narrow
conversation-controller entry points instead. The three attachment state hooks
are represented by one fragment and the two AI-runtime state hooks by one
fragment.

## 4. Hydration and stale-response proof

Chat hydration remains in the existing history hook with the original history
key, draft identity, hydration sequence ref, pending/skip keys, cleanup, and
dependency order. The Phase 2 operation authority and existing identity reset
effects remain unchanged. Therefore a completion for identity A still fails
the same sequence/authority checks after identity B becomes active.

Empty history and failure remain distinct: an empty message list does not
create a chat error, while recovery/load failure continues through
`chatError`.

## 5. Attachment and STT lifecycle proof

Attachment listing, upload, extracted-text update, limits, operation keys, and
stale-operation checks are unchanged; only their import boundary changed.
Attachment state preserves independent data, loading, and error fields.

STT continues through the existing leaf hook with the same recognition,
recorder, stream, timer, abort-controller, episode-identity, and discard refs.
Stop, identity switch, and unmount therefore execute the existing cleanup
paths in the same order.

## 6. AI confirmation and credits

The existing AI request path, lane resolution, explicit confirmation
preferences, depleted-credit behavior, balance refresh, and disabled-AI
behavior are unchanged. The controller exposes the current confirmation result
without adding a generic automation path. Deterministic/non-AI operations
still bypass AI requests and consume no credits.

## 7. Proposal authority

Pending proposals remain separate from editable and canonical script state.
Review, selection, edit/reset, rejection, and application continue through the
existing proposal hook. Attachment and STT output do not silently write script
content. Chat history is not script authority.

## 8. Phase 4A interaction

Proposal application invokes the existing reviewed proposal command. Its
script mutation continues through the Phase 4A-approved transition and
autosave path. Phase 4B1 neither duplicates script state nor reconstructs
draft, revision, approval, persistence, or recovery authority.

## 9. Hook metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Direct HearthShell hook/custom-hook sequence | 283 | 281 | -2 |
| Semantically expanded sequence | 347 | 347 | 0 |

Semantic expansion maps the grouped state fragments and controller aliases
back to the exact original state and leaf-hook calls. The final assembly
boundary has no hook of its own.

## 10. Expanded hook hash

- Before:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- After:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Expanded length: 347 before and after
- Result: identical

## 11. HearthShell metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Lines | 6,982 | 7,059 | +77 |
| Import declarations | 140 | 139 | -1 |

The temporary line increase is the explicit typed controller assembly. The
behavioral blocks remain in their original positions to preserve hook order
and timing; later accepted slices can reduce shell assembly without combining
unrelated authority domains.

## 12. Bundle

No budget changed and the six Phase 3.5 optional production surfaces remain
lazy.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Verifier-counted Hearth JS chunks | 8 | 8 | 0 |
| Verifier total | 1,501,198 | 1,502,314 | +1,116 |
| Largest Hearth chunk | 753,935 | 755,051 | +1,116 |

## 13. Validation

- Focused Phase 4B1 plus existing chat/attachment/STT/authority tests: pass
  (34 tests)
- `pnpm --filter @nursery/hearth typecheck`: pass
- `pnpm --filter @nursery/hearth test`: pass (90 test files)
- `pnpm --filter @forge/tongs test:commit-api`: pass (135/135)
- `pnpm --filter nursery build`: pass
- `pnpm --filter nursery verify:hearth-bundle`: pass
- `git diff --check`: pass

The focused Phase 4B1 tests characterize grouped attachment status, AI-runtime
lane/balance preservation, and proposal non-canonicity until application.
Existing behavior suites retain coverage of hydration, identity switching,
stale completions, sending/retry, attachment constraints, STT cleanup,
confirmation preferences, proposal application/rejection, AI-disabled use,
mobile/desktop surfaces, and lazy boundaries.

## 14. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/routes/hearth-shell/hearth-conversation-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthConversationController.ts`
- `apps/hearth/tests/hearth-shell-phase-4b1-conversation-controller.test.tsx`
- `apps/hearth/HEARTH_SHELL_PHASE_4B1_REPORT.md`

## 15. Restored unrelated/generated changes

The build-generated `apps/nursery/public/forge-nav.json` change was restored.
No generated artifacts, caches, credentials, screenshots, temporary files, or
unrelated source changes remain in the worktree.

## 16. Recommended Phase 4B2 boundary

Keep Phase 4B2 narrow: sources/research orchestration only. Presence and Anvil
handoff should remain separate later slices because their identity, lifecycle,
and authority boundaries differ from research and from the creator
conversation loop.

## 17. Branch and worktree

Phase 4B1 remains uncommitted on `codex/hearthshell-refactor`, as requested.
The branch tracks `origin/codex/hearthshell-refactor`; Phase 4A is pushed and
Phase 4B1 has not been pushed, merged, or deployed.
