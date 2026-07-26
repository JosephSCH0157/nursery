# HearthShell Refactor Phase 0 Report

Status: complete, pending review  
Date: 2026-07-25  
Scope: tests and documentation only

## Constraints Observed

- No production code was extracted or moved.
- `HearthShell` runtime behavior was not changed.
- UX, persistence, authority, queries, migrations, RLS, and database schema were not changed.
- No commit, push, or deployment was performed.
- The Hearth bundle thresholds remain unchanged:
  - total budget: `1,800,000` bytes;
  - maximum chunk budget: `910,000` bytes.

## Structural Baseline

Baseline file: `apps/hearth/src/routes/HearthShell.tsx`

| Metric | Baseline |
| --- | ---: |
| Lines | 8,160 |
| Import declarations | 148 |
| `useState` call sites | 87 |
| `useEffect` call sites | 55 |
| `useLayoutEffect` call sites | 1 |
| `useMemo` call sites | 71 |
| `useCallback` call sites | 49 |
| `useRef` call sites | 29 |
| Total listed React hook call sites | 292 |

Method:

- line count: PowerShell `Get-Content`;
- imports: lines beginning with `import`;
- hook counts: whole-word occurrences minus each imported hook name.

These are characterization metrics, not a gate that permits hiding calls or combining unrelated state.

## HearthShell Source-Coupled Tests Found

Seven tests asserted directly against `HearthShell.tsx` source text:

1. `hearth-approval-authority.test.ts`
2. `hearth-dependency-degradation.test.ts`
3. `hearth-expansion-gate.test.ts`
4. `hearth-format-only-wiring.test.ts`
5. `hearth-reference-clips-language.test.ts`
6. `hearth-spark-entry-smoke.test.ts`
7. `hearth-stabilization-blockers.test.tsx`

After Phase 0, no test or Hearth test script reads or asserts against `HearthShell.tsx`.

## Source Assertion Replacements

| Prior test | Replacement boundary |
| --- | --- |
| Approval reload wiring in `hearth-approval-authority.test.ts` | Behavior assertions against `resolveCanonicalScriptApproval`, `LocalHearthStore`, `TongsHearthStore`, and `commitCanonicalScriptApproval`. |
| Presence strings in `hearth-dependency-degradation.test.ts` | Dependency API behavior plus server-rendered `HearthEpisodesMode` presentation-boundary assertions. Initial-loader and Spark assertions now target their owning hooks only. |
| `window as any` grep in `hearth-expansion-gate.test.ts` | Removed as redundant with the TypeScript build gate; the remaining assertions target the chat owner, standalone lazy boundary, and authority document. |
| Format-only proposal wiring in `hearth-format-only-wiring.test.ts` | Behavior assertions against `buildHearthFormatOnlyPreview`, `evaluateHearthFormatOnlyPreservation`, and `confirmHearthUserEditorialTransition`; UI language remains checked in `ChatSurface`. |
| Reference Clip wording in `hearth-reference-clips-language.test.ts` | Assertions remain against the owning Reference Clip, B-roll, and media-map components only. |
| Spark-entry route implementation in `hearth-spark-entry-smoke.test.ts` | Intake defaults assert against `useHearthIntakeLifecycle`; route-bootstrap precedence is verified through rendered `HearthMainContentSwitch` behavior. |
| Canonical-approval source grep in `hearth-stabilization-blockers.test.tsx` | Direct absent-canonical-approval behavior via `resolveCanonicalScriptApproval`; existing recovery-only storage characterization remains. |

## Characterization Coverage

| Required behavior | Coverage |
| --- | --- |
| Workspace and workpiece switching | Added explicit workspace/workpiece scope changes in `hearth-operation-authority.test.ts`; existing source-scope and mounted stale-result tests remain. |
| Stale async completion rejection | Added commit rejection after workspace/workpiece changes; existing A-to-B late AI completion test remains. |
| Draft hydration and autosave | Added `hearth-autosave-characterization.test.tsx` covering canonical body hydration and attributable queued AI autosave. |
| Canonical script approval and approval absence | `hearth-approval-authority.test.ts` now tests owning authority/store behavior only; stabilization coverage asserts absent canonical approval remains unapproved. |
| Ready transitions | Existing `hearth-ready-transition-wiring.test.ts` covers saved, duplicate, stale/rehydrate, and invalid-script behavior. |
| Downstream invalidation after approved-script changes | Existing `hearth-media-map-reload-invalidation.test.ts` covers hydration, matching version, and newer-version invalidation. |
| Visual Plan apply followed by canonical image-map verification | Added `hearth-media-map-generation-actions.test.tsx`; verifies persist-before-repair order, success only after verification, and failure when verification fails. |
| Canonical thumbnail preview resolution | Existing `hearth-thumbnail-concept-set-presentation.test.ts` verifies authoritative candidate asset paths win with metadata fallback. |
| Degraded authority states | Expanded `hearth-dependency-degradation.test.ts`; existing visual authority and image-map authority guardrail suites remain. |
| Desktop and mobile mode selection | Added `hearth-shell-mode-characterization.test.tsx` for layout breakpoints, single desktop mode selection, and mobile Spark bootstrap precedence. |

## Baseline Failure

The full Hearth test command has one known unrelated failure:

- file: `apps/hearth/tests/hearth-format-only.test.ts`;
- test: `format-only preservation rejects Florida rewrite regressions`;
- case: `industry or a branding\nexercise.` becomes `industry. Or a branding exercise.`;
- expected: preservation `false`;
- actual: preservation `true`.

This failure was present before Phase 0 and was reproduced after the Phase 0 changes. It was documented only; neither the implementation nor this test was changed.

Because `apps/hearth/scripts/run-tests.mjs` stops on the first failing test file, the aggregate Hearth test command exits `1` at that known baseline failure. The changed and newly added Phase 0 tests pass when run directly.

## Validation Results

| Gate | Result |
| --- | --- |
| `pnpm --filter @nursery/hearth typecheck` | PASS |
| `pnpm --filter @nursery/hearth test` | BASELINE FAIL: unrelated `hearth-format-only.test.ts` case documented above |
| `pnpm --filter @forge/tongs test:commit-api` | PASS: 135/135 |
| `pnpm --filter nursery build` | PASS |
| `pnpm --filter nursery verify:hearth-bundle` | PASS |
| `git diff --check` | PASS |

Bundle result:

- Hearth-related JS chunks: 8;
- total bytes: `1,650,103` of `1,800,000`;
- maximum chunk: `902,838` of `910,000`;
- threshold file unchanged.

## Files Changed by Phase 0

Modified:

- `apps/hearth/tests/hearth-approval-authority.test.ts`
- `apps/hearth/tests/hearth-dependency-degradation.test.ts`
- `apps/hearth/tests/hearth-expansion-gate.test.ts`
- `apps/hearth/tests/hearth-format-only-wiring.test.ts`
- `apps/hearth/tests/hearth-operation-authority.test.ts`
- `apps/hearth/tests/hearth-reference-clips-language.test.ts`
- `apps/hearth/tests/hearth-spark-entry-smoke.test.ts`
- `apps/hearth/tests/hearth-stabilization-blockers.test.tsx`

Added:

- `apps/hearth/tests/hearth-autosave-characterization.test.tsx`
- `apps/hearth/tests/hearth-media-map-generation-actions.test.tsx`
- `apps/hearth/tests/hearth-shell-mode-characterization.test.tsx`
- `apps/hearth/HEARTH_SHELL_PHASE_0_REPORT.md`

`apps/nursery/public/forge-nav.json` was already an unrelated dirty workspace file and was regenerated by the required Nursery build. It is not part of the Phase 0 implementation scope.

## Recommended Phase 1 Boundary

Begin with standalone material declared before the `HearthShell` component:

1. Extract `OscilloscopeFill` and its canvas/audio lifecycle into a dedicated component.
2. Extract pure route/query parsing and UI-preference helpers into narrow owning modules.
3. Extract constants, types, formatting helpers, and planning/session pure functions only where ownership is unambiguous.

Do not begin Phase 1 with controller extraction, persistence changes, or visual-production workflows. Preserve hook order in the main component and require direct unit coverage for each moved helper.

Phase 1 should remain code movement plus imports, with no behavioral changes.
