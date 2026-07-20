# Nursery Phase 3A — Bar-Stock database validation

## Scope and environment

Phase 3A validates the persistence-authority migration only. No Bar-Stock
production repository, hydration, retry, import, state, or UI behavior changed.

Executable environment:

- local disposable Supabase stack;
- Docker Desktop 29.4.0, `desktop-linux` context;
- Supabase CLI 2.84.2;
- PostgreSQL exposed locally at `127.0.0.1:54322`;
- database container `supabase_db_nursery`;
- complete repository migration chain applied with
  `supabase db reset --local --no-seed`.

The CLI twice returned an upstream 502 during its post-reset container restart.
In both cases the PostgreSQL container subsequently reported healthy and the
`supabase_migrations.schema_migrations` ledger ended at
`20260713170000`. This was a local orchestration limitation, not a migration
application error.

No remote or production Supabase environment was modified.

## Security and correctness review

The executable review found and corrected three defects in the checkpoint SQL:

1. Invoker-security RPCs could not remain usable after direct authenticated
   table writes were revoked. Mutation RPCs are now explicitly postgres-owned
   `SECURITY DEFINER` functions with `search_path = pg_catalog, tongs`.
2. Authenticated clients retained direct insert/update/delete grants and could
   bypass compare-and-swap. Those grants are now revoked; authenticated reads
   remain available under RLS.
3. Reusing an import key with a different canonical UUID was reported as a
   duplicate. It now returns `conflict` without returning the conflicting row.

Additional hardening:

- the pre-existing definer workspace-consistency triggers now use the same safe
  non-public search path;
- trigger functions are not directly executable by public, anonymous, or
  authenticated roles;
- unauthorized authenticated mutations return structured `denied` results
  before any row lookup;
- anonymous callers have no RPC execution grant;
- server-owned revision triggers advance every successful update;
- compare-and-swap predicates allow exactly one writer for a revision;
- failed workspace-consistency checks abort the statement atomically;
- only admins may hard-delete assignments, and linked assignments return
  `linked` without deleting either the link or Workpiece.

The migration remains one explicit transaction. DDL, grants, ownership changes,
functions, indexes, and comments therefore commit or roll back together.

## Executable matrix

`scripts/verify-barstock-persistence-db.mjs` executes PostgreSQL sessions as
`anon`, `authenticated` viewer/editor/admin members, and a member of another
workspace. It verifies:

- function ownership, definer flags, safe search paths, grants, and direct-write
  revocation;
- anonymous, viewer, editor, admin, and other-workspace behavior;
- Assignment create/update/archive/delete;
- Spark create/archive and cross-workspace assignment rejection;
- saved, duplicate, conflict, stale, denied, not-found, linked, and deleted
  outcomes;
- malformed and missing identifiers;
- revision advancement and stale-row return;
- two genuinely concurrent PostgreSQL sessions with exactly one CAS winner;
- duplicate retry returns the prior canonical row;
- idempotency-key conflict discloses no row;
- RLS-scoped hydration;
- Spark failure atomicity; and
- Workpiece preservation after a protected delete attempt.

All executable assertions pass.

## Deployment status

The corrected migration is applied only to the disposable local Supabase
database. It is not deployed to any shared development, staging, or production
environment. Phase 3B remains blocked pending review and explicit authorization.
