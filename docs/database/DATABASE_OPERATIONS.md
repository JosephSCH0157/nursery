# Forge Database Operations

This is the supported operating runbook for Forge database development. `DATABASE_ARCHITECTURE.md` explains the design. All examples run from `D:\nursery\nursery` in PowerShell and require Supabase CLI exactly `2.84.2`.

The selectable roots are historical lineage `historical-v1`, frozen through `20261020171522`, and fresh-install lineage `baseline-v1`, reserved for `20261021000000`–`20261021235959`. Both use the single shared tail beginning `20261022000000`; installed identity is held in `forge_meta.database_lineage`.

Before Docker-dependent work, run `docker info`. If it fails, stop and ask the user to start Docker Desktop; never start, restart, repair, or reconfigure Docker Desktop.

Before any database certification or historical-root migration execution, establish canonical frozen evidence and exact runtime bytes:

```powershell
node scripts/verify-frozen-git-evidence.mjs --scope all
node scripts/materialize-frozen-git-evidence.mjs --scope all
node scripts/verify-frozen-git-evidence.mjs --scope all --require-exact-worktree-bytes
```

The first command verifies immutable content from the current `HEAD` Git objects against certified source commit `87524f872e76f24de631d1cbf58580674c9df2a9`; it also rejects index, working-content, filter, and protected-path collisions. The materializer writes those already-verified blob bytes to the current isolated worktree. The final command proves execution-byte identity. Do not run the materializer in a checkout containing unresolved protected database edits.

## 1. Identify and validate a lineage

Validate the historical repository workdir without querying a database:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage historical -Action Validate -Workdir (Get-Location)
```

Validate an assembled B1 workdir without starting it:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Validate -Workdir $workdir
```

For a running local B1 database, `Start`, `Reset`, and `Types` validate both its migration history and `forge_meta.database_lineage`. For the linked hosted H database, the only supported identification path is the read-only preflight:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage historical -Action HistoricalPreflight -Workdir (Get-Location)
```

This checks that hosted history is a chronological prefix of H, reads the marker if present, lists migrations, and runs `db push --linked --dry-run`. It performs no migration. It now requires `SUPABASE_DB_PASSWORD` to already be present in the process environment: passwordless linked commands in Supabase CLI 2.84.2 create or rotate a write-capable temporary login role and are rejected by Forge. Never print, persist, or pass the password on the command line. Never guess a lineage from schema shape alone.

## 2. Create a migration

All new migrations are T migrations in `supabase/migrations`; B1 and the first 414 H files are immutable.

```powershell
supabase --version
supabase migration new add_descriptive_name_here --workdir .
```

Stop unless the first command prints exactly `2.84.2`. Inspect the generated filename and stop if its version is earlier than `20261022000000`, collides with an existing version, or falls in the B1 reserved range `20261021000000`–`20261021235959`.

**Temporarily unavailable before 2026-10-22 UTC without separate version approval:** because CLI 2.84.2 derives the version from the current clock, it cannot create a valid T version while the clock is still inside the reserved B1 day. Do not rename that generated file. Remove the empty, unapplied candidate and wait, or request owner approval for an explicit version-reconciliation plan.

Write one transactional migration. Declare complete dependencies, owner, RLS, policies, grants/revocations, sequence access, trigger/function ownership, safe function `search_path`, and execution permissions. For an exposed schema, RLS and explicit Data API grants are both required; neither substitutes for the other. Do not rely on default privileges.

Run the certification in sections 5 and 6 before review. Do not amend an already-reviewed or applied migration; add a later T migration after owner approval.

## 3. Apply a shared-tail migration

For B1 certification, do not apply an individual file manually. Reassemble and certify B1; the assembler copies every root migration at `20261022000000` or later and verifies byte identity:

```powershell
pnpm certify:db:canonical-baseline
```

For a disposable B1 workdir created before the new migration existed, destroy it and create a new one rather than copying the file by hand.

**Not yet implemented/certified:** there is no authorized hosted “apply T” command. An H deployment must first pass genuine historical-upgrade certification and owner review. Do not use `--include-all`, `migration repair`, direct history writes, or B1 to force discovery.

## 4. Create a disposable fresh database

Choose an unused local port range and a destination that does not exist:

```powershell
$workdir = Join-Path $env:TEMP ('forge-baseline-' + [guid]::NewGuid().ToString('N'))
./scripts/new-forge-database-workdir.ps1 `
  -Lineage baseline `
  -OutputPath $workdir `
  -ProjectId forge-local-example `
  -ApiPort 57321
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Start -Workdir $workdir
```

This creates B1 plus the current T outside the historical root. It includes no customer data and starts financially inactive. Stop it when finished:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Stop -Workdir $workdir
```

The scripts never start Docker Desktop.

## 5. Run canonical baseline certification

Run frozen-document/artifact checks first, then both default-privilege lanes:

```powershell
node scripts/materialize-frozen-git-evidence.mjs --scope all
pnpm verify:db:historical-integrity
pnpm certify:db:canonical-baseline
```

Certification creates disposable databases, executes B1 plus T, runs catalog/ACL, RLS/isolation, signup/profile/workspace, Anvil, pairing, subscription/billing, Quench, Data API, and financial-inactivity tests, compares the normalized catalog, and tears the databases down. Success must report 15,901 entries, contract hash `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`, and only the approved hosted `wrappers` 0.5.6 versus local 0.5.7 difference.

## 6. Test an existing historical-database upgrade

The available read-only preflight is:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage historical -Action HistoricalPreflight -Workdir (Get-Location)
```

Record its lineage result, hosted history range/digest, migration list, and dry-run order.

Authentic-history H upgrade certification completed under the one-time Gate 5F owner authorization. The dedicated read-only endpoint returned the authentic 411-row six-column history into an encrypted local capsule; both disposable privilege lanes restored it transactionally, discovered exactly four migrations normally, applied them, and reached 415 rows plus `historical-v1` with the original records unchanged. See the [Gate 5F authentic closeout](baseline/v1-gate5f/AUTHENTIC_CERTIFICATION_CLOSEOUT.md).

**Not yet implemented/certified:** a production hosted-apply command. Gate 5F did not migrate production or exercise production customer/financial rows. Schema-equivalent B1 certification, manually synthesized history, SQL wrapped in a rollback, and linked dry-run remain distinct evidence and are not substitutes for the recorded authentic-history run. Every hosted migration still requires backup/PITR verification, read-only production preflight, exact pending-version review, and separate owner authorization.

Gate 5D Stage 1 provides a synthetic-only guardrail run:

```powershell
./scripts/invoke-gate5d-authentic-history-certification.ps1 `
  -Mode Stage1Synthetic `
  -RepositoryRoot D:\nursery\nursery
```

It makes no hosted request. This command certifies the encrypted-capsule restorer end to end with deterministic 411-row six-column synthetic history, the exact four pending migrations, both default-privilege lanes, catalog/security/application/Data API/financial checks, failure rollback, and scoped teardown. It remains the repeatable local regression lane. A local token-fingerprint attestation does not independently prove Supabase-side token scopes; see [Gate 5D](baseline/v1-gate5d/README.md).

Gate 5D Stage 1C provides a separately frozen dedicated read-only endpoint adapter and mock tests. It is not an operational hosted procedure. The generic adapter remains unchanged; neither adapter may be selected for a hosted call until the owner authorizes the non-confidential probe and names the approved Stage 2 endpoint. See [Stage 1C assessment](baseline/v1-gate5d/STAGE_1C_READ_ONLY_ENDPOINT_ASSESSMENT.md).

Gate 5E provides the dedicated zero-row probe runner and masked owner-preparation helper used before the authentic run. The runner cannot invoke the full-history exporter and always clears its process token. Its completed probe is historical evidence, not reusable authorization for another hosted request. See [Gate 5E](baseline/v1-gate5e/README.md).

Gate 5F Stage A provides the two-lane coordinator and bounded dedicated-endpoint adapter. The locally authorized synthetic procedure is:

```powershell
./scripts/invoke-gate5f-authentic-history-certification.ps1 `
  -Mode StageASynthetic `
  -RepositoryRoot D:\nursery\nursery
```

The authentic mode was exercised once under explicit owner authorization and passed; its scoped token was then revoked. That completed authorization is not reusable. Do not invoke authentic mode again without a new owner-reviewed token, attestation, and explicit transfer authorization. See [Gate 5F](baseline/v1-gate5f/README.md) and its [authentic closeout](baseline/v1-gate5f/AUTHENTIC_CERTIFICATION_CLOSEOUT.md).

Read-only investigation predicts that a dashboard branch will fail while replaying the backdated September credit-economy migration because its lived-in Luna pricing prerequisite is not in earlier stored migration statements. The owner-approval procedure, cost, and mandatory teardown conditions are documented in [DASHBOARD_BRANCH_PREFLIGHT.md](baseline/v1-gate4/DASHBOARD_BRANCH_PREFLIGHT.md). Do not create that branch under this runbook without separate authorization.

## 7. Reset a local development database

Only an assembled, running B1 workdir may be reset:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage baseline -Action Reset -Workdir $workdir
```

The command validates the marker/history before and after reset and disables seed data. Historical-root reset is rejected. If a disposable workdir is ambiguous or damaged, stop it without backup and recreate it from section 4.

## 8. Generate TypeScript types

Generate the canonical checked-in public-schema types from a new certified disposable B1 database:

```powershell
pnpm supabase:types
```

For review-only output at another existing parent directory, start a B1 workdir and run:

```powershell
./scripts/invoke-forge-database.ps1 `
  -Lineage baseline `
  -Action Types `
  -Workdir $workdir `
  -OutputPath $output `
  -Schema public
```

Never generate canonical types with `--linked`, a production project ID, or the historical root.

## 9. Handle a failed migration

1. Stop. Preserve the exact CLI output, migration version, lineage, workdir identity, and non-sensitive catalog/history evidence.
2. Do not retry against production, bypass assertions, edit migration history, use `--include-all`, run `migration repair`, renumber an approved migration, or apply manual hosted SQL.
3. If the target is disposable B1, stop it without backup, correct only an authorized unapplied T migration, and recreate/certify from scratch.
4. If the target is hosted or the migration may have committed partially, perform read-only catalog/history inspection and request owner direction. Do not assume transactional rollback without evidence.
5. If correction requires an additional historical amendment, production behavior change, weaker security/economic checks, or destructive recovery, stop for separate approval.

## 10. Prepare a production deployment for owner review

No command in this section deploys anything.

```powershell
git status --short
node scripts/materialize-frozen-git-evidence.mjs --scope all
node scripts/verify-frozen-git-evidence.mjs --scope all --require-exact-worktree-bytes
pnpm verify:db:historical-integrity
./scripts/verify-forge-database-entrypoints.ps1
./scripts/test-supabase-lineage-guard.ps1
pnpm certify:db:canonical-baseline
./scripts/invoke-forge-database.ps1 -Lineage historical -Action HistoricalPreflight -Workdir (Get-Location)
```

Present the exact commit, changed migrations and hashes, frozen-artifact result, permissive/restrictive catalog results, security/application/financial test results, read-only H preflight, genuine H upgrade evidence, rollback conditions, and unresolved differences. Owner approval is required for every hosted schema change and production write. Never interpret review readiness as deployment permission.

## 11. Record migration and catalog evidence

Retain non-sensitive command output with:

- Git commit and branch.
- Supabase CLI version `2.84.2`.
- `pnpm verify:db:historical-integrity` JSON and the 414-file manifest hash.
- B1 migration SHA-256 and shared T migration SHA-256 values from Git.
- Both certification result objects, including catalog object count, contract hash, default-privilege mode, and approved environmental differences.
- H preflight history count, minimum/maximum version, digest, and dry-run order.
- Test counts and failures/blocks; a blocked hosted-upgrade test is never recorded as passed.

Record the checked-out source identity and canonical frozen-object result with read-only commands:

```powershell
git branch --show-current
git rev-parse HEAD
node scripts/verify-frozen-git-evidence.mjs --scope all --require-exact-worktree-bytes
```

Do not substitute `Get-FileHash` over a platform-dependent checkout for the canonical frozen-object verifier. The unchanged legacy manifest hashes remain audit evidence and are classified, not regenerated. The mechanics and affected verifier inventory are in [Gate 6B.1 cross-platform frozen evidence](baseline/v1-gate6b/CROSS_PLATFORM_FROZEN_EVIDENCE.md).

Authoritative artifacts are linked from `DATABASE_ARCHITECTURE.md`; do not copy their large inventories into a new report. Never retain secrets, API keys, credentials, customer rows, transactions, or operational Stripe/provider data as evidence.

## 12. Recover from certification failure

For B1, use the supported stop command, discard the disposable workdir, and reconstruct it from frozen source. Re-run the failed lane and then the complete certification. Do not normalize a new catalog difference merely to pass.

For H preflight or future hosted-upgrade failure, leave production unchanged, retain read-only evidence, and stop. Recovery requires a separately owner-approved diagnosis and, when applicable, the platform's supported backup/restoration process. Never apply B1, rewrite H, fabricate a marker, or manipulate migration history as recovery.

If the failure reveals drift in a frozen artifact, unknown `wrappers` version, financial activation, customer data in a fixture, or broadened access, treat it as a hard stop requiring owner review.

## 13. Pull requests and hosted write-capable smoke tests

Ordinary pull-request workflows must remain local and disposable. Verify that boundary with:

```powershell
node --test scripts/tests/hosted-smoke-authorization.test.mjs
```

Do not add hosted credentials, service-role keys, management tokens, paid-provider keys, or hosted write tests to `pull_request`, `pull_request_target`, or code checked out from a pull request. Hosted team/Hearth smoke is isolated in `.github/workflows/hosted-nonproduction-smoke.yml`; it is manual, restricted to trusted `main`, and requires the protected `forge-nonproduction-hosted-smoke` environment. A label or typed confirmation is not an authorization boundary.

The hosted workflow is **not operationally authorized** until the owner independently verifies the environment reviewers, main-only deployment policy, nonproduction project ref, environment-scoped secrets, and absence of an automatic production migration path. Exact controls and the external verification checklist are recorded in [Gate 6C PR hosted-write isolation](baseline/v1-gate6c/PR_HOSTED_WRITE_ISOLATION.md).
