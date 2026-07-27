# HearthShell Refactor: Final Phase 5 Production Assembly

## Baseline

- Branch/HEAD: `codex/hearthshell-refactor` at
  `cde9de325742002ec361e008c170f4ce96370056`
- Worktree was clean and synchronized before implementation.
- HearthShell: 6,872 lines, 112 imports, 268 direct hooks.
- Expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.
- Bundle: 8 chunks, 1,525,096 bytes total, 777,833-byte maximum.
- Lazy chunks: Visual Plan 15,320; Episode Images 32,420; Thumbnail 73,190;
  B-roll 16,070; Reference Clips 17,230; Metadata 8,620 bytes.

## Production assembly boundary

`buildHearthProductionController` is a pure, hook-free route assembly function.
It accepts the existing Thumbnail, Image Planning, B-roll, Reference Clips,
Metadata, and Release Preparation controller contracts and passes their state,
commands, status, and surface objects through without reconstruction. Its
contract keeps those domains separately addressable rather than flattening
their commands or reducing their explicit states to a generic Boolean.

The assembly imports controller contracts with `import type`. It imports no
repository, persistence implementation, domain hook, or lazy presentation
component. It neither loads nor writes canonical data and owns no workflow
authority. Package failure remains an explicit `error` status distinct from a
successfully loaded absent package.

## HearthShell wiring and ownership proof

HearthShell now constructs one production assembly after the six established
controllers and supplies its surface section to the existing surface
composition. The six local aliases that independently re-exposed controller
surface props were removed. Release presentation also consumes the assembly's
release surface.

The shared Episode Package hook, effect, timing, state, and refresh callback
remain in HearthShell. The assembly receives only the immutable package
projection, its four-state load status, and the existing refresh command. It
does not import or invoke the package repository.

All established cross-domain inputs remain upstream of this pure assembly:
approved-script invalidation stays with the established production
controllers; Phase 5B still supplies its immutable B-roll eligibility input to
Phase 5C1; and Phase 5E still receives the established canonical completion
summaries. The assembly does not infer eligibility, provenance, completion, or
freshness from arrays, previews, or cached display data.

## Release checklist and execution boundary

Release readiness, summary, and blocking reasons are passed through from Phase
5E unchanged. Its checklist remains exactly:

1. Approved script.
2. Activated media plan.
3. Complete canonical Metadata.
4. Selected canonical thumbnail.

B-roll and Reference Clips were not added as requirements. The assembly exposes
no Quench execution command and does not generate framing packs, publish,
schedule, or mutate any production artifact.

## Status, hook, and shell metrics

Every domain's original state and status object remains available unchanged,
including loading, absence, incomplete, stale, blocked, failure, authority
unavailable, complete, and existing not-required distinctions.

| Metric | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,872 | 6,878 |
| Import declarations | 112 | 113 |
| Direct hooks | 268 | 268 |
| Expanded hooks | 347 | 347 |

The expanded SHA-256 remains
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.
No runtime hook was added and no existing hook or effect moved.

## Bundle

| Metric/surface | Before | After |
| --- | ---: | ---: |
| Hearth JS chunks | 8 | 8 |
| Total | 1,525,096 | 1,526,462 |
| Largest Hearth chunk | 777,833 | 779,199 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

All six production surfaces remain lazy. The only eager addition is the narrow
pure assembly and its erased type contract. Eager growth is 1,366 bytes, below
the 5 KB gate; no production presentation module entered the eager graph.

## Validation and changed files

- Focused final Phase 5 assembly tests: 4/4 passed.
- Hearth typecheck: passed.
- Hearth suite: 100 files passed.
- Tongs commit API: 135/135 passed.
- Nursery build: passed.
- Hearth bundle verifier: passed.
- `git diff --check`: passed.
- Generated `forge-nav.json`: restored.

The five intended files are HearthShell, the production contract, the pure
assembly builder, the focused behavior test, and this report. No controller,
repository, schema, migration, RPC, query, RLS policy, generated asset,
credential, screenshot, cache, or unrelated file changed.

## Recommended Phase 6 boundary

Phase 6 should extract presentation-only view models one surface or shell region
at a time. Those view models may format labels, badges, counts, and visible
blocked reasons from this immutable assembly, but should remain pure and must
not absorb controller construction, canonical loading, commands, navigation,
or cross-domain authority.

No commit, push, merge, or deployment was performed. The branch remains at the
Phase 5E checkpoint with this five-file Phase 5 assembly slice uncommitted and
unstaged for review.
