# HearthShell Refactor Phase 6C Report

## 1. Baseline

- Branch/HEAD: `codex/hearthshell-refactor` at
  `717bc48d69586f074c4eadb2296dedeead36ad0c`
- Clean, synchronized worktree
- HearthShell: 6,859 lines, 115 imports, 268 direct hooks
- Expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 Hearth JS chunks, 1,526,746 bytes total, 779,483-byte
  largest Hearth chunk

The existing mobile renderer was
`views/modes/HearthMobileOverlays.tsx`, imported directly by HearthShell.
It renders the editor and Ready `MobilePage` overlays. The current product has
no separate hamburger menu, destination-group overlay, mobile header identity
row, badge collection, Escape handler, focus ref/restoration, focus trap,
body-scroll lock, or mobile route parser in this region.

## 2. Existing lifecycle and ownership classification

The lifecycle remains:

`useLayoutMode` → `isMobile` → Phase 2 responsive navigation lifecycle →
`mobileOverlayView` → editor/Ready overlay → supplied Phase 2 open/close
command → existing mode/overlay reset.

- Presentation-only: `MobilePage` composition, titles, action labels,
  archived/restore and save/delete button presentation, Ready refresh
  presentation, and content slots.
- Phase 2 navigation authority: `useHearthMobileOverlayState`,
  `useHearthResponsiveNavigationLifecycle`,
  `useHearthMobileOverlayCommands`, `mode`, and `setMode`.
- Identity/status projection: active draft title, active-workpiece existence
  and archive state, restoring IDs, saving state, and Ready loading state.
- Outside Phase 6C: desktop rail, mobile main content, modals, toasts,
  editorial/production content, canonical loading, and controllers.

Menu state is presentation-facing but not presentation-owned: it participates
in Phase 2 breakpoint, workspace-reset, and mode synchronization. It therefore
remains in HearthShell at its original semantic hook position. There was no
Escape, focus, or body-scroll behavior to move or change.

## 3. Extracted responsibilities and boundaries

`buildHearthMobileNavigationViewModel` is pure and hook-free. It accepts
already-established identity, overlay state, commands, status flags, and
content slots. It preserves supplied callbacks and renderers by identity,
derives only the existing `Restore Workpiece`/`Restoring...` label and
disabled state, freezes the result, and never invokes a command.

`HearthMobileNavigation` is a stateless presentation boundary that delegates
to the unchanged `HearthMobileOverlays` renderer. The renderer retains the
existing labels, action ordering, native buttons, disabled behavior,
`MobilePage` semantics, overlay placement, breakpoints, and creator-facing
copy. Its props type is now exported solely to define the narrow contract.

HearthShell no longer directly renders the mobile overlay prop bag or formats
restore labels/disabled state. It constructs one immutable view model and
renders one mobile-navigation boundary.

## 4. Authority and provenance proof

Phase 2 remains the sole navigation owner. No navigation hook, effect, state,
ref, callback, or timing moved. The new modules do not parse routes, inspect
location, call history, normalize destinations, create active state, or
reconstruct commands.

Opening Ready still calls the supplied command that sets `mode` and the
mobile overlay. Closing still clears the overlay and returns mobile mode to
Episodes. The existing responsive lifecycle still closes on desktop
transition, closes on workspace change, and opens the appropriate overlay
from the established mode. No Escape or focus behavior existed, so none was
invented.

Identity remains supplied projection only. The new boundary does not resolve,
load, select, rename, or persist a workspace or workpiece. Restore, saving,
and Ready-loading statuses retain their established owners. No badges or
aggregate completion were present in the existing mobile overlay, and none
were introduced. Release readiness remains Phase 5E-owned.

The Phase 6B desktop rail and its builder are unchanged. No mutable state is
shared between mobile and desktop. Modals and toasts remain separate siblings
in HearthShell.

The new modules import no repository, canonical loader, route parser, browser
history helper, Tongs client, controller, production surface, persistence
helper, Quench executor, credential, receipt, or Ledger command.

## 5. Hook and HearthShell metrics

No hook moved or was added. The expanded sequence remains 347 hooks with
SHA-256
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

| Metric | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,859 | 6,853 |
| Import declarations | 115 | 116 |
| Direct hooks | 268 | 268 |
| Expanded hooks | 347 | 347 |

## 6. Bundle proof

| Metric/surface | Before | After |
| --- | ---: | ---: |
| Hearth JS chunks | 8 | 8 |
| Total | 1,526,746 | 1,527,514 |
| Largest Hearth chunk | 779,483 | 780,251 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

Eager growth is 768 bytes, below the 5 KB review threshold. The eager graph
adds only the pure builder and stateless presentation wrapper; the contract
is type-only and erased. The existing mobile renderer remains eager. No heavy
domain or lazy production module entered the eager graph.

## 7. Validation

- Focused Phase 6A/6B/6C and shell characterization tests: 16/16 passed
- Hearth typecheck: passed
- Full Hearth suite: 103 files passed
- Tongs commit API: 135/135 passed
- Nursery production build: passed
- Hearth bundle verification: passed
- `git diff --check`: passed
- `forge-nav.json`: restored

## 8. Files changed and restored

Changed:

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/views/modes/HearthMobileOverlays.tsx`
- `apps/hearth/src/routes/hearth-shell/HearthMobileNavigation.tsx`
- `apps/hearth/src/routes/hearth-shell/buildHearthMobileNavigationViewModel.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-mobile-navigation-contracts.ts`
- `apps/hearth/tests/hearth-shell-phase-6c-mobile-navigation.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_6C_REPORT.md`

Restored after the build:

- `apps/nursery/public/forge-nav.json`

## 9. Recommended Phase 6D boundary

Extract modal presentation assembly only: compose and revision modal prop
projection plus the existing `HearthShellModals` renderer. Keep modal state
and domain commands at their established owners, leave toasts separate, and
do not move editorial content, controller construction, canonical loading,
or persistence.

Phase 6C remains uncommitted. No push, merge, or deployment occurred.
