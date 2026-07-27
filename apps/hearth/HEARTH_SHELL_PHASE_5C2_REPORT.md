# HearthShell Refactor Phase 5C2 Report

## 1. Baseline

- Branch: `codex/hearthshell-refactor`
- Starting HEAD: `37f2e2602594ea41903df9535b9ba098f9c44269`
- Starting worktree: clean and synchronized with
  `origin/codex/hearthshell-refactor`
- HearthShell: 6,875 lines, 114 import declarations, 268 direct
  hook/custom-hook calls
- Expanded hook sequence: 347 calls
- Expanded SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Hearth verifier: 8 JavaScript chunks, 1,518,583 bytes total, 771,320-byte
  largest chunk
- Reference Clips lazy chunk: 17,230 bytes

## 2. Existing Reference Clips data path

The preserved path is:

1. Phase 2 supplies active workspace/workpiece identity and operation authority.
2. The shell-owned shared Episode Package loader supplies the canonical
   `cdc_plan` projection.
3. `useReferenceClipWorkspace` owns creator-local prompt, URL, labels, provider,
   context, values, and description drafts.
4. Existing core and bridge command hooks perform explicit create, upload,
   attach, Forge-generation, removal, and selection operations.
5. Those operations persist through the existing Tongs-backed Episode Package
   and B-roll asset APIs.
6. Canonical entries retain ordered membership, candidate assets, source type,
   external-request state, selected asset identity, and provenance.
7. The existing lazy `ReferenceClipPlanPanel` resolves and renews preview paths
   and presents the workflow.

No second route identity resolver, Episode Package loader, or repository was
introduced.

## 3. Source and provenance audit

Canonical state remains the Episode Package `cdc_plan`: entry identity and
ordering, candidate membership and asset identities, selected asset identity,
`source_type`, external-request state, and persisted provenance. Prompt, URL,
provider, label, context, values, and descriptive fields remain local drafts
until an existing explicit command consumes or persists them.

The current implementation preserves creator upload, external URL, and
Forge-generated reference distinctions. Upload continues through the existing
Tongs-backed asset command using the `reference_clip` asset type. URL attach
remains an explicit manual action. Forge generation continues through the
existing canonical image-candidate service and temporary bridge cleanup.
Phase 5C2 adds no claims about verification, ownership, licensing, extraction,
or trimming.

## 4. Responsibilities extracted

One typed controller boundary now owns route-level composition for:

- Reference Clips workspace, core-command, and bridge-command entry points;
- canonical projection and progress derivation;
- local source-value parsing;
- preview-path classification;
- load, authority, command, preview, and completion status;
- retry projection;
- construction of the existing lazy surface contract.

The underlying hooks and command implementations were deliberately retained
unchanged and are re-exported through the controller module, preserving their
hook position, reset timing, stale-operation guards, confirmation behavior,
and persistence semantics.

## 5. Controller and helper boundaries

- `useHearthReferenceClipsController.ts` is the route composition owner and
  compatibility boundary over the existing workspace/core/bridge hooks.
- `hearth-reference-clips-contracts.ts` defines explicit state, command,
  status, progress, preview, and surface sections.
- `buildHearthReferenceClipsViewModel.ts` performs pure canonical projection
  and local comma-separated value parsing.
- `hearth-reference-clips-progress.ts` derives fail-closed canonical progress.
- `hearth-reference-clip-preview.ts` resolves canonical preview choices
  without fabricating a playable video from a raw asset path.

No raw setter is exposed for a canonical transition.

## 6. Shell boundary

HearthShell no longer directly imports the three Reference Clips implementation
hooks or `buildHearthReferenceClipPanelProps`. It consumes the controller
module's typed workspace/command entry points and one assembled controller
surface. The local value parser and completion/status derivation moved to pure
helpers.

The shell continues to own the shared Episode Package load and passes only its
Reference Clips projection, load state, refresh command, and existing surface
inputs to the controller. B-roll, Metadata, and release assembly were not
changed.

## 7. Shared Episode Package decision

`useEpisodePackageLoader` remains single-owner in HearthShell. The controller
does not import it, does not reload canonical state, and does not consume
unrelated package fields. This preserves package projection and identity-reset
timing.

## 8. Upload, attach, and generation authority

The controller aliases, rather than rewrites, the existing command hooks.
Therefore explicit creator action, operation-authority capture, AI confirmation
and credit behavior, provider behavior, canonical asset identity, replay and
conflict handling, partial failure, retry, and creator-visible errors retain
their previous implementation.

No command was added that automatically selects, changes script/image
planning/B-roll state, creates Hammer placements, completes Metadata or
release, or publishes. Downloading, extraction, trimming, and processing
authority did not move into Hearth.

## 9. Selection and preview proof

Completion projection accepts selection only when the selected asset ID is a
member of the entry's canonical candidate set. Selection still uses the
existing Tongs-backed bridge command, so persistence, recovery, ordering,
expected-revision behavior, and provenance remain unchanged.

Preview projection prefers a canonical preview path. A thumbnail may represent
a video preview under the existing rule; a raw video asset path is not
fabricated into a preview. Non-video assets may use their canonical asset path.
The lazy panel retains actual preview loading and time-limited-path renewal.
Preview failure changes neither membership, selection, provenance, ingestion
state, nor completion.

## 10. Completion and no-reference proof

The pure progress projection distinguishes:

- inactive;
- loading;
- authority unavailable or failed;
- successful canonical absence;
- source incomplete;
- selection incomplete;
- complete.

Completion requires an active identity, successfully loaded canonical
authority, at least one canonical reference entry, a non-empty canonical
candidate set for every entry, and a selected ID belonging to each required
entry's canonical membership. Local fields, cached state, preview availability,
upload/generation alone, stale projections, failed loads, unavailable
authority, and empty arrays cannot complete the domain.

No existing explicit canonical “no references required” marker was found.
Consequently successful empty canonical state remains explicitly empty and
fail-closed; Phase 5C2 does not invent vacuous completion.

## 11. Identity and stale-operation proof

All effectful operations still run through the existing core and bridge hooks,
which consume the Phase 2 `operationAuthority` captured for the active
workspace/workpiece generation. Their implementations and call order were not
changed. The shared loader retains identity-scoped projection/reset behavior,
and the controller introduces no asynchronous state of its own. A late
completion therefore cannot be accepted into a newer identity through this
extraction.

## 12. Authority exclusions

Phase 5C1 remains the sole Hearth B-roll controller and no B-roll state or
eligibility is consumed here. Thumbnail, Visual Plan, Episode Images, script,
Metadata, release preparation, recording, and publishing were untouched.
Hammer retains executable placement/timeline authority; Quench retains release
and publishing authority. No schema, migration, RPC, query, RLS, repository, or
persistence semantics changed.

## 13. Hook proof

| Metric | Before | After |
| --- | ---: | ---: |
| Direct HearthShell hook/custom-hook sequence | 268 | 268 |
| Semantically expanded sequence | 347 | 347 |

The existing implementation hooks are invoked through aliases in their
original positions. No hook was added, removed, reordered, or retimed.

Expanded SHA-256 before and after:
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

## 14. HearthShell metrics

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Lines | 6,875 | 6,892 | +17 |
| Import declarations | 114 | 112 | -2 |
| Direct hooks/custom hooks | 268 | 268 | 0 |

The temporary line increase is typed controller wiring; direct imports of four
Reference Clips implementation symbols were removed.

## 15. Bundle proof

| Metric/chunk | Before | After | Delta |
| --- | ---: | ---: | ---: |
| JavaScript chunks | 8 | 8 | 0 |
| Verifier total | 1,518,583 | 1,520,707 | +2,124 |
| Largest eager Hearth chunk | 771,320 | 773,444 | +2,124 |
| Visual Plan | 15,320 | 15,320 | 0 |
| Episode Images | 32,420 | 32,420 | 0 |
| Thumbnail | 73,190 | 73,190 | 0 |
| B-roll | 16,070 | 16,070 | 0 |
| Reference Clips | 17,230 | 17,230 | 0 |
| Metadata | 8,620 | 8,620 | 0 |

The eager graph exchanges the shell's direct Reference Clips hook/prop-builder
imports for the narrow controller and pure projection helpers. No heavy player,
editor, source-form, or presentation dependency entered the eager graph.
Growth is 2,124 bytes, below the 10 KB investigation gate. All six production
surfaces remain independently lazy and bundle thresholds are unchanged.

## 16. Validation

- Focused Phase 5C2 tests: 6/6 passed.
- Full Hearth suite, including existing Reference Clips, Phase 5C1 B-roll,
  Phase 5B image-planning, and prior characterization coverage: 97 files
  passed.
- `pnpm --filter @nursery/hearth typecheck`: passed.
- `pnpm --filter @forge/tongs test:commit-api`: 135/135 passed.
- `pnpm --filter nursery build`: passed.
- `pnpm --filter nursery verify:hearth-bundle`: passed.
- `git diff --check`: passed.

## 17. Files changed

1. `apps/hearth/src/routes/HearthShell.tsx`
2. `apps/hearth/src/routes/hearth-shell/useHearthReferenceClipsController.ts`
3. `apps/hearth/src/routes/hearth-shell/hearth-reference-clips-contracts.ts`
4. `apps/hearth/src/routes/hearth-shell/buildHearthReferenceClipsViewModel.ts`
5. `apps/hearth/src/routes/hearth-shell/hearth-reference-clip-preview.ts`
6. `apps/hearth/src/routes/hearth-shell/hearth-reference-clips-progress.ts`
7. `apps/hearth/tests/hearth-shell-phase-5c2-reference-clips-controller.test.ts`
8. `apps/hearth/HEARTH_SHELL_PHASE_5C2_REPORT.md`

## 18. Restored files

`apps/nursery/public/forge-nav.json` was restored after the production build.
The Anvil mirror remained byte-identical and does not appear in the worktree.
No generated assets, screenshots, caches, credentials, or temporary files are
included.

## 19. Recommended Phase 5D boundary

Phase 5D should extract Metadata orchestration only: creator-local title,
description, tag, chapter, platform, and validation drafts; canonical metadata
projection; explicit generation/save commands; progress; and the existing lazy
Metadata surface contract. Keep the shared Episode Package loader in its
current owner, keep release preparation and Quench outside the slice, preserve
AI confirmation and credit behavior, and make metadata completion incapable of
publishing or declaring release readiness.

## 20. Final repository state

The branch remains `codex/hearthshell-refactor`, synchronized with
`origin/codex/hearthshell-refactor` at the committed Phase 5C1 checkpoint.
Exactly the eight Phase 5C2 files above are uncommitted. Nothing is staged.
No commit, push, merge, or deployment was performed.
