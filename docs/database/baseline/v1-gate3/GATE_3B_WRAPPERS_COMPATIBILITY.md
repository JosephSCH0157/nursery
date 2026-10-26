# Gate 3B wrappers compatibility evidence

## Version policy and environment inventory

Supabase [announced on 2026-08-05](https://supabase.com/changelog/extension-version-pinning-ignored) that requested versions in `CREATE EXTENSION` and `ALTER EXTENSION` are ignored and the environment default is installed. Supabase's [extension documentation](https://supabase.com/docs/guides/database/extensions) also states that available/default versions follow project infrastructure updates. The baseline therefore requests `wrappers` without a version and independently asserts the reviewed compatibility set.

Read-only hosted catalog evidence records `wrappers` 0.5.6 as installed and as the newest available version. Supabase CLI 2.84.2 selects PostgreSQL image `public.ecr.aws/supabase/postgres:17.6.1.095`; that image provides only the 0.5.7 installer. The locally cached earlier image `17.6.1.054` contains 0.5.6, but CLI configuration exposes the PostgreSQL major version rather than a source-controlled database-image pin. A transient `.temp/postgres-version` selection is therefore not an approved or reproducible certification route.

Installer artifact SHA-256 values:

- 0.5.6 from image `17.6.1.054`: `ebb023c4b9eca16d5fe557507814b7b73106a0840d6889b3ec898421d4c6eda8`
- 0.5.7 from image `17.6.1.095`: `199207c2569e9dfdba14eaafd0e690130870922dc39d7d5fdc94a9b57f7f5b1c`

## Forge dependency inventory

Hosted production contains zero foreign data wrappers, foreign servers, foreign tables, and user mappings. The extension owns 60 catalog objects (FDW handler/validator/metadata functions, embedding support objects, and its internal statistics relation/type), but no Forge-owned object depends on them. Repository searches of migrations, tests, packages, and application source found no extension API usage.

The upstream [0.5.7 release notes](https://github.com/supabase/wrappers/releases/tag/v0.5.7) confine changes to extension implementation and FDW families (including ClickHouse stream buffering and S3 Vectors changes). Forge configures none of those paths. Compatibility is therefore established for the complete Forge dependency set, which is empty, while the extension remains installed for catalog parity.

## Fail-closed comparison

`wrappers-extension-compatibility.json` records both versions and origins. Linked capture requires 0.5.6. CLI 2.84.2 local capture requires 0.5.7. The comparator checks all 15,901 identities and hashes and permits only the resulting `extension|wrappers` hash difference. Version 0.5.8, a schema/relocatability change, a changed production fingerprint, a missing/unexpected object, or any second hash difference fails certification.

This normalization changes no RLS, grant, ownership, financial, application, or production state.
