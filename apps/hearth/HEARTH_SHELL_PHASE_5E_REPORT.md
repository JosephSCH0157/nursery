# HearthShell Refactor Phase 5E Report

## Baseline

- Branch/HEAD: `codex/hearthshell-refactor` at
  `6e9c398e2aba36a3533bffb946479404fa90af68`
- Clean, synchronized worktree
- HearthShell: 6,872 lines, 112 imports, 268 direct hooks
- Expanded proof: 347 hooks,
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- Bundle: 8 chunks, 1,523,310 bytes total, 776,047-byte maximum
- Presentation: lightweight `ReleaseSurface`; no separate release chunk

## Existing path and classification

The preserved path is Phase 2 identity → script approval → shared Episode
Package and established production projections → versioned framing-pack
artifact → four-item release checklist → creator-facing handoff readiness.

The actual checklist contains approved script, activated media plan, canonical
Metadata completion, and selected canonical thumbnail. B-roll and Reference
Clips are not existing release requirements, so Phase 5E does not add them or
infer “not required” from empty arrays. The framing pack is a canonical,
versioned Tongs-backed artifact loaded by `useReleasePrepPackWorkspace`.
Checklist rows, counts, summary, load labels, and readiness are display
projections. Credentials, destinations, scheduling, upload, publishing,
receipts, and external retries are Quench-owned.

## Extraction and authority proof

`useHearthReleasePreparationController.ts` is the typed route owner. It aliases
the existing workspace hook in the original hook position, preserving
automatic hydration, identity reset, request-sequence rejection, missing/error
distinctions, and repository ownership. `buildHearthReleaseChecklist.ts`
projects each existing requirement with an explicit state and reason.
`hearth-release-preparation-contracts.ts` defines artifact, status, checklist,
surface, and immutable handoff sections.

HearthShell no longer imports the release workspace hook or checklist helper,
derives aggregate readiness, or constructs Release surface props. Shared
Episode Package loading remains single-owner. No upstream repository is
imported and no production state is reconstructed from local arrays.

The controller creates no persistence path. Existing framing-pack generation
still runs only through the explicit creator production action with unchanged
AI confirmation, prompts, credits, persistence, and recovery. Generated or
cached display data cannot satisfy a checklist item.

## Fail-closed readiness and staleness

Readiness requires all four nonempty checklist items to be explicitly
`complete`; absence, incomplete state, or unavailable authority blocks it.
Each blocking reason is retained. No preview, browser flag, cached artifact,
local field, suggestion, or vacuous array logic participates.

Artifact staleness is current only when its canonical script version equals
the approved version, stale when both canonical versions differ, and unknown
when no artifact version exists. No timestamp, text, title, or Episode Package
recency heuristic is used.

The frozen handoff contains only workspace/workpiece identity, readiness, and
blocking reasons. It contains no credential, token, destination, upload,
schedule, publish, retry, receipt, or release outcome and exposes no execution
command. Opening or executing Quench was not added.

## Hook and shell metrics

| Metric | Before | After |
| --- | ---: | ---: |
| HearthShell lines | 6,872 | 6,872 |
| Imports | 112 | 112 |
| Direct hooks | 268 | 268 |
| Expanded hooks | 347 | 347 |

Expanded SHA-256 remains
`43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`.

## Bundle

| Metric/surface | Before | After |
| --- | ---: | ---: |
| Chunks | 8 | 8 |
| Total | 1,523,310 | 1,525,096 |
| Largest Hearth chunk | 776,047 | 777,833 |
| Visual Plan | 15,320 | 15,320 |
| Episode Images | 32,420 | 32,420 |
| Thumbnail | 73,190 | 73,190 |
| B-roll | 16,070 | 16,070 |
| Reference Clips | 17,230 | 17,230 |
| Metadata | 8,620 | 8,620 |

All six production surfaces remain lazy. Release remains lightweight eager
composition. Eager growth is 1,786 bytes, below the 10 KB gate.

## Validation and files

- Focused Phase 5E: 5/5 passed
- Hearth typecheck: passed
- Hearth suite: 99 files passed
- Tongs commit API: 135/135 passed
- Nursery build and bundle verifier: passed
- `git diff --check`: passed
- `forge-nav.json`: restored

Changed files are HearthShell, the controller, checklist, contracts, focused
test, and this report. No generated assets, credentials, schemas, migrations,
RPCs, queries, RLS changes, or unrelated files are included.

The final Phase 5 assembly should compose the established immutable controller
outputs only, without absorbing their repositories, hooks, commands, or
authority and without creating Quench execution.

The branch remains at the committed Phase 5D checkpoint. These six Phase 5E
files are uncommitted and unstaged; no commit, push, merge, or deployment was
performed.
