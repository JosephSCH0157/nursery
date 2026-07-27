# HearthShell Refactor Phase 6B Report

## Baseline and existing path

- Branch/HEAD: `codex/hearthshell-refactor` at
  `2ec9b2ae2607d1069bee0b24dc127e613a9b2340`
- Clean, synchronized worktree
- HearthShell: 6,863 lines, 114 imports, 268 direct hooks
- Expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 chunks, 1,526,597 bytes total, 779,334-byte maximum

The existing renderer is `views/modes/HearthDesktopRail.tsx`, composed inside
`HearthDesktopFrame` through HearthShell's `railContent` slot. It preserves the
Ready Queue, Workspace Projects, and Active Workpiece groups and delegates to
their existing rail components. HearthShell previously formatted the Sources
badge and supplied more than sixty individual JSX props directly.

## Extracted boundary

`buildHearthDesktopRailViewModel` is a pure, hook-free projection. Its typed
contract receives the already-established identity, collection, readiness,
Anvil handoff, navigation-command, and presentation inputs. It preserves all
callbacks and status objects by identity, formats only the existing Sources
badge/title, and returns an immutable prop contract for the existing renderer.

HearthShell now supplies one `desktopRailViewModel` to
`HearthDesktopRail`. It no longer directly formats rail badges or renders the
large rail prop bag. The renderer's group order, labels, selected-state logic,
disabled behavior, buttons, keyboard-native semantics, and accessibility
presentation are unchanged.

## Ownership proof

Phase 2 remains the sole navigation owner. The existing
`useHearthDesktopNavigationCommands` call remains in HearthShell in its
original hook position. The view model neither invokes nor reconstructs those
commands, parses routes, reads browser location, or writes history.

Identity labels and workpiece IDs remain supplied projections. The rail does
not resolve, load, select, rename, or persist identity. Ready counts,
readiness status, Sources counts, revision/word counts, and Anvil availability
retain their existing owners and semantics. No arrays, previews, or cache are
used to infer completion; no new aggregate completion exists.

The mobile overlay/header JSX and state remain untouched in HearthShell and
continue to use their existing presentation lifecycle. No mutable state is
shared between desktop and mobile.

The new modules import no repository, canonical loader, route parser, Tongs
client, production surface, or persistence helper. They expose no Quench,
publishing, scheduling, credential, receipt, or Ledger authority.

## Hook, bundle, validation, and next boundary

No hook moved or was added. The expanded sequence remains 347 hooks with
SHA-256
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.
All six production lazy boundaries remain unchanged.

| Metric/surface | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,863 | 6,859 |
| Import declarations | 114 | 115 |
| Direct hooks | 268 | 268 |
| Expanded hooks | 347 | 347 |
| Hearth JS chunks | 8 | 8 |
| Total | 1,526,597 | 1,526,746 |
| Largest Hearth chunk | 779,334 | 779,483 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

Eager growth is 149 bytes. Focused Phase 6A/6B tests pass 8/8; Hearth
typecheck, the 102-file Hearth suite, Tongs commit API 135/135, Nursery build,
bundle verification, and `git diff --check` all pass. `forge-nav.json` is
restored.

Phase 6C should extract the mobile overlay presentation only, retaining Phase
2 navigation ownership and keeping modal, toast, editorial, controller, and
canonical-loading boundaries separate.

No commit, push, merge, or deployment is part of Phase 6B.
