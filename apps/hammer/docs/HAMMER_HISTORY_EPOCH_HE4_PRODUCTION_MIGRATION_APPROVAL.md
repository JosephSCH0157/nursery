# Hammer history epochs — HE-4 production migration approval package

Prepared: 2026-08-20 UTC

Status: **REVIEW ONLY — DEPLOYMENT UNAUTHORIZED**

This package prepares, but does not authorize, production deployment of exactly:

- `20260819130000_tongs_hammer_history_epochs.sql` — history epoch authority;
- `20260819140000_tongs_hammer_history_epoch_heads.sql` — immutable epoch-head authority.

No `db push`, application deployment, writer call, Hammer open, artifact read, data query, or mutation was performed while preparing this record.

## 1. Mandatory preflight

| Item | Verified value |
| --- | --- |
| Repository HEAD | `6d8bccd766d9ee4d6ce2978def845245a8306e74` |
| Worktree exception | only the protected pre-existing `apps/nursery/public/forge-nav.json` modification; excluded from this commit |
| Linked project ref | `wtvdjndyxegudufrompx` |
| Project name | `JosephSCH0157's Project` |
| Region | `us-east-1` |
| Database | PostgreSQL `17.6.1.054` |
| Project status | `ACTIVE_HEALTHY` |
| Installed Supabase CLI | `2.84.2` |
| Isolated HE-3 validation CLI | `2.84.2` |

Migration hashes:

| Version | SHA-256 |
| --- | --- |
| `20260819130000` | `451ab7715e700378ba705db50b6889a26bd075310208c7707252490135ac5700` |
| `20260819140000` | `1b6561f6fe1cc7654b91e403062ad3010b0f04bbe4d5db07153368047c6cb988` |

`supabase migration list --linked` produced 187 recognized local rows: 185 paired remote versions and exactly two local-only versions, `20260819130000` and `20260819140000`. Every prior recognized local migration was paired (`185/185`), every remote version appeared exactly once, and there was no remote-only or duplicate remote version. In particular, the previously authorized migrations through `20260819120000` remain recorded exactly once.

The repository contains 187 `.sql` files plus `PROD_DEPLOY_2026-03-03.md`. The CLI reports:

```text
Skipping migration PROD_DEPLOY_2026-03-03.md... (file name must match pattern "<timestamp>_name.sql")
```

The non-SQL deployment document is therefore ignored. Ledger comparison proves no SQL migration other than the two named files is pending.

## 2. Current production metadata baseline

Evidence was captured with project listing, migration-ledger listing, and a schema-only dump of `tongs,public`. The dump contained definitions only, was written outside the repository, had SHA-256 `a3fdbc4cd743d301ff3bbb783d60e1c7c7378d65aa4fb1d9b4936779812dfcbd`, and was 1,796,397 bytes. No table data, history bytes, artifact bytes, pointer value, Florida identity, or Anvil identity was read.

Exact-name searches of the production schema returned zero occurrences for:

- tables `tongs.hammer_history_epochs`, `tongs.hammer_history_epoch_transitions`, `tongs.hammer_history_epoch_heads`, and `tongs.hammer_history_epoch_head_transitions`;
- RPCs `tongs.commit_hammer_history_epoch`, `tongs.read_hammer_history_epoch_operation`, `tongs.commit_hammer_history_epoch_head`, and `tongs.read_hammer_history_epoch_head_operation`.

Because none of the exact prefixes occur, there is no conflicting epoch/head policy, grant, constraint, index, trigger, helper function, or named type in production.

The established revision pointer remains `tongs.recording_revisions.history_path text null`; `tongs.episodes.active_revision_id` continues to reference `tongs.recording_revisions(id)`. The proposed migrations do not add, replace, default, or backfill either pointer.

Current `recording_revisions` protection is unchanged:

- RLS is enabled;
- `recording_revisions_select_if_workspace_viewer`: authenticated `SELECT`, `has_workspace_role(workspace_id, 'viewer')`;
- `recording_revisions_insert_if_workspace_editor`: authenticated `INSERT`, editor role plus creator/updater identity checks;
- `recording_revisions_delete_if_workspace_editor`: authenticated `DELETE`, editor role;
- `recording_revisions_update_if_workspace_editor`: editor-role `USING` and updater `WITH CHECK` policy;
- grants remain `anon SELECT`, `authenticated SELECT, INSERT, DELETE`, and `service_role ALL`;
- authenticated has no table-level `UPDATE`, so direct pointer mutation remains denied.

## 3. Exact migration contract

Both migrations are additive, transactional, and contain no backfill or update of an existing application row. Existing `recording_revisions` rows change only later through an explicitly invoked CAS RPC; applying the DDL alone cannot move `history_path`.

### 3.1 `20260819130000` — epoch authority

Adds helper `tongs.is_hammer_history_component_sha256(jsonb)`, validating the five component SHA-256 values.

Adds `tongs.hammer_history_epochs`, one immutable authority row per epoch, with:

- UUID identities for epoch, workspace, workpiece, canonical recording, and recording revision;
- schema version 1;
- canonical epoch artifact path, SHA-256, positive byte count, registry revision, and exact registry timestamp;
- base editor-state hash and five component hashes;
- fixed creation reason `legacy_history_unrecoverable`;
- original predecessor and canonical archive paths plus exact predecessor/archive registry authority;
- initiating user and creation timestamp;
- foreign keys to workspaces, episodes, canonical recordings, recording revisions, and Auth users;
- checks for canonical paths, positive values, hashes, and distinct original/archive/epoch paths;
- unique composite identity, workpiece artifact path, and workpiece archive path;
- revision/creation index.

Adds append-only `tongs.hammer_history_epoch_transitions`, recording expected and committed pointers/tokens, complete predecessor/archive/epoch registry tuples, operation fingerprint, idempotency key, actor, outcome, and commit time. Uniqueness covers epoch, workspace/workpiece/revision/idempotency key, and committed path. Its identity foreign key and path-consistency check bind the receipt to its immutable epoch.

Adds immutable triggers for epoch/transition rows and for committed history registry rows.

Adds viewer-select RLS policies on both tables using `tongs.has_workspace_role(workspace_id, 'viewer')`. Authenticated receives `SELECT` only and has `INSERT/UPDATE/DELETE` revoked. `service_role` receives `ALL`, but immutable triggers still reject mutation of committed evidence.

Adds:

```text
tongs.commit_hammer_history_epoch(
  uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,bigint,
  timestamptz,text,bigint,text,bigint,timestamptz,text,bigint,
  timestamptz,text,bigint,text,jsonb
) returns jsonb
```

The commit RPC is owned by `postgres`, is `SECURITY DEFINER`, and locks `search_path` to `pg_catalog, tongs`. It requires an authenticated editor, validates all workspace/workpiece/recording/active-revision relationships and canonical paths, validates exact registry bytes/hashes/revisions/timestamps, archives the predecessor, appends authority/receipt rows, and CAS-updates `recording_revisions.history_path` using the expected pointer and exact `updated_at` token. Stale, foreign, invalid, duplicate, or ambiguous authority fails closed.

Adds invoker-safe readback:

```text
tongs.read_hammer_history_epoch_operation(uuid,uuid,uuid,text) returns jsonb
```

Readback requires workspace-viewer authority. `PUBLIC` has all function privileges revoked; `authenticated` and `service_role` receive `EXECUTE` on helper, commit, and readback functions.

### 3.2 `20260819140000` — immutable epoch heads

Adds invoker-safe helper `tongs.is_hammer_history_component_authority(jsonb)`. It requires exactly five components—transcript, visual timeline, visual placements, audio, and editorial authority—and exactly seven fields per component: `workpiece_id`, `path`, `sha256`, `bytes`, `registry_revision`, `registry_updated_at`, and `content_type`. It confirms each tuple against `tongs.workpiece_files` and canonical Storage addressing.

Adds `tongs.hammer_history_epoch_heads`, with:

- head and epoch identities plus workspace/workpiece/recording/revision authority;
- positive monotonic sequence and schema version 1;
- canonical immutable head path and exact registry tuple;
- parent kind, optional parent head, parent path/hash/revision/timestamp;
- base and result editor-state hashes;
- base component hashes and complete result component authority;
- initiating user and creation timestamp;
- epoch identity foreign key;
- unique head identity, epoch sequence, and workpiece artifact path;
- checks enforcing canonical path, sequence-1 anchor parent, later head parent, and parent/artifact distinction;
- revision/epoch/descending-sequence index.

Adds append-only `tongs.hammer_history_epoch_head_transitions`, recording the exact expected pointer/revision token, committed pointer/token, parent and candidate registry authority, resulting state/component authority, complete envelope, idempotency identity, actor, and outcome. Uniqueness covers head, epoch sequence, operation identity, and committed path.

Adds parent-validation and immutable triggers. The parent trigger requires sequence continuity, exact anchor/head parent authority, the active revision pointer, and an identity-consistent immutable chain.

Adds viewer-select RLS policies using `has_workspace_role(workspace_id, 'viewer')`. Authenticated receives `SELECT` only with direct `INSERT/UPDATE/DELETE` revoked; `service_role` receives `ALL`, subject to immutability triggers.

Adds:

```text
tongs.commit_hammer_history_epoch_head(
  uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,
  uuid,text,bigint,timestamptz,text,text,bigint,bigint,timestamptz,
  text,jsonb,jsonb
) returns jsonb
```

The head commit RPC is owned by `postgres`, is `SECURITY DEFINER`, locks `search_path` to `pg_catalog, tongs`, requires an authenticated editor, validates active revision and epoch identities, exact parent and component authority, canonical path/envelope, sequence, registry metadata, idempotency, expected pointer, and exact revision timestamp, then appends the head/receipt and CAS-advances `history_path` atomically.

Adds invoker-safe readback:

```text
tongs.read_hammer_history_epoch_head_operation(uuid,uuid,uuid,text,text,uuid) returns jsonb
```

Readback requires workspace-viewer authority. `PUBLIC` is revoked; `authenticated` and `service_role` receive `EXECUTE` on helper, commit, and readback functions.

## 4. Recovery gate — mandatory before any deployment

This package does not certify a fresh recovery point. Deployment must stop until a new recovery bundle positively covers the complete application-owned blast radius:

1. schema definitions for `tongs` and affected `public` objects;
2. all existing `tongs.recording_revisions` rows, exact `history_path` and `updated_at` values, row count, grants, RLS, policies, constraints, indexes, triggers, and comments;
3. predeployment DDL, owner, ACL, security mode, and search path for every function/policy the migrations depend on or replace;
4. the complete predeployment `supabase_migrations.schema_migrations` ledger;
5. deterministic row-count/metadata manifests and SHA-256 hashes for every captured file;
6. a documented, rehearsed restore procedure limited to application-owned schemas, including restoration of the prior revision-pointer state and migration-ledger evidence.

The bundle must have a unique non-secret identity, UTC completion time, durable location, manifest hash, individual evidence hashes, integrity-verification result, and positive restore/recovery certification. Provider-owned `auth`, Storage service internals, and platform schemas need not be portably reconstructed, but the application-owned foreign-key dependencies and authorization definitions must be captured sufficiently to restore the affected contract.

Required approval fields:

```text
Recovery bundle identity: __________________________________
Completion time (UTC): ____________________________________
Durable location: _________________________________________
Manifest SHA-256: _________________________________________
Application-owned restore rehearsal: PASS / FAIL
Reviewer: _________________________________________________
```

No deployment may proceed while any field is blank, the bundle is stale or anonymous, an application-owned object fails restoration, or recoverability is inferred rather than demonstrated.

## 5. Deployment preview — derived, not executed

The ledger-derived expected preview is exactly, in order:

```text
20260819130000_tongs_hammer_history_epochs.sql
20260819140000_tongs_hammer_history_epoch_heads.sql
```

No dry run was executed during HE-4 preparation because the order explicitly forbids either `db push` command. After a fresh recovery certification and separate explicit deployment approval naming the project and both migration hashes, the operator must run:

```powershell
supabase db push --linked --include-all --dry-run
```

Stop unless the linked ref is exactly `wtvdjndyxegudufrompx` and the dry run lists exactly the two files above, with no seed, repair, reset, destructive statement, unrelated migration, or prompt for broader action. Only after review of that exact preview and separate authorization may the operator run:

```powershell
supabase db push --linked --include-all
```

The operator must not answer an unexpected prompt affirmatively or use migration repair/manual SQL as a workaround.

## 6. Post-deployment metadata-only verification plan

Before any runtime release or application call, capture and compare metadata only:

1. Both versions appear exactly once; remote ledger advances by exactly two and no unrelated version changes.
2. All four tables exist with the exact columns, defaults, nullability, checks, foreign keys, unique constraints, indexes, triggers, comments, owners, and ACLs documented above.
3. Both table pairs have RLS enabled and exactly their authenticated viewer-select policies; authenticated direct mutation is denied; service-role ACLs and immutable-trigger enforcement match contract.
4. Both commit and readback RPCs have exact signatures/returns, owner `postgres`, expected security mode, locked `search_path=pg_catalog, tongs`, authorization, identity/path/registry/envelope/CAS predicates, grants, and revokes.
5. Existing `recording_revisions` table definition, grants, RLS policies, row count, aggregate pointer snapshot, and exact predeployment `history_path`/`updated_at` metadata manifest are unchanged.
6. Epoch, epoch-transition, head, and head-transition row counts are all zero immediately after DDL application.
7. Florida and Anvil `history_path` and revision-token metadata snapshots remain value-for-value unchanged against the sealed predeployment manifest. No history or artifact bytes are downloaded.
8. No writer, Hammer open, artifact upload/download, session-open, recovery control, commit/readback RPC invocation, or application endpoint is used.

Any difference is a stop condition. Keep the runtime writer disabled/unreleased, preserve all evidence, do not delete tables or clear pointers, and prepare a reviewed forward correction or separately authorized recovery.

## 7. Risk and explicit stop conditions

| Risk | Mandatory control |
| --- | --- |
| Wrong project | Reconfirm exact linked ref, name, region, and healthy status immediately before preview and deployment |
| Migration drift | Recompute both SHA-256 hashes and compare with this package |
| Unrelated pending SQL | Fresh ledger comparison and exact two-file dry run |
| Insufficient recovery | Fresh application-owned recovery bundle and successful restore rehearsal |
| Authorization broadening | Exact RLS, ACL, role-predicate, owner, security-mode, and search-path comparison |
| Pointer/data mutation | Pre/post row-count and pointer/token metadata manifests; new authority tables must remain empty |
| Partial or ambiguous deployment | Stop runtime release, capture ledger/schema metadata, use forward recovery; never improvise ledger repair |

Stop if project identity, HEAD, worktree scope, hashes, ledger pairing, baseline schema, recovery certification, or dry-run contents differ; if any requested operation could read production content; or if any prompt requests repair, reset, destructive rollback, seed application, or additional migration.

## 8. Reviewer approval block

This document does not approve deployment. A later instruction must explicitly name all of the following:

```text
Production project: wtvdjndyxegudufrompx
Migration 20260819130000 SHA-256:
  451ab7715e700378ba705db50b6889a26bd075310208c7707252490135ac5700
Migration 20260819140000 SHA-256:
  1b6561f6fe1cc7654b91e403062ad3010b0f04bbe4d5db07153368047c6cb988
Expected dry run: exactly 20260819130000, then 20260819140000
Recovery bundle identity/hash: ____________________________
Reviewer: ________________________________________________
Approval timestamp: ______________________________________
Explicit deployment approval: _____________________________
```

Until that separate approval is received, HE-4 deployment is unauthorized. No production runtime deployment, history transition, Florida or Anvil access, writer call, artifact operation, pointer change, or application mutation is permitted.
