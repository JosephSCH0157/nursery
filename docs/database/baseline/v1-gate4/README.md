# Gate 4 integration-readiness record

Gate 4 makes the two approved database lineages usable by developers and CI without changing either application's database contract. It does not authorize integration, a hosted write, or deployment.

## Frozen inputs

The command below is the mandatory first step for every supported database entrypoint:

```powershell
./scripts/verify-canonical-database-artifacts.ps1
```

It fails unless all of the following remain exact:

| Artifact | SHA-256 |
| --- | --- |
| 414-file historical manifest | `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40` |
| canonical baseline migration | `73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e` |
| baseline manifest | `f0eaf080270dde1df59a77fb075f8e363d06ad46a67c0b12dcb84220c258f4c3` |
| canonical catalog fingerprint | `abeb5876b1acf0b23d6be8594c788e1fe700fe5c1abe44755ea1cf431c2ca3d7` |
| wrappers compatibility contract | `8b82e58a85b835641c42738a51e695b05b4c7871ae922a48dd192dca303defc1` |

The only catalog exception remains `wrappers`: hosted `0.5.6` and Supabase CLI 2.84.2 local `0.5.7`. Every other catalog/security entry is compared exactly, and any third version is rejected.

## Supported entrypoints

Every state-changing local command requires `-Lineage baseline`, an explicitly assembled disposable workdir, and Supabase CLI `2.84.2`.

```powershell
# Assemble a fresh-install lineage. The destination must not already exist.
./scripts/new-forge-database-workdir.ps1 `
  -Lineage baseline `
  -OutputPath $workdir `
  -ProjectId forge-local-example `
  -ApiPort 57321

./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Start -Workdir $workdir
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Reset -Workdir $workdir
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Types -Workdir $workdir -OutputPath $output
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Stop -Workdir $workdir
```

`pnpm supabase:types` creates its own disposable baseline and never reads a hosted database. `pnpm certify:db:canonical-baseline` runs both permissive and restrictive default-privilege certification. `pnpm verify:db:historical-integrity` verifies the frozen artifacts.

The PR workflow now assembles the canonical baseline for Bar-stock and browser/application CI. Its database lineage gate verifies frozen artifacts, rejection behavior, both baseline modes, Slice A catalog/ACL/RLS/application behavior, and the financial fail-closed contracts.

The repository root is the historical audit/upgrade lineage and is deliberately not a fresh-install workdir. `Start` and `Reset` reject `-Lineage historical`. The only supported linked command is the read-only preflight:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage historical -Action HistoricalPreflight -Workdir (Get-Location)
```

It verifies that hosted migration history is a chronological prefix of the frozen manifest, then runs `migration list --linked` and `db push --linked --dry-run`. It cannot prove that pending migrations will execute successfully.

## Shared-tail routing

The baseline assembler copies the immutable baseline epoch plus root migrations numbered `20261022000000` or later. Historical upgrades discover the same tail in the root migration directory. The entrypoint verifier rejects a baseline-version collision in the historical root and compares the assembled tail byte-for-byte.

The first shared-tail migration is `20261022000000_establish_database_lineage.sql`. It creates only the private `forge_meta.database_lineage` marker. On an unmarked database it requires the exact 414-version historical manifest; on an already marked database it accepts only the exact baseline or historical history before/after this migration. Creation, ownership, forced RLS, revocations, validation, and insertion are one transaction. No Data API role receives schema or relation access.

## Legacy and unsupported entrypoints

Direct `supabase start`, `supabase db reset`, or `supabase migration up` from the repository root is unsupported and intentionally absent from supported scripts/workflows. The older `scripts/certify-mid-september-migration-replay.ps1` and `scripts/certify-anvil-migration-chain.mjs` remain historical diagnostic artifacts; their staged/`--include-all` behavior is not an approved bootstrap, upgrade, CI, or deployment path. `certify:db:anvil-release` therefore remains a legacy diagnostic and is not evidence for Gate 4 integration.

Production deployment behavior is unchanged. No Gate 4 tool provides a hosted write action.

## Local results

- Frozen artifact verification: passed, 414 migrations.
- Wrong CLI, wrong lineage, historical-root bootstrap, and unqualified-tail rejection: passed.
- Baseline start, reset, and type generation: passed.
- Permissive and restrictive fresh-install certification: passed; 15,901 catalog entries, canonical SHA-256 `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`, sole approved difference `wrappers` 0.5.7 local versus 0.5.6 hosted.
- Slice A catalog/ACL parity, RLS/cross-user isolation, signup/profile/workspace, Anvil profile, pairing, subscription/billing, Quench discovery, Data API, and inactive paid-provider behavior: passed in both modes.
- Financial source-contract suite: 32 passed, 0 failed.
- Read-only hosted preflight: passed as a 411-version prefix; pending versions are the three Slice A migrations followed by the lineage marker.
- Genuine historical upgrade execution: not performed and remains blocked as described in `HISTORICAL_UPGRADE_CERTIFICATION.md`.
