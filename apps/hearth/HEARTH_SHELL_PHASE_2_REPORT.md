# HearthShell Refactor Phase 2 Report

Status: complete and verified
Scope: route identity, navigation state, responsive preferences, reset boundaries, and stale async identity protection
Production behavior: unchanged
Persistence, authority, queries, migrations, RLS, lifecycle, and UX: unchanged

## Reset Matrix

The reset matrix was formalized before extraction in
`HEARTH_SHELL_PHASE_2_RESET_MATRIX.md` and encoded in
`hearth-shell-reset-matrix.ts`.

The locked ownership rule is:

> Identity tells domain owners what scope to load. It does not load,
> reconstruct, clear, or persist their state.

Workspace, workpiece, draft-revision, and approved-script transitions now
have explicit survive, clear, reload, and revalidate dispositions. Existing
collection, editorial, and production lifecycle hooks remain responsible for
their own resets.

## Extracted Ownership

### `useHearthShellIdentity.ts`

- initial route workspace/workpiece resolution;
- Bar-Stock intake route exclusion of an initial workpiece;
- active workspace/workpiece setters;
- active workpiece ref and ref synchronization;
- global workspace identity event synchronization;
- operation-authority composition for stale async rejection;
- deterministic normalized identity reset keys.

The module uses the existing `sources-repo` identity parser because that
module remains the canonical owner of workspace/workpiece query resolution.
It imports no canonical data loader or persistence repository.

### `useHearthShellNavigation.ts`

- mode and focus-tab state;
- workpiece-tab state and existing UI-preference lifecycle;
- mobile-overlay state, responsive opening, and closing;
- density preference hydration and serialization;
- mode restoration and serialization;
- desktop and mobile navigation commands.

Guarded workpiece-tab transitions remain composed through the existing
`useHearthWorkpieceTabLifecycle`. Route cleanup and focus opening remain
composed through the existing `useHearthFocusOpenActions`. Neither behavior
was duplicated.

## Reset Ownership Preserved

- Workspace identity change still signals the existing
  `useHearthWorkspaceResetLifecycle`.
- Collection state is cleared/reloaded by collection lifecycle code.
- Draft, revision, planning, chat, attachment, presence, and approval state
  remain editorial-owned.
- Episode package and visual workspace state remain production-owned.
- Approved-script changes continue to revalidate downstream production state
  through existing contracts.
- No Phase 2 hook writes canonical state.

## Hook Order and Timing

Every extracted hook was called at the original hook block's location.
Expanding each new custom hook back to its built-in/custom hook sequence
produces an identical sequence to the Phase 1 shell:

- before: `347`;
- after direct shell calls: `332`;
- after semantic expansion: `347`;
- before SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`;
- after SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`;
- result: identical.

Effect dependency timing was preserved at each extraction boundary.

## Characterization

`hearth-shell-phase-2-identity-navigation.test.ts` proves:

- identity owns identity rows only;
- canonical UUID normalization for workspace/workpiece reset keys;
- workspace, workpiece, draft, draft-version, and revision changes reject
  stale async tokens;
- identity/navigation modules import no canonical loaders or repositories;
- existing UI-preference access remains the only storage dependency.

Existing mode characterization verifies:

- mobile/tablet/desktop layout boundaries;
- exactly one desktop owning mode;
- mobile Spark intake bootstrap precedence.

The isolated mode test exposed a missing React runtime import in
`HearthMainContentSwitch.tsx`. The import was added without changing rendered
behavior.

## HearthShell Reduction

| Metric | Phase 1 | Phase 2 | Change |
| --- | ---: | ---: | ---: |
| Lines | 7,089 | 7,024 | -65 |
| Direct hook/custom-hook sequence | 347 | 332 | -15 |
| Semantically expanded hook sequence | 347 | 347 | 0 |
| Direct `useState` call sites | 78+ extracted state | 78 | navigation/identity state moved |
| Direct `useEffect` call sites | 55-era baseline | 43 | lifecycle effects moved |

## Bundle

| Metric | Phase 1 | Phase 2 | Change |
| --- | ---: | ---: | ---: |
| Hearth JS chunks | 8 | 8 | 0 |
| Total bytes | 1,650,141 | 1,653,176 | +3,035 |
| Maximum chunk | 902,876 | 905,911 | +3,035 |
| Maximum limit | 910,000 | 910,000 | 0 |
| Total limit | 1,800,000 | 1,800,000 | 0 |

The increase is module-boundary/minification overhead. Both configured
budgets pass and no threshold changed.

## Verification

| Gate | Result |
| --- | --- |
| Focused identity/navigation characterization | PASS: 20/20 with Phase 1 and authority coverage |
| `pnpm --filter @nursery/hearth typecheck` | PASS |
| `pnpm --filter @nursery/hearth test` | PASS: 86 files |
| `pnpm --filter @forge/tongs test:commit-api` | PASS: 135/135 |
| `pnpm --filter nursery build` | PASS |
| `pnpm --filter nursery verify:hearth-bundle` | PASS |
| `git diff --check` | PASS |

## Files

Added:

- `apps/hearth/HEARTH_SHELL_PHASE_2_RESET_MATRIX.md`
- `apps/hearth/HEARTH_SHELL_PHASE_2_REPORT.md`
- `apps/hearth/src/routes/hearth-shell/hearth-shell-reset-matrix.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthShellIdentity.ts`
- `apps/hearth/src/routes/hearth-shell/useHearthShellNavigation.ts`
- `apps/hearth/tests/hearth-shell-phase-2-identity-navigation.test.ts`

Modified:

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/views/modes/HearthMainContentSwitch.tsx`

No database, migration, RLS, Tongs, repository, query, or canonical
persistence file changed.

## Recommended Phase 3 Boundary

Move only collection and queue orchestration:

1. Spark discovery and forge intake.
2. Episode/workpiece summaries, filtering, archive, and restore.
3. Ready loading, ordering, labels, removal, restore, and send-back-to-edit.
4. Series and rail projections.

Keep draft rows, revisions, proposals, presence, and production artifacts out
of the navigation collection contract.
