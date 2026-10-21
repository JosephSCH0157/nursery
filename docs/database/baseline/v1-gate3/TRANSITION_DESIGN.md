# Historical-lineage transition and shared tail

No transition migration is created in Gate 3.

The first owner-approved shared-tail migration, at a version beginning `20261022000000`, must be identical in both lineages and perform one fail-closed action:

- On a historical database with all 414 manifest versions and no `forge_meta.database_lineage`, transactionally create the private marker contract and insert `historical-v1`.
- On a baseline database, require the existing singleton marker to be `baseline-v1` and leave it unchanged.
- Reject a nonempty or incompatible `forge_meta` schema, mixed baseline/historical migration versions, a missing baseline marker, or an unexpected marker value.

That migration must not replay history, alter hosted migration records, or change an application object. The deployment wrapper must run the read-only lineage guard before `supabase db push` and again after migration. Existing hosted databases continue using the repository-root historical workdir; fresh databases use `database/canonical-baseline-v1`. The historical root is prohibited for bootstrap.

Future tail files have one canonical source: root `supabase/migrations`, versioned at or above `20261022000000`. A baseline assembly step copies those exact files, without edits, into the baseline workdir. `verify-supabase-lineage.ps1` rejects missing, extra, changed, pre-tail, historical, or reserved-range files in the baseline workdir. CI must compare version sets and SHA-256 bytes before any migration command.

Rollback is forward-only. A failed baseline bootstrap destroys only its disposable database and retries from the immutable baseline. A failed shared tail leaves its transaction unapplied; recovery is a new shared-tail migration. Neither lineage may be switched, rebased, or repaired by editing migration history.

## Stop conditions

- Hosted history differs from the 414-file manifest.
- A database contains both historical and baseline versions.
- Marker, migration versions, or tail bytes disagree with the selected workdir.
- The first shared-tail transition cannot be expressed as one transaction without changing production behavior.
- Supabase CLI requires `--include-all`, history repair, or unsupported migration discovery.
