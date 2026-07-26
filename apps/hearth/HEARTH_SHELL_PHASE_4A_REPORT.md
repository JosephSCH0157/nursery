# HearthShell Refactor Phase 4A Report

Status: implemented, verified, and intentionally uncommitted for review

Baseline branch: `codex/hearthshell-refactor`
Baseline commit: `7042ce5bad9030601703d5835f4a82aca51e78b1`

The baseline worktree was clean.

## 1. Script responsibilities extracted

The Phase 4A controller boundary now owns the route-level composition for:

- canonical draft buffers and active draft selection state;
- draft snapshots, dirty state, and save/conflict status;
- the existing autosave hook and unchanged debounce/revision policy;
- revision loading, selection, creation, comparison, restoration, and notes;
- canonical approval state, identity reset, guarded canonical reload, approval
  persistence, and approval commands;
- deterministic formatting and the existing AI-assisted repair command;
- Script and History surface contracts.

Chat, attachments, STT, compose, sources, presence, Anvil handoff,
collections, Ready, and every production surface remain outside this
controller.

## 2. Controller and internal composition

`useHearthScriptController.ts` is the script-workspace orchestration boundary.
Like the accepted Phase 3 controller, its fragments remain at the original
shell hook positions so semantic hook and effect ordering is unchanged.

The public `HearthScriptController` contract has explicit `state`, `commands`,
`status`, and `surfaces` sections. Domain transitions are commands; the public
contract exposes no raw domain setter. Script and History rendering consume
the controller surface/command contract.

Existing leaf hooks are composed rather than copied:

- `useHearthAutosave`
- `useScriptWorkspace`
- `useHearthDraftHydrationActions`
- `useHearthDraftPersistenceActions`
- `useHearthDraftController`
- `useHearthApprovalPersistenceActions`
- `useApprovalFlow`
- `useHearthScriptRepairActions`
- `useScriptWorkspaceReadModel`

## 3. Repository and hook imports removed from HearthShell

`HearthShell.tsx` no longer imports the script leaf hooks listed above
directly. It also no longer imports revision-save acknowledgement checks or
autosave constants/helpers used only by controller composition.

The controller owns canonical revision reads/writes through the existing
injected Hearth store. No new repository, persistence path, query, RPC, or
browser authority was introduced.

## 4. Draft hydration and stale responses

The existing hydration leaf hook remains the sole implementation of canonical
draft hydration and keeps Tongs-backed drafts and primary-script reads
unchanged. Missing draft, initial loading, failure, and loaded-empty state are
not collapsed into one another.

The Phase 2 operation authority remains immutable input. Focus/open lifecycle
guards remain in their original positions, while canonical approval loading
begins an authority operation and rejects completions after a workspace,
workpiece, or draft identity change. Focused coverage proves a workpiece A
completion cannot update workpiece B.

## 5. Autosave and conflict behavior

The controller composes the existing autosave hook with the same:

- delay, minimum gap, and revision gap constants;
- snapshot comparison and dirty derivation;
- AI reason mapping;
- in-flight queuing;
- quiet failure and retry behavior;
- canonical `persistDraft` path.

Expected-revision conflicts, local-body preservation, reload-latest, and
copy-local-text commands still use the existing draft persistence/controller
implementations. No autosave implementation was duplicated.

## 6. Revision and approval authority

Revision loading remains scoped to the normalized active workpiece and active
draft. An absent draft triggers no revision read. Revision snapshots remain
canonical and immutable under the existing store contract.

Approval still:

- reads canonical Tongs revisions;
- treats zero canonical approvals as explicit absence;
- never promotes browser recovery evidence to authority;
- commits draft, published script, and immutable approval revision in the
  existing order;
- uses the existing operation-authority guard and replay/conflict behavior;
- remains distinct from Ready, scheduling, recording, and publication.

The full approval-authority suite remains passing.

## 7. Downstream invalidation boundary

The approval command continues to emit the same approved-script version/state.
Existing production orchestration observes that immutable authority change at
the shell boundary. The script controller does not mutate Visual Plan, image
map, thumbnail, B-roll, reference-clip, metadata, or release state.

## 8. Formatting and AI-credit behavior

Deterministic formatting still uses the existing normalization, repair, and
format-only preservation contracts and the ordinary canonical draft save
path. It makes no AI request and consumes no AI credits.

AI repair still uses the existing confirmation, AI lane, token-balance,
request, operation guard, proposal application, autosave, and credit refresh
behavior. General chat/proposal orchestration was not moved.

## 9. Hook metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Direct HearthShell hook/custom-hook sequence | 304 | 283 | -21 |
| Semantically expanded sequence | 347 | 347 | 0 |

The semantic expansion maps controller fragments back to the exact original
state, ref, memo, callback, effect, and leaf-hook calls at each original
position. `useHearthScriptController` itself is a typed assembly boundary and
adds no runtime hook.

## 10. Expanded hook hash

- before:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- after:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- expanded length: 347 before and after
- result: identical

## 11. HearthShell metrics

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Lines | 6,993 | 6,982 | -11 |
| Import declarations | 149 | 140 | -9 |

## 12. Bundle

No threshold changed and all six Phase 3.5 optional production chunks remain
lazy.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Verifier-counted Hearth JS chunks | 8 | 8 | 0 |
| Verifier total | 1,497,549 | 1,501,198 | +3,649 |
| Largest Hearth chunk | 750,286 | 753,935 | +3,649 |

The largest chunk remains 156,065 bytes below the unchanged 910,000-byte
limit. The total remains 298,802 bytes below the unchanged 1,800,000-byte
limit.

## 13. Test and build results

- focused Phase 4A tests: 4/4 passed;
- focused Phase 0–3.5 characterization: 39/39 passed including Phase 4A;
- Hearth typecheck: passed;
- Hearth tests: passed, 89 files;
- Tongs commit API: passed, 135/135;
- Nursery production build: passed;
- Hearth bundle verification: passed;
- `git diff --check`: passed.

Existing suites cover hydration, autosave, expected revision conflicts,
approval absence/unavailability, immutable approvals, replay/no-change,
format-only preservation, AI credit behavior, navigation parity, operation
authority, and production lazy boundaries.

## 14. Files changed

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/routes/hearth-shell/hearth-script-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthScriptController.ts`
- `apps/hearth/tests/hearth-shell-phase-4a-script-controller.test.tsx`
- `apps/hearth/HEARTH_SHELL_PHASE_4A_REPORT.md`

## 15. Unrelated and generated changes

The Phase 4A baseline contained no unrelated changes. Build-generated
`apps/nursery/public/forge-nav.json` timestamp churn was restored. No generated
bundle, synchronized Anvil output, cache, screenshot, credential, schema,
migration, RPC, or RLS file is part of this slice.

## 16. Recommended Phase 4B boundary

Phase 4B should extract the remaining editorial collaboration controller:
chat history/runtime, attachments, STT, compose/proposal orchestration,
research/sources, and presence. It should consume the immutable script
controller contract and emit explicit proposals/commands rather than gaining
script persistence or approval authority.

Production and Anvil handoff should remain outside Phase 4B.

## 17. Branch and worktree

- branch: `codex/hearthshell-refactor`
- HEAD: `7042ce5bad9030601703d5835f4a82aca51e78b1`
- worktree: intentionally dirty with only the uncommitted Phase 4A files
  listed above
- commit, push, merge, and deploy: not performed
