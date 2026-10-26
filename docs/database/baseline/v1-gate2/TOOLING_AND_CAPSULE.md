# Lineage tooling, CI plan, and hosted-upgrade capsule

## Implemented non-deploying controls

`scripts/verify-supabase-lineage.ps1` requires an explicit lineage, workdir, database target, and mode. It enforces CLI 2.84.2, the 414-file manifest, immutable historical bytes, reserved-range collision checks, one canonical shared tail, wrong-workdir rejection, root-bootstrap refusal, and read-only migration-history/marker checks. It contains no migration application or database write.

`scripts/test-supabase-lineage-guard.ps1` creates two temporary Supabase projects. Synthetic migrations are created through `supabase migration new` and applied normally by CLI startup. The test proves historical and baseline acceptance, wrong-lineage rejection, root-bootstrap rejection, and baseline marker enforcement. Both stacks and their volumes are removed.

## Version and marker recommendation

- Historical cutoff: `20261020171522`.
- Reserved baseline epoch: `20261021000000` through `20261021235959`.
- First permissible shared-tail version: `20261022000000`.
- Marker: singleton `forge_meta.database_lineage`, outside exposed schemas.
- Recommended columns: `singleton boolean primary key check(singleton)`, `lineage text`, `baseline_contract_sha256 text`, `historical_manifest_sha256 text`, `baseline_start_version text`, `baseline_end_version text`, `shared_tail_minimum_version text`, and `installed_at timestamptz`.

The future baseline epoch creates `baseline-v1` atomically. The first shared-tail migration may create `historical-v1` only after verifying the complete 414-version historical set. Existing hosted databases without a marker are accepted only in the pre-tail state with the complete historical manifest; a shared-tail version without a marker fails closed. No marker was written in Gate 2.

## Required entrypoint changes—not implemented

| Entrypoint | Required Gate 3 change |
|---|---|
| Local reset | Replace raw root `supabase db reset` with an explicit fresh-baseline assembler and preflight. Historical root bootstrap remains forbidden. |
| Browser CI | Stop copying all root migrations into the browser workdir; assemble baseline plus canonical tail and run the guard before startup. |
| Migration certification | Replace `--include-all` and direct local history edits with separate baseline, tail, and genuine-history upgrade lanes. Preserve old scripts as non-authoritative diagnostics or quarantine them. |
| Preview projects | Require CI-created project identity, empty history, baseline workdir marker, baseline bootstrap mode, and teardown confirmation. |
| Type generation | Generate from a certified disposable post-tail database, not directly from production project `wtvdjndyxegudufrompx`. |
| Existing production upgrades | Use historical root only, verify manifest/history/marker, then normal `db push`; never include baseline files. Do not change Git-backed Netlify deployment policy. |
| CLI consistency | Pin package and workflow use to exact 2.84.2; remove the `^2.84.4` range from certification paths and prevent the 2.72.7 remote smoke from being treated as lineage certification. |

## Hosted-upgrade capsule status

Blocked. Supabase CLI compares local timestamps with `supabase_migrations.schema_migrations`, but no supported mechanism has been verified that creates a customer-free disposable hosted clone while preserving genuine migration history. Schema-only restore does not establish genuine history. `migration repair`, `--include-all`, direct history writes, a customer-bearing clone, and fabricated evidence remain prohibited.

The blocker can close only with a documented provider-supported snapshot/branching process that never copies customer or operational rows, or a separately approved certification architecture. Gate 2 does not make this appear resolved.
