# HearthShell Refactor Phase 6A Report

## Baseline

- Branch/HEAD: `codex/hearthshell-refactor` at
  `e05ed895165fc38aceb4c596cd0006d7c88a64b1`
- Clean, synchronized worktree
- HearthShell: 6,878 lines, 113 imports, 268 direct hooks
- Expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 chunks, 1,526,462 bytes total, 779,199-byte maximum
- Lazy chunks: Visual Plan 15,320; Episode Images 32,420; Thumbnail 73,190;
  B-roll 16,070; Reference Clips 17,230; Metadata 8,620 bytes

## Presentation extraction

`buildHearthProductionViewModel` is a pure, hook-free presentation projection
over the immutable Phase 5 production controller. It selects the active
Visuals, Metadata, or Release surface; formats the existing production tab
summaries; preserves explicit domain statuses and blocked reasons; and passes
all six established controller surface contracts through by identity.

`HearthProductionContent` renders the existing lightweight Release,
Metadata, and Visuals surfaces from the derived contract. It owns no state,
navigation, controller construction, command implementation, repository
access, canonical loading, persistence, or authority. `HearthDraftMode` now
accepts this production content as one cohesive presentation region.

HearthShell retains every production controller, the shared Episode Package
loader, Phase 2 navigation, and all explicit commands. It no longer selects
the active production surface, composes the six production panel prop bags,
renders the three production surfaces, or formats the Visuals, Metadata, and
Release tab summaries directly.

## Authority and failure proof

Package failure remains distinct from canonical absence in the Phase 5
controller status. All domain status objects and Phase 5E blocking reasons are
passed through without flattening. The view model does not inspect arrays,
previews, cache, or local presentation state to infer eligibility, provenance,
freshness, completion, or not-required state.

Phase 5B still owns the immutable B-roll eligibility input, Phase 5C1 still
consumes it, and Phase 5E still owns release readiness. The release checklist
remains Approved script, Activated media plan, Complete canonical Metadata,
and Selected canonical thumbnail. B-roll and Reference Clips remain outside
that checklist. No Quench execution, publishing, scheduling, credential,
upload, receipt, or Ledger command is exposed.

## Hook and bundle safety

No hook moved or was added. The expanded sequence remains 347 hooks with
SHA-256
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

The presentation component imports the same Release, Metadata, and Visuals
surfaces previously imported by `HearthDraftMode`. Visuals and Metadata retain
their existing lazy loaders and Suspense/error boundaries. The six production
surface chunks remain separate.

| Metric/surface | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,878 | 6,863 |
| Import declarations | 113 | 114 |
| Direct hooks | 268 | 268 |
| Expanded hooks | 347 | 347 |
| Hearth JS chunks | 8 | 8 |
| Total | 1,526,462 | 1,526,597 |
| Largest Hearth chunk | 779,199 | 779,334 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

Eager growth is 135 bytes. Focused Phase 5/6A tests pass 8/8; Hearth
typecheck, the 101-file Hearth suite, Tongs commit API 135/135, Nursery build,
bundle verification, and `git diff --check` all pass. `forge-nav.json` is
restored.

## Phase 6B recommendation

Phase 6B should extract one non-production shell presentation region, with the
desktop rail as the safest next cohesive boundary. Navigation state and
commands must remain owned by Phase 2; mobile overlay, modals, and editorial
presentation should remain separate later slices.

No commit, push, merge, or deployment is part of Phase 6A.
