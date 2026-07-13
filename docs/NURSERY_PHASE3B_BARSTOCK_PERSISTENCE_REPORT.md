# Phase 3B — Bar-Stock Persistence Authority

## Scope and authority

Phase 3B replaces browser-authoritative Bar-Stock state with revision-bearing,
workspace-scoped Supabase/Tongs state. It consumes the RPC and RLS contract
validated in Phase 3A. No Phase 4 behavior is included.

The Phase 3A migration remains deployed only to the local, non-production
Supabase environment. This application path must not be enabled in another
environment until migration `20260713170000_barstock_persistence_authority.sql`
has been deployed and validated there.

## Repository contract

`BarStockRepository` requires an authenticated user and resolved workspace for
all reads and writes. It exposes:

- workspace hydration and list operations;
- assignment create, update, archive, and hard delete;
- Spark create, update, and archive;
- assignment-to-Workpiece link inspection.

Reads use RLS-scoped canonical tables. Every mutation uses the Phase 3A RPCs;
there are no direct table insert, update, upsert, or delete calls in Bar-Stock.
The repository preserves the database outcomes `saved`, `duplicate`, `stale`,
`denied`, `conflict`, `not_found`, `linked`, and `deleted`, and distinguishes
transport `failed` and `unavailable` results. A write is not shown as saved
until an RPC acknowledgement returns a terminal successful result.

## Client state model

The explicit states are `loading`, `pending`, `saved`, `failed`, `denied`,
`stale`, `conflict`, `retrying`, `offline`, and `unavailable`. Stale results
retain both the local intent and the canonical server snapshot. Authentication,
workspace resolution, and successful canonical hydration are required before
the UI enables mutations.

Canonical hydration runs on authentication, initial load/refresh, workspace
change, and reconnect. A workspace switch replaces the displayed collection;
it does not merge another workspace's cached rows.

## Retry and reconciliation

The retry cache is non-canonical and workspace-scoped. Operations use stable
operation identifiers and create operations use stable idempotency keys.
Entries remain until the database acknowledges `saved`, `duplicate`, or
`deleted`. Denied, stale, conflicting, linked, failed, and unavailable entries
remain visible and actionable.

Before replaying an update or archive, reconciliation compares the operation's
expected revision with a newly hydrated canonical snapshot. A newer cloud
revision prevents the queued mutation from running and produces a stale state;
the retry cache never overwrites newer cloud state. Duplicate retries resolve
to the prior canonical result through the database idempotency contract.

## Legacy import and browser storage

Legacy v1/v2 browser rows are import input only. Import derives deterministic
UUIDs and idempotency keys, isolates malformed rows, and replays safely. If a
legacy Spark references a missing legacy assignment, import creates a stable
placeholder assignment first so the canonical foreign key is preserved.

The convenience completion marker is written only after every valid row is
acknowledged. It is not trusted as authority and does not suppress a later
idempotent replay. The old authority keys are removed only after completion.

The only intended browser storage after this change is:

- active-workspace and display preferences;
- the workspace-scoped non-canonical retry cache;
- the legacy-import convenience marker while migration is relevant.

Clearing browser storage therefore cannot delete canonical Sparks or
assignments.

## Lifecycle preservation

Assignment-to-Workpiece links are inspected before hard deletion. A linked
assignment returns the structured `linked` outcome and is not deleted. Spark
cleanup is a soft archive and does not delete or invalidate the Workpiece or
its assignment link.

## Verification evidence

The following commands passed on Node 20.20.0 and pnpm 10.30.3:

```text
pnpm --filter @nursery/bar-stock test
pnpm --filter @nursery/bar-stock typecheck
pnpm --filter @nursery/bar-stock build
pnpm --filter @nursery/bar-stock test:db
pnpm --filter @nursery/bar-stock test:db:repository
pnpm preflight:workspace
pnpm typecheck
pnpm build
git diff --check
```

The executable repository suite used local Supabase/PostgreSQL with the clean
migration chain and exercised hydration/refresh, a second client, workspace
switching and isolation, viewer denial, successful and failed mutations,
concurrent stale-write resolution, retry/reconnect, duplicate and conflicting
idempotency, legacy import and malformed input, cleared browser storage,
Spark-to-Workpiece handoff, protected cleanup, archive, and unlinked deletion.

## Environment limits and accepted baseline

- No production, staging, or shared-development database deployment was made.
- Local Supabase executable validation is evidence for the local migration
  chain, not a claim about a deployed environment.
- Previously accepted non-Phase-3 integration/browser failures and unrelated
  database lint findings were not repaired in this pass.
- Generated Anvil/Nursery mirror output from the production build is excluded
  from the Phase 3B change set.
