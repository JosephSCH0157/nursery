# HearthShell Refactor Phase 1 Report

Status: complete and verified  
Scope: standalone components, pure route helpers, UI preferences, shell-only contracts, and deterministic formatting/planning helpers  
Production behavior: unchanged  
Persistence, authority, queries, migrations, RLS, UX, and production workflows: unchanged

## 1. Bundle Baseline Discrepancy

The discrepancy is explained and did not block Phase 1.

1. The current configured Hearth maximum chunk limit is `910_000` bytes.
2. It is defined by `const CHUNK_BUDGET = 910_000` in
   `apps/nursery/scripts/verify-hearth-bundle-budget.mjs`.
3. Commit `8c3b89441196af4ffa7cbfdfa5f006d52a931028`
   (`fix(verify-hearth-bundle-budget): update chunk budget from 900k to 910k`)
   changed the value from `900_000` to `910_000`.
4. The change was intentional and already committed. Its commit contains the
   threshold change and generated navigation timestamp only.
5. The measured max chunk increased from `899,992` to `902,838` immediately
   after commit `6e79073e7d8e032a2433ee757350ff40348bf841`. That commit added canonical
   thumbnail preview-path resolution and image-map authority repair behavior:
   23/7 lines in `ThumbnailV3Panel.tsx`, 15/0 lines in
   `useMediaMapGenerationActions.ts`, and 17/1 lines in `HearthShell.tsx`.
   The measured increase was `2,846` bytes.
6. Phase 0 did not change the threshold. The budget file was clean before
   Phase 1 and remains unchanged.

## 2. Material Extracted

- `OscilloscopeFill`, including canvas sizing/drawing, Web Audio setup,
  animation-frame ownership, and cleanup.
- The standalone `CopyIcon`.
- Route string normalization, UUID validation, incoming-intake detection,
  deterministic query cleanup, Forge notice routes, and Anvil links.
- Existing storage-backed UI mode, density, workpiece-tab, and development
  store preferences. No keys were added or renamed.
- Shell-only types and stable timing/display constants.
- Deterministic labels, date summaries, draft projections, Ready ordering,
  metadata tag suggestions, image-map labels, Spark display projections, chat
  intent derivation, proposal summaries, validation summaries, and planning
  session creation/fingerprinting.

No hook block was extracted from the `HearthShell` component.

## 3. New Module Ownership

| Module | Ownership |
| --- | --- |
| `routes/hearth-shell/OscilloscopeFill.tsx` | STT oscilloscope rendering and audio/canvas resource lifecycle |
| `routes/hearth-shell/CopyIcon.tsx` | Copy glyph presentation |
| `routes/hearth-shell/hearth-shell-route.ts` | Pure Hearth route/query derivation and link construction |
| `routes/hearth-shell/hearth-shell-preferences.ts` | Existing shell UI preference parsing and serialization |
| `routes/hearth-shell/hearth-shell-contracts.ts` | Narrow shell-only contracts and stable constants |
| `routes/hearth-shell/hearth-shell-formatting.ts` | Deterministic shell display, ordering, and formatting projections |
| `routes/hearth-shell/hearth-shell-planning.ts` | Deterministic chat/planning/session and validation derivation |

Canonical workspace/workpiece query parsing remains owned by
`lib/sources-repo.ts`; direct tests cover that actual owner rather than
duplicating its domain identity resolution.

## 4. Tests Added

`hearth-shell-phase-1-helpers.test.ts` covers:

- canonical workspace/workpiece query resolution through the existing owner;
- malformed identity handling;
- explicit workpiece versus Bar-Stock intake queries;
- deterministic route cleanup without browser mutation;
- Anvil link validation;
- store, mode, density, and workpiece-tab defaults and serialization;
- invalid stored preference fallback;
- formatting, labels, Ready ordering, and planning/session calculations.

`hearth-oscilloscope-fill.test.tsx` covers:

- inactive rendering;
- active rendering without an audio source;
- visualization startup with a supplied source;
- canvas sampling and animation scheduling;
- same-prop rerender without another context or loop;
- cleanup when deactivated;
- deterministic cleanup when unmounted while active.

Focused Phase 1 result: `9/9` passing.

The Phase 0 characterization selection also passes after extraction:
`44/44` current runner subtests across the accepted Phase 0 files.

## 5. Hook-Order Preservation

The main component hook/custom-hook sequence was parsed from the committed
pre-Phase-1 file and the final extracted file with the TypeScript AST.

- Before sequence length: `347`
- After sequence length: `347`
- Before SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- After SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Result: identical

The accepted behavior characterization tests were run before and after the
move. No HearthShell source-text assertion was reintroduced.

## 6. HearthShell Before/After

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Lines | 8,160 | 7,089 | -1,071 |
| Import declarations | 148 | 153 | +5 |
| Built-in hook call-site metric | 292 | 285 | -7 |
| Main component hook/custom-hook sequence | 347 | 347 | 0 |

Built-in hook call sites moved out of the file with `OscilloscopeFill`:
one `useState`, one `useEffect`, one `useLayoutEffect`, and four `useRef`
calls. The hook sequence inside `HearthShell` did not change.

## 7. Bundle Before/After

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Hearth JS chunks | 8 | 8 | 0 |
| Total bytes | 1,650,103 | 1,650,141 | +38 |
| Maximum chunk | 902,838 | 902,876 | +38 |
| Maximum limit | 910,000 | 910,000 | 0 |
| Total limit | 1,800,000 | 1,800,000 | 0 |

The small byte increase is module-boundary/minification overhead from the
literal extraction. The budget passes and neither threshold changed.

## 8. Validation Results

| Gate | Result |
| --- | --- |
| Focused Phase 1 tests | PASS: 9/9 |
| Phase 0 characterization selection | PASS: 44/44 current runner subtests |
| `pnpm --filter @nursery/hearth typecheck` | PASS |
| `pnpm --filter @nursery/hearth test` | PASS after cross-platform fixture normalization |
| `pnpm --filter @forge/tongs test:commit-api` | PASS: 135/135 |
| `pnpm --filter nursery build` | PASS |
| `pnpm --filter nursery verify:hearth-bundle` | PASS |
| `git diff --check` | PASS |

The previously documented Windows-only fixture failure in
`hearth-format-only.test.ts` was resolved by normalizing the fixture's CRLF
line endings before applying LF-based mutation cases. Production behavior was
not changed.

Post-recovery verification also found and corrected missing React runtime
imports in the two extracted TSX components. The focused Phase 1 suite now
passes from a clean process.

## 9. Phase 1 Files Changed

Modified:

- `apps/hearth/src/routes/HearthShell.tsx`

Added:

- `apps/hearth/src/routes/hearth-shell/CopyIcon.tsx`
- `apps/hearth/src/routes/hearth-shell/OscilloscopeFill.tsx`
- `apps/hearth/src/routes/hearth-shell/hearth-shell-contracts.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-shell-formatting.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-shell-planning.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-shell-preferences.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-shell-route.ts`
- `apps/hearth/tests/hearth-oscilloscope-fill.test.tsx`
- `apps/hearth/tests/hearth-shell-phase-1-helpers.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_1_REPORT.md`

No repository, Tongs, visual-production, image, thumbnail, Visual Plan,
B-roll, release, migration, or RLS file changed in Phase 1.

## 10. Existing Unrelated Dirty Files

The accepted Phase 0 test/report changes remain in the worktree and were
preserved.

`apps/nursery/public/forge-nav.json` was dirty before Phase 1. The required
build regenerated its timestamp; it was restored to the exact pre-build Phase
1 content and SHA-256:

`1ABAADCC17BBF6685C6535DB32E6907E2F6E8D9E1CD67ACACD41220F0A290D69`

## 11. Recommended Phase 2 Boundary

Extract identity and navigation only:

1. Route-derived workspace/workpiece identity and identity refs.
2. Mode, focus tab, workpiece tab, mobile overlay, and guarded transitions.
3. Workspace/workpiece reset boundaries and route cleanup application.
4. Responsive shell preference state.

Do not include canonical data loading, repositories, editorial state,
production workflows, or persistence semantics. Preserve the current
operation-authority guards and require identity-switch and hook-order
characterization before moving any cohesive hook block.

## 12. Current Git Status

The worktree contains the accepted, uncommitted Phase 0 changes; the Phase 1
HearthShell extraction and tests; the Phase 0 and Phase 1 reports; and the
pre-existing `forge-nav.json` timestamp change.

Nothing has been committed, pushed, staged, or deployed.
