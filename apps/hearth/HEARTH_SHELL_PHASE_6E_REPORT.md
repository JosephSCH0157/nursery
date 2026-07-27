# HearthShell Refactor Phase 6E Notification Audit

## 1. Outcome and baseline

Phase 6E concludes with **Outcome B: no safe cohesive Hearth presentation
boundary**.

The repository baseline was confirmed before the audit:

- branch: `codex/hearthshell-refactor`
- HEAD: `884926d06faabac1df02d49dcafd3ed3a2956710`
- HearthShell: 6,855 lines, 117 imports, 268 direct hooks
- expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- bundle: 8 Hearth chunks, 1,528,030 bytes total, 780,767-byte largest
  chunk, 129,233 bytes of headroom
- lazy chunks: Visual Plan 15,320; Episode Images 32,420; Thumbnail
  73,190; B-roll 16,070; Reference Clips 17,230; Metadata 8,620 bytes
- worktree clean and synchronized with
  `origin/codex/hearthshell-refactor`

## 2. Existing genuinely shared notice system

The repository does contain Class A shared transient notices, but their
presentation boundary is not in HearthShell or the Hearth package.

`HearthShell` creates owner-supplied `ForgeNoticeDetail` events through
`publishForgeNotice`. Conversation, thumbnail, and image-candidate operation
owners supply the job, title, message, and severity. Hearth supplies the
current workspace/workpiece route and dispatches `forge:notice`.

The Nursery shell's existing `ForgeNoticeProvider` owns:

- event validation and receipt;
- generated toast IDs;
- newest-first ordering;
- four-visible and twenty-history limits;
- 15-second content/route/workpiece deduplication;
- severity-specific dismissal timers (info 4.5 seconds, success 5 seconds,
  warning 6.5 seconds, error 8 seconds);
- timer replacement/removal and unmount cleanup;
- activation navigation and dismissal;
- desktop-notification permission and background delivery.

Its stateless `ForgeNoticeToasts` renderer owns the already-centralized
presentation, `aria-live="polite"` region, `role="status"` cards, severity
labels, activation, and dismiss buttons. It is mounted above all tools in
Nursery `main.tsx`, so desktop and mobile already use the same presentation.

Hearth owns neither the shared queue nor its renderer. Moving or duplicating
that presentation under HearthShell would split the cross-tool contract and
change queue, timer, navigation, layering, and desktop-notification
semantics. The correct action is therefore to leave the existing cross-tool
boundary intact.

## 3. Complete Hearth notification inventory

| Category | Existing display and owner | Producer/lifecycle | Class |
| --- | --- | --- | --- |
| Shell-level transient notices | Nursery `ForgeNoticeToasts`, not Hearth JSX | Hearth operation owners publish events; Nursery owns IDs, order, dedupe, dismissal, timers, navigation, and cleanup | A, already outside Hearth |
| Script workspace | `HearthDraftScriptHeader` shows autosave warning/retry, draft load/save error, conflict actions, validation and dismiss actions; `ScriptSurface` shows dictation feedback | Phase 4A/script workspace, autosave, conflict, validation, and STT owners; conflict/validation clear only through their supplied commands | B/C |
| Conversation / Compose | `ChatSurface` shows chat/send error, proposal validation, attachment parse errors, STT status/error, processing and retry | Phase 4B1 conversation, attachment, proposal, and STT owners; STT timer/reset remains in `useChatWorkspace`; Compose validation remains modal-local | B/D/F |
| Sources / research | `SourcesView` presents source load/research/extraction status and retry; source status is projected by the sources controller | `useSourcesState` owns operation mapping and a replaceable 2.2-second status timer, clears it before replacement and during cleanup; workspace/workpiece operation authority rejects stale work | B/C |
| Presence | Desktop rail badges/tooltips and presence projections | Phase 4B3 controller/repository owns polling, retry, degraded state, lifecycle generation and identity cleanup | C/E/F |
| Anvil handoff | Script/header handoff readiness, validation and disabled reasons | Phase 4C controller owns eligibility, validation, retry and explicit open command; no transient renderer | C/E |
| Thumbnail | Lazy Thumbnail panels show authority/load errors, generation/upload/pairing failures, failed versions, retry, preview unavailable, busy and completion status | Phase 5A controller and existing thumbnail hooks own operation results and retries; canonical authority remains Tongs; 250 ms title-style/brand timers are persistence debounce, not notice timers | B/C/F |
| Visual Plan / image map | `EpisodeMediaMapPanel` and `ImageMapPanel` show package failure, authority unavailable, anchor repair, generation/selection/save errors, preview unavailable, export acknowledgement, progress and retry | Phase 5B controller and canonical package/image-map owners; HearthShell owns the existing 2.6-second export-message timer; retry stays with package/image planning | B/C/F |
| B-roll | `BrollPlanPanel` shows eligibility, ingestion/save/preview errors, retry and progress; operation acknowledgement remains panel input | Phase 5C1 controller owns operation mapping; canonical plan remains Tongs; HearthShell owns the existing 2.6-second `brollMessage` timer | B/C/F |
| Reference Clips | `ReferenceClipPlanPanel` shows processing, canonical membership, save and preview failures | Phase 5C2 controller and existing hooks own ingestion/generation/upload/selection/recovery and retry; no shared queue or dismissal | B/C/F |
| Metadata | `MetadataPanel` shows save/retry, validation/completion, suggestion assignment and tag-added acknowledgements | Phase 5D workspace owns 450 ms autosave/cancellation/recovery; panel owns 1.8-second assignment and 1.5-second recently-added-tag timers plus 3-second “still saving” presentation timer, all cleaned/replaced locally | B/C/F |
| Release preparation | Release surface renders exact checklist state, framing-pack failure/staleness and blocking reasons | Phase 5E controller owns projection and recovery; reasons are durable workflow evidence, not transient notices | C/E/F |
| Ready / collection | `HearthReadyMode`, `HearthReadyQueueRail`, workspace/projects rail and collection surfaces show loading, errors, category errors, remove/restore activity and retry | Phase 3 collection/Ready controller owns commands, stale-operation authority and reset behavior | B/C/F |
| Archive / restore | Episode rows, focus empty/archived state, desktop rail and mobile overlay show archiving/restoring labels, disabled reasons and failures | Collection controller and Phase 2 navigation supply identity-scoped commands/status; there is no shared message lifecycle | B/E/F |
| Modal-local | Compose Setup validation and Create Revision form/confirmation | Existing Phase 6D modal inputs and Phase 4A script owners; close/reset remains local and no notice state enters the modal boundary | D |
| Mobile-overlay-local | `HearthMobileNavigation` delegates editor/Ready overlays with restore, saving, loading and disabled presentation | Phase 2 owns overlay/mode/responsive lifecycle and commands; Phase 6C is stateless presentation | E/F |
| Lazy-load failure | `LazyProductionSurfaceBoundary` renders an alert and retry for the failed lazy surface | React error boundary owns the captured chunk error and retry/remount behavior | B |
| Copy and operation acknowledgements | Script surface copy text, clipboard acknowledgements, image export and panel-local success labels | Existing producer owns text; HearthShell clears three legacy messages after 2.6 seconds, while `useClipboardButtonAcks` owns keyed timers and unmount cleanup | B/F |
| AI runtime warning | Supplied to conversation/production surfaces as an operation warning | Existing AI runtime owner replaces the string; HearthShell clears it after 4 seconds and effect cleanup cancels the active timer | B |

No Hearth-local item has a presentation-owned unique ID or ordering contract.
Apart from the Nursery provider, the product uses independent scalar,
per-entity, or controller status. Repeated scalar messages replace their
owner's prior value; per-candidate errors remain keyed to the candidate;
canonical failures persist until their domain reload/retry succeeds. They do
not share deduplication.

## 4. Ownership and reset findings

Notice-like timers stay with their current lifecycle:

- Nursery Forge notices: severity durations above; provider dismisses,
  cancels individual timers, and clears all timers on provider unmount.
- AI runtime warning: 4 seconds; replacement cancels the prior effect timer.
- image-map export, B-roll acknowledgement, and script copy message:
  2.6 seconds each; replacement/effect cleanup cancels the prior timer.
- source status: 2.2 seconds by default; `useSourcesState` clears before
  replacement and during cleanup.
- Metadata assignment/tag acknowledgements: 1.8/1.5 seconds; local effects
  clean up on replacement/unmount. The 3-second timer changes only the saving
  label.
- STT notices and previews: durations are supplied to and owned by the
  conversation/STT lifecycle; explicit stop, target change and teardown clear
  the timer refs.
- clipboard acknowledgements: keyed timers owned and cleaned by
  `useClipboardButtonAcks`.

Other timers found in these regions drive autosave, persistence debounce,
polling, speech limits, scroll/focus, package-load timeout, or lazy work.
They are not dismissal timers and cannot safely move into presentation.

Identity and navigation resets remain heterogeneous by design. Controllers
clear or reject stale state at workspace/workpiece generation boundaries;
Phase 2 clears navigation/overlay state; modal owners clear modal-local state;
canonical failures survive until domain recovery; the global Forge queue is
cross-tool and is not cleared by Hearth navigation. A shared Hearth renderer
could not impose one reset rule without changing behavior.

Retry is likewise domain-owned: autosave, draft hydration, source refresh,
presence refresh, canonical package/image planning, media ingestion,
Metadata save, collection refresh, and lazy chunk reload are distinct
commands. Dismissal never substitutes for retry or clears canonical failure.

## 5. Classification boundary

- **Class A — shared transient notice:** only the already-existing
  Nursery-owned Forge notice system.
- **Class B — inline domain status:** operation results, STT feedback,
  source status, candidate/media errors, preview failures, and local
  acknowledgements.
- **Class C — canonical failure or authority:** script/package/source/image
  map/media/Metadata/release/presence load and authority states.
- **Class D — modal-local:** Compose Setup and Create Revision validation and
  confirmation.
- **Class E — navigation or availability:** disabled reasons, Anvil readiness,
  archive/restore availability, release blockers, rail and mobile projections.
- **Class F — non-notification:** loading, saving, progress, completion,
  empty-state, counts, and accessibility announcements.

The same CSS color or `role="alert"` does not merge these ownership classes.
In particular, “Preview unavailable,” exact-anchor failures, release blockers,
and validation cannot become transient Forge toasts.

## 6. Why no safe Hearth extraction exists

HearthShell does not assemble shared toast JSX. It supplies domain contracts
to existing surfaces and publishes a small set of long-running operation
events to the already-centralized Nursery provider.

Centralizing the remaining inline states would require at least one prohibited
architectural invention:

- a new Hearth queue/provider/event bus;
- generated IDs, ordering and deduplication for previously independent state;
- moving timer/reset lifecycle away from its producer;
- flattening durable canonical and authority failures into transient messages;
- moving retry or operation-result interpretation into presentation; or
- duplicating the global renderer and changing cross-tool layering.

Therefore no `buildHearthNoticeViewModel`, notice contract, renderer, hook,
context, queue, reducer, or placeholder test was created.

## 7. Production, hook, and bundle proof

No production source, test, stylesheet, generated asset, or
`forge-nav.json` file changed. HearthShell remains byte-for-byte unchanged.
Consequently:

- direct hooks remain 268;
- expanded hooks remain 347;
- expanded SHA-256 remains
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`;
- all six production surfaces remain independently lazy;
- bundle count, sizes, largest chunk and thresholds remain the confirmed
  baseline values;
- no persistence, schema, migration, RPC, query, RLS, repository, canonical
  authority, workflow, modal, desktop rail, or mobile-overlay behavior moved.

## 8. Validation

The audit was traced against the actual Hearth controllers, hooks, surfaces,
panels, shared shell notice provider/renderer, and application mount.
Repository status and the baseline commit were confirmed. Since this is a
report-only Outcome B, no production build or test run was necessary.
`git diff --check` is the required validation for this documentation-only
change.

## 9. Files changed

- `apps/hearth/HEARTH_SHELL_PHASE_6E_REPORT.md` — audit report only.

No commit, push, merge, or deployment is part of Phase 6E.

## 10. Recommended Phase 6F boundary

Audit the remaining **main-content switch presentation** as the next narrow
boundary: the pure selection and prop assembly among Spark bootstrap, Sparks,
Episodes, Ready, Series, and Focus content. Keep Phase 2 navigation/mode
state, Phase 3 collection commands and authority, and all render functions at
their current owners. Extract only if the switch can remain a stateless,
hook-free renderer with supplied content; otherwise document another
Outcome B.
