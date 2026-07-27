# HearthShell Refactor Phase 6D Report

## 1. Baseline

- Branch/HEAD: `codex/hearthshell-refactor` at
  `345ddbbd513b99962d3dacfd3e7d06d30cf78f9e`
- Clean, synchronized worktree
- HearthShell: 6,853 lines, 116 imports, 268 direct hooks
- Expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 Hearth JS chunks, 1,527,514 bytes total, 780,251-byte
  largest Hearth chunk
- Lazy chunks: Visual Plan 15,320; Episode Images 32,420; Thumbnail
  73,190; B-roll 16,070; Reference Clips 17,230; Metadata 8,620 bytes

## 2. Actual modal inventory

Hearth has exactly two shell modals:

1. Compose Setup, rendered by `ComposeSetupModal`.
2. Create Revision, rendered inline by `HearthShellModals`.

No other modal was added or absorbed. The existing renderer had no shell-level
pending, error, unavailable, conflict, or success props to project, so Phase
6D does not invent them.

## 3. Existing lifecycle and ownership

Compose:

`onOpenComposeScript` → conflict/default evaluation → supplied open state →
existing `ComposeSetupModal` form → supplied submit command →
defaults/draft/prompt updates → existing successful close.

HearthShell continues to own `composeModalOpen`, production defaults, the
compose setup draft, conflict evaluation, persistence of promoted defaults,
draft metadata, prompt construction, navigation/focus behavior, and close
timing.

Revision:

`openRevisionModal` → `useScriptWorkspace` state → existing revision form →
supplied confirm command → canonical draft/revision persistence → existing
close and kind/note reset.

`useScriptWorkspace` continues to own open state, kind, note, close/reset,
canonical save, selected revision, restore, comparison, concurrency, and
success/failure behavior. The modal does not choose a revision or infer
approval.

Classification:

- Presentation-only: modal visibility props, form/display props, callback
  wiring, and Create-button disabled presentation.
- Modal lifecycle/domain-local state: existing HearthShell and
  `useScriptWorkspace` hooks.
- Canonical commands and validation: existing compose/script owners.
- Identity projection: active draft ID supplied only to project whether
  Create is enabled.
- Toast behavior: outside Phase 6D.

No modal-specific hook, effect, callback, or ref moved.

## 4. Extracted boundary

`buildHearthModalViewModel` is pure and hook-free. It returns a frozen typed
contract, preserves defaults, form state, and callbacks by identity, invokes
nothing, and derives only the existing `hasActiveDraft` presentation boolean
from the supplied active draft ID.

`HearthShellModals` remains the existing renderer. Its prop type is exported
solely for the presentation contract. Compose copy, revision title and fields,
option ordering, button ordering, disabled behavior, and native controls are
unchanged.

HearthShell now builds one modal view model and renders
`<HearthShellModals {...modalViewModel} />`; it no longer directly assembles
the renderer's JSX prop list or the revision disabled boolean.

## 5. Authority proofs

The compose presentation imports no persistence, attachment, STT, AI,
proposal, or navigation authority. Its existing submit callback remains the
only path into compose behavior.

The revision presentation imports no repository or canonical authority. It
does not select, compare, restore, save, approve, or order revisions. Kind and
note remain supplied local form state. Canonical revision behavior remains in
`useScriptWorkspace` and the established script persistence path.

Close behavior is unchanged:

- Compose has its existing explicit Close button and successful-submit close.
- Revision has its existing Cancel button and confirm-command close/reset.
- No backdrop close, Escape close, route close, responsive close, or
  independent failure close was added.

No new error, unavailable, pending, or success state was flattened or
fabricated. The renderer continues to show exactly the states it previously
received.

Focus, portal, backdrop, and accessibility behavior are unchanged. Compose
retains its existing labelled section and presentation backdrop. Revision
retains its existing DOM placement and native form controls. No focus trap,
Escape listener, portal, scroll lock, animation, or confirmation was added.

Toast state, queues, timers, notices, errors, and rendering remain completely
outside Phase 6D. Desktop rail, mobile overlays, production presentation, and
editorial presentation are unchanged.

The new modules import no repository, canonical loader, route parser, history
helper, Tongs client, controller, production surface, persistence
implementation, Quench executor, credential, receipt, or Ledger command.

## 6. Hook and HearthShell metrics

No hook moved or was added. The expanded sequence remains 347 hooks with
SHA-256
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

| Metric | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,853 | 6,855 |
| Import declarations | 116 | 117 |
| Direct hooks | 268 | 268 |
| Expanded hooks | 347 | 347 |

## 7. Bundle proof

| Metric/surface | Before | After |
| --- | ---: | ---: |
| Hearth JS chunks | 8 | 8 |
| Total | 1,527,514 | 1,528,030 |
| Largest Hearth chunk | 780,251 | 780,767 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

Eager growth is 516 bytes. The eager graph adds only the pure builder; the
contract module is type-only and erased. No heavy domain or lazy production
module entered the eager graph.

## 8. Validation

- Focused Phase 6A–6D, shell characterization, and compose tests: 26/26 passed
- Hearth typecheck: passed
- Full Hearth suite: 104 files passed
- Tongs commit API: 135/135 passed
- Nursery production build: passed
- Hearth bundle verification: passed
- `git diff --check`: passed
- `forge-nav.json`: restored

## 9. Files changed and restored

Changed:

- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/views/modes/HearthShellModals.tsx`
- `apps/hearth/src/routes/hearth-shell/buildHearthModalViewModel.ts`
- `apps/hearth/src/routes/hearth-shell/hearth-modal-contracts.ts`
- `apps/hearth/tests/hearth-shell-phase-6d-modal-presentation.test.ts`
- `apps/hearth/HEARTH_SHELL_PHASE_6D_REPORT.md`

Restored after build:

- `apps/nursery/public/forge-nav.json`

## 10. Recommended Phase 6E boundary

Audit toast presentation as its own optional slice. Extract only existing
toast/notice rendering and immutable presentation projection if a cohesive
boundary exists. Leave queues, timers, success/error production, domain
commands, modal behavior, canonical loading, and persistence at their current
owners.

Phase 6D remains uncommitted. No push, merge, or deployment occurred.
