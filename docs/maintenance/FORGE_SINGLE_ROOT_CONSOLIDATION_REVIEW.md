# Forge single-root consolidation — review only

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
