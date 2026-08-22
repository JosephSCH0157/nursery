# HE-8 production migration deployment receipt

Verification date: 2026-08-22 UTC

Project: `wtvdjndyxegudufrompx` (`JosephSCH0157's Project`, `us-east-1`, PostgreSQL 17)

Deployment baseline HEAD: `fe7bb9c62da153fd1b690fedabcb6b2e4416f892`

Result: **PASS — exactly the two approved migrations were deployed and immediate metadata-only verification passed.**

## Recovery and dry-run gates

The external HE-8D scoped recovery certification is stored at:

```text
D:\nursery-backups\wtvdjndyxegudufrompx-he8d-20260822T070927Z
```

Its manifest SHA-256 is `ac85b2e8048727f872a8c8da3902627086f0434d669aa78831e31a03c19d5e12`; its certification SHA-256 is `b3424b5064e5f84500c70a828c41e22a65d335cdb92a83673d185c8ce1bf005f`. The recovery rehearsal restored all 204 application-owned tables, 173,455 rows, all nine recording-revision pointers and microsecond tokens, schema/security metadata, and the 187-version predeployment ledger with zero differences.

The authorized dry run was preserved at:

```text
D:\nursery-backups\wtvdjndyxegudufrompx-he8-dryrun-20260822T074442Z
```

Its raw-output SHA-256 is `cfa55913d7da4815b43a4bedd1934bbb5efce2930219f770539b839f95054dd4`. It listed exactly the two approved files in order.

## Applied migrations

The authorized command was:

```powershell
supabase db push --linked --include-all
```

It applied exactly:

```text
20260821120000_tongs_hammer_history_atomic_components.sql
20260821130000_tongs_hammer_history_atomic_readback_completion.sql
```

Approved and applied file hashes:

| Version | SHA-256 |
| --- | --- |
| `20260821120000` | `685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af` |
| `20260821130000` | `59843954956754578ceb57539be047a972b825fc6af6333eb0c346e6ba200fdf` |

The complete push output is preserved externally at:

```text
D:\nursery-backups\wtvdjndyxegudufrompx-he8-deployment-20260822T074611Z\supabase-db-push-linked-include-all.raw.txt
```

Raw output SHA-256: `a76b8756073619814941369fd10b3dc4cffb29dbfa9b867017b8fd957d919f23`.

```text
Initialising login role...
Connecting to remote database...
Skipping migration PROD_DEPLOY_2026-03-03.md... (file name must match pattern "<timestamp>_name.sql")
Do you want to push these migrations to the remote database?
 • 20260821120000_tongs_hammer_history_atomic_components.sql
 • 20260821130000_tongs_hammer_history_atomic_readback_completion.sql

 [Y/n]
Applying migration 20260821120000_tongs_hammer_history_atomic_components.sql...
Applying migration 20260821130000_tongs_hammer_history_atomic_readback_completion.sql...
Finished supabase db push.
A new version of Supabase CLI is available: v2.113.0 (currently installed v2.84.2)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
```

The command exited `0`. No other SQL migration, seed, repair, reset, or destructive action appeared.

## Ledger verification

The authoritative postdeployment ledger contains:

| Measurement | Result |
| --- | ---: |
| Physical rows | 189 |
| Distinct versions | 189 |
| Duplicate versions | 0 |
| Local-only versions | 0 |
| Remote-only versions | 0 |
| `20260821120000` occurrences | 1 |
| `20260821130000` occurrences | 1 |

The final versions are `20260819130000`, `20260819140000`, `20260821120000`, and `20260821130000`. No unrelated ledger advancement occurred.

## Schema and security verification

The production schema was compared with the HE-8D locally rehearsed postmigration schema after normalization of quoting and `CREATE OR REPLACE` dump syntax.

- All five replaced/added function definitions match the certified bodies exactly: registry revision trigger, lossless timestamp trigger, component-authority validator, atomic component/head commit, and conclusive readback.
- The new parent-evidence table's complete set of 17 table/constraint/comment/RLS/policy/trigger/grant statements matches the certified DDL exactly.
- The commit RPC is owned by `postgres`, is `SECURITY DEFINER`, and locks `search_path` to `pg_catalog, tongs`.
- Readback remains `STABLE SECURITY INVOKER` with the same locked search path.
- `PUBLIC` execution is revoked; `authenticated` and `service_role` execution matches the approved contract.
- RLS is enabled and the sole authenticated viewer policy uses `tongs.has_workspace_role(workspace_id, 'viewer')`.
- Direct authenticated mutation remains unavailable, and the immutable trigger remains installed.
- The workpiece-file updated-at trigger routes to the reviewed lossless-token trigger function.

## Data no-change proof

The application-owned production data dump was compared table-by-table with the HE-8D baseline:

- pre-existing tables compared: 204;
- pre-existing rows compared: 173,455;
- deterministic row/content differences: zero;
- all existing epoch, head, and transition rows: unchanged;
- all nine `recording_revisions` pointer tuples and exact microsecond tokens: unchanged;
- new `tongs.hammer_history_epoch_atomic_parent_evidence` rows: zero;
- no other new application table or row exists.

Therefore deployment created no epoch/head operation evidence, changed no history pointer or registry authority, and performed no Florida or Anvil content mutation.

## External verification evidence

The ACL-restricted postdeployment package is:

```text
D:\nursery-backups\wtvdjndyxegudufrompx-he8-deployment-20260822T074611Z
```

Canonical evidence-manifest SHA-256: `a53629ebcdc2a309088f086097b966da559ce50e2830e6ea17f64bd90936fca1`.

Important capture hashes:

| Evidence | SHA-256 |
| --- | --- |
| Push output | `a76b8756073619814941369fd10b3dc4cffb29dbfa9b867017b8fd957d919f23` |
| Schema dump | `cd6c1cea10f797e4b8d18d1d0a9a6a63b55276bb8bb40c0afe918b015e01eec1` |
| Application data dump | `4dee2a6b002f775bfd2edcc4b3c708c9aeb1ff4d91cf87ac5fada9081bcba867` |
| Migration ledger dump | `724b4268ebb2588a2ff5a43b07c91cbe838403b66d5faf1faeaa67ea813c0ba6` |

## Operational boundary

No Hammer mount, commit/readback RPC invocation, writer call, Storage operation, Florida operation, Anvil access, migration repair, or manual SQL occurred. This receipt verifies schema deployment only. Florida HE-8 remains separately unauthorized.

The five protected pre-existing worktree modifications were excluded and remained byte-identical.
