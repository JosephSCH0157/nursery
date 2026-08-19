# Hammer revision editorial authority — CP-6 production migration approval package

Prepared: 2026-08-19

Status: **REVIEW ONLY — deployment is not authorized; CP-6 is not complete**

## 1. Scope and project identity

| Item | Recorded value |
| --- | --- |
| Repository HEAD | `de34e94a34ebaba9f9413e7fcc044270fa9f7e74` |
| Linked Supabase project | `wtvdjndyxegudufrompx` |
| Project name | `JosephSCH0157's Project` |
| Region / database | `us-east-1` / PostgreSQL `17.6.1.054` |
| Remote status at review | `ACTIVE_HEALTHY` |
| Worktree exception | protected, pre-existing `apps/nursery/public/forge-nav.json` modification only |

This package authorizes nothing by itself. In particular, it does not authorize a production migration, enable the production writer, access or mutate Florida Oranges or live Anvil, clear any authority pointer, or begin a Florida authority write.

## 2. Reviewed migration set

| Version and file | SHA-256 | Production ledger | Intended effect |
| --- | --- | --- | --- |
| `20260811135000_tongs_reference_visual_sequence_policy_clean_init_bridge.sql` | `7547f3de3a04f2484c7d7445221ea22296918527c4a4ca0998fde467c71266f7` | absent | ledger-aware bridge; no schema mutation on this production baseline |
| `20260816190000_tongs_hammer_editorial_authority_revision.sql` | `fbf8a810ff38814a871dddcc94e4f4f80efaa3f0ec760718b852c1818154d07e` | present | existing authority columns, RPC, RLS/grant contract |
| `20260819120000_tongs_hammer_editorial_authority_terminal_conflict.sql` | `1b85cd592c9705bf6a374c185e8f208afd73ba85616f31ed8f2881f32c16dd5a` | absent | replace only the RPC's expected-conflict SQLSTATE, `40001` -> `PT409` |

Metadata-only `supabase migration list --linked` showed 184 remote versions against 186 repository migrations. The only local-only rows were `20260811135000` and `20260819120000`; there was no unrelated pending migration.

The critical ordering evidence is:

```text
20260811135000 | absent
20260811140000 | present
20260816190000 | present
20260819120000 | absent
```

### Bridge no-op proof

The bridge runs inside a transaction and drops the reference-visual viewer policy only when ledger version `20260811140000` is absent. Production already records `20260811140000`, so its `if not exists (...)` condition is false. Applying the bridge records its own version but performs no policy or other schema mutation. It neither recreates nor changes policy semantics.

## 3. Current production authority baseline

The baseline was captured through metadata-only `supabase db dump --linked --schema tongs`; no SQL or writer mutation was issued.

### Columns and constraints

`tongs.recording_revisions` currently has:

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `editorial_authority_path` | `text` | yes | none |
| `editorial_authority_fingerprint` | `text` | yes | none |
| `editorial_authority_revision` | `bigint` | no | `0` |

The `recording_revisions_editorial_authority_revision_nonnegative` check requires `editorial_authority_revision >= 0`. The three reviewed comments identify the revision-owned path, exact-byte SHA-256 fingerprint, and monotonic CAS revision respectively.

### RPC

`tongs.acknowledge_hammer_editorial_authority(uuid, uuid, uuid, uuid, text, text, timestamptz, bigint, text)` currently:

- returns `jsonb`;
- is owned by `postgres`;
- is `SECURITY DEFINER`;
- locks `search_path` to `pg_catalog, tongs`;
- enforces editor membership, canonical revision-scoped path, lowercase 64-character SHA-256, workspace/workpiece/recording/revision identity joins, active status, exact `updated_at`, authority revision, and prior path CAS predicates;
- is revoked from `PUBLIC` and executable by `authenticated` and `service_role`;
- currently raises `40001 / editorial_authority_conflict` on the zero-row expected-conflict branch.

The forward migration preserves every item above and changes only that branch to `PT409 / editorial_authority_conflict`, producing a prompt non-retryable HTTP 409.

### RLS and direct-update boundary

- RLS is enabled on `tongs.recording_revisions`.
- `recording_revisions_select_if_workspace_viewer`: authenticated `SELECT`, using `tongs.has_workspace_role(workspace_id, 'viewer')`.
- `recording_revisions_insert_if_workspace_editor`: authenticated `INSERT`, editor role with creator/updater equal to `auth.uid()`.
- `recording_revisions_delete_if_workspace_editor`: authenticated `DELETE`, editor role.
- `recording_revisions_update_if_workspace_editor` remains defined, but authenticated has no table-level `UPDATE` grant; direct updates therefore remain unavailable. Pointer changes go through the RPC.
- Table grants: `anon SELECT`; `authenticated SELECT, INSERT, DELETE`; `service_role ALL`. RLS supplies the row boundary, and no anon policy grants row visibility.

## 4. Deployment preview and command sequence

No `db push`, `--include-all`, migration repair, or SQL mutation command was run while preparing this package. Supabase CLI `2.84.2` documents that `--dry-run` prints migrations without applying them and `--include-all` includes migrations missing from remote history. Because the bridge is backdated behind the remote head, the later approved deployment must deliberately use `--include-all`.

The reviewed deployment operator sequence is:

```powershell
# 1. Freeze identity and exact source.
git rev-parse HEAD
git status --short
supabase projects list --output json
supabase migration list --linked
Get-FileHash -Algorithm SHA256 -LiteralPath `
  supabase/migrations/20260811135000_tongs_reference_visual_sequence_policy_clean_init_bridge.sql, `
  supabase/migrations/20260816190000_tongs_hammer_editorial_authority_revision.sql, `
  supabase/migrations/20260819120000_tongs_hammer_editorial_authority_terminal_conflict.sql

# 2. Preview only. Stop unless exactly the two expected files are listed.
supabase db push --linked --include-all --dry-run

# 3. Deployment — run only after a separate explicit approval names this command and hashes.
supabase db push --linked --include-all
```

Expected dry-run execution list, in order:

```text
20260811135000_tongs_reference_visual_sequence_policy_clean_init_bridge.sql
20260819120000_tongs_hammer_editorial_authority_terminal_conflict.sql
```

Expected database effects:

1. Record `20260811135000` in `supabase_migrations.schema_migrations`; its guarded body performs no schema mutation because `20260811140000` is already recorded.
2. Replace `tongs.acknowledge_hammer_editorial_authority` with the reviewed equivalent whose zero-row conflict uses `PT409` instead of `40001`.
3. Record `20260819120000` once.
4. No column, table, policy, grant, pointer tuple, artifact, or application-data row changes.

If the fresh dry run lists anything else, deployment must stop. The operator must not use migration repair, edit a deployed migration, manually apply SQL, or accept an expanded migration set.

## 5. Risk assessment and stop conditions

| Risk | Control |
| --- | --- |
| Backdated migration unexpectedly mutates policy | ledger proof for `20260811140000`; post-deploy policy comparison; stop on ledger drift |
| `--include-all` captures an unrelated migration | fresh dry run must list exactly the two hashed files |
| RPC posture or authorization broadens | byte/review comparison plus post-deploy owner/security/search-path/ACL checks |
| CAS behavior regresses | writer remains disabled; CP-5 disposable matrix already passed; production metadata verification precedes any runtime release |
| Existing authority data changes | migrations contain no data update; compare column/pointer aggregates metadata-only if separately approved |
| CLI targets wrong project | require linked ref `wtvdjndyxegudufrompx`, project status `ACTIVE_HEALTHY`, and operator verbal confirmation before deployment |

Stop immediately if:

- HEAD, migration hashes, linked project ref, or worktree scope differs;
- the ledger no longer has `20260811140000` and `20260816190000` exactly once;
- either proposed migration is already present unexpectedly;
- the dry run lists anything except `20260811135000` and `20260819120000` in that order;
- a current production metadata contract differs from section 3;
- no acceptable fresh backup/recovery point is available;
- the writer cannot be confirmed disabled;
- any command requests migration repair, destructive rollback, seed inclusion, or manual SQL;
- authorization scope expands to Florida, Anvil, application data, or CP-7 and later work.

## 6. Backup and non-destructive recovery posture

Metadata-only `supabase backups list --project-ref wtvdjndyxegudufrompx` reported WAL-G enabled, PITR disabled, and completed physical backups for 2026-08-12 through 2026-08-18. The latest observed completed backup was `2026-08-18T06:28:51.960Z`.

Before deployment, the operator must verify a current completed backup acceptable to the production owner. Absence or failure of that recovery point is a stop condition. No restore is part of this package.

If post-deployment verification fails:

1. Keep or immediately disable the production writer; do not issue authority writes.
2. Do not delete the three columns, policies, function, or migration ledger rows.
3. Do not clear or rewrite any editorial-authority pointer.
4. Preserve production state and capture metadata evidence.
5. Prepare a new reviewed forward migration that restores/corrects the RPC contract.
6. Use physical backup recovery only for a separately authorized database-wide incident where forward correction is insufficient.

## 7. Immediate post-deployment metadata-only verification

CP-7 is separate and does not begin under this package. After a future approved deployment, run only metadata reads until the production schema is accepted:

```powershell
supabase migration list --linked
supabase db dump --linked --schema tongs --file $env:TEMP\cp7-tongs-schema.sql
```

Verify with catalog queries or the schema dump:

```sql
select version, count(*)
from supabase_migrations.schema_migrations
where version in ('20260811135000', '20260811140000', '20260816190000', '20260819120000')
group by version order by version;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'tongs'
  and table_name = 'recording_revisions'
  and column_name like 'editorial_authority_%'
order by column_name;

select p.rolname as owner, pr.prosecdef, pr.proconfig,
       pg_get_functiondef(pr.oid) as definition,
       pr.proacl
from pg_proc pr
join pg_namespace n on n.oid = pr.pronamespace
join pg_roles p on p.oid = pr.proowner
where n.nspname = 'tongs'
  and pr.proname = 'acknowledge_hammer_editorial_authority';

select relrowsecurity, relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'tongs' and c.relname = 'recording_revisions';

select polname, polcmd, polroles, polqual, polwithcheck
from pg_policy
where polrelid = 'tongs.recording_revisions'::regclass
order by polname;
```

Pass conditions:

- all four named ledger versions exist exactly once;
- the columns, comments, constraint, policies, and table grants match section 3;
- the RPC still has identical signature, return shape, owner, `SECURITY DEFINER`, locked search path, authorization/identity/path/CAS predicates, grants, and revokes;
- the sole functional difference is `PT409` in the zero-row expected-conflict branch;
- production writer remains disabled and no application-data or authority pointer write has occurred.

## 8. Reviewer approval block

Approval must be explicit and must bind the project, HEAD, hashes, expected two-file dry run, backup posture, and exact deployment command.

```text
Production project: wtvdjndyxegudufrompx
Reviewed HEAD: de34e94a34ebaba9f9413e7fcc044270fa9f7e74
Approved migration hashes:
  20260811135000 7547f3de3a04f2484c7d7445221ea22296918527c4a4ca0998fde467c71266f7
  20260819120000 1b85cd592c9705bf6a374c185e8f208afd73ba85616f31ed8f2881f32c16dd5a
Expected dry run: exactly 20260811135000, then 20260819120000
Approved command: supabase db push --linked --include-all
Backup/recovery point verified at: ____________________
Writer confirmed disabled by: ________________________
Reviewer: ____________________________________________
Approval timestamp: __________________________________
Explicit approval statement: _________________________
```

Approval of this production schema migration does not authorize any Florida Oranges artifact or pointer write. Florida remains governed by the separate CP-8 dry run and CP-9 single-use write approval. CP-7 has not begun.
