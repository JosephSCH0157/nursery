# HearthShell Refactor Phase 6F Main-Content Audit

## 1. Outcome and baseline

Phase 6F concludes with **Outcome B: no further safe cohesive
main-content extraction**.

The repository baseline was confirmed before the audit:

- branch: `codex/hearthshell-refactor`
- HEAD: `cfcff33eab7a8d137f685aede9862717734a44d6`
- HearthShell: 6,855 lines, 117 imports, 268 direct hooks
- expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- bundle: 8 Hearth chunks, 1,528,030 bytes total, 780,767-byte largest
  chunk, 129,233 bytes of headroom
- lazy chunks: Visual Plan 15,320; Episode Images 32,420; Thumbnail
  73,190; B-roll 16,070; Reference Clips 17,230; Metadata 8,620 bytes
- worktree clean and synchronized with
  `origin/codex/hearthshell-refactor`

## 2. Existing switch and rendering paths

Hearth already has a narrow, hook-free desktop selector:
`HearthMainContentSwitch`. It receives:

- the supplied Phase 2 `mode`;
- the supplied `showSparkRouteBootstrap` condition; and
- six render callbacks owned by HearthShell.

It gives Spark bootstrap precedence, then selects `sparks`, `episodes`,
`ready`, `series`, or `focus`. The `focus` callback is also the existing
default for the closed `HearthMode` union. It does not redirect, normalize,
update, or persist mode.

The callbacks are significant. Only the selected callback is invoked, so
inactive content is not constructed through this boundary. Each callback
closes over the exact current HearthShell state, commands, refs, controllers,
and derived collection projections required by its established mode
component.

Desktop passes the resulting node to `HearthDesktopFrame`.

Mobile intentionally does not use the desktop mode switch. Its base main
content is:

- Spark bootstrap while the incoming Spark route is unresolved under the
  existing mobile condition; otherwise
- Episodes.

Focus/editor and Ready are supplied separately to the Phase 6C mobile overlay
boundary. This is established responsive behavior, not a second mode
authority to consolidate.

## 3. Actual mode and content inventory

### Spark bootstrap

- Selection: desktop uses
  `incomingBarStockIntakeRoute && routeSparkId && !routeProjectId &&
  !hasActiveEpisode && !forgeError`; mobile keeps its existing similar but
  deliberately separate condition.
- Renderer: `HearthSparkBootstrapMode`.
- Inputs: route Spark projection, title formatter, and forge failure.
- Loading/empty/failure: existing “Lighting the forge” presentation and
  owner-supplied failure; no new absence inference.
- Ownership: route/identity resolution and bootstrap operation remain in
  HearthShell and Phase 2/collection owners.
- Closure: `renderSparkRouteBootstrapView` closes over route and operation
  state but performs no operation when rendered.
- Classification: switch choice A; prop assembly B; route and forge state C/D.

This is an incoming-route bootstrap, not a generic no-workspace or
no-Spark onboarding state. The audit does not invent those variants.

### Sparks

- Selection: desktop `mode === "sparks"`.
- Renderer: `HearthSparksMode`.
- Inputs: session identities, route Project identity, workpiece and draft
  collections, selected Spark, loading/error state, formatting helpers.
- Commands: start from scratch, resume, select/activate Spark, forge selected
  Spark, and forge Project into Episode.
- Loading/empty/failure: the existing Bar Stock loading, discovery error,
  empty copy, forge error, and Project-resolution presentation.
- Ownership: Phase 2 owns the mode; Phase 3 and existing forge/session owners
  retain collections, selection, creation, persistence, and operation state.
- Closure: broad; it captures collection state, route state, identity
  resolvers, formatters, setters, and canonical commands.
- Classification: selection A; component props B; navigation C; collection
  and forge authority D.

### Episodes

- Selection: desktop `mode === "episodes"`; mobile base content when Spark
  bootstrap is not active.
- Renderer: `HearthEpisodesMode`.
- Inputs: responsive flag, search ref/text, sort state, filtered navigation
  items, draft map, active identity, archive/restore operation IDs, presence
  projections.
- Commands: create workpiece/draft, open Ready overlay, open workpiece,
  pin/save draft metadata, archive, restore, and delete draft buffer.
- Loading/empty/failure: collection projection is supplied by existing
  owners; the component preserves current empty-list and operation
  presentation.
- Archived/disabled: supplied canonical archive state and identity-scoped
  operation IDs determine labels and disabled buttons.
- Ownership: Phase 2 owns destination/overlay navigation; Phase 3 owns the
  collection, selection, archive/restore, retries, and stale-operation
  authority.
- Closure: broad and includes a live DOM ref and numerous domain callbacks.
- Classification: choice A; display props B; navigation C; collection and
  operation authority D; search ref/local presentation E.

### Ready

- Selection: desktop `mode === "ready"` and the established mobile Ready
  overlay slot.
- Renderer: `HearthReadyMode`.
- Inputs: canonical ordered queue, total/removed counts, loading/error state,
  drag identity, updating/removing/sending operation IDs, label and
  attribution resolvers.
- Commands: refresh, restore hidden, reorder, relabel, open in Hearth, send
  back to edit, hide, and resolve/open the established Anvil link.
- Loading/empty/failure: existing loading label, error, empty list, removal
  and restore state pass through.
- Content-local behavior: the current component preserves the existing Anvil
  activation bridge, including token handoff and browser navigation on the
  explicit button action. It must not enter a generic presentation builder.
- Ownership: Phase 3 retains Ready authority, reversible commands, ordering,
  categories, retry, and operation state. Ready is not approval, recording,
  scheduling, or publication.
- Closure: broad and includes drag-state setters and an inline drop command
  that reads the active dragging identity.
- Classification: choice A; display props B; navigation C; Ready authority D;
  browser action and drag interaction E.

### Series

- Selection: desktop `mode === "series"`.
- Renderer: `HearthSeriesMode`.
- Inputs: the supplied Series projection and Ready attribution resolver.
- Commands: an inline callback opens the selected canonical workpiece with
  its supplied workspace/workpiece identity.
- Loading/empty/failure: current empty copy is local to the Series surface;
  no array is reinterpreted by the switch.
- Ownership: Phase 3 retains Series projection, ordering, identities, and
  selection behavior.
- Closure: small but authority-bearing because the open callback closes over
  `openWorkpieceInFocus`.
- Classification: choice A; display props B; navigation C; collection and
  selection D.

### Focus

- Selection: desktop `mode === "focus"` and the current default branch;
  mobile receives Focus as an editor overlay slot rather than base content.
- Renderer: `HearthFocusMode`.
- Inputs: active Episode/draft/workpiece/archive state, focus tab, archive
  reason, restoration state, and four nested render callbacks.
- Commands: go to Episodes, restore archived workpiece, retry draft
  hydration.
- Loading/empty/failure/archived: existing no-Episode, archived-workpiece and
  draft-hydration branches remain within `HearthFocusMode`.
- Nested content: planning, sources, revisions, or the draft workspace.
  Draft composition coordinates script, conversation, sources, presence,
  Anvil handoff, Phase 6A production presentation, history and release
  preparation through existing controllers and surfaces.
- Closure: very broad. `renderFocusEditor` closes over active identity,
  navigation state, archive/restore commands and hydration commands, then
  delegates to four more HearthShell-owned closures. `renderDraftView` alone
  assembles substantial editorial and production contracts from established
  owners.
- Ownership: Phase 2 owns mode and focus tab; Phase 3 owns workpiece
  selection/archive/restore; Phases 4–6A retain editorial and production
  controllers and presentation.
- Classification: outer choice A; display props B; mode/focus navigation C;
  identity, collection and controller authority D; nested closure lifecycles
  E.

Focus does not currently have one immutable surface contract that can move
through a new builder without either retaining the same nested render
callbacks or introducing a giant unrelated prop object.

### Fallback

There is no separate fallback component or copy. The typed switch's
`default` is the existing Focus renderer. The audit does not add an unknown
mode, redirect, error, or normalization path.

## 4. Ownership classification

- **Class A — pure switch presentation:** bootstrap precedence and the
  desktop choice among the six supplied render callbacks. This is already
  isolated in `HearthMainContentSwitch`.
- **Class B — presentation prop assembly:** component-specific labels,
  projections, state flags, render slots, refs and callbacks. These are
  assembled beside their actual owners in HearthShell.
- **Class C — navigation authority:** `mode`, focus tab, incoming route,
  mobile overlay paths, URL behavior and transition commands remain Phase 2
  responsibilities.
- **Class D — collection/domain authority:** Spark/Project forging,
  Episodes, Ready, Series, selection, archive/restore, canonical loading,
  retries and stale-operation rejection remain Phase 3 and established
  controller responsibilities.
- **Class E — content-local lifecycle:** search and drag interaction,
  browser activation, nested Focus render closures, refs, component-local
  behavior and controller surfaces remain in their current components and
  owners.

Only Class A is fully eligible, and it has already been extracted. The safe
parts of Class B are not cohesive across these six unrelated content regions.

## 5. Why no further safe boundary exists

A second view model and renderer would not remove an unextracted selection
responsibility. It would wrap the existing `HearthMainContentSwitch`.

The apparent alternatives are all behaviorally or architecturally worse:

1. Passing six prebuilt React nodes would construct inactive region elements
   in HearthShell instead of preserving the current selected-callback timing.
2. Selecting one prebuilt node in a builder would still require HearthShell
   to construct all region-specific prop bags before selection.
3. Passing six render callbacks through a discriminated union would reproduce
   the existing component with more types but no clearer ownership.
4. Moving prop assembly would create a mega-contract spanning route state,
   collections, refs, presence, archive/restore, Ready drag state, browser
   activation, editorial controllers and production surfaces.
5. Unifying desktop and mobile would change their established base-content
   and overlay paths.
6. Turning Focus into a single new contract would merely relocate its nested
   closure tree or move Phase 2, Phase 3 and editorial/production authority.

No selection currently invokes navigation merely by rendering. Preserving
that fact requires keeping commands inside their established interactive
surfaces. No hook order or render timing should be disturbed merely to rename
an already-isolated switch.

Therefore no new contract, builder, renderer, controller, context, test, or
state machine was created.

## 6. Production, hook, and bundle proof

No production source, test, stylesheet, bundle configuration, generated
asset, or `forge-nav.json` file changed. HearthShell remains byte-for-byte
unchanged. Consequently:

- direct hooks remain 268;
- expanded hooks remain 347;
- expanded SHA-256 remains
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`;
- all six production surfaces remain independently lazy;
- bundle count, total, largest chunk, headroom and lazy chunk sizes remain the
  confirmed baseline;
- Phase 2 remains the sole navigation/mode owner;
- Phase 3 retains collection and operation authority;
- no canonical loader, controller, command, ref, effect, timer, persistence,
  route parser, Tongs client, Quench action, Ledger action, schema, migration,
  RPC, query or RLS behavior moved.

## 7. Validation

The audit was traced against the actual HearthShell render path,
`HearthMainContentSwitch`, every selected mode component, desktop frame,
mobile base-content branch and Phase 6C overlay slots. Repository status and
the baseline commit were confirmed.

Because this is a report-only Outcome B, no production build or test run was
performed or claimed. `git diff --check` is the required validation for the
documentation-only change.

## 8. Files changed

- `apps/hearth/HEARTH_SHELL_PHASE_6F_REPORT.md` — audit report only.

No commit, push, merge, or deployment is part of this audit.

## 9. Recommended narrower Phase 6 boundary

Phase 6G should audit **Focus empty/archived/hydration presentation only**:
the three pre-workspace branches currently rendered by `HearthFocusMode`.
Proceed only if their supplied identity/status/commands can remain unchanged
and the active focus-tab render closure remains completely outside the slice.
Do not move focus navigation, archive/restore, hydration, tab selection, or
any editorial/production surface. Outcome B remains valid if separating
those guards would obscure the already-cohesive `HearthFocusMode`.
