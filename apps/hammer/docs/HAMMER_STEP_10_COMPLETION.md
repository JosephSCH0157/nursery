# Hammer Step 10 Completion

Recorded: 2026-07-12

## Result

Hammer's ten-step foundation program is complete. Step 10 changed structure and permanent gates only; it did not change placement scoring, thresholds, face geometry, matte behavior, resolver order, timeline/history semantics, persistence schemas, Tongs APIs, or user workflow.

## Responsibility map

| Surface | Starting responsibility | Ending responsibility |
| --- | --- | --- |
| `HammerWorkspaceShell` | Composed the workspace and also performed final automatic-placement frame validation and command construction inline. | Composes the workspace, captures the displayed frame, delegates the pure final decision to `hammerAutomaticPlacementController`, and routes only an explicit commit command to canonical history. |
| `HammerWorkspaceEditor` | Render orchestration also owned canonical-open dedupe and prep-run lifecycle ledgers. | Composes editor state while `hammerWorkspaceEditorLifecycle` owns those identity-keyed lifecycle mechanisms. |
| `HammerWorkspaceShellToolBay` | Presented tools through a VM but retained placeholder domain aliases and a browser-storage debug read. | Remains presentation-only, imports actual domain types, expresses commands supplied by the shell, and owns no browser persistence. |

### Extracted authorities

- `hammerAutomaticPlacementController.ts`: one pure responsibility—convert current canonical placement authority plus the current displayed frame into refusal or one typed commit command. It cannot mutate history or persistence.
- `hammerWorkspaceEditorLifecycle.ts`: one responsibility—identity-keyed deduplication lifecycle for canonical open and prep kick operations. It owns no canonical data representation.
- The existing neutral preview-analysis, placement lifecycle, history, persistence, selection, playback, source-desk, and snapshot controllers remain the sole owners of their established responsibilities.

These boundaries follow `canonical state -> focused controller -> typed command -> existing canonical mutation`. No store, event bus, context provider, mask representation, face representation, or persistence path was added.

## Measurements and ratchets

| Principal file | Starting lines | Ending lines | Enforced parser line cap | Explicit `any` cap |
| --- | ---: | ---: | ---: | ---: |
| `HammerWorkspaceShell.tsx` | 8,630 | 8,601 | 8,602 | 6 |
| `HammerWorkspaceEditor.tsx` | 5,432 | 5,370 | 5,371 | 4 |
| `HammerWorkspaceShellToolBay.tsx` | 4,019 | 4,019 | 4,020 | 339 |

The parser caps count the terminal line and are therefore one greater than PowerShell's content-line measurement. Extracted controller caps are 100 parser lines each; achieved sizes are 71 and 70 content lines.

`check-architecture-ratchet.mjs` permanently enforces:

- principal responsibility concentration cannot grow;
- the focused controllers cannot become replacement giant shells;
- principal explicit-`any` counts cannot grow;
- no `@ts-nocheck` may exist in Hammer production or tests;
- tool-bay presentation may not import persistence/history, read browser storage, or invoke automatic-placement authority directly;
- the shell must route automatic placement through the focused command boundary;
- a built-in representative regression proves browser-storage ownership detection remains active.

The existing type, lint, test-discovery, strict-compilation, and coverage ratchets remain active. Current type debt is critical `any=0`, critical suppressions `=0`, total `any=446/457`, and suppressions `=1/1`.

## Regression proof

New `hammerAutomaticPlacementController.test.ts` proves:

- refusal produces no history mutation command;
- frame-A evidence is rejected on frame B and invalidated;
- success emits exactly one canonical commit command with deterministic geometry.

Existing preserved tests continue to prove workspace identity invalidation, neutral preview analysis independent of eye-contact UI, automatic-placement analysis demand, exact matte/face frame identity, undo/redo, persistence acknowledgement, tool-bay command wiring, and cleanup of provider leases, captures, timers, and in-flight lifecycle work.

## Complete verification

| Gate | Result |
| --- | --- |
| Stable Hammer suite | 120/120 passed |
| Shuffled Hammer suite | 120/120 passed, seed `260710` |
| Strict TypeScript test boundary | 120 discovered / 120 strict-compiled |
| Production TypeScript | Passed |
| Type-safety + architecture ratchets | Passed |
| Hammer lint | 0 errors; 84/84 grandfathered Hook warnings |
| Coverage | 37.98% lines/statements, 67.36% branches, 78.72% functions; 204/204 production sources; 22 critical floors passed |
| Nursery-integrated Hammer build | Passed; entry `213.87 kB`, CSS `87.25 kB` |
| Hearth stabilization | 63/63; 62 strict TypeScript tests |
| Tongs commit API | 123/123 |
| `git diff --check` | Passed |

Verification did not modify tracked generated files.

## Authority and database disposition

Steps 1–9 remain unchanged and authoritative. `ForegroundMatte.alphaMask`, shared neutral face analysis, exact frame identity, the canonical placement policy, manual refusal fallback, canonical history, and canonical persistence retain their existing semantics.

No database migration, RLS update, Tongs API change, Hearth behavior change, or Quench behavior change was required.

## Optional later cleanup

Further presentational section extraction, cosmetic naming, CSS organization, peripheral noncritical typing, and unrelated medium-file decomposition remain optional. They are outside the completed ten-step authority program and may not weaken the permanent ratchets.
