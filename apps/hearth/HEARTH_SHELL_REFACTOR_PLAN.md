# HearthShell Refactor Plan

Status: proposed  
Scope: `apps/hearth/src/routes/HearthShell.tsx` and directly related Hearth tests  
Authority baseline: `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`, `apps/hearth/AGENTS.md`, and `apps/hearth/HEARTH_CANONICAL_AUTHORITY.md`

## Outcome

Turn `HearthShell` into a small route-level composition root while preserving all current product behavior and Tongs-backed authority.

The target shell should:

- resolve the route and active workspace/workpiece context;
- compose a small number of domain controllers;
- map controller output into existing mode and surface components;
- own only truly shell-level presentation state;
- contain no persistence implementation, canonical-state reconstruction, or production workflow business logic.

This is a structural refactor. It does not authorize schema, migration, RLS, lifecycle, query-semantics, or UX changes.

## Current Baseline

At the time this plan was written, `HearthShell.tsx` contains approximately:

- 8,160 lines;
- 148 imports;
- 88 `useState` declarations/usages;
- 55 effects;
- 71 memos;
- 49 callbacks.

The file currently combines at least six responsibilities:

1. Route, workspace, workpiece, and responsive-shell state.
2. Spark, Episode, Ready, Series, rail, and archive navigation.
3. Draft, script, revision, approval, autosave, presence, and Anvil handoff workflows.
4. Chat, attachments, STT, AI proposal, and compose workflows.
5. Episode package, thumbnails, visual plan, image map, B-roll, reference clips, metadata, and release preparation.
6. Construction of large view prop contracts and final desktop/mobile rendering.

Many leaf hooks and view components already exist. The remaining problem is primarily orchestration: their state, dependencies, callbacks, and output contracts are still assembled in one route component.

## Non-Negotiable Guardrails

- Supabase in the `tongs` schema remains the canonical persisted source of truth.
- Do not introduce new `localStorage`, local files, or in-memory state as persistence.
- Existing local/session storage remains cache or UI preference only.
- Workpiece is the durable production identity; Episode remains the human-facing label.
- Ready remains reversible editorial state, not approval, lock, scheduling, or recording.
- Visual, script, approval, revision, and asset authority must continue through existing Tongs-backed paths.
- Degraded or unavailable authority must remain explicit; it must not become an empty or successful state.
- Do not add a second state library or a global Hearth context during this refactor.
- Do not create one replacement “mega-hook” with the same dependency graph hidden inside it.
- If extraction reveals a need to change persistence semantics, relationships, lifecycle, queries, migrations, or RLS, stop that slice and plan the database change separately.

## Target Structure

Keep the existing `hooks`, `lib`, and `views` organization initially. Add a route-specific orchestration directory without moving stable domain modules merely for aesthetics.

```text
src/routes/
  HearthShell.tsx
  hearth-shell/
    hearth-shell-contracts.ts
    useHearthShellIdentity.ts
    useHearthCollectionController.ts
    useHearthEditorialController.ts
    useHearthProductionController.ts
    useHearthShellNavigation.ts
    buildHearthShellViewModel.ts
    HearthShellContent.tsx
    HearthShellChrome.tsx
```

Responsibilities:

- `useHearthShellIdentity`
  - route workspace/workpiece resolution;
  - active identity and refs;
  - responsive layout and UI preference state;
  - identity reset boundary.

- `useHearthCollectionController`
  - Sparks, Episodes, Ready, and Series collections;
  - archive/restore and Ready queue commands;
  - navigation-safe collection projections;
  - no draft or artifact rows in the left-rail workpiece collection.

- `useHearthEditorialController`
  - draft/session/revision state;
  - autosave, canonical approval, formatting, and repair;
  - sources, presence, chat, attachments, STT, and AI proposals;
  - script, history, and planning surface contracts.

- `useHearthProductionController`
  - canonical episode-package loading;
  - thumbnail, visual-plan, image-map, B-roll, reference-clip, metadata, and release workflows;
  - explicit canonical repair/revalidation after upstream changes;
  - production surface contracts.

- `useHearthShellNavigation`
  - mode, focus tab, workpiece tab, mobile overlay, and guarded transitions;
  - dirty-state navigation prompts;
  - no persistence.

- `buildHearthShellViewModel`
  - pure derivation of labels, badges, summaries, visibility, and component props;
  - no effects, network access, browser storage, or mutation.

- `HearthShellContent` and `HearthShellChrome`
  - desktop/mobile composition;
  - render existing mode/surface components;
  - no domain decisions.

`HearthShell.tsx` should ultimately be a readable composition root, not a workflow implementation.

## Controller Contract Rules

Each controller should expose a typed contract with three sections:

```ts
type ControllerContract<TState, TCommands, TStatus> = {
  state: TState;
  commands: TCommands;
  status: TStatus;
};
```

Contract rules:

- Accept identity and narrow service/controller dependencies, not dozens of unrelated setters.
- Return named commands instead of exposing raw state setters when a transition has domain meaning.
- Keep raw setters only for local form fields.
- Do not return a single untyped object assembled with spreads.
- Do not pass React components or JSX into controllers.
- Do not let controllers call one another indirectly through mutable refs.
- Cross-controller interaction must be an explicit command or immutable input.
- Preserve the existing operation-authority guards for stale async completions.

## Phased Implementation

### Phase 0 — Freeze Behavior and Repair Test Boundaries

Goal: make code movement safe before moving implementation.

Work:

1. Record the current typecheck and focused test baseline.
2. Add characterization coverage for:
   - workspace/workpiece switching;
   - draft hydration and autosave;
   - canonical approval and approval absence;
   - Ready queue transitions;
   - script-version invalidation of downstream visual state;
   - visual-plan apply followed by canonical image-map repair;
   - completed thumbnail preview-path resolution;
   - degraded Tongs/presence/attachment states;
   - desktop and mobile mode selection.
3. Replace tests that inspect `HearthShell.tsx` source text with behavior or module-boundary tests before moving the pinned code.

Known source-coupled tests include:

- `hearth-approval-authority.test.ts`;
- `hearth-dependency-degradation.test.ts`;
- `hearth-expansion-gate.test.ts`;
- `hearth-format-only-wiring.test.ts`;
- `hearth-reference-clips-language.test.ts`;
- `hearth-stabilization-blockers.test.tsx`.

Acceptance:

- Every source-grep assertion that pins movable business logic is replaced or redirected to the owning module.
- Existing unrelated test failures are documented as baseline failures rather than silently changed in this refactor.
- No production behavior changes.

### Phase 1 — Remove Non-Component Material From HearthShell

Goal: reduce noise without changing hook order or runtime behavior.

Extract:

- pure route/query parsers;
- storage-backed UI preference helpers;
- formatting and label helpers;
- planning/session pure helpers;
- rail ordering and display helpers;
- small types and constants;
- `OscilloscopeFill` and its audio/canvas implementation;
- any other standalone component declared before `HearthShell`.

Place helpers in existing domain modules when an obvious owner exists; otherwise use narrow files under `routes/hearth-shell`.

Acceptance:

- No hook inside the main `HearthShell` component changes order.
- Extracted helpers have direct unit tests.
- `HearthShell.tsx` contains the route component and route composition only.
- Typecheck and characterization tests pass.

### Phase 2 — Extract Navigation and Identity

Goal: establish a stable root boundary for every later slice.

Extract:

- route-derived workspace/workpiece identity;
- active mode, focus tab, workpiece tab, and mobile overlay;
- workspace-change reset behavior;
- guarded workpiece-tab transitions;
- route cleanup and active identity refs;
- desktop/mobile shell preference state.

Keep canonical data loading outside this controller. Identity tells other controllers what to load; it does not fabricate domain state.

Acceptance:

- Switching workspaces cannot leak the prior workpiece, draft, presence, or production state.
- Route-driven Spark intake still resolves deterministically.
- Navigation does not write canonical data.
- Navigation tests operate against the extracted controller/module, not HearthShell source.

### Phase 3 — Extract Collection and Queue Orchestration

Goal: move top-level Hearth navigation collections behind the navigation contract.

Extract:

- Spark discovery and forge intake;
- Episode/workpiece summaries and filtering;
- archive/restore actions;
- Ready loading, labeling, ordering, remove/restore, and send-back-to-edit;
- Series projection;
- left-rail and Episode list view models.

Preserve the rule that persistence is not navigation: intermediate sources, revisions, proposals, and AI events must never enter the workpiece rail collection.

Acceptance:

- One canonical workpiece produces one navigation row.
- Spark cleanup never destroys the resulting workpiece.
- Ready behavior remains reversible and Tongs-backed.
- Collection loading failures remain distinct from successful empty collections.
- `HearthShell` no longer imports collection repository functions directly.

### Phase 4 — Extract Editorial Workspace Orchestration

Goal: create one explicit editorial boundary without collapsing its existing leaf hooks.

Move orchestration for:

- draft selection, hydration, editing, conflict handling, and autosave;
- revision history and milestone actions;
- planning session state;
- canonical script approval and publication;
- deterministic formatting and AI repair;
- sources and research;
- presence;
- chat history/runtime, attachments, STT, compose, and proposal application;
- Anvil handoff readiness.

The controller should compose existing hooks such as `useHearthAutosave`, `useApprovalFlow`, `useChatWorkspace`, and the draft/revision lifecycle hooks. It should not reimplement them.

Split the returned contract by consumer:

- `scriptSurface`;
- `chatSurface`;
- `historySurface`;
- `planningSurface`;
- `sourcesSurface`;
- `handoff`;
- `editorialStatus`.

Acceptance:

- Canonical approval cannot be reconstructed from browser cache.
- Unsaved local edits remain explicit.
- AI credit confirmation and non-AI deterministic formatting rules are unchanged.
- Stale async responses cannot update a newly selected workpiece.
- `HearthShell` no longer directly coordinates draft, approval, chat, presence, or revision repositories.

### Phase 5 — Extract Production Workspace Orchestration

Goal: isolate all episode-production preparation behind one authority-aware controller.

Move orchestration for:

- episode-package loading and reset;
- production action dispatch;
- thumbnail progress and canonical preview paths;
- visual-plan generation/application;
- image-map persistence, canonical anchor verification, candidate generation, and previews;
- B-roll and reference-clip workflows;
- metadata/framing and release preparation;
- downstream invalidation when the approved script or visual plan changes.

Continue composing the existing visual hooks. Consolidate repeated long argument lists into narrow typed inputs such as:

- `ProductionIdentity`;
- `ApprovedScriptAuthority`;
- `AiRuntimeAuthority`;
- `EpisodePackageAuthority`;
- `VisualProviderAuthority`.

Acceptance:

- Applying a visual plan cannot report success until the image map is verified against the approved script.
- Completed thumbnail sets read previews from canonical Tongs asset paths.
- Script changes invalidate only the downstream artifacts defined by current contracts.
- Every save/reload continues through the existing Tongs data-access layer.
- No browser/local persistence becomes authoritative.

### Phase 6 — Extract View-Model and Presentation Composition

Goal: remove JSX builders and prop-bag construction from the route.

Move:

- tab summaries and dirty markers;
- media workflow summaries;
- draft header and surface prop construction;
- mode render functions;
- desktop rail props;
- mobile overlay props;
- modal props;
- metadata, visuals, release, and history surface composition.

Use pure builders for derived contracts and components for JSX. Avoid a single 150-property `HearthShellContent` prop interface; pass the domain contracts from the controllers.

Acceptance:

- Presentation components do not query Tongs or browser storage.
- Pure builders are deterministic and testable without rendering React.
- `HearthShell.tsx` contains controller composition plus top-level layout only.
- Desktop and mobile behavior remain equivalent to the baseline.

### Phase 7 — Tighten Boundaries and Delete Transitional Wiring

Goal: finish the refactor instead of leaving two orchestration systems.

Work:

- remove unused imports, duplicate state, refs, callbacks, and compatibility adapters;
- replace raw setters crossing domain boundaries with named commands;
- collapse duplicated canonical refresh/repair callbacks into their owning controller;
- add dependency rules preventing views from importing repos and preventing route composition from importing low-level persistence APIs;
- update Hearth architecture documentation.

Target metrics:

- `HearthShell.tsx`: fewer than 600 lines;
- fewer than 40 imports;
- fewer than 10 direct state/effect hooks;
- zero direct repository/Tongs calls;
- zero production business rules;
- no source-grep tests pinning movable implementation.

These are maintainability gates, not reasons to obscure logic or combine unrelated state.

## Pull Request Strategy

Use small, reversible PRs. A recommended sequence is:

1. Characterization tests and source-test migration.
2. Pure helpers, types, constants, and `OscilloscopeFill`.
3. Identity/navigation controller.
4. Collections/Ready controller.
5. Editorial controller, split into draft/revision and chat/AI sub-slices if needed.
6. Production controller, split by thumbnails, media map/image map, and metadata/release.
7. View-model/presentation extraction.
8. Boundary enforcement and cleanup.

Each PR should:

- move one coherent responsibility;
- avoid opportunistic UX or schema changes;
- preserve public component contracts unless that contract is the explicit slice;
- include its own tests;
- be independently revertible.

Prefer code movement plus small adapters over broad rewrites.

## Verification Gates

Run after every phase:

```powershell
pnpm --filter @nursery/hearth typecheck
pnpm --filter @nursery/hearth test
pnpm --filter @forge/tongs test:commit-api
git diff --check
```

Run the relevant browser/smoke gates for phases that change route, navigation, responsive rendering, or production workflows.

Before final closeout:

- verify Spark -> Workpiece -> Hearth editing -> Ready -> Anvil handoff;
- verify return from Ready to editing preserves workpiece identity;
- verify workspace and workpiece switching under in-flight requests;
- verify cloud reload restores canonical state;
- verify degraded Tongs authority stays explicit;
- verify thumbnail, visual-plan, image-map, metadata, and release workflow progression;
- verify no schema/RLS/local-persistence workaround was introduced.

## Primary Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Hook-order or effect-timing regression | Extract whole cohesive hook blocks; characterize before moving; do not conditionally invoke controllers. |
| Stale workpiece response overwrites current state | Preserve operation-authority tokens and identity checks in controller contracts. |
| Hidden split-brain persistence | Keep repos unchanged initially; require all controller writes to use existing Tongs-backed paths. |
| Giant replacement controller | Enforce narrow domain contracts and consumer-specific outputs. |
| Prop-bag merely moves to another file | Pass controller contracts, then use pure view-model builders close to consuming views. |
| Source-grep tests block movement or provide false confidence | Replace them in Phase 0 with behavior and module-boundary tests. |
| Workspace reset behavior becomes fragmented | Establish identity/reset ownership in Phase 2 before extracting domain controllers. |
| Refactor accidentally changes product flow | One responsibility per PR; no UX, lifecycle, or schema changes in structural slices. |

## Definition of Done

The refactor is complete when:

- HearthShell is a thin, readable route composition root;
- state and effects have clear domain owners;
- navigation, editorial, collection, and production workflows expose typed contracts;
- views receive derived state and named commands without persistence knowledge;
- all canonical state still resolves through Tongs;
- source-coupled tests have been replaced with meaningful behavior tests;
- the full Hearth/Tongs verification gates pass, aside from any separately documented pre-existing baseline failure;
- the lifecycle, navigation, AI, and authority contracts remain unchanged.
