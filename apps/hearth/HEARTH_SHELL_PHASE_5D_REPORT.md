# HearthShell Refactor Phase 5D Report

## Baseline

- Branch: `codex/hearthshell-refactor`
- HEAD: `e155b7dbaeef9e4bc3fb01d8eddf898b5df40d89`
- Worktree: clean and synchronized before implementation
- HearthShell: 6,892 lines, 112 imports, 268 direct hooks
- Expanded hooks: 347
- SHA-256: `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 chunks, 1,520,707 bytes total, 773,444-byte largest chunk
- Metadata lazy chunk: 8,620 bytes

## Existing path and authority

The preserved path is active Phase 2 identity → the shell-owned shared Episode
Package loader → canonical `EpisodePackageV2.seo` → local Metadata drafts →
existing explicit edit/save behavior → the existing Tongs-backed Episode
Package save → canonical reload → validation/completion → lazy Metadata panel.
Release preparation consumes only a downstream completion summary.

Canonical platform-neutral fields are title records (including primary and
thumbnail text), tags, short description, and long description. Edited fields
and tag input are local until the existing save path succeeds. Generated title
rows and tag proposals remain suggestions until the creator assigns/applies
them; framing-pack artifacts remain release-preparation inputs outside this
controller. Preview mode, counts, status copy, and tab summaries are
display-only. Destinations, credentials, scheduling, publishing, and receipts
remain platform/release data outside Phase 5D.

## Extraction

`useHearthMetadataController.ts` is the typed route owner. It wraps, rather
than replaces, `useMetadataWorkspace`, preserving its local state, 450 ms
autosave timing, timeout, cancellation, workpiece reset, Tongs persistence,
canonical artifact retention, error behavior, and reload recovery. It also
owns tag-suggestion memoization and panel-contract assembly.

Pure supporting modules define the controller contract, explicit
inactive/loading/absent/failed/unavailable states, canonical progress,
fail-closed completion, display metadata, and the immutable release input.
HearthShell no longer imports the Metadata implementation hook, tag
normalizers/parser/suggestion builder, thumbnail-overlay derivation, or builds
the Metadata panel props.

The shared `useEpisodePackageLoader` remains single-owner in HearthShell. No
repository, loader, schema, migration, RPC, query, or RLS behavior was added.

## Drafts, suggestions, persistence, and conflicts

Local edits remain non-canonical until the existing hook saves them.
Suggestions require the existing explicit creator actions and cannot complete
Metadata or overwrite canonical fields merely by existing. The extraction does
not change AI prompts, providers, confirmations, credits, proposal rejection,
or application behavior.

The existing save implementation remains sole authority for no-change
handling, canonical identity, failure, cancellation, and reload recovery. No
success is fabricated and local edits are not cleared by the controller.
Identity changes still reset drafts through the existing hook, while its
cancelled flag rejects late saves from the prior lifecycle.

## Validation, stale state, and completion

Load states distinguish inactive, loading, canonical absence, failure, and
authority unavailability. Completion requires loaded authority and the
existing canonical title, tag, short-description, and long-description rule.
Dirty/local state, empty fields, generated suggestions, failed or unavailable
loads, and cached canonical-looking data cannot complete.

The current Metadata schema carries no independent approved-script revision
marker, so the controller reports staleness as `unknown` rather than inventing
new invalidation semantics. Existing Episode Package replacement/reset behavior
is unchanged. The immutable downstream input contains only `{ complete }`;
it does not infer release readiness.

## Release boundary

Release-pack loading/generation, readiness checklist composition, destinations,
credentials, platform validation, scheduling, Quench operations, publishing,
and receipts remain outside Phase 5D. Metadata completion is neither release
readiness nor publication. Thumbnail, image planning, B-roll, Reference Clips,
script, recording, Hammer, Quench, and Ledger authority did not move.

## Metrics and hook proof

| Metric | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,892 | 6,872 |
| Import declarations | 112 | 112 |
| Direct hook/custom-hook sequence | 268 | 268 |
| Expanded hook sequence | 347 | 347 |

The implementation hook and suggestion memo remain in their original sequence
positions through typed wrappers. Expanded SHA-256 before and after:
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

## Bundle

| Metric/surface | Before | After |
| --- | ---: | ---: |
| Chunk count | 8 | 8 |
| Total | 1,520,707 | 1,523,310 |
| Largest Hearth chunk | 773,444 | 776,047 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

All six production surfaces remain lazy. The 2,603-byte eager increase is the
typed controller and pure projections and remains below the 10 KB gate.

## Validation

- Focused Phase 5D tests: 6/6 passed
- Hearth typecheck: passed
- Full Hearth suite: 98 files passed
- Tongs commit API: 135/135 passed
- Nursery production build: passed
- Hearth bundle verifier: passed
- `git diff --check`: passed

## Files

Changed:

1. `apps/hearth/src/routes/HearthShell.tsx`
2. `apps/hearth/src/routes/hearth-shell/useHearthMetadataController.ts`
3. `apps/hearth/src/routes/hearth-shell/hearth-metadata-contracts.ts`
4. `apps/hearth/src/routes/hearth-shell/buildHearthMetadataViewModel.ts`
5. `apps/hearth/src/routes/hearth-shell/hearth-metadata-progress.ts`
6. `apps/hearth/tests/hearth-shell-phase-5d-metadata-controller.test.ts`
7. `apps/hearth/HEARTH_SHELL_PHASE_5D_REPORT.md`

`apps/nursery/public/forge-nav.json` was restored. No generated assets,
screenshots, credentials, caches, or temporary files are included.

## Recommended Phase 5E boundary

Phase 5E should extract release preparation only: consume immutable approved
script and production-completion projections, load/recover the existing
framing/release artifact, assemble the release checklist, and expose explicit
handoff readiness. It must keep credentials, platform execution, scheduling,
publishing, receipts, and all Quench authority outside Hearth.

## Repository status

The branch remains `codex/hearthshell-refactor` at the committed Phase 5C2
checkpoint. Exactly the seven Phase 5D files above are uncommitted and
unstaged. No commit, push, merge, or deployment was performed.
