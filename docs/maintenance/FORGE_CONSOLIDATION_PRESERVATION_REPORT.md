# Forge consolidation: preservation and reconciliation report

Checked: 2026-09-13 03:56–04:00 America/New_York.

## Outcome

**Preservation is complete for the inspected, selected material; reconciliation is prepared locally. Removal and live-checkout adoption have not occurred.** Uninspected material remains on explicit hold.

The sole destination remains `D:\nursery\nursery`. No new clone, worktree, runnable source snapshot, or full-source backup was created. No original file/directory was deleted or moved. Neither localhost server was stopped. No push, deployment, migration, paid call, or production configuration change occurred.

## Preserved work

All refs are in the existing canonical Git repository, under `codex/preserve/20260913/`:

| Material | Evidence |
|---|---|
| 31 existing worktree heads | Named preservation refs; exact source-to-ref mapping in protected `history.json` |
| 49 reflog-only commits | Individually anchored; remaining reflog-only commit count is zero |
| Two stashes | Original stash commits anchored without popping or changing them |
| Two independent clones | 164 named ref mappings anchored; no missing reachable commit imports required |
| Six current Hearth edits | `35e5d9a30d48a840fce532953da299f11ec0cb52`; byte-exact capture, original staging/checkout unchanged |
| Original canonical-root edits and initial review/script | `84ff63b70f05f4323994ebf93af7bd0bbd8de374` |
| Hydration-repair tracked delta | `997b35dbc51b63b40351efe7440f5c3708090257`; 56 tracked paths, including deletions |
| Old billing checkout's CLI marker | `af8acb91006b6679f12295006e3b77bb2901cd57` |
| Eight unmatched research-work files | `4bc3cccc42c8bf21f3b4ddbafa70c2114e2557e8`; preserved, not integrated |
| Four other selected snapshot deltas | `aacf8656`, `179e1c4b`, `c59d44fc`, `ae38e8da`; preserved, not integrated |

The raw preservation commits retain original file bytes, including line endings. The reviewed integration uses the repository's normal Git text normalization. Preserving old code does not mean declaring it correct, current, or approved for production.

## Reconciliation prepared, not adopted in running checkout

- Remote main rechecked: `2305dfb6f7e2922f933140c30775f0ef1671c3a7`.
- Reviewed local branch: `codex/consolidation-reviewed-20260913`.
- Prepared integration commit: `035dc7462d45037b9594db76eb8637515afba3a2`.
- Base: current remote main. The six current Hearth files had identical base versions in main and their original release candidate, so no conflicting source integration was required.
- Included: those six tested Hearth edits, canonical Docker/deployment/single-checkout instructions, and the consolidation review/scripts.
- Excluded: historical repair branches, dependency upgrade, old research snapshot changes, generated timestamp changes, private configuration, evidence, and source-cache artifacts.
- Running canonical checkout remains `6f439d69d841fab64379c618a5005db928381fdd` on its original branch. Application files were not switched underneath its server.

The current-to-main transition changes `apps/nursery/vite.config.ts`, which Vite watches and may use to automatically restart its runtime. Checkout adoption is therefore held for an explicit watcher handoff. This report does not claim that the running canonical server already uses the reconciled branch.

The infrastructure task acknowledged no active writes, browser work, or dependence on unchanged 5173 source. The Hearth task was observed idle after coordination messages and its captured files remained unchanged; a specific watcher/server-release acknowledgment was not returned through the task interface. Its live checkout remains on hold.

## Private configuration and evidence

- 360 distinct retained files, **55,348,910 bytes**, verified by content hash.
- Storage: `D:\nursery\nursery\.git\forge-consolidation-private`.
- ACL inheritance is disabled at the store root; access is granted only to the current Windows account and SYSTEM. Retained files inherit that restricted ACL.
- Existing canonical environment files were not overwritten. Conflicting configurations are retained as separate content-addressed files, with source mapping in the protected manifest.
- The store is outside the Git index and deployment source. No secret values or sensitive evidence contents are included in the public review.
- Non-secret `.env` and `.txt` probes: 5173 returned 403; 5199 returned fallback content, not the probe contents. No protected contents were exposed by the tested paths.

Protected records include `history.json`, `deltas.json`, `snapshots.json`, `reconciliation.json`, `removal-manifest.json`, `verification.json`, and `git-connectivity.txt`. These records describe local preservation only; they are not a substitute for Tongs product persistence.

## Verification

- **256 ref mappings verified.**
- **All 31 original Git index hashes unchanged.**
- Captured source files and preserved deletions rechecked against their originals; no late edits detected in the selected material.
- All 360 retained private files rehashed successfully.
- Captured new source blobs checked for high-confidence credential patterns: none found.
- Git connectivity check: exit 0, no errors or warnings; no GC/pruning performed.
- Reconciled tree passes `git diff --check`.
- Focused existing Hearth suite: **19 passed, zero failed**, using mocked requests in the existing release checkout. It covers hydration isolation, late results, duplicate persistence, empty autosave, and explicit clear acknowledgment/failure behavior. No paid operation or database mutation was used.

## Exact removal review and remaining holds

See `FORGE_EXACT_PATH_REMOVAL_REVIEW.md`: **79 exact targets**, comprising **55 preserved candidates pending approval** and **24 HOLD targets**. The count includes source directories, metadata remnants, evidence folders, loose evidence files, and the accidental literal `%SystemDrive%` directory; it is not a revised count of source trees.

Each entry states its resolved path, directory type, preservation refs or retained evidence, file disposition, nested targets, dependencies, removal method, and recoverability. Held relative file paths are listed explicitly; sensitive preservation mappings remain in the protected manifest.

Holds include uninspected archives, large logs/dumps not retained in this bounded pass, historical test artifacts, reparse points, incomplete Git metadata, nested source directories, and the live research checkout. These are not eligible for blanket removal. Inaccessible/cloud locations remain outside the list.

Ports and processes at final check:

- 5173: Node PID 152696, canonical checkout — still running.
- 5199: Node PID 149724, external research release checkout — still running.

PIDs must be revalidated before any later approved process action. Terminal working directories and open handles cannot be fully established from CIM; final per-target dependency checks remain mandatory.

## Next approval boundary

Review the 55 preserved candidates separately from the 24 holds. Actual removals require explicit exact-path approval and fresh source/dependency checks. Adopting the reconciled branch requires a coordinated 5173 watcher transition; retiring 5199 requires its separate handoff. Until then, neither server nor checkout should be removed or silently replaced.

Creator media, Supabase data/volumes/containers, and Docker Desktop remain untouched. Production remains unchanged.
