# HE-8C — production migration approval package

Prepared: 2026-08-22 UTC

Status: **REVIEW ONLY — RECOVERY, DRY RUN, DEPLOYMENT, RUNTIME RELEASE, AND FLORIDA HE-8 UNAUTHORIZED**

This package prepares a later decision concerning exactly:

- `20260821120000_tongs_hammer_history_atomic_components.sql`
- `20260821130000_tongs_hammer_history_atomic_readback_completion.sql`

Preparation used only Supabase project/ledger metadata and a schema-only production dump. It did not run `db push`, a dry run, migration repair, mutation SQL, an RPC, a writer, Hammer, Storage, or an application endpoint. No production row or artifact content, Florida identity, or Anvil identity was read.

## 1. Repository and production identity

| Item | Verified value |
| --- | --- |
| Repository HEAD | `3036a7ab492a0b8a34cad64fa1a3b5957ddc8ce7` |
| HE-8 implementation chain | `800b7821` → `bd02d3f6` → `3036a7ab` |
| Linked project ref | `wtvdjndyxegudufrompx` |
| Project name | `JosephSCH0157's Project` |
| Organization | `nclurylekhseghlhrvxg` |
| Region | `us-east-1` / East US (North Virginia) |
| Database | PostgreSQL `17.6.1.054`, engine 17, GA |
| Project status | `ACTIVE_HEALTHY` |
| Installed and isolated-validation Supabase CLI | `2.84.2` |

The only worktree changes at preparation time were the five pre-existing protected files listed in section 9. None is required by either migration or this package.

Approved migration hashes:

| Version | SHA-256 |
| --- | --- |
| `20260821120000` | `685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af` |
| `20260821130000` | `59843954956754578ceb57539be047a972b825fc6af6333eb0c346e6ba200fdf` |

## 2. Complete ledger reconciliation

The repository contains 189 SQL migration files with 189 distinct numeric prefixes. The reconciliation parser accepts every numeric prefix length rather than assuming a 14-digit calendar timestamp. This includes the valid legacy version `20260207` and the valid repository/ledger version `20260806136000`, whose minute field is not calendar-shaped but whose migration identity is legitimate.

`supabase migration list --linked` established:

- remote distinct versions: 187;
- local SQL versions: 189;
- duplicate local versions: 0;
- remote versions lacking a local SQL file: 0;
- local SQL versions absent remotely: exactly 2.

The two pending versions, in order, are:

```text
20260821120000_tongs_hammer_history_atomic_components.sql
20260821130000_tongs_hammer_history_atomic_readback_completion.sql
```

Every prior repository SQL migration through `20260819140000` is present remotely. No other SQL migration is pending. The non-SQL `PROD_DEPLOY_2026-03-03.md` does not match `<timestamp>_name.sql`; the CLI explicitly skips it.

External metadata evidence captured during preparation:

- raw migration listing: 11,670 bytes, SHA-256 `b30d87184992b4ad94cda48790015900e123b32d4668238cad629a701ac3a623`;
- schema-only `tongs,public` dump: 1,867,816 bytes, SHA-256 `16874bb4c43468f467e236b29fa83d89f81e7599872e9ba1e892906585608610`.

These files contained no table data. The approval record retains the decisive counts and definitions; the temporary captures are not deployment or recovery evidence.

## 3. Current production metadata baseline

Exact-name inspection proves the following proposed HE-8B1/HE-8B1A objects do not currently exist:

- table `tongs.hammer_history_epoch_atomic_parent_evidence`;
- trigger `trg_hammer_history_epoch_atomic_parent_evidence_immutable`;
- policy `hammer_history_epoch_atomic_parent_evidence_select_if_viewer`;
- commit RPC `tongs.commit_hammer_history_epoch_head_with_components(...)` in either its HE-8B1 or HE-8B1A signature;
- readback RPC `tongs.read_hammer_history_epoch_head_with_components_operation(uuid,uuid,uuid,text,text,uuid)`;
- helper `tongs.workpiece_file_set_updated_at()`;
- temporary migration-boundary helper `tongs.he8b1a_migration_boundary()`.

There is therefore no conflicting table, primary/unique/check/foreign-key constraint, index, trigger, policy, grant, function overload, or named type for the new atomic authority.

### 3.1 Existing functions and triggers that will be replaced

`tongs.workpiece_file_advance_revision()` currently:

- is a PostgreSQL-owned `plpgsql` trigger function;
- is `SECURITY INVOKER` with `search_path = pg_catalog, tongs`;
- always replaces `NEW.revision` with `OLD.revision + 1`;
- is used by `trg_workpiece_files_revision BEFORE UPDATE`;
- is revoked from `PUBLIC`; `service_role` has the existing function ACL.

`trg_workpiece_files_updated_at BEFORE UPDATE` currently calls the established `tongs.set_updated_at()` function.

`tongs.is_hammer_history_component_authority(jsonb)` currently:

- is PostgreSQL-owned, `STABLE SECURITY INVOKER`, with `search_path = pg_catalog, tongs`;
- requires exactly the five component lanes and seven authority fields per lane;
- validates each tuple against `tongs.workpiece_files`;
- currently accepts only the canonical `workpieces/<workpiece>/<path>` Storage key;
- is revoked from `PUBLIC`; `authenticated` and `service_role` currently have its established ACL.

Migration `20260821120000` replaces these definitions only to add transaction-scoped exact registry-token installation and recognition of prior, operation-owned atomic-staging authority. It does not relax component identity, hash, byte, registry revision, timestamp, bucket, content type, or registry-row equality.

### 3.2 Existing tables and pointer authority used atomically

The migrations do not add columns to these existing tables:

- `tongs.workpiece_files`: canonical registry rows keyed by workpiece/path, with SHA-256, byte count, registry revision, lossless `updated_at`, content type, Storage bucket/key, provenance, revision trigger, and updated-at trigger.
- `tongs.hammer_history_epochs`: immutable epoch anchor authority.
- `tongs.hammer_history_epoch_heads`: immutable complete post-epoch heads, unique by head identity, epoch sequence, and workpiece artifact path; parent, canonical-path, hash, byte, revision, and state checks remain unchanged.
- `tongs.hammer_history_epoch_head_transitions`: append-only operation receipts with unique idempotency/operation/head/path authority and immutable triggers.
- `tongs.recording_revisions`: existing `history_path text NULL` pointer and exact `updated_at` CAS token.
- `tongs.episodes`: `active_revision_id` selects the active recording revision.

Existing epoch/head tables remain owned by `postgres`, RLS-enabled, viewer-readable through `has_workspace_role(workspace_id, 'viewer')`, and directly immutable. `authenticated` has select-only table authority on epoch/head evidence; `service_role` has table ACLs but immutable triggers reject update/delete of committed evidence.

`recording_revisions` remains RLS-enabled. Its policies are:

- viewer-scoped authenticated `SELECT`;
- editor-scoped `INSERT` with creator/updater identity checks;
- editor-scoped `DELETE`;
- editor-scoped update policy with updater identity check.

Table grants remain `anon SELECT`, `authenticated SELECT, INSERT, DELETE`, and `service_role ALL`. Because authenticated lacks table-level `UPDATE`, application users cannot directly change `history_path`; only reviewed RPC authority can CAS the pointer.

The established `commit_hammer_history_epoch_head(...)` remains PostgreSQL-owned, `SECURITY DEFINER`, and locked to `search_path = pg_catalog, tongs`. It validates active revision, epoch, exact parent, component authority, canonical head path/envelope, sequence, registry evidence, idempotency, expected history pointer, and exact revision token before appending the immutable head/transition and advancing `recording_revisions.history_path`. Neither HE-8 migration changes that function.

## 4. Exact proposed migration effects

Both files are transactional. Applying their DDL performs no backfill, invokes no commit RPC, creates no epoch/head row, changes no existing pointer, and updates no existing application row.

### 4.1 `20260821120000` — unified component-and-head authority

Replaces `workpiece_file_advance_revision()` so ordinary writes still advance by one, while the transaction-local `tongs.history_atomic_registry_tokens = on` mode requires the caller-supplied revision to equal `OLD.revision + 1` exactly.

Adds `workpiece_file_set_updated_at()` and repoints `trg_workpiece_files_updated_at` to it. Ordinary updates still receive `now()`; the atomic transaction preserves its validated lossless timestamp token.

Replaces `is_hammer_history_component_authority(jsonb)` so a registry-selected component may use either its canonical Storage key or an operation-owned key below `workpieces/<workpiece>/hammer/staging/history-atomic/<operation>/`. All five identities and registry values still have to match the authoritative row.

Adds the initial unified commit RPC:

```text
tongs.commit_hammer_history_epoch_head_with_components(
  uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,
  uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,
  timestamptz,text,text,text,jsonb,jsonb
) returns jsonb
```

It is owned by `postgres`, `SECURITY DEFINER`, and locked to `search_path = pg_catalog, tongs`. `PUBLIC`/anonymous execution is unavailable; `authenticated` and `service_role` receive `EXECUTE`. It requires an authenticated workspace editor and one locked active-revision transaction. The frozen CAS basis covers revision identity/token, history pointer, parent tuple, every changed component tuple, sequence, idempotency key, and operation fingerprint. It installs only changed registry authority, inserts the staged head registry row, delegates immutable head/transition/pointer installation to the established head RPC, and rolls every registry/head/pointer effect back on a terminal conflict.

Adds the initial authorized readback wrapper:

```text
tongs.read_hammer_history_epoch_head_with_components_operation(
  uuid,uuid,uuid,text,text,uuid
) returns jsonb
```

It is PostgreSQL-owned, `STABLE SECURITY INVOKER`, and locked to `search_path = pg_catalog, tongs`; `PUBLIC` is revoked and `authenticated`/`service_role` receive `EXECUTE`.

### 4.2 `20260821130000` — parent evidence and conclusive readback

Creates `tongs.hammer_history_epoch_atomic_parent_evidence`:

| Column | Contract |
| --- | --- |
| `transition_id uuid` | primary key; FK to head transition, `ON DELETE RESTRICT` |
| `workspace_id uuid` | not null; workspace FK, restrict |
| `workpiece_id uuid` | not null; episode FK, restrict |
| `recording_revision_id uuid` | not null; recording revision FK, restrict |
| `idempotency_key text` | not null |
| `parent_bytes bigint` | not null; check `> 0` |
| `created_at timestamptz` | not null; default `now()` |

It also adds a unique constraint on workspace/workpiece/revision/idempotency key, table and `parent_bytes` comments, an immutable update/delete trigger, RLS, and exactly one authenticated viewer-select policy using `has_workspace_role(workspace_id, 'viewer')`. Authenticated receives `SELECT` and explicit mutation revokes; `service_role` receives `ALL`, subject to the immutable trigger. No additional index beyond those backing the primary and unique constraints is added.

The migration drops only the just-installed HE-8B1 commit overload and creates the final signature with `p_parent_bytes bigint`. The final RPC preserves the owner, security posture, locked search path, authorization, joins, canonical-path validation, component CAS, head CAS, rollback behavior, grants, and revokes. It additionally locks and validates the exact parent registry row—including path, SHA-256, bytes, revision, timestamp, content type, hash algorithm, bucket, and canonical key—and persists `parent_bytes` as immutable operation evidence. Exact replay includes that value.

The readback RPC is replaced with a PostgreSQL-owned `STABLE SECURITY INVOKER` function using the same locked search path and viewer authorization. One response returns the operation/idempotency identity, complete transition and envelope, frozen component plan, resulting component authority/state hash, exact parent and head tuples including byte counts and lossless tokens, final history pointer, and revision token. It distinguishes committed, conflicting replacement, conclusive absence, missing evidence, and unauthorized access.

The temporary `he8b1a_migration_boundary()` exists only inside the transaction to impose creation ordering and is dropped before commit.

## 5. Recovery gate — required before either push command

This package is not recovery certification. No `supabase db push` command—including `--dry-run`—may run until a fresh, external, ACL-restricted recovery package is positively certified for the complete application-owned blast radius:

1. current `tongs` and affected `public` schema DDL;
2. complete `workpiece_files`, `recording_revisions`, epoch, head, and transition definitions plus the application-owned data needed to restore their exact predeployment authority;
3. current pointer/token and relevant registry-authority manifests without interpreting artifact bytes;
4. the current function bodies, owners, security modes, search paths, ACLs, triggers, RLS, policies, grants, constraints, indexes, and comments listed in section 3;
5. the complete 187-version production migration ledger;
6. individual file sizes/SHA-256 values and a signed manifest stored outside the repository;
7. a loopback-confined restore rehearsal proving table-by-table counts, deterministic metadata, pointers, registry tuples, functions, ACLs, RLS, policies, constraints, indexes, comments, and the ledger can be restored exactly;
8. a local application of both proposed migrations followed by restoration of the captured predeployment authority.

Provider-owned Auth/Storage service internals are outside portability certification unless needed to restore an application-owned dependency. Any application-owned object or authority that cannot be restored exactly is a stop condition.

```text
Recovery package identity: ______________________________________
Capture completion time (UTC): _________________________________
External ACL-restricted location: ______________________________
Manifest SHA-256: ______________________________________________
Application-owned restore rehearsal: PASS / FAIL
Postmigration-to-predeployment recovery rehearsal: PASS / FAIL
Reviewer: ______________________________________________________
Certification accepted: _______________________________________
```

## 6. Derived deployment preview — not executed

After recovery certification and a separate explicit dry-run authorization, the only permitted preview command is:

```powershell
supabase db push --linked --include-all --dry-run
```

The expected output is exactly these two files, in order:

```text
20260821120000_tongs_hammer_history_atomic_components.sql
20260821130000_tongs_hammer_history_atomic_readback_completion.sql
```

Stop if the linked ref differs from `wtvdjndyxegudufrompx`; either file hash differs; any additional migration, seed, repair, reset, destructive action, or unrelated SQL appears; the order differs; or the CLI asks for broader action. Do not answer an unexpected prompt affirmatively.

Only after separate review of that exact dry-run evidence and separate deployment authorization may the operator use:

```powershell
supabase db push --linked --include-all
```

Migration repair, manual SQL, partial application, `--include-all` against an unverified ledger, and improvised rollback are prohibited.

## 7. Immediate metadata-only postdeployment verification plan

Before application runtime release or any writer/RPC call:

1. Reconcile the complete ledger with the same all-numeric-version rule. Require 189 distinct remote versions, each migration exactly once, and no unrelated advancement.
2. Recompute both migration hashes and compare them with section 1.
3. Capture a fresh schema-only dump and compare every pre-existing object in section 3. Only the reviewed replacements/additions may differ.
4. Verify the final commit/readback signatures, returns, full bodies, owner `postgres`, security modes, locked `search_path = pg_catalog, tongs`, comments, execute grants, and revokes.
5. Verify the parent-evidence table's exact columns/defaults/nullability, primary/unique/check/foreign-key constraints, comments, owner, RLS, viewer policy, grants/revokes, immutable trigger, and absence of unexpected indexes or policies.
6. Verify `workpiece_files` structure, row count, deterministic registry manifest, grants, RLS, and all unrelated triggers remain unchanged; only the reviewed revision/updated-at trigger function definitions may differ.
7. Verify `recording_revisions` structure, row count, pointer/token manifest, RLS, policies, grants, comments, constraints, indexes, and triggers remain unchanged.
8. Verify epoch/head/transition existing row counts and deterministic metadata manifests remain unchanged. Verify the new parent-evidence table has zero rows immediately after DDL deployment.
9. Verify no Storage registry row, history pointer, revision token, epoch/head/transition row, or application-owned data changed during DDL deployment.
10. Keep the runtime writer disabled/unreleased. Do not invoke either RPC, a writer, Hammer, Storage, session-open, recovery, Florida, or Anvil.

Suggested read-only verification queries must be executed only after deployment authorization and should use catalog views/functions such as `pg_proc`, `pg_get_functiondef`, `pg_class`, `pg_attribute`, `pg_constraint`, `pg_get_constraintdef`, `pg_indexes`, `pg_trigger`, `pg_get_triggerdef`, `pg_policy`, `pg_get_expr`, `information_schema.role_table_grants`, and `information_schema.routine_privileges`, plus metadata-only aggregate/manifests captured by the recovery certification. Never call the commit or readback functions to verify DDL.

## 8. Explicit stop conditions and recovery posture

Stop before deployment if any of the following occurs:

- HEAD, linked project, project health, worktree boundary, migration hash, ledger count, or pending set differs;
- fresh scoped recovery is missing, stale, anonymous, incomplete, or not restore-rehearsed;
- a proposed object exists unexpectedly or current schema/ACL/RLS/pointer authority differs from this baseline;
- the dry run contains anything except the two reviewed files in order;
- the CLI requests repair, reset, seed, destructive action, or broader confirmation.

Stop after deployment and keep the application writer disabled if metadata differs, an unrelated ledger version appears, any existing row/registry/pointer/token changes, or the new table is nonempty. Preserve evidence and use a separately reviewed forward correction or the certified application-owned recovery procedure. Do not clear pointers, delete evidence, drop tables, alter the ledger manually, or improvise rollback.

Application runtime deployment is a separate approval after metadata verification. Florida HE-8 is another separate, single-use authorization after both migration and runtime gates pass. Neither is implied by schema deployment.

## 9. Protected worktree boundary

The following pre-existing modifications were byte-pinned before metadata access and must remain excluded:

- `apps/hammer/HAMMER_QUENCH_HANDOFF_SPEC.md` — `bfd2448bd60cf25a8960e53af396f68d936d780ca47b7b9441e0e3dc023bab93`
- `apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md` — `e4bcc45545fd9589731586d3b7b8edc948a03b7a4a4fb59b1b4c88aaacc418a7`
- `apps/quench/README.md` — `d43e5d5f023a42447107beb383108c4405ed20be3b7c446b2b35bae59a1c51c0`
- `docs/QUENCH_MANIFEST.md` — `f426808497c7d04a36f39ba4f331672aad83918d3ec84e89556add1279e35c15`
- `apps/nursery/public/forge-nav.json` — `e25a95808b9b5f7ae7eb0359360b9bda70e88a360db54b184e561f55626538ba`

## 10. Reviewer approval block

This document authorizes nothing beyond review. A later instruction must separately name the recovery certification and then authorize the exact dry run. Deployment requires another explicit approval after that preview passes.

```text
Production project: wtvdjndyxegudufrompx
Migration 20260821120000 SHA-256:
  685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af
Migration 20260821130000 SHA-256:
  59843954956754578ceb57539be047a972b825fc6af6333eb0c346e6ba200fdf
Expected dry run: exactly 20260821120000, then 20260821130000
Recovery certification identity/hash: __________________________
Recovery certification accepted: ______________________________
Dry-run authorization: ________________________________________
Dry-run evidence reviewed: ____________________________________
Deployment authorization: _____________________________________
Application runtime authorization: separate / not granted
Florida HE-8 authorization: separate / not granted
Reviewer: _____________________________________________________
Approval timestamp: ___________________________________________
```

Until those gates are satisfied, both `db push` commands, application deployment, and Florida HE-8 remain unauthorized.
