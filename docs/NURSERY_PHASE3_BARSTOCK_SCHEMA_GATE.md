# Nursery Phase 3 — Bar-Stock schema gate

## Verification level

- Static migration and application review: completed.
- Mocked contract verification: completed by the Bar-Stock test lane.
- Local Supabase verification: unavailable because the local Docker engine is not running.
- Deployed-environment verification: not performed; no authenticated database session was available in this pass.
- Migration deployment: **not performed**.

## Existing database authority

The migration history defines `tongs.barstock_assignments`,
`tongs.barstock_sparks`, and `tongs.barstock_project_episode_links`.
Existing contracts already provide:

- UUID primary keys and workspace foreign keys;
- Spark-to-assignment `ON DELETE SET NULL` behavior;
- assignment-to-workpiece links with workspace consistency triggers;
- viewer reads, editor inserts/updates, and admin deletes through canonical RLS;
- workspace/update indexes and a unique project-to-workpiece link;
- soft-deletion fields for Sparks and archived assignment status.

The existing contracts do **not** provide:

- a server-controlled optimistic concurrency token;
- atomic stale-write rejection;
- a workspace-scoped idempotency key for legacy import or retry;
- mutation outcomes that distinguish saved, duplicate, stale, denied, and not-found states;
- a hard-delete guard that preserves an established assignment-to-workpiece identity link.

Direct browser upserts currently allow an older retry to overwrite a newer cloud
row. Their success also cannot safely distinguish a duplicate retry from a
conflicting write. Therefore the existing schema is insufficient and the Phase
3 hard gate is active.

## Required migration

`20260713170000_tongs_barstock_persistence_authority.sql` adds:

- server-controlled monotonically increasing `revision` columns;
- workspace-scoped partial unique indexes on `import_key`;
- authenticated, role-checked mutation RPCs with structured outcomes;
- compare-and-swap updates using `expected_revision`;
- idempotent create/import acknowledgement;
- soft archive operations; and
- an admin hard-delete operation that refuses to delete linked assignments.

Client-authored timestamps are deliberately not concurrency authority. The
quarantined `20260713160000` candidate used client timestamps and was rejected.

## Application work blocked on deployment

After this migration is deployed and verified, the application rewrite must:

1. Add a Bar-Stock repository interface for authenticated, workspace-scoped
   hydration and mutations through the Tongs/Supabase client.
2. Include `revision` on every canonical Assignment and Spark snapshot.
3. Treat only `saved`, `duplicate`, or `deleted` RPC outcomes as acknowledged;
   surface `stale`, `conflict`, `linked`, `not_found`, and database/RLS errors.
4. Hydrate after authentication, refresh, workspace change, and reconnect.
5. Replace direct table upserts with the migration RPCs.
6. Keep retry entries non-canonical until acknowledgement and preserve their
   operation UUID, expected revision, error, and retry count.
7. On stale retry, retain both the pending intent and returned cloud row for an
   explicit reconciliation decision; never replay over the newer revision.
8. Import legacy local rows once using deterministic canonical UUIDs and stable
   workspace-scoped import keys. Mark local import completion only after every
   row receives database acknowledgement.
9. Stop using local Assignment/Spark stores and browser ID maps as authority.
   Browser storage may retain UI preferences and the non-canonical retry cache.
10. Preserve `barstock_project_episode_links`; archive Sparks after handoff and
    never delete the resulting `tongs.episodes` Workpiece.

No production application behavior was changed in this schema-gate pass.
