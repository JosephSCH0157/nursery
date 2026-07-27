# HearthShell Refactor Phase 3.5 Report

## Scope and baseline

Phase 3.5 changes loading boundaries only. It is based on Phase 3 commit
`43605a4849af3614b13f4efadbff730caec0a3f2` on
`codex/hearthshell-refactor`.

Baseline bundle evidence:

- static Hearth chunks: 8
- static Hearth total: 1,657,197 bytes
- largest chunk: 909,932 bytes
- margin below the unchanged 910,000-byte limit: 68 bytes

## 1. Original eager import paths

The immediate render composition eagerly reached the optional production UI
through these paths:

```text
HearthShell
└─ HearthDraftMode
   ├─ VisualsSurface
   │  ├─ EpisodeMediaMapPanel       (Visual Plan)
   │  ├─ ThumbnailV3Panel           (Thumbnails)
   │  ├─ ImageMapPanel              (Episode Images)
   │  ├─ BrollPlanPanel             (B-roll)
   │  └─ ReferenceClipPlanPanel      (Reference Clips)
   └─ MetadataSurface
      └─ MetadataPanel
```

`buildVisualsPanelProps.ts` also imported the panel components as runtime
values solely to derive `ComponentProps`. Those imports were presentation
contract edges, not runtime state, and kept the panels reachable from the
eager graph.

Approximate unminified source sizes of the principal candidates were:

| Boundary | Principal module | Source bytes |
| --- | --- | ---: |
| Thumbnails | `ThumbnailV3Panel.tsx` | 80,353 |
| Legacy thumbnail contract edge | `ThumbnailPanel.tsx` | 66,938 |
| Episode Images | `ImageMapPanel.tsx` | 56,417 |
| Reference Clips | `ReferenceClipPlanPanel.tsx` | 30,400 |
| B-roll | `BrollPlanPanel.tsx` | 29,179 |
| Visual Plan | `EpisodeMediaMapPanel.tsx` | 25,202 |
| Metadata | `MetadataPanel.tsx` | 15,625 |

These modules are presentation-, panel-, mutation-control-, or preview-facing.
The lightweight prop contracts remain type-only. Shared runtime authority,
repositories, orchestration state, and canonical data remain eager in their
existing owners.

## 2. Modules and surfaces made lazy

The existing components—not replacement panels—are now loaded through narrow
dynamic imports when their corresponding surface becomes active:

- `ThumbnailV3Panel` for Thumbnails
- `EpisodeMediaMapPanel` for Visual Plan
- `ImageMapPanel` for Episode Images
- `BrollPlanPanel` for B-roll
- `ReferenceClipPlanPanel` for Reference Clips
- `MetadataPanel` for Metadata

`CanonicalThumbnailPreview`, exported by `ThumbnailV3Panel`, follows the same
thumbnail boundary. Panel imports in `buildVisualsPanelProps.ts` are type-only.
The unused legacy `ThumbnailPanel` runtime edge is therefore also absent from
the eager graph; no rendered UI was removed.

## 3. New chunk boundaries

Final Vite output:

| Surface | Chunk | Bytes |
| --- | --- | ---: |
| Thumbnails | `ThumbnailV3Panel-B5upxPl4.js` | 73,189 |
| Episode Images | `ImageMapPanel-D1T81mFx.js` | 32,419 |
| Reference Clips | `ReferenceClipPlanPanel-EYzxXZOK.js` | 17,225 |
| B-roll | `BrollPlanPanel-D62BepRY.js` | 16,072 |
| Visual Plan | `EpisodeMediaMapPanel-DTrmu2Kt.js` | 15,319 |
| Metadata | `MetadataPanel-DTmzPGlS.js` | 8,618 |

Each surface has a direct module entry point. No production barrel combines
the optional panels into a single large lazy chunk.

## 4. State and authority ownership

No state or authority ownership moved. Tongs calls, canonical loading,
production repositories, image-map and thumbnail authority, visual-plan
application, asset selection, script invalidation, and release workflow state
remain in their prior owners. The lazy components receive the same existing
props and callbacks; they do not independently load, reconstruct, or persist
canonical state.

No persistence, schema, migration, RLS, lifecycle, navigation, editorial,
approval, or production-workflow behavior changed.

## 5. Loading and error behavior

Each lazy panel is wrapped by a narrow `Suspense` and error boundary:

- the fallback is confined to the panel layout;
- it exposes `aria-busy="true"`;
- its accessible label says that a production panel is loading, rather than
  claiming canonical data is loading;
- a JavaScript chunk failure renders a surface-local alert;
- the surrounding Hearth route remains mounted;
- existing authority-unavailable and unresolved-domain states remain the
  responsibility of the panel and are not converted to loading success.

Changing to another surface clears a prior chunk-failure boundary state.

## 6. State-preservation proof

`VisualsSurface` retains its existing mounting behavior. It remains mounted
while hidden by the workpiece tab, so its surface-level hooks and state survive
those switches. Within Visuals, the application already rendered only the
active stage panel; lazy loading preserves that existing mount/unmount
boundary rather than introducing a new reset boundary.

The focused test rerenders a loaded lazy panel through the same boundary,
proves its local state remains at the updated value, and proves the authority
object is passed by unchanged identity.

## 7. HearthShell hook safety

`HearthShell.tsx` was not changed and no HearthShell hook was moved or
reordered.

- direct hook sequence before: 304
- direct hook sequence after: 304
- semantically expanded sequence before: 347
- semantically expanded sequence after: 347
- before SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`
- after SHA-256:
  `43637a0f9afe56009d46c0ba0a545a203d5b79a617a32525a4f602733f2d1448`

The expanded sequence and hash are identical.

## 8. Bundle before and after

No threshold changed.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Static chunks counted by verifier | 8 | 8 | 0 |
| Static total counted by verifier | 1,657,197 | 1,497,549 | -159,648 |
| Largest Hearth chunk | 909,932 | 750,286 | -159,646 |
| Margin below 910,000 | 68 | 159,714 | +159,646 |

The largest chunk is 134,714 bytes below the required 885,000 target and
124,714 bytes below the preferred 875,000 target.

The six on-demand production chunks total 162,842 bytes. Including them gives
an eventual lazy-inclusive Hearth total of 1,660,391 bytes across 14 relevant
chunks, still 139,609 bytes below the unchanged 1,800,000-byte total limit.
The verifier reports the static entry graph, while this lazy-inclusive figure
accounts for every new optional panel chunk.

## 9. Modules removed from the largest chunk

The largest chunk no longer contains the runtime implementations and
panel-only dependency graphs rooted at:

- `ThumbnailV3Panel`
- `ThumbnailPanel` (previously an accidental prop-typing runtime edge)
- `EpisodeMediaMapPanel`
- `ImageMapPanel`
- `BrollPlanPanel`
- `ReferenceClipPlanPanel`
- `MetadataPanel`

Lightweight type contracts remain available at compile time; shared production
orchestration remains in the eager graph.

## 10. Test and build results

Final validation:

- focused Phase 3.5 lazy-boundary tests: 4/4 passed
- selected Phase 0–3 characterization and authority tests: 35/35 passed
- `pnpm --filter @nursery/hearth typecheck`: passed
- `pnpm --filter @nursery/hearth test`: passed (88 test files)
- `pnpm --filter @forge/tongs test:commit-api`: passed (135/135)
- `pnpm --filter nursery build`: passed
- `pnpm --filter nursery verify:hearth-bundle`: passed
- `git diff --check`: passed

Focused behavior coverage proves per-surface loader selection, resolution to
the existing panel modules, unchanged authority identity, mounted local state,
and surface-contained chunk failure. Existing characterization tests cover the
unchanged mode, navigation, stale-operation authority, autosave, and
HearthShell hook behavior.

## 11. Files changed

- `apps/hearth/src/components/production/LazyProductionSurfaceBoundary.tsx`
- `apps/hearth/src/hooks/visuals/buildVisualsPanelProps.ts`
- `apps/hearth/src/views/surfaces/hearth-production-surface-loaders.ts`
- `apps/hearth/src/views/surfaces/MetadataSurface.tsx`
- `apps/hearth/src/views/surfaces/VisualsSurface.tsx`
- `apps/hearth/tests/hearth-shell-phase-3-5-lazy-production.test.tsx`
- `apps/hearth/HEARTH_SHELL_PHASE_3_5_REPORT.md`

## 12. Unrelated and generated changes

Build-generated `apps/nursery/public/forge-nav.json` timestamp churn was
restored. No generated bundle output, cache, screenshot, credential, schema,
migration, RLS, or unrelated file is part of the Phase 3.5 diff. Pre-existing
work outside this slice was not modified.

## 13. Recommended Phase 4A boundary

After Phase 3.5 is reviewed and committed, the next slice should begin with
the cohesive editorial controller boundary already identified by the refactor
plan. Keep its canonical load/persist authority in the current domain owner,
formalize its inputs and outputs first, and extract orchestration without
changing hook order, reset timing, approval behavior, or production state.
Phase 4A should not absorb any of the production-controller ownership
deliberately left in place here.

## 14. Branch and worktree status

- branch: `codex/hearthshell-refactor`
- base/HEAD: `43605a4849af3614b13f4efadbff730caec0a3f2`
- worktree: intentionally dirty with only the uncommitted Phase 3.5 files
  listed above
- commit/push/merge/deploy: not performed
