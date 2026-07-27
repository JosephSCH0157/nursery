# HearthShell Refactor Phase 6G Focus-Guard Audit

## 1. Outcome and baseline

Phase 6G concludes with **Outcome B: `HearthFocusMode` is already the
cohesive Focus-guard presentation owner**.

The repository baseline was confirmed before the audit:

- branch: `codex/hearthshell-refactor`
- HEAD: `95e31fd16d1390a1d489e4ee56470f4433840940`
- clean worktree synchronized with
  `origin/codex/hearthshell-refactor`
- HearthShell: 6,855 lines, 117 imports, 268 direct hooks
- expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- bundle: 8 Hearth chunks, 1,528,030 bytes total, 780,767-byte largest
  chunk, 129,233 bytes of headroom
- lazy chunks: Visual Plan 15,320; Episode Images 32,420; Thumbnail
  73,190; B-roll 16,070; Reference Clips 17,230; Metadata 8,620 bytes

No bundle threshold was changed.

## 2. Exact Focus path and branch precedence

HearthShell owns `renderFocusEditor`, which supplies immutable status
projections, existing commands, and four opaque active-content render slots
to `HearthFocusMode`.

`HearthFocusMode` is a small stateless, hook-free component with this exact
precedence:

1. `!hasActiveEpisode` renders the no-active-Episode guard.
2. `activeWorkpieceIsArchived` renders the archived-workpiece guard.
3. `!hasActiveDraft` renders the draft-hydration guard.
4. Otherwise, the active Focus workspace selects exactly one supplied render
   callback from `planning`, `sources`, `revisions`, or `draft` (the existing
   default).

The active render callbacks are not invoked while any guard is active. Within
the active branch, only the selected focus-tab callback is invoked.

There is no separate hydration-failed, hydration-missing, or
authority-unavailable prop or branch in the current component. The product
currently projects all `hasActiveEpisode && !archived && !hasActiveDraft`
states through one hydration presentation with an explicit retry button. The
audit does not invent distinctions that the established contract does not
contain.

## 3. Actual Focus guard inventory

### No active Episode

- Exact condition: `!hasActiveEpisode`.
- Existing JSX: first branch in `HearthFocusMode`.
- Copy:
  - title: `Focus Mode`
  - description: `Open an Episode from Episodes (In Progress) first.`
  - button: `Go to Episodes`
- Identity inputs: only the supplied `hasActiveEpisode` projection is
  inspected. No collection is searched and no workpiece is inferred.
- Navigation: the button invokes the supplied `onGoToEpisodes` callback.
  HearthShell currently supplies `() => setMode("episodes")`; Phase 2 remains
  the mode owner.
- Archive/restore/hydration: not evaluated for presentation after this branch
  wins.
- Accessibility: existing semantic `section`, heading, paragraph and native
  button behavior; no added live region or focus behavior.
- Side effects: rendering invokes no command.
- Classification: A guard presentation, B display projection, C navigation
  authority outside the component.

### Archived active workpiece

- Exact condition: active Episode passed and
  `activeWorkpieceIsArchived` is true.
- Existing JSX: second branch in `HearthFocusMode`.
- Copy:
  - title: supplied `activeWorkpieceTitle`
  - description:
    `This workpiece is archived. Restore it to review, then re-ready it before recording.`
  - optional `Archive reason: ...`
  - buttons: `Restore Workpiece` / `Restoring...` and `Back to Episodes`
- Identity inputs: supplied `activeWorkpieceId`, title, archive reason and
  archive boolean from `activeWorkpieceContext`.
- Restore state: supplied
  `isRestoringArchivedWorkpiece`, derived by the Phase 3 owner from the
  identity-scoped restoring-ID collection.
- Disabled behavior: Restore is disabled while restoring or when no active
  workpiece ID is supplied.
- Restore command: the supplied callback captures the current archived
  workpiece ID and delegates to the existing
  `onRestoreWorkpiece(..., { openAfterRestore: true })` command.
- Navigation: Back to Episodes uses the supplied Phase 2 callback.
- Failure presentation: the component has no separate restore-error prop and
  does not translate, suppress, or fabricate one.
- Accessibility: semantic section/header and native buttons retain current
  disabled behavior.
- Side effects: rendering invokes neither restore nor navigation.
- Classification: A/B presentation, C navigation authority, D
  archive/restore authority outside the component.

### Draft hydration

- Exact condition: active Episode passed, workpiece is not archived, and
  `!hasActiveDraft`.
- Existing JSX: third branch in `HearthFocusMode`.
- Copy:
  - title: supplied `activeWorkpieceTitle`
  - description:
    `Hydrating the attached draft buffer for this Episode.`
  - buttons: `Retry draft hydration` and `Back to Episodes`
- Identity inputs: supplied `workpieceId` and title.
- Hydration state: only the supplied `hasActiveDraft` boolean is inspected.
  The guard does not own a loader or infer canonical absence.
- Retry disabled behavior: disabled when `workpieceId` is absent.
- Retry command: the supplied callback verifies the captured current
  workpiece ID and delegates to `openWorkpieceInFocus`, preserving the
  session's existing preferred draft ID.
- Failure/unavailable distinction: none is exposed by the present surface
  contract. The retry affordance remains visible in the same combined guard;
  no failure copy is invented.
- Navigation: Back to Episodes uses the supplied Phase 2 callback.
- Accessibility: existing semantic structure and native disabled button.
- Side effects: rendering invokes no retry or navigation command.
- Classification: A/B presentation, C navigation authority, E
  hydration/canonical loading authority outside the component.

### Active Focus workspace

- Exact condition: active Episode, non-archived workpiece, and active draft.
- Selection: supplied `focusTab` chooses planning, sources, revisions, or
  draft/default.
- Content: each tab is an opaque `() => ReactNode` slot.
- Lazy evaluation: only the selected slot is invoked, once through the active
  branch; guard branches invoke none of them.
- Scope: script, conversation, sources, presence, Anvil, history,
  production, Metadata and release presentation remain behind their existing
  render closures and controllers.
- Side effects: the selection itself invokes no domain command; it calls only
  the selected render closure.
- Classification: C focus-tab navigation authority, F active Focus content,
  G nested content lifecycle. None is eligible for Phase 6G.

## 4. Caller, desktop/mobile, and reset ownership

HearthShell supplies the Focus inputs. It retains:

- active identity and workpiece context;
- the Phase 2 mode and focus-tab values;
- the Phase 2 go-to-Episodes command;
- the Phase 3 identity-scoped archive/restore command and operation state;
- the existing draft hydration/open command and preferred-draft projection;
- all four active-content render closures.

Desktop reaches `HearthFocusMode` through the existing
`HearthMainContentSwitch` Focus callback. Phase 6C mobile navigation receives
the same `renderFocusEditor` callback as its editor overlay content. There is
no separate mobile guard state or authority, and no overlay lifecycle needs
to move.

Workspace/workpiece identity changes reset or invalidate archive, restore,
hydration, editorial and production state in their established Phase 2,
Phase 3 and controller lifecycles. `HearthFocusMode` owns no hook, effect,
ref, timer, state or cleanup and imposes no reset semantics.

## 5. Ownership classification

- **A — guard presentation:** the three ordered early-return branches already
  owned by `HearthFocusMode`.
- **B — display-only prop projection:** supplied title, reason, booleans,
  labels implied by those booleans, disabled presentation and callbacks.
- **C — navigation authority:** mode, focus tab, responsive/mobile overlay
  behavior and navigation callbacks remain Phase 2 responsibilities.
- **D — archive/restore authority:** canonical archive projection, restoring
  IDs, command, success/failure interpretation and stale-operation rejection
  remain Phase 3 responsibilities.
- **E — hydration/canonical loading authority:** active-draft projection,
  loader, retry command, preferred draft and failure handling remain with
  existing identity/script/collection owners.
- **F — active Focus content:** the four opaque render slots remain outside
  the guard audit.
- **G — content-local lifecycle:** all nested hooks, refs, effects, drafts,
  controllers and production surfaces remain behind the active render slots.

Only A and the displayed portions of B are presentation. They already have
one narrow owner.

## 6. Why no safe further boundary exists

`HearthFocusMode` is already the target architecture described by Phase 6G:
it is stateless and hook-free, receives immutable status projections and
supplied commands, keeps active content opaque, and lazily invokes active
content only after all guards pass.

Splitting approximately three short early-return branches into a contract
file, pure builder and second renderer would:

- duplicate the component's existing discriminating logic;
- add more modules than responsibility;
- leave the same commands and active render slots flowing through an extra
  ceremonial layer;
- risk invoking or constructing active content earlier if converted to
  prebuilt nodes; or
- force invented hydration variants unsupported by the current contract.

Keeping the guards together also makes their precedence explicit. No
navigation, archive/restore, hydration, identity, controller or reset
ownership needs to move, and no genuine ownership boundary remains to
extract.

Therefore no builder, contract, renderer, controller, hook, test or state
machine was created.

## 7. Production, hook, and bundle proof

No production source, test, stylesheet, bundle configuration, generated
asset, or `forge-nav.json` file changed. HearthShell and
`HearthFocusMode` remain byte-for-byte unchanged. Consequently:

- direct hooks remain 268;
- expanded hooks remain 347;
- expanded SHA-256 remains
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`;
- all six production surfaces remain independently lazy;
- bundle count, total, largest chunk, headroom and lazy chunk sizes remain the
  confirmed baseline;
- active-content evaluation timing remains unchanged;
- no repository, loader, controller, route parser, persistence, Tongs
  client, Quench action, Ledger action, schema, migration, RPC, query or RLS
  behavior moved.

## 8. Validation

The audit was traced against the actual HearthShell caller,
`HearthFocusMode`, desktop `HearthMainContentSwitch` path and Phase 6C mobile
editor overlay slot. Repository status and the baseline commit were
confirmed.

Because this is a report-only Outcome B, no production build or test run was
performed or claimed. `git diff --check` is the required validation for the
documentation-only change.

## 9. Files changed

- `apps/hearth/HEARTH_SHELL_PHASE_6G_REPORT.md` — audit report only.

No commit, push, merge or deployment is part of this audit.

## 10. Recommended stopping point

Stop Phase 6 presentation extraction here.

The remaining main-content and Focus presentation boundaries are already
small, stateless components. Further splitting would increase indirection
without removing shell authority. The next refactor should begin only with a
separately approved behavioral or ownership goal, not another presentation
file-count exercise.
