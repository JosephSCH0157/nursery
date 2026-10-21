# Historical upgrade certification status

## Evidence classes

Gate 4 keeps three forms of evidence separate:

1. **Genuine historical upgrade certification** starts from a disposable database whose migration history and schema were derived through a supported restoration or branch mechanism from the qualifying existing project, contains no customer/financial/operational data, and then executes the pending migrations normally.
2. **Schema-equivalent compatibility testing** creates the approved baseline and executes the identical shared tail. It proves the target catalog and behavior but does not prove the existing database's upgrade transition.
3. **Read-only production preflight** checks the hosted catalog/history and performs a CLI dry run. It proves qualification and migration discovery but does not execute the transition.

Gate 4 completed classes 2 and 3. Class 1 remains unexecuted, so hosted upgrade certification is still blocked.

## Supported options evaluated

- A local schema-only database cannot be called a genuine historical upgrade unless its history is obtained through a supported mechanism. Synthesizing `supabase_migrations.schema_migrations`, using `migration repair`, or using `--include-all` is prohibited.
- Transaction rollback can validate self-contained SQL, but it does not reproduce CLI migration bookkeeping or prove the complete upgrade and therefore is supplementary evidence only.
- The linked `migration list` plus `db push --dry-run` is useful read-only preflight. It is not execution evidence.
- Supabase dashboard branches are the only identified candidate that starts from the base project's migration history while excluding production data by default. This feature is public alpha and no branch was created during Gate 4. GitHub-integrated branches instead build from repository migrations and would follow the known-broken historical replay path.

## Evidence required before a production migration approval

An owner-authorized future certification must:

1. Confirm that a Supabase-supported, data-less dashboard branch derives the exact qualifying hosted migration history and schema without customer or financial records.
2. Record the source project, branch mechanism, CLI/platform versions, 411-version starting digest, and absence of customer/operational rows.
3. Run normal migration discovery without `--include-all`, repair, or direct history writes.
4. Apply the three Slice A migrations and `20261022000000_establish_database_lineage.sql` in version order.
5. Verify the historical marker, the exact post-Slice-A catalog/security fingerprint, the approved wrappers 0.5.6 contract for hosted infrastructure, and all shared application/RLS/financial tests.
6. Destroy the disposable branch after retaining non-sensitive logs and normalized fingerprints.

If the platform cannot supply this mechanism, the residual risk remains: local baseline equivalence and hosted dry-run cannot demonstrate how the real 411-version installation behaves while executing the four pending migrations.

## Production preflight observed at Gate 4

The read-only hosted history contained 411 versions from `20260131120000` through `20261018120000`, with digest `e60976f5c3ddc853b75552dc1cbcf1b06320b5a937e24a7b567c4d361982e863`. It was a valid chronological prefix of the frozen 414-file manifest and had no `forge_meta` marker. Supabase CLI 2.84.2 dry-run discovered exactly:

1. `20261020171517_public_schema_foundation.sql`
2. `20261020171519_public_schema_reconciliation.sql`
3. `20261020171522_public_schema_security_contract.sql`
4. `20261022000000_establish_database_lineage.sql`

No write was performed.
