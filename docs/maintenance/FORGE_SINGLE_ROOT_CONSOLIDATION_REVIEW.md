# Forge single-root consolidation — review only

## Current local commit-construction checkpoint — 2026-09-13 21:23 EDT

This section supersedes historical branch/count/working-state checkpoints below. **Local commit construction only**: no release, PR, merge, or authorization to push.

- Sole canonical source: `D:\nursery\nursery`, branch `codex/consolidation-reviewed-20260913`; no checkout switch.
- Original HEAD: `ef24f0d1e352a97960409bb636b050e6fb1844ff`. Remote main unchanged: `2305dfb6f7e2922f933140c30775f0ef1671c3a7`. Local main unchanged: `cdf497001ad0959aa9fec9bccca74467fda01d81`.
- Non-secret working checkpoint: `8d9bc4d0d4c5b55c9b5d088154f66a8e027aae10`, at `refs/heads/codex/preserve/20260913/reconciliation-reviewed-working-before-local-commits`, capturing the 38 reviewed paths.
- **272 preservation refs**: all previous 271 unchanged plus the authorized checkpoint. Only two ordinary local branches and `origin/main` remotely remain.
- Isolated indexes construct exact reviewed paths/hunks. The originally empty real staging area is synchronized to each commit without rewriting source. Stat-cache refreshes were verified against identical index trees; a refused two-tree index update during commit 2 was completed using verified exact-path index entries. No application or staging content was lost.
- Application bytes remain identical to the checkpoint. Deliberate final differences are the approved navigation timestamp and these three audit finalizations, apart from ordinary Git line-ending normalization.
- Four private environment files remain excluded and byte-identical. Necessary private evidence stays in the existing restricted ignored store. No private machine-readable manifests, auth state, dumps, caches, or build output enter these commits.
- The 16 one-off maintenance utilities remain present, untracked, and unchanged. No further source-root or branch deletion.
- Both development servers remain stopped. No production SQL, provider call, push, PR, merge, deployment, or local-main change.
- Combined verification follows the sixth documentation commit. **This checkpoint asserts no new combined/full-chain PASS.** The completion report and protected local verification records provide actual results; previous certification below remains historical.

### Constructed local commits

| Order | Commit | Subject |
| --- | --- | --- |
| 1 | `234f13c66b1fa627bce080f9a4722258b55eceec` | fix(tongs): preserve staged thumbnail attachment authority |
| 2 | `3717cfb95ceb4c5c3cbba17204b32083e1b28f0c` | fix(hearth): recover discovery without stale identity mutations |
| 3 | `3356b1b3a2aa3af2a8d29ec724372f7bb3e1d5a3` | fix(anvil): enforce bounded visual recovery ownership |
| 4 | `319d574c441b6f9de7e750cc7a06bdbe43c59b1d` | feat(hammer): persist canonical cleanup discard decisions |
| 5 | `cd2aa72481b3e98bdbe6efbcf6d7eda699efa426` | chore(nursery): remove generated navigation timestamp churn |
| 6 | This documentation commit; SHA in completion report | docs(maintenance): finalize local consolidation checkpoint |

Commit 1 contains all six thumbnail-only hunks, including its pointer helpers, and no Hammer authority. Commit 4 adds only the remaining Hammer delta. Earlier Hearth work at `035dc746` remains ancestral. The four interdependent ASR repairs stay together; deferred/rejected historical behaviors were not restored.

Navigation working timestamp `2026-09-13T08:20:08.976Z` (parent `2026-09-13T08:06:08.497Z`) is corrected to remote main's `2026-09-07T22:10:55.458Z`. Every other navigation field already matched remote main. No regeneration or rewrite of `d6369e9c`.

Migration ordering remains `20261010120000_tongs_owner_funded_hearth_research.sql`, `20261010130000_tongs_owner_hearth_research_permissions.sql`, then `20261011120000_tongs_hammer_cleanup_review_decisions.sql`. The new migration's raw SHA-256 is `a2edc9bb892f5c0079d21fc8177610edd8b2e3c42a302de087df30b7931c63d1`. No production application in this phase.

## Historical checkpoints

## Final quarantine branch — retired 2026-09-13, 20:59 EDT

This explicitly approved local-only closure supersedes the quarantine branch's ordinary survivor status in the historical entries below. The read-only semantic review inspected its one unique commit and all 165 changed paths. No forward-port was required: legitimate persistence/readiness/verification objectives have stronger canonical implementations; the client-clock migration was explicitly rejected; remaining import standardization and historical diagnostics are not retirement prerequisites. No historical code or SQL was restored.

- Deleted only `refs/heads/codex/quarantine-nursery-authority-candidate-20260713`, verified tip `04c604c82779af6f5654ac5908a26f19b7ec9d5a`.
- Successful deletion at `2026-09-13T20:58:45.6356643-04:00` used `git update-ref --no-deref -d refs/heads/codex/quarantine-nursery-authority-candidate-20260713 04c604c82779af6f5654ac5908a26f19b7ec9d5a`. No remote mutation or push occurred.
- Fresh baseline checks at `2026-09-13T20:57:35.1205353-04:00` and immediately before deletion at `2026-09-13T20:58:21.4041303-04:00` matched the reviewed state: all 58 captured working/untracked/private hashes, index, configuration, branch/HEAD, sole worktree, and all 271 preservation refs.
- The target was not symbolic and no worktree owned it. Fresh GitHub checks found no open PR head/base dependency, no active branch workflow, and no remote counterpart. The live remote contained only main.
- The app listing returned only this executing canonical task active and no unavailable hosts. No other visible active task dependency was identified; historical names/references were not treated as active dependencies. This finding is limited to the app state returned by the inspection.
- Post-deletion checkpoint `2026-09-13T20:59:04.0302903-04:00` showed exactly the authorized ref removed. All 58 captured file hashes, index, and configuration remained unchanged before this audit insertion. All approved uncommitted Hearth/ASR/Hammer/Tongs repairs and migration work remain intact.
- Both existing exact-tip preservation refs below still resolve to `04c604c82779af6f5654ac5908a26f19b7ec9d5a`. All 271 preservation refs remain unchanged. Historical traversal found 27,503 reachable objects and zero missing objects; no new preservation ref was needed.

Exact-tip anchors:

- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-codex-quarantine-nursery-authority-candidate-20260713`
- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-codex-quarantine-nursery-authority-candidate-20260713`

Canonical checkout remains `D:\nursery\nursery`, branch `codex/consolidation-reviewed-20260913`, HEAD `ef24f0d1e352a97960409bb636b050e6fb1844ff`, with one registered worktree.

**273 local branches = 271 preservation refs + two ordinary local branches:**

- `codex/consolidation-reviewed-20260913` -> `ef24f0d1e352a97960409bb636b050e6fb1844ff`
- `main` -> `cdf497001ad0959aa9fec9bccca74467fda01d81`

**One ordinary remote branch:** `origin/main` -> `2305dfb6f7e2922f933140c30775f0ef1671c3a7`. Symbolic `origin/HEAD` is excluded. Local and remote main retain their pre-existing different tips; no main/reconciliation integration was begun.

No action was skipped. This audit insertion is the sole working-file change. No source/test/migration edits, other documentation changes, staging, commit, merge, cherry-pick, push, deployment, server/database/provider operation, pruning, or garbage collection occurred. Historical migration deployment assertions remain limited to the recorded evidence; this closure did not inspect or change a live database.

## Hammer Week 4 signoff branch — retired 2026-09-13, 20:41 EDT

This explicitly approved local-only closure supersedes the signoff branch's ordinary survivor status below. The read-only review found one unique documentation commit: the March 29 Week 4 signoff and two links to it. It contained no still-required application/test behavior or current documentation requiring a forward-port. Its historical passed statements were not treated as certification of today's working tree.

- Deleted only `refs/heads/codex/hammer-week4-signoff-docs`, expected and verified tip `e140fc6162da1748e48014171c84a7373fc6b8af`.
- Successful deletion at `2026-09-13T20:40:57.9170439-04:00` used `git update-ref --no-deref -d refs/heads/codex/hammer-week4-signoff-docs e140fc6162da1748e48014171c84a7373fc6b8af`. No remote deletion or push occurred.
- The preflight at `2026-09-13T20:40:19.0140682-04:00` matched the reviewed state. All 58 captured dirty/untracked/private file hashes, index, configuration, branch/HEAD, worktree ownership and 271 preservation refs were revalidated, then checked again immediately before deletion.
- No worktree owned the branch; it was not a symbolic ref. Fresh GitHub checks found no open PR head/base dependency and no active branch workflow. Live remote inspection found no counterpart.
- App inspection returned only the executing canonical task active, with no unavailable hosts/sources. No other visible active task dependency was identified; that statement is limited to the returned app listing, not inferred from historical task references.
- Post-deletion checkpoint `2026-09-13T20:41:17.7053196-04:00` showed only the authorized local ref absent. All 58 captured file hashes, index and configuration were unchanged before this audit addition. All approved uncommitted Hearth/ASR/Hammer repairs, including the new cleanup-review migration, remain intact.
- Both existing exact-tip anchors below still resolve to `e140fc6162da1748e48014171c84a7373fc6b8af`. All 271 preservation refs are unchanged. Historical traversal found 13,602 reachable objects and zero missing objects.

- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-codex-hammer-week4-signoff-docs`
- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-codex-hammer-week4-signoff-docs`

Canonical checkout remains `D:\nursery\nursery`, branch `codex/consolidation-reviewed-20260913`, HEAD `ef24f0d1e352a97960409bb636b050e6fb1844ff`, with one registered worktree.

**274 local branches = 271 preservation refs + three ordinary local branches:**

- `codex/consolidation-reviewed-20260913` -> `ef24f0d1e352a97960409bb636b050e6fb1844ff`
- `codex/quarantine-nursery-authority-candidate-20260713` -> `04c604c82779af6f5654ac5908a26f19b7ec9d5a`
- `main` -> `cdf497001ad0959aa9fec9bccca74467fda01d81`

**One ordinary remote branch:** `origin/main` -> `2305dfb6f7e2922f933140c30775f0ef1671c3a7`; symbolic `origin/HEAD` is excluded from the count. The live remote listing contains only main.

No action was skipped. This audit insertion is the sole working-file change. No source/test/migration changes, new preservation refs, staging, commit, merge, cherry-pick, push, deployment, database action, server action, pruning or garbage collection occurred. Quarantine review and main/reconciliation work were not begun.


## Resolved Hammer/Anvil historical family — retired 2026-09-13, 20:11 EDT

This mechanical closure supersedes the unresolved Hammer/Anvil branch entries and branch counts below. It follows the approved current-canonical durable cleanup-review repair; no historical source was merged or cherry-picked. The repair's migration and application changes remain uncommitted and undeployed.

### Exact refs and guarded results

| Exact branch | Reviewed and verified tip | Remote deletion (EDT) | Local deletion (EDT) |
| --- | --- | --- | --- |
| `anvil-hammer-recording-smoke` | `1023f637a0d0ae0a5e6c05db201384046400b480` | 20:09:44; absent verified | 20:10:33; absent verified |
| `hammer-ingest-followup` | `2915470344c41cc2db9513cf362666d3dad746b7` | 20:09:52; absent verified | 20:10:38; absent verified |

Each remote deletion used `git -c push.followTags=false push --porcelain --force-with-lease=refs/heads/<exact-name>:<exact-reviewed-SHA> origin :refs/heads/<exact-name>`. Each local deletion used `git update-ref --no-deref -d refs/heads/<exact-name> <exact-reviewed-SHA>`. No broad deletion, unconditional force, code/tag push, or separate remote-tracking cleanup was used. Git removed the corresponding remote-tracking refs during the successful remote deletions. No target was skipped.

### Preservation and dependency evidence

The review/checkpoint tips matched the live remote, local refs, and the prior semantic review. Both tips retain their two pre-existing exact-tip anchors; no preservation ref was created, moved or deleted:

- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-anvil-hammer-recording-smoke` -> `1023f637a0d0ae0a5e6c05db201384046400b480`
- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-anvil-hammer-recording-smoke` -> `1023f637a0d0ae0a5e6c05db201384046400b480`
- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-hammer-ingest-followup` -> `2915470344c41cc2db9513cf362666d3dad746b7`
- `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-hammer-ingest-followup` -> `2915470344c41cc2db9513cf362666d3dad746b7`

- Baseline `2026-09-13T20:08:30.2614375-04:00` matched the completed repair checkpoint. Fresh pre-deletion checks were repeated for each ref.
- Canonical directory: `D:\nursery\nursery`; sole registered worktree; current branch `codex/consolidation-reviewed-20260913`; unchanged HEAD `ef24f0d1e352a97960409bb636b050e6fb1844ff`. No target branch was checked out or symbolic.
- GitHub reported no open PRs. Fresh, paginated branch workflow listings reported no active runs for either branch. Repository workflow configuration contained no explicit reference to either target.
- Fresh app listing showed only the executing canonical task active, with no unavailable hosts/sources. No other visible active task dependency was identified. This is limited to the app's returned listing; historical task references were not treated as active dependencies.
- Post-deletion checkpoint `2026-09-13T20:11:04.9645609-04:00`: all 58 captured dirty/untracked/private file hashes, index, local Git configuration, canonical branch/HEAD and worktree ownership were unchanged. This includes the new Hammer migration, durable cleanup-review work, and all approved Hearth/ASR repairs.
- All 271 preservation refs retain their exact prior targets. Read-only traversal of the two preserved historical tips found 21,511 reachable objects and zero missing objects.
- Fresh live remote listing contains only `refs/heads/main` at `2305dfb6f7e2922f933140c30775f0ef1671c3a7`. Local `origin/main` and symbolic `origin/HEAD` retain that target.
- This audit insertion is the only working-file change in the retirement operation. No application/test/migration edit, staging, commit, checkout switch, integration, deployment, database/provider call, server action, pruning, or garbage collection occurred. Local branch configuration was preserved rather than edited as incidental cleanup.

### Semantic prerequisite and remaining branches

The sole required behavior from this historical family—durable revision-bound cleanup discard intent—was forward-implemented using append-only Tongs authority, authenticated server verification, a transactional RPC, RLS, exact-basis restoration, and existing history-owned approvals. Carried-forward evidence: 38 focused Hammer tests, one actual HTTP-handler test, isolated PostgreSQL migration/RPC/RLS verification, Hammer/Tongs/Nursery server typechecks, and targeted lint/diff checks passed. No new test campaign or implementation was performed during retirement. Production application of that migration remains outside this closure.

**275 local branches = 271 preservation refs + four ordinary local branches:**

| Ordinary local branch | Unchanged tip |
| --- | --- |
| `codex/consolidation-reviewed-20260913` | `ef24f0d1e352a97960409bb636b050e6fb1844ff` |
| `codex/hammer-week4-signoff-docs` | `e140fc6162da1748e48014171c84a7373fc6b8af` |
| `codex/quarantine-nursery-authority-candidate-20260713` | `04c604c82779af6f5654ac5908a26f19b7ec9d5a` |
| `main` | `cdf497001ad0959aa9fec9bccca74467fda01d81` |

**One ordinary remote branch:** `origin/main` (symbolic `origin/HEAD` is not a branch count). Local main and remote main retain their pre-existing different tips; no synchronization or integration was attempted. The signoff-docs and quarantine branches were not reviewed or changed in this operation.


## Final ASR historical remote retirement — completed 2026-09-13, 18:24 EDT

This explicitly approved closure supersedes the unresolved `origin/ASR_final_tuning` entries and preservation/remote branch counts below. Prior records remain historical evidence. No application source, tests, Hearth work, or ASR behavior was changed in this operation.

### Exact-tip preservation and guarded deletion

- Expected and freshly verified live remote tip: `1b19cc770a9a6d2e8b8cd8228727a29c86f04bb5`.
- Created only `refs/heads/codex/preserve/20260913/asr-final-tuning-exact-tip` at `2026-09-13T18:22:36.8624697-04:00`, targeting that exact commit. `git update-ref --no-deref` used an all-zero expected old SHA, requiring the ref to be absent. The commit object and live remote tip were checked before creation; the resulting exact target and count of 271 were verified afterward.
- All original 270 preservation refs remained identical to both the protected preservation manifest and this operation's baseline. No existing preservation ref was altered.
- Deleted only `refs/heads/ASR_final_tuning` at `2026-09-13T18:23:38.2650921-04:00` using the exact lease-bound command below. No unconditional force, code/tag push, other remote deletion, or pruning was performed.

```text
git -c push.followTags=false push --porcelain --force-with-lease=refs/heads/ASR_final_tuning:1b19cc770a9a6d2e8b8cd8228727a29c86f04bb5 origin :refs/heads/ASR_final_tuning
```

The push succeeded. Fresh live listings confirmed the remote branch absent; Git also removed its corresponding local remote-tracking ref. No separate tracking-ref cleanup was needed. No action was skipped and no unexpected result occurred.

### Semantic disposition prerequisite

The preceding read-only review covered all 34 ancestry-unique commits and 22 affected paths against the canonical working tree, including its approved uncommitted repairs:

| Historical behavior/material | Final disposition |
| --- | --- |
| Reanchor landing scheduling ownership/invalidation | Forward-ported and verified in current working source |
| Backward visual ownership and final revalidation | Forward-ported and verified in current working source |
| Post-commit measured visual completion | Forward-ported and verified in current working source |
| Packet-scoped pending-reanchor continuity | Forward-ported and verified in current working source; historical renewable lease implementation superseded |
| Startup visual bridge | Deferred policy/design question; not a demonstrated correctness prerequisite |
| Blanket final-packet freshness substitution | Rejected; existing narrower canonical authority remains unchanged |
| Historical pocket/geometry/read-ahead/nudge tuning | Experimental/future UX tuning, not correctness authority |
| Broader short-line reason matching/release policy | Deferred policy expansion; not ported |
| Remaining diagnostics, tests, logs, generated output and timestamps | Nonessential historical evidence, already-covered behavior, or superseded implementation; not restored |

No still-required forward-port remained. Existing verification was carried forward; no coding slice or test campaign was started during retirement.

### Fresh dependency and unchanged-state gates

- Baseline `2026-09-13T18:21:51.7719337-04:00` matched the final semantic review: canonical branch/HEAD, all 46 captured dirty/untracked/private file hashes, index, local Git configuration, local refs, live remote refs, and single worktree ownership.
- Immediately before deletion, baseline `2026-09-13T18:23:32.3307898-04:00` confirmed only the approved new anchor differed. Exact remote SHA, exact anchor, descendant ancestry, canonical branch/HEAD and worktree ownership were rechecked in the deletion command.
- No local `ASR_final_tuning` branch existed. No open PR used it as head or base; branch workflow checks found no active run. Repository workflow files contained no explicit reference to this branch.
- Fresh app inspection returned only the executing canonical task active, with no unavailable hosts/sources. No other active task dependency was identified. Task visibility is limited to the returned app listing; historical task references were not treated as active dependencies.
- Post-deletion baseline `2026-09-13T18:24:08.6758454-04:00` confirmed only the new preservation ref and the approved live remote disappearance changed. All 46 file hashes, index, status, configuration, other local refs, and other live remote tips remained unchanged before this audit insertion.
- Canonical directory remains `D:\nursery\nursery`, branch `codex/consolidation-reviewed-20260913`, HEAD `ef24f0d1e352a97960409bb636b050e6fb1844ff`, with one registered worktree. Both completed Hearth repairs and all four approved uncommitted ASR repairs remain intact. Ports 5173 and 5199 remained stopped.
- This insertion in the established audit is the only working-file change authorized/performed. No staging, commit, checkout switch, merge, cherry-pick, deployment, database/provider call, server action, garbage collection, or unrelated branch review occurred.

### Recovery coverage

The new exact-tip ref and all three pre-existing descendant refs remain intact:

- `refs/heads/codex/preserve/20260913/asr-final-tuning-exact-tip` -> `1b19cc770a9a6d2e8b8cd8228727a29c86f04bb5`
- `refs/heads/codex/preserve/20260913/reflog-5b26c7d97b194d976b886ad105eafb90ed696966` -> `5b26c7d97b194d976b886ad105eafb90ed696966`
- `refs/heads/codex/preserve/20260913/reflog-72baf654ffcb7828af24c2b14e2eb47f5151a085` -> `72baf654ffcb7828af24c2b14e2eb47f5151a085`
- `refs/heads/codex/preserve/20260913/reflog-e09e2525bda3eb7dc348babef424290e8379cf5c` -> `e09e2525bda3eb7dc348babef424290e8379cf5c`

Read-only `git rev-list --objects --missing=print` from the exact-tip anchor traversed 26,833 reachable objects with zero missing objects. Historical commits, source/test blobs, JSON logs, diagnosis CSV and generated artifacts remain reachable without the ordinary remote branch. This is object-availability evidence, not a new runtime certification.

### Remaining ordinary branches

**277 local branches = 271 preservation refs + 6 ordinary local branches:**

- `anvil-hammer-recording-smoke`
- `codex/consolidation-reviewed-20260913`
- `codex/hammer-week4-signoff-docs`
- `codex/quarantine-nursery-authority-candidate-20260713`
- `hammer-ingest-followup`
- `main`

**3 ordinary remote branches**, excluding symbolic `origin/HEAD`:

- `origin/anvil-hammer-recording-smoke`
- `origin/hammer-ingest-followup`
- `origin/main`

Their tips are unchanged. This closes only the ASR historical branch; it does not begin Hammer/Anvil review or the connections audit.

## Resolved local ASR backup closure — completed 2026-09-13, 15:35 EDT

This explicitly approved local-only closure supersedes the two ASR backup survivor entries and ordinary local branch counts below. Earlier records remain historical evidence. No ASR implementation or test was changed; `origin/ASR_final_tuning` remains unresolved and excluded.

| Exact deleted local ref | Expected and verified tip | Deletion time (EDT) |
| --- | --- | --- |
| `refs/heads/backup/codex-asr-late-regime-proof-prefix` | `f4e7870fab5c0bf15ffa00595cb3037a1eb18836` | `2026-09-13T15:35:02.5342344-04:00` |
| `refs/heads/backup/codex-asr-late-regime-proof-sync-fix` | `bfdb0adf605463ddc83a064c3684d235b76c8521` | `2026-09-13T15:35:07.0333751-04:00` |

Each deletion used `git update-ref --no-deref -d <exact-ref> <expected-SHA>` independently, with atomic expected-tip protection. Both succeeded; no deletion was skipped. No remote ref was deleted or pushed.

### Incorporation and preservation

The preceding read-only semantic review established that prefix runtime/test changes match canonical ancestor `e9b02a8562a23f33997759fed7bee1941e2f8afd` (source/test stable patch ID `34f70f3276cdfaac1111936e5336b1945157d56e`), and sync-fix matches canonical ancestor `8a2f32a054dfca21396a004aa8a8ad13ecf7ee1f` (stable patch ID `edce8d960dad02fd36108d0bfb0b73dfb64eebc5`). Unmatched material is logging/evidence-only. No application forward-port was required for these two refs.

These four existing preservation refs resolve to the exact respective deleted tips, two per branch, before and after closure:

- Prefix: `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-backup-codex-asr-late-regime-proof-prefix`
- Prefix: `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-backup-codex-asr-late-regime-proof-prefix`
- Sync-fix: `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-backup-codex-asr-late-regime-proof-sync-fix`
- Sync-fix: `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-backup-codex-asr-late-regime-proof-sync-fix`

All 270 preservation refs matched both the prior reviewed state and their protected original targets. Historical source and log objects remain reachable; no new preservation refs or archives were created and no pruning or garbage collection occurred.

### Fresh guards and unchanged working state

- Baseline at `2026-09-13T15:34:07.1728367-04:00` matched the completed ASR review at `2026-09-13T15:17:12.7159947-04:00`: branch, HEAD, all 40 captured dirty/untracked/private file hashes, index, status, local Git configuration, local refs, live remote refs, and worktree ownership.
- Immediately before each deletion, fresh baseline comparison, exact-tip and two-anchor checks, worktree ownership checks, app task inspection, open PR head/base checks, and active branch-workflow checks passed. Only this canonical task was active among returned Codex tasks, with no unavailable hosts/sources; no active dependency was found. These are point-in-time dependency checks, not deletion of historical task references.
- Live remote listings confirmed neither backup has a remote counterpart. `origin/ASR_final_tuning`, both its local tracking ref and live remote branch, remained exactly `1b19cc770a9a6d2e8b8cd8228727a29c86f04bb5`.
- Post-deletion verification at `2026-09-13T15:35:26.1054503-04:00` confirmed only the two approved refs were removed. All 40 file hashes, index, status, configuration, and remaining refs were unchanged before this audit addition. Both completed uncommitted Hearth repairs remain intact.
- Canonical checkout remains `D:\nursery\nursery`, branch `codex/consolidation-reviewed-20260913`, HEAD `ef24f0d1e352a97960409bb636b050e6fb1844ff`, with exactly one registered worktree. This audit insertion is the only authorized working-file change. No source/test changes, staging, commit, checkout switch, merge, deployment, database/provider calls, or server actions occurred.

### Current ordinary branches

**276 local branches = 270 protected preservation refs + 6 ordinary local branches:**

- `anvil-hammer-recording-smoke`
- `codex/consolidation-reviewed-20260913`
- `codex/hammer-week4-signoff-docs`
- `codex/quarantine-nursery-authority-candidate-20260713`
- `hammer-ingest-followup`
- `main`

**4 ordinary remote branches**, excluding symbolic `origin/HEAD`:

- `origin/ASR_final_tuning`
- `origin/anvil-hammer-recording-smoke`
- `origin/hammer-ingest-followup`
- `origin/main`

The remaining ASR tuning branch was not modified, deleted, or forward-ported. Its unresolved semantic disposition requires separate approval; this closure does not resolve that branch or the other ordinary branch families.

## Final ordinary Hearth historical-ref closure — completed 2026-09-13, 15:07 EDT

This explicitly approved local-only closure supersedes the production-ready survivor entry and branch counts below. Earlier audit entries are retained as historical evidence. Exactly `refs/heads/codex/hearth-production-ready`, expected tip `b4f1b734d3450f4b79ea8a458e9ca33e264ecbf7`, was deleted at `2026-09-13T15:07:31.2223373-04:00` using:

```text
git update-ref --no-deref -d refs/heads/codex/hearth-production-ready b4f1b734d3450f4b79ea8a458e9ca33e264ecbf7
```

The exact-SHA compare-and-delete succeeded. No other ref mutation or remote push occurred; there were no skips or uncertain outcomes.

### Guarded preservation and dependency evidence

- Canonical directory/branch/HEAD remained `D:\nursery\nursery`, `codex/consolidation-reviewed-20260913`, `ef24f0d1e352a97960409bb636b050e6fb1844ff` throughout. Exactly one registered worktree remained; none owned the deleted branch.
- Fresh pre-deletion comparisons matched the reviewed 14:57:51 EDT state: all 40 captured dirty/untracked/private file hashes, staging/index hash, local Git configuration, status, worktree ownership, and all branch tips. Both completed uncommitted Hearth repairs (thumbnail staging/reconciliation and discovery recovery/cancellation) remained intact.
- All 270 preservation refs matched their original protected targets. These three existing refs independently resolved to the exact deleted tip before and after deletion:
  - `refs/heads/codex/preserve/20260913/d-nursery-hearth-production-ready-head`
  - `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-refs-remotes-origin-codex-hearth-production-ready`
  - `refs/heads/codex/preserve/20260913/clone-c-users-iam11-documents-codex-2026-09-12-next-bounded-owner-funded-hearth-research-repo-refs-remotes-origin-codex-hearth-production-ready`
- Current app task inspection found only the executing canonical task active among returned Codex tasks; the historical Hearth readiness task remained not loaded. No active branch dependency was identified. Open PR head/base dependency and branch workflow checks returned zero active dependencies at 15:07:28 EDT. These are point-in-time checks, not a claim that historical task references were erased.
- Live `git ls-remote --heads origin` confirmed no production-ready counterpart before and after deletion. Remote branch tips were unchanged.
- Post-deletion verification at `2026-09-13T15:07:46.2724289-04:00`, before this audit addition, confirmed the exact expected ref map (only the authorized local ref absent), unchanged file hashes/index/configuration/status, and unchanged canonical HEAD. This audit insertion is the only authorized file change in this operation; prior audit content is retained. No source or test was changed, staged, or committed.
- All eight historical-only commits remain reachable from the three exact-tip preservation refs. No objects were pruned or garbage-collected; no new preservation ref was created.

### Remaining ordinary branches

**278 local branches = 270 preservation refs + 8 ordinary branches.** The eight ordinary local branches are:

- `anvil-hammer-recording-smoke`
- `backup/codex-asr-late-regime-proof-prefix`
- `backup/codex-asr-late-regime-proof-sync-fix`
- `codex/consolidation-reviewed-20260913`
- `codex/hammer-week4-signoff-docs`
- `codex/quarantine-nursery-authority-candidate-20260713`
- `hammer-ingest-followup`
- `main`

**Four ordinary remote branches**, excluding symbolic `origin/HEAD`:

- `origin/ASR_final_tuning`
- `origin/anvil-hammer-recording-smoke`
- `origin/hammer-ingest-followup`
- `origin/main`

### Separately deferred Bellows session-identity projection defect

The preceding disposition review identified that `apps/nursery/src/lib/bellows/bellowsTongsRepository.ts` projects persisted workpiece/capture-authority identities as null. Repository schema evidence in `20260829120000_tongs_venue_neutral_recording_authority.sql` confirms both columns exist, with workspace/workpiece/venue binding and immutable-authority rules. Historical commit `de830cbf106ae7f43e193ef743e1213c537d44de` mapped those fields; its evidence remains reachable through all three preservation refs above.

Defer to a future Bellows session-identity authority review of header projection, writer RPCs, checkpoint/route consistency, capture-authority provenance, and recovery/sealing integrity. The projection information loss is established; user-visible impact across checkpoint-based recovery is not certified by this finding. No Bellows investigation or implementation was undertaken during this deletion operation. No old mapping, schema, or release infrastructure was restored.

No checkout switch, application/test/migration edit, commit, merge, cherry-pick, deployment, database/provider call, server action, or ASR/Hammer/Anvil work was performed. Optional historical verification improvements remain preserved, not automatically integrated.

## Guarded six-Hearth-ref closure — completed 2026-09-13, 12:47 EDT

This later, explicitly approved closure supersedes the survivor counts and the six protected classifications in the earlier cleanup record below; that historical record is retained unchanged. Exactly six local refs and one remote ref were deleted, with zero skips or uncertain outcomes. No application behavior was changed or integrated.

Canonical checkout before and after: `D:\nursery\nursery`, branch `codex/consolidation-reviewed-20260913`, HEAD `ef24f0d1e352a97960409bb636b050e6fb1844ff`. There remains exactly one registered worktree. Both main refs are unchanged: local `cdf497001ad0959aa9fec9bccca74467fda01d81`, origin `2305dfb6f7e2922f933140c30775f0ef1671c3a7`.

Immediately before each deletion, the guard checked exact tip, worktree ownership, current app task status against read-only task branch metadata, open PR head/base dependencies, active workflow dependencies, and existing exact-tip preservation anchors. No active dependency was found in those checks. Historical task references were not treated as active checkout ownership. Dependency checks are point-in-time; exact expected-SHA guards also protected the actual ref mutation against concurrent tip changes.

| Scope | Exact deleted branch | Verified original SHA | Existing exact-tip preservation anchor under `codex/preserve/20260913/` | Matching anchors | Deleted at EDT |
|---|---|---|---|---:|---|
| Local | `codex/hearth-legacy-migration-compatibility` | `b5e7dcdf0137fd0f56faa2a3d635d99cbff2cfb3` | `d-nursery-hearth-legacy-compat-candidate-head` | 3 | 12:46:04 |
| Local | `codex/hearth-hydration-deadlock-repair` | `9d4f5ae8e322fc10b84420a3997eea541e10756b` | `d-nursery-hearth-hydration-deadlock-repair-head` | 3 | 12:46:09 |
| Local | `codex/hearth-customer-admission-repair` | `c78593f834e985fec7d4bb7ddfe02c30b5169e13` | `d-nursery-hearth-customer-admission-repair-head` | 3 | 12:46:14 |
| Local | `codex/hearth-nonbillable-authority` | `a21fd85cf27c894ff2511c38453072fea251e34e` | `d-nursery-hearth-nonbillable-authority-head` | 3 | 12:46:34 |
| Local | `codex/hearth-structural-paid-integration` | `5a08fbbda9e78958efdd8507c7e23502c78f30bc` | `d-nursery-hearth-structural-paid-integration-head` | 3 | 12:46:39 |
| Local + origin | `codex/hearth-research-workflow-repair` | `6f439d69d841fab64379c618a5005db928381fdd` | `d-nursery-nursery-head` | 5 | Local 12:46:44; origin 12:45:33 |

Local deletion used `git update-ref --no-deref -d refs/heads/<exact-name> <expected-SHA>`: an atomic compare-and-delete for these explicitly approved non-ancestor refs, not a merge or blanket branch deletion. The sole remote deletion used `git -c push.followTags=false push --porcelain --force-with-lease=refs/heads/codex/hearth-research-workflow-repair:6f439d69d841fab64379c618a5005db928381fdd origin :refs/heads/codex/hearth-research-workflow-repair`. Remote absence was verified with `git ls-remote --heads`; the matching remote-tracking ref is absent too. No other push was performed. Local Git configuration was intentionally left unchanged, including any historical tracking entries; those entries are not surviving branch refs.

Post-deletion verification at `2026-09-13T12:47:06.9057691-04:00` confirmed the exact expected ref maps: **279 total local refs = 270 preservation + 9 ordinary**, and **4 ordinary remote branches** (excluding symbolic `origin/HEAD`). Every preservation ref still matches its protected pre-consolidation SHA. No new preservation ref was created. All deleted histories remain recoverable through the anchors above; no object pruning occurred.

Remaining ordinary local branches:

- `anvil-hammer-recording-smoke`
- `backup/codex-asr-late-regime-proof-prefix`
- `backup/codex-asr-late-regime-proof-sync-fix`
- `codex/consolidation-reviewed-20260913`
- `codex/hammer-week4-signoff-docs`
- `codex/hearth-production-ready`
- `codex/quarantine-nursery-authority-candidate-20260713`
- `hammer-ingest-followup`
- `main`

Remaining ordinary remote branches:

- `origin/ASR_final_tuning`
- `origin/anvil-hammer-recording-smoke`
- `origin/hammer-ingest-followup`
- `origin/main`

`codex/hearth-production-ready` remains unchanged at `b4f1b734d3450f4b79ea8a458e9ca33e264ecbf7`. Before this audit insertion, all 24 captured dirty/untracked/private file hashes matched the baseline byte-for-byte; index SHA-256 remained `C3559DC7358D98F4A94007084BAE5E1DB4B310FF0C1D067C4F9BC25395833DA1`, working status and local Git configuration were unchanged. This insertion in the established audit record is the only file edit authorized and performed in this closure; existing report content is retained. All other staged/dirty work, private settings and source are untouched.

No commits, source/migration changes, checkout transitions, merges, cherry-picks, new copies, deployments, database/provider calls, server actions, PR closures or garbage collection were performed. Thumbnail staging, discovery retry, historical verification tooling and Bellows remain outside this operation.

## Approved branch cleanup — completed 2026-09-13, 11:52 EDT

Completed exactly **44 ancestor-merged local refs, one patch-equivalent local ref, and 45 ancestor-merged remote refs** below. L means local `refs/heads/<name>`; R means that exact branch on origin. No matching by prefix or branch age is authorized.

Baseline remote main: `2305dfb6f7e2922f933140c30775f0ef1671c3a7`. Canonical checkout: `codex/consolidation-reviewed-20260913` / `ef24f0d1e352a97960409bb636b050e6fb1844ff`. Initial counts: **330 local refs (270 preservation + 60 ordinary), 50 remote branches**. All 54 discovered PRs are merged; the returned live task list has only this canonical billing task active. Historical task branch names are not live checkout ownership.

The earlier “50 branches” is confirmed remotely. “20 active” is not reproduced: 24 non-main remote tips have commit dates in the preceding three months. GitHub activity is a recency label, not a count of active tasks or unmerged work. No branch is deleted based on that label.

All 270 preservation refs, both main refs, current reconciliation, 13 ordinary local refs and four remote refs with unresolved work remain excluded. Their exact SHAs are protected against the preflight snapshot. No checkout, integration, code push, deployment or garbage collection is included.

Remote removal uses one explicit `--force-with-lease=refs/heads/<name>:<approved SHA>` per deletion; an actual stale-SHA dry run was rejected and the correct-SHA dry run succeeded. There is no unconditional force push. Remote refs are handled before local refs. Local removal uses `git branch -d`; only `codex/he9-hydration-fix` may use `-D`, after its three patch IDs and three unchanged preservation anchors pass. Git refusals are never retried or overridden for other branches.

For every candidate the executor rechecks tip, main, incorporation, worktree ownership, live PR/run dependencies, current app task evidence and task changes. It journals intent before deletion and records result afterward. Unknown results are not retried. A small unavoidable gap remains between dependency inspection and the Git action; the remote expected-SHA lease protects against concurrent ref updates at the action itself.

### Final verified outcome

Execution finished at **2026-09-13T15:52:19.186925Z**. Post-execution verification at **15:52:44 UTC** confirmed **45 local and 45 remote refs deleted; zero skips, refusals, uncertain outcomes or unprocessed entries**. The table below records the exact deleted names and original SHAs; protected entries were not changed.

Remaining: **285 local branches = 270 preservation refs + 15 ordinary branches**, and **five remote branches**. The 15 ordinary local branches are main, current reconciliation and the 13 unresolved-work branches listed below. The remote survivors are main, ASR_final_tuning, anvil-hammer-recording-smoke, codex/hearth-research-workflow-repair and hammer-ingest-followup. All survivor tips match their preflight SHAs.

Canonical HEAD, branch, worktree, source, staging/index and private configuration match the preflight. Only authorized maintenance reports and the guarded cleanup helper changed in this order. Git removed the deleted local branches' own tracking configuration normally; all unrelated/excluded local Git configuration remains unchanged. No commits, checkout switch, integration, code/tag push, PR closure, deployment or garbage collection occurred. Only the approved remote deletion refspecs were pushed.

Deleted ancestor history remains reachable from remote main; HE9's original history remains on its three protected preservation anchors. Branch names were removed, not the recovery refs or underlying preserved evidence. Both development servers remain stopped.

### Exact review and execution manifest

| Scope | Exact name | Expected tip SHA | Classification | Ahead / behind remote main |
|---|---|---|---|---:|
| L+R | `ASR2` | `0ce6e08c25a2e5a78c6253a5de4fdc196728c699` | Deleted: ancestor incorporated | 0 / 807 |
| L+R | `HammerEditorialPipeline` | `b10464f6294679a64294a94e3a5daefef8162a94` | Deleted: ancestor incorporated | 0 / 549 |
| L+R | `Hammer_Smoke3` | `89be906fe7719299bc5edbb3fa3f8b6ae6a45419` | Deleted: ancestor incorporated | 0 / 151 |
| L+R | `Hammer_polish_2` | `10cae62ce536875a5a437bf35738fb90a84bd621` | Deleted: ancestor incorporated | 0 / 1063 |
| L+R | `Hammer_smoke_2` | `d2c27612c41085e7318629b685ea6314f004459a` | Deleted: ancestor incorporated | 0 / 1191 |
| L+R | `Hearth_Ai` | `99b28b5d57630ebe4b310e7e598ec425eb7dcd8e` | Deleted: ancestor incorporated | 0 / 354 |
| L+R | `Production_Flow` | `e27fa0658359a758772451565efdf124e56b8e86` | Deleted: ancestor incorporated | 0 / 353 |
| L+R | `anvil-hammer-recording-smoke` | `1023f637a0d0ae0a5e6c05db201384046400b480` | Protected: unresolved unique work | 63 / 1063 |
| L | `backup/codex-asr-late-regime-proof-prefix` | `f4e7870fab5c0bf15ffa00595cb3037a1eb18836` | Protected: unresolved unique work | 1 / 781 |
| L | `backup/codex-asr-late-regime-proof-sync-fix` | `bfdb0adf605463ddc83a064c3684d235b76c8521` | Protected: unresolved unique work | 2 / 776 |
| L | `c-drive-scratch-brave-alias` | `85bffdb8664b346810fded2ba72f82af1d921051` | Deleted: ancestor incorporated | 0 / 1060 |
| L+R | `codex/actual-seven-route-certification` | `0c652cd0774e66d62abb4d8ccf5023b36b1ef571` | Deleted: ancestor incorporated | 0 / 79 |
| L+R | `codex/asr-late-regime-proof` | `417e0d4691564cb22ed8569fabd53810b44950c2` | Deleted: ancestor incorporated | 0 / 696 |
| L | `codex/consolidation-reviewed-20260913` | `ef24f0d1e352a97960409bb636b050e6fb1844ff` | Protected current/default | 4 / 0 |
| L | `codex/hammer-polish` | `083896d529f259453650a9d2f72dc6f6939a0350` | Deleted: ancestor incorporated | 0 / 1425 |
| L+R | `codex/hammer-smoke` | `e9746f97ad57521d0e92683e70876b13a9d7355f` | Deleted: ancestor incorporated | 0 / 1322 |
| L | `codex/hammer-week4-signoff-docs` | `e140fc6162da1748e48014171c84a7373fc6b8af` | Protected: unresolved unique work | 1 / 1701 |
| L | `codex/he9-hydration-fix` | `c3807d513bef881c71dda6abec84c86e93ed1cd9` | Deleted: three equivalent patches | 3 / 215 |
| L | `codex/hearth-customer-admission-repair` | `c78593f834e985fec7d4bb7ddfe02c30b5169e13` | Protected: unresolved unique work | 4 / 86 |
| L | `codex/hearth-hydration-deadlock-repair` | `9d4f5ae8e322fc10b84420a3997eea541e10756b` | Protected: unresolved unique work | 3 / 86 |
| L | `codex/hearth-legacy-migration-compatibility` | `b5e7dcdf0137fd0f56faa2a3d635d99cbff2cfb3` | Protected: unresolved unique work | 2 / 86 |
| L | `codex/hearth-next-pass` | `6c06aed1fb7bc6c9288413c85707822e5f6fed09` | Deleted: ancestor incorporated | 0 / 1587 |
| L | `codex/hearth-nonbillable-authority` | `a21fd85cf27c894ff2511c38453072fea251e34e` | Protected: unresolved unique work | 1 / 54 |
| L | `codex/hearth-production-ready` | `b4f1b734d3450f4b79ea8a458e9ca33e264ecbf7` | Protected: unresolved unique work | 8 / 181 |
| L+R | `codex/hearth-research-workflow-repair` | `6f439d69d841fab64379c618a5005db928381fdd` | Protected: unresolved unique work | 5 / 86 |
| L | `codex/hearth-structural-paid-integration` | `5a08fbbda9e78958efdd8507c7e23502c78f30bc` | Protected: unresolved unique work | 1 / 15 |
| L | `codex/netlify-build-fix` | `64ede877e20338b7578a1c7c00bc485e072629bc` | Deleted: ancestor incorporated | 0 / 1319 |
| L+R | `codex/nursery-authority-repair` | `b657ef3c39ba5a7a1789cae27109b94987860dee` | Deleted: ancestor incorporated | 0 / 465 |
| L+R | `codex/openai-cost-reconciliation` | `b765fc01304d20dd824138e940a583eecbdfb864` | Deleted: ancestor incorporated | 0 / 55 |
| L | `codex/openai-cutover-activation-release` | `55ac90d2ac6d6604771b14952418b5c5e7b3ed46` | Deleted: ancestor incorporated | 0 / 11 |
| L | `codex/openai-evidence-environment-docs` | `28e1ee5b075fa6f2276106b06528e71323030b37` | Deleted: ancestor incorporated | 0 / 68 |
| L | `codex/openai-evidence-results` | `1ba3c2bd2a9e010313f042839e26fba4551f9d1d` | Deleted: ancestor incorporated | 0 / 66 |
| L | `codex/openai-ordinary-caller-funding` | `48e5613904db586af452f78f0d5c3e7bc76e4c9b` | Deleted: ancestor incorporated | 0 / 72 |
| L | `codex/openai-production-cutover` | `8ca1034357ff48b91efc582b13bda6c6714dc387` | Deleted: ancestor incorporated | 0 / 13 |
| L+R | `codex/openai-seven-adapters` | `91850b5796bb0937bb674f8dda731d2671f91e5a` | Deleted: ancestor incorporated | 0 / 82 |
| L+R | `codex/openai-seven-browser-cost-policy` | `74b493aa2a08e93c6e48d53a1e1b04bcb5d3aaed` | Deleted: ancestor incorporated | 0 / 62 |
| L+R | `codex/openai-seven-test-certification` | `ea3f1acc9fd77568398213e74859c7a0a242d799` | Deleted: ancestor incorporated | 0 / 81 |
| L | `codex/openai-transcription-activation-prep` | `54afd4963f5cfb5787a28bef192d5464b8107642` | Deleted: ancestor incorporated | 0 / 51 |
| L+R | `codex/openai-transcription-coordination` | `ffe7c9fd47d2ef0865cf51b336a3842defdf0d1a` | Deleted: ancestor incorporated | 0 / 52 |
| L+R | `codex/owner-funded-hearth-activation` | `977987d58f93278a65b34890b3aee7cf2274f359` | Deleted: ancestor incorporated | 0 / 40 |
| L+R | `codex/owner-funded-hearth-research-release-candidate` | `b5f285196802f5ce86fcd3fd6b5f40a53a6078b2` | Deleted: ancestor incorporated | 0 / 1 |
| L+R | `codex/owner-hearth-lint-repair` | `d132ff003cb97e6da66e917c062e261b86ed4c91` | Deleted: ancestor incorporated | 0 / 30 |
| L+R | `codex/owner-hearth-opening-commitment-repair` | `7da50f3f1558ba6aaa25f64e62accbc3e618f673` | Deleted: ancestor incorporated | 0 / 34 |
| L | `codex/quarantine-nursery-authority-candidate-20260713` | `04c604c82779af6f5654ac5908a26f19b7ec9d5a` | Protected: unresolved unique work | 1 / 549 |
| L | `codex/recovery-page-polish` | `fb8a61a458fce764cab0b05863c1a40ce7b8b66f` | Deleted: ancestor incorporated | 0 / 137 |
| L | `codex/recovery-route` | `048eaa0736a950c82287d8df2426763e0c693c9a` | Deleted: ancestor incorporated | 0 / 138 |
| L+R | `codex/restricted-beta-preparation` | `ea43d3ca3fae89267aac865743824eee433c8ec3` | Deleted: ancestor incorporated | 0 / 59 |
| L+R | `hammer-ingest-followup` | `2915470344c41cc2db9513cf362666d3dad746b7` | Protected: unresolved unique work | 64 / 1063 |
| L+R | `hammer-truth-smoke-pass` | `0073851e90ee4f4877ec9ff33e18b0626ae4af71` | Deleted: ancestor incorporated | 0 / 1063 |
| L | `main` | `cdf497001ad0959aa9fec9bccca74467fda01d81` | Protected current/default | 0 / 15 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20` | `825283793b9cf00e5692d33e6afa9e7587a0b50a` | Deleted: ancestor incorporated | 0 / 1184 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR10` | `b201a34657d91b77e3328e62689f88484f6e004b` | Deleted: ancestor incorporated | 0 / 1158 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR2` | `c2ccfd82cb7bc6908d5b31aa213b38c4736c38c2` | Deleted: ancestor incorporated | 0 / 1183 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR3` | `0c75599931277313671b4b7fddfdc15d31f54e2b` | Deleted: ancestor incorporated | 0 / 1182 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR4` | `13c5adb120a9093ea152bf380b78ac19de605215` | Deleted: ancestor incorporated | 0 / 1174 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR5` | `666730af9773ad2bc8951af44d44416992460b69` | Deleted: ancestor incorporated | 0 / 1171 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR6` | `a40e797fd01ad233a389364da54259ec371f1064` | Deleted: ancestor incorporated | 0 / 1170 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR7` | `120ddafcce5a9d555c99edfc7611828cf98a36b5` | Deleted: ancestor incorporated | 0 / 1169 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR8` | `c3ad4e3440bb25ce9392482d5ed6316934389f14` | Deleted: ancestor incorporated | 0 / 1168 |
| L+R | `refactor/hammer-shell-thin-orchestrator-4-20_PR9` | `2b0f03860c9ce9cb180f9e9aee7e9db1c6dc8dfa` | Deleted: ancestor incorporated | 0 / 1166 |
| R | `ASR_final_tuning` | `1b19cc770a9a6d2e8b8cd8228727a29c86f04bb5` | Protected: unresolved unique work | 34 / 596 |
| R | `codex/hammer-images` | `d9b01ee651dc2bed29ba203a4a8e3324a0d6fb0d` | Deleted: ancestor incorporated | 0 / 1522 |
| R | `codex/hammer-polish` | `5551b2b6bf33c6714a685d8aad88f29d457a9cb0` | Deleted: ancestor incorporated | 0 / 1426 |
| R | `codex/hammer-takes-shape` | `37d4b792a9aabb98160f58a68fc872362a85f879` | Deleted: ancestor incorporated | 0 / 1523 |
| R | `codex/hearth-format-choice` | `f77b90488aedbdb127be3d545f56b7cc2d33db3c` | Deleted: ancestor incorporated | 0 / 1599 |
| R | `codex/hearth-next-pass` | `b52ccdb58db6f587bedcf406bcd16a7bc6b8b55b` | Deleted: ancestor incorporated | 0 / 1588 |
| R | `codex/hemmer-images` | `a49155d935f216057abf4067254f4456b19ae093` | Deleted: ancestor incorporated | 0 / 1521 |
| R | `codex/openai-billing-evidence-closure` | `48e5613904db586af452f78f0d5c3e7bc76e4c9b` | Deleted: ancestor incorporated | 0 / 72 |
| R | `codex/openai-cutover-activation-release` | `3fd1c6f7c7b67110945974114220045c02af5f31` | Deleted: ancestor incorporated | 0 / 12 |
| R | `codex/openai-evidence-environment-docs` | `3b66e0c75b4dcf2216f0045ec2ece138edd9061d` | Deleted: ancestor incorporated | 0 / 70 |
| R | `codex/openai-evidence-secret-scope` | `28e1ee5b075fa6f2276106b06528e71323030b37` | Deleted: ancestor incorporated | 0 / 68 |
| R | `codex/openai-ordinary-caller-funding` | `dd48cd0d856f74e6e844c29d0f892c8c0c38dd6f` | Deleted: ancestor incorporated | 0 / 76 |
| R | `codex/openai-production-cutover` | `aec290cdf012eda8d93f57fc1bb42e59a54f96fc` | Deleted: ancestor incorporated | 0 / 14 |
| R | `feature/asr-resolver-actuator-obedience` | `f3128ec32b5f45c214e8feab27b4797ae2264728` | Deleted: ancestor incorporated | 0 / 784 |
| R | `main` | `2305dfb6f7e2922f933140c30775f0ef1671c3a7` | Protected current/default | 0 / 0 |

### Evidence and pending decisions

All approved ancestor tips have zero commits unique to remote main. HE9 has three unique SHAs with matching stable patch IDs: `3567b673` → `147d1b0b`, `2ffc05ee` → `a4c94bc6`, and `c3807d51` → `7bffa1d5`. Original HE9 history remains on three protected preservation refs.

Partial matches do not authorize broader deletion: ASR backup tip `bfdb0adf` matches `8a2f32a0` but its unique log commit remains; Hearth canary `3dc02838` matches `d0fe1126` but its containing research branch has unmatched work. The ASR/old Hammer-ingest candidates, overlapping Hearth candidates, signoff restoration and quarantined authority candidate need separate substantive review. No old work is merged to eliminate a branch. Current reconciliation's four unpublished commits and working changes remain protected.

Protected machine-readable evidence lives only under `D:\nursery\nursery\.git\forge-consolidation-private\`: `approved-branch-cleanup.json` (SHA-256 `83fc153538fd11144a1946f6121d161aa066861a429caf1513a3e88b855281c1`), `branch-cleanup-before.json`, `branch-cleanup-app-tasks.json`, `branch-cleanup-journal.json`, `branch-cleanup-after.json`, and the two-file maintenance prestate. The journal records exact location/name/SHA, checks, method, refusal or success for every attempted ref. These are selective audit records, not another source copy.

## Final inventory outcome — 2026-09-13, 11:21 EDT

All **79 original removal targets**, including the **45-target final batch**, are now absent. T020 was removed through ordinary Git worktree removal without force after fresh preservation and dependency checks. **`D:\nursery\nursery` is the sole registered worktree and sole remaining inventoried Forge source root.** All 270 preservation refs, 1,380 retained files and 4,642 preserved Git blobs remain accessible; canonical source/staging/configuration is unchanged. Both development servers remain stopped.

Current evidence, recoverability and inspection limits are in [the removal report](D:/nursery/nursery/docs/maintenance/FORGE_EXACT_PATH_REMOVAL_REVIEW.md) and [the preservation report](D:/nursery/nursery/docs/maintenance/FORGE_CONSOLIDATION_PRESERVATION_REPORT.md). Saved app references remain historical metadata, not proof of an active editor. No deployment, database change, paid call or broader cleanup occurred. The earlier inventory counts and server status below are historical checkpoints.

## Historical removal outcome — 2026-09-13, 04:49 EDT

The approved batch removed **34 exact targets** and skipped **21**. All **24 original HOLD targets** remain present and excluded. **Single-root consolidation is not complete:** 19 registered worktrees, two independent clones, and 14 non-Git source copies remain (35 roots including canonical). No additional checkout or full-source backup was created.

- Removed: **T006–T017, T051–T059, T062, T064–T067, T072–T079**. Git removed the twelve linked worktrees without force; other removals used literal exact paths without directory-link traversal. T079 was the literal canonical `%SystemDrive%` cache. No parent research/release directory was removed.
- Skipped: fourteen targets with unreviewed dependency links, T020's surviving Codex configuration reference, T032's clone-origin metadata discrepancy, T033's inaccessible dependency, and T068–T071's nonempty directory structures without dispositions. No refusal was overridden.
- Verified: all **258 preservation refs**, **4,642 Git content objects**, and **360 retained evidence files / 55,348,910 bytes** remain accessible. Canonical index/staging and private environment files are unchanged. The 3,733-file surviving-configuration scan found no references to removed targets; untraversed links and uninspected archives remain limitations.
- Canonical branch/HEAD remains `codex/consolidation-reviewed-20260913` / `ef24f0d1e352a97960409bb636b050e6fb1844ff`. **5173/PID272572** remains running from canonical source and returns HTTP200; **5199 remains stopped**. No restart, database change, Docker mutation, push, deployment, paid call, or pruning occurred.

Full exact-path outcomes are in `FORGE_EXACT_PATH_REMOVAL_REVIEW.md`; preservation, recovery information, and every remaining source root are in `FORGE_CONSOLIDATION_PRESERVATION_REPORT.md`. Removed directories are not in the Recycle Bin, but their reviewed material remains recoverable from existing Git preservation refs/objects and the protected retained store. Current report/script edits remain local and unstaged. Earlier “nothing removed”/pending-approval language below is historical and superseded by this outcome; original HOLD classifications are not changed.

---

Latest completed handoff (2026-09-13, 04:15–04:23 EDT): the canonical directory now runs `codex/consolidation-reviewed-20260913` at adopted source commit `d6369e9c`, including reviewed `035dc746`, document-only `c668cffc`, and all six Hearth changes. Port5173/PID272572 serves that source after the approved restart; port5199 remains stopped. Mocked regressions19/19 and Hearth typechecking passed. Newest pre-handoff changes are preserved at `bebe4c2a` and exact-byte `e4bbb0bc`. No external removals occurred; all55 candidates still await approval and all24 holds remain protected. Current details are in the preservation report and exact-path removal review; earlier inventory and handoff entries below are historical.

Latest handoff verification (2026-09-13, 04:10–04:14 EDT): 5173 now serves the canonical directory under PID 252492, but the checkout remains `6f439d69`, not reconciled `035dc746`. Port5199 is stopped; the Hearth task is idle and its six files remain byte-identical to preserved `35e5d9a3`. No holds were cleared. See `FORGE_CONSOLIDATION_PRESERVATION_REPORT.md` and `FORGE_EXACT_PATH_REMOVAL_REVIEW.md` for current evidence. The inventory and process observations below are historical.

Checked: 2026-09-13, approximately 03:00–03:25 America/New_York.

Destination: **`D:\nursery\nursery` only**. This inventory does not authorize removal, server shutdown, source integration, or deployment. No new worktrees, clones, source snapshots, or archives were created. Only this review document was added.

## Executive findings

- 31 registered worktrees: the destination plus 30 elsewhere.
- 16 additional source trees: two independent clones and 14 non-Git copies. Total discovered source roots: **47**. Nested trees are counted separately.
- Two additional Git metadata remnants, plus evidence-only directories and archives, need separate treatment.
- Remote `main` was checked directly: `2305dfb6f7e2922f933140c30775f0ef1671c3a7`. The destination is still on `codex/hearth-research-workflow-repair`, HEAD `6f439d69d841fab64379c618a5005db928381fdd`, not current main.
- Six uncommitted Hearth files live outside the destination, in the research release worktree. They contain **268 insertions and 39 deletions**. Its server is listening on **5199**.
- The destination's separate server is listening on **5173**. Both were left running.
- A detached dependency-upgrade commit and several local-only Hearth branch histories must be anchored/preserved before removing their checkouts.
- This is a discovered-local inventory, not a guarantee about inaccessible folders, cloud storage, or source hidden inside archives. Those are not approved deletion targets.

## Preservation gates

Every proposed deletion below is conditional. Before deleting any listed directory:

1. Recheck its exact resolved path, current Git status, ignored/private files, and process dependencies.
2. Preserve unique history in named Git refs within the destination's existing `.git`; preserve reviewed source changes there. Do not make another checkout, ZIP, or full-tree snapshot.
3. Compare unmatched non-Git source files against current code. Record whether each is incorporated, superseded, or deliberately retained; do not overwrite newer code with an older snapshot.
4. Preserve necessary audit evidence selectively under the destination, outside public bundles and Git where sensitive. Do not publish SQL dumps, browser authentication state, or credentials.
5. Verify that no active task, server, terminal working directory, container bind mount, or configured tool still requires the target.
6. Remove linked worktrees through Git's worktree mechanism, not raw directory deletion. No broad wildcard deletion or forced removal of unresolved work.

“Clean” below means tracked/untracked Git status was clean at inspection. It does **not** mean ignored evidence, environment files, or dependencies are disposable.

## 1. Destination — keep and reconcile in place

`D:\nursery\nursery`

Existing uncommitted items:

- `AGENTS.md`: Docker ownership instructions, +28/-1. Preserve these alongside the newer canonical Git-backed deployment instructions on main.
- `apps/nursery/public/forge-nav.json`: generated timestamp change, +1/-1. Review before discarding.
- Literal `%SystemDrive%/ProgramData/Microsoft/Windows/Caches/` directory containing three Windows cache files. This is a local accidental-path artifact, not the real system directory. Candidate for separately approved removal after checking no dependency.

The current branch has five commits not ancestors of remote main, including a merge. Its history is remotely preserved. Notable commits include `59d73711` (simulated Hearth/Stripe Test support), `3dc02838` (patch-equivalent Test canary), `fab85265` (generated metadata), and `7cc8afad` (episode-creation structural candidate). Ancestry differences do not prove missing features after squash integration. Do not reset or blindly cherry-pick this branch.

## 2. Registered worktrees — proposed removal after preservation

### Codex-managed linked worktrees

Each path below is exactly `C:\Users\Iam11\.codex\worktrees\<ID>\nursery`.

| ID | HEAD | Unique-work finding | Proposed disposition |
|---|---|---|---|
| 0151 | 9647371e | Clean; commit contained in main | Remove after ignored-file/process check |
| 08cf | c2343820 | Clean; contained in main | Same |
| 4e52 | 95b83c33 | Clean; contained in main | Same |
| 54e6 | c31ce6d1 | Clean, detached; one local-only dependency-upgrade commit | Anchor exact commit `c31ce6d11599128e19ebc30bb5229e10b304d064` in destination first; review integration separately |
| 628a | c99c5808 | Clean; contained in main | Remove after checks |
| 6d43 | d3250d95 | Clean; contained in main | Same |
| 7310 | 23088fb4 | Clean; contained in main | Same |
| 77a1 | e0968587 | Clean; contained in main | Same |
| 917f | 436d06bc | Clean; contained in main | Same |
| 9955 | e0968587 | Clean; contained in main | Same |
| 998f | 9647371e | Clean; contained in main | Same |
| 9caa | fd0c831c | Clean; contained in main | Same |
| 9d83 | e0968587 | Clean; contained in main | Same |
| adb8 | e0968587 | Clean; contained in main | Same |
| b798 | e835d06b | Clean; contained in main | Same |
| c076 | b386f757 | Clean; contained in main | Same |

These directories contain ignored `.tmp`/`.playwright-mcp` material; 54e6 also contains dependencies. Selective evidence review remains a deletion prerequisite.

### Other linked worktrees

The first twelve table paths are relative to `D:\nursery\`.

| Path | HEAD | Unique-work finding | Proposed disposition |
|---|---|---|---|
| forge-aggregate-admission | b765fc01 | Clean; no commits outside main | Remove after checks |
| forge-beta-preparation | ea43d3ca | Clean; no commits outside main | Remove after checks; no Beta activation |
| forge-canary-deploy | 74b493aa | Clean; no commits outside main | Remove after checks |
| forge-openai-transcription | 55ac90d2 | Only `supabase/.temp/cli-latest` dirty; no unique commits | Review generated marker and ignored evidence, then remove |
| he9-hydration-fix | c3807d51 | Three local commits, all patch-equivalent to main | Keep history refs; no duplicate cherry-picks; remove checkout |
| he9-staging-7bffa1d5 | 7bffa1d5 | Clean; no unique commits | Remove after checks |
| hearth-customer-admission-repair | c78593f8 | Four commits outside main, three local-only | Preserve refs; compare source intent before removal |
| hearth-hydration-deadlock-repair | 9d4f5ae8 | Three commits outside main, two local-only; 61 public/generated files dirty | Preserve history; inspect generated Anvil asset changes and nav timestamp before disposal |
| hearth-legacy-compat-candidate | b5e7dcdf | Two commits outside main, one local-only | Preserve history and review integration |
| hearth-nonbillable-authority | a21fd85c | One local-only commit | Preserve deterministic-research/preflight work |
| hearth-production-ready | b4f1b734 | Eight local-only commits | Preserve complete branch; review prior integration and certification fixes |
| hearth-structural-paid-integration | 5a08fbbd | One local-only commit; related implementation integrated through PR54 | Preserve ref; avoid reapplying already integrated behavior |
| `C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research\release-worktree` | b5f28519 | Candidate merged in PR54, but six uncommitted Hearth files and live 5199 server | **Hold until work is incorporated in destination and server/task dependencies are retired/repointed** |
| `C:\Users\Iam11\AppData\Local\Temp\forge-pr54-guarded-fb015cc46c4b4b53beba2de2576d044c\checkout` | b5f28519 | Clean exact release checkout; no unique commits | Remove linked checkout after retaining parent-directory release evidence |

### Six uncommitted Hearth files to preserve

All paths are relative to the research `release-worktree` above:

- `apps/hearth/src/hooks/useChatWorkspace.ts`
- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/storage/hearth-store.ts`
- `apps/hearth/src/storage/local-store.ts`
- `apps/hearth/src/storage/tongs-store.ts`
- `apps/hearth/tests/hearth-stabilization-blockers.test.tsx`

Inspected changes separate explicit canonical chat clearing from empty autosave, prevent duplicate/unchanged persistence, preserve recovery state on failures, and add regression coverage. These are substantive creator-workflow edits, not disposable generated files. Coordinate their move with the task **“Investigate Hearth episode context”**; do not restart or expand that task during inventory.

### Local-history preservation details

- HE9: `3567b673`, `2ffc05ee`, `c3807d51` are patch-equivalent to main.
- Repair chain: `b5e7dcdf` → `9d4f5ae8` → `c78593f8` covers legacy capture authority, hydration convergence, and paid-admission failure behavior.
- Production-ready branch retains `de830cbf`, `4a8c7640`, `afc67bf4`, `d600003d`, `20ca8a3f`, `39d40b1e`, `5e739c7e`, `b4f1b734`.
- Retain `a21fd85c`, `5a08fbbd`, and detached `c31ce6d1` before removing any worktree associations.

Existing primary Git storage already contains these linked-worktree objects. Named refs preserve history without retaining a runnable copy. Ref creation and source integration have not been performed in this audit.

## 3. Independent clones and non-Git copies

For this section, `RESEARCH` means the exact path `C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research`.

### Independent clones

| Exact path | Finding | Proposed disposition |
|---|---|---|
| `RESEARCH` | Own `.git`, HEAD 55ac90d2; 82 refs; no ref-reachable commits missing from destination. Thousands of untracked files belong mainly to nested copies/evidence | Remove parent **last**, only after child linked worktree, copies, task dependency, private config, and evidence are resolved |
| `RESEARCH\repo` | Own `.git`, HEAD 6f439d69; 82 refs; clean; no ref-reachable commits missing from destination | Remove after private/unreachable-history checks |

Reachable-ref comparison does not certify stashes, reflog-only objects, or ignored files as disposable; these remain final removal checks.

### Non-Git copies

Text comparison normalized CRLF and compared Git blob hashes against all reachable destination history. Excluded dependencies, generated public output, build/cache/test-report trees, selected private/auth files, binaries, files over 4 MB, and unsupported text extensions. A historical match means recoverable content, not proof that an old file arrangement is identical to current main.

| Exact path | Compared text finding | Proposed disposition |
|---|---|---|
| `D:\nursery\forge-linux-build` | 2,956 historical matches; no unmatched inspected text | Remove after exclusions reviewed |
| `D:\nursery\netlify-release-57e06d62` | 745 matches; none unmatched | Same |
| `D:\nursery\nursery-clean-reference-review-control` | 735 matches; none unmatched | Same |
| `D:\nursery\nursery-deploy-ebede181` | 824 matches; none unmatched | Same |
| `D:\nursery\nursery-hammer-shell` | 86 matches; none unmatched; partial old source tree | Same |
| `D:\nursery\nursery-openai-verify` | 811 matches; none unmatched | Same |
| `D:\nursery\verify-99a4a117` | 837 matches; none unmatched | Same |
| `C:\Users\Iam11\.codex\worktrees\recovery-route\nursery` | 764 matches; none unmatched | Same |
| `C:\Users\Iam11\.codex\worktrees\he8-closeout-4d5abf0d` | 643 matches; none unmatched | Same |
| `RESEARCH\base` | 3,145 matches; unmatched Anvil changelog | Hold unmatched file review, then remove |
| `RESEARCH\work` | 3,142 matches; eight unmatched files below | **Hold source comparison**; do not overwrite newer released research code |
| `C:\Users\Iam11\AppData\Local\Temp\hearth-inactive-release-9a23dc9828664ef9bd4780919bf6043c` | 3,167 matches; unmatched Anvil changelog | Preserve required release logs/evidence; review unmatched file; remove copy/archive |
| `C:\Users\Iam11\AppData\Local\Temp\hearth-git-tree-tests-377e46e45ee54d8ba3d7b7d071f3dc57` | 3,171 matches; unmatched Anvil changelog and permission-certification document | Review differences/evidence, then remove source copies/archives |
| `C:\Users\Iam11\AppData\Local\Temp\forge-pr54-guarded-fb015cc46c4b4b53beba2de2576d044c\candidate` | 3,172 matches; unmatched Anvil changelog | Review difference, preserve parent release report/evidence, remove copy |

Eight unmatched `RESEARCH\work` files:

- `docs/billing/OWNER_FUNDED_HEARTH_RESEARCH_IMPLEMENTATION.md`
- `supabase/tests/owner_funded_hearth_research.sql`
- `supabase/migrations/20261010120000_tongs_owner_funded_hearth_research.sql`
- `apps/nursery/server/hearth/owner-hearth-research-execution.ts`
- `apps/nursery/server/hearth/hearth-research-runtime.ts`
- `apps/nursery/server/hearth/create-hearth-ai-handler.ts`
- `apps/hearth/src/hooks/useChatWorkspace.ts`
- `apps/anvil/CHANGELOG.md`

Unmatched means not proven redundant, not necessarily newer or correct. Applied migrations must not be replaced from this old work copy.

## 4. Metadata remnants, archives, and evidence-only folders

### Git remnants

- `D:\nursery\nursery-cp4-baseline-5f56b641`: broken linked `.git` pointer and `.codex-temp`. Not an empty clean checkout. Review `.codex-temp`; remove remnant only after preservation.
- `D:\nursery\nursery-recovery-deploy`: `.git` only; no resolved HEAD/refs; 11,506 enumerated objects all have object IDs present in destination. One empty object file exists in this remnant; the same object is nonempty (3,028 bytes) in destination. No repair or deletion performed. Final metadata/reflog review remains required.
- `C:\Users\Iam11\.codex\worktrees\recovery-polish`: empty folder at inspection; candidate for exact-path removal.

Destination Git also reports 12 temporary object files as garbage. These are not source-tree copies. Do not run aggressive pruning/GC during consolidation; first anchor all valuable history and verify repository integrity.

### Evidence-only directories under `D:\nursery\`

These are not counted as source roots. Preserve necessary evidence selectively inside the destination before proposing removal of their old locations:

- `cp10-florida-acceptance-20260819`
- `cp10-retest-20260819-1128`
- `cp11-history-diagnosis-20260819`
- `cp8-florida-dry-run-20260819-0530`
- `he5-florida-dry-run-20260820`
- `he6-florida-production-transition-20260820`
- `he7-florida-reopen-20260820`
- `he7-retest-20260820`
- `he7-retest-20260821`
- `he7a-canonical-base-diagnosis-20260820`
- `he8a-offline-20260821`
- `supabase-production-migration-deploy`
- `supabase-seven-adapter-isolated`

Loose cp11/he8 diagnosis scripts and JSON in `D:\nursery` also need selective retention. SQL dumps, auth traces, and browser storage state are private evidence, not commit-ready documentation.

Known archives include `RESEARCH\hearth-research-base.zip`, `candidate.zip` in old release/test directories, and `literal-git-blobs.zip`/`raw-git-blobs.zip` in the git-tree test directory. Do not retain these as another full source snapshot by default; review archive-only contents before removal. Archives were not recursively audited in this inventory.

The PR54 temporary parent holds the unique `PR54_PRODUCTION_RELEASE_REPORT.md`, sanitized before/guarded/restored/final state evidence, and supporting scripts. Preserve needed release evidence inside the destination before removing that parent. The published PR report is also available at https://github.com/JosephSCH0157/nursery/pull/54#issuecomment-5649868731 .

Additional known temp trace folders are on hold for private-evidence classification, not blanket deletion: `forge-codex-broll-playback`, `forge-codex-broll-runtime`, `forge-codex-runway-boundary`, `forge-codex-runway-prompt`, `forge-hearth-trace-d6dcddb4-66bc-4f18-aa93-1bf55cd116bc`, `forge-trace-cfa7de4ac9384776ace96fed2225149a`, `hearth-auth-trace-63f587e9-7d0b-48eb-a82d-a2f07ee00a19`, and `hearth-p5-trace-2c973546-7562-4f91-99de-c1e632f6c64f` under `C:\Users\Iam11\AppData\Local\Temp`.

## 5. Process and external dependencies

| Dependency | Observed state | Consolidation treatment |
|---|---|---|
| Destination Vite | 127.0.0.1:5173; Node PID 152696; esbuild child 154836 in destination | Keep running; no restart was performed or approved here |
| Research release Vite | 127.0.0.1:5199; Node PID 149724; esbuild child 100072 in research release worktree; launcher ancestry also points there | Source/task handoff first; explicit approval needed to retire this server during consolidation |
| Other Node/pnpm launcher chains and open terminals | Some use relative paths; CIM does not expose every cwd/open handle | Recheck ancestry/cwd before deleting any dependency; do not kill broad process names or terminal apps |
| Codex | Saved Forge project points to destination; research/projectless task context points outside it | Repoint/finish affected task contexts before removal; no new worktrees |
| Scheduled tasks | No matching Forge/nursery/Hearth action paths found | No changes; not a claim about every possible launcher |
| Docker Desktop | Engine available; left untouched | User-owned; no stop/restart/reset |
| Local Supabase | 11 running containers; persistent DB/storage/runtime volumes; Studio binds destination `supabase/functions` and `supabase/snippets` | Keep containers and volumes; they are canonical/local infrastructure, not redundant source copies |
| Creator media | `F:\Podcasters Forge` contains Assets, BarStock, Exports, Projects, Recordings, Scripts | **Exclude entirely from source-copy deletion** |

Process IDs are observations, not reusable shutdown instructions. Revalidate identities immediately before any later approved process action.

## 6. Proposed consolidation sequence — awaits review

1. Agree this exact scope and the eventual retirement of the 5199 server. Coordinate writers in the separate Hearth task without starting additional feature work.
2. Preserve local-only/detached Git history using refs in the existing destination. Inspect stashes/reflogs/ignored assets and unmatched snapshot files. No new clones, worktrees, ZIP backups, or runnable snapshots.
3. Preserve the six dirty Hearth files and destination edits in reviewed commits in the existing repository. Reconcile the destination with freshly fetched remote main in place, preserving PR54 and any subsequent remote work. Respect PR protections; no force push or destructive reset.
4. Restore one canonical instruction set in the destination: existing Docker ownership plus main's Git-backed release rule, with an explicit single-checkout workflow. Keep unrelated instructions.
5. Selectively retain required private audit evidence/configuration under destination using appropriate ignored storage. Preserve creator content and Supabase data where they already belong; this is not a media or database migration.
6. Verify the consolidated source with focused checks. Keep 5173 untouched during this review; a later source switch may trigger its watcher/HMR, so coordinate that impact. Retire/repoint 5199 only at the approved handoff; do not delete a checkout from under a running server.
7. Remove resolved external linked worktrees by exact path. Remove nested `RESEARCH\release-worktree` before the parent clone. Then remove resolved independent clones/non-Git source copies and redundant archives. Each unresolved hold stays on the exception list rather than being force-deleted.
8. Verify only the destination remains registered as a Forge worktree, no remaining launcher/container/task targets removed paths, preserved Git history is reachable, required evidence is available, and primary server/data remain intact. Report exact removals and recoverability.

No production migrations, paid calls, configuration changes, or deployments are implied by consolidation. Any eventual source release follows the canonical Git-backed workflow separately.

## Limits and approval needed

Marker searches covered the known C: user and D: workspace locations. An additional E:/F:/X: scan returned no additional markers, but errors were suppressed and inaccessible locations cannot be certified. Cloud `G:\My Drive` yielded no usable Forge inventory. No cloud source or unknown archive is on the removal list. Binary/private/generated exclusions and final per-target dependency checks remain holds.

**Review requested:** approve preserve-first consolidation into the existing destination and the later controlled retirement of the 5199 duplicate server. No removal has occurred. Any source/evidence item that cannot be proven preserved will be reported and withheld from deletion.
