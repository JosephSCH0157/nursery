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

The first command verifies immutable content from the current `HEAD` Git objects against the self-contained 451-file trust anchor derived from certified source commit `87524f872e76f24de631d1cbf58580674c9df2a9` and tree `85816e221aa31e05f2ce634a5ee785ae00db20f5`. The anchor is [frozen-evidence-trust-anchor.v1.json](baseline/v1-gate6b/frozen-evidence-trust-anchor.v1.json), and its independently pinned SHA-256 is `fca1dbd9f8d582db01a3cd03720b8feffb75ec243340f042b9df08adbb41ebcb`. Verification does not fetch or require the unpublished source commit; it rejects a changed or missing anchor, incomplete path membership, object or mode substitution, index or working-content changes, filters, and protected-path collisions. The materializer writes those already-verified blob bytes to the current isolated worktree. The final command proves execution-byte identity. Do not run the materializer in a checkout containing unresolved protected database edits.

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

That process variable is a CLI safety boundary, not a requirement for routine
development or read-only investigation. Local development and both historical
certification lanes remain credential-free. Bounded hosted reads should use the
existing authorized Supabase MCP connection and return only sanitized project,
lineage, migration-history, and contract results. They must not invoke a
passwordless linked CLI command, because CLI 2.84.2 may create or rotate a
temporary write-capable role.

For an owner-authorized hosted deployment, Forge stores the existing database
password once in Windows Credential Manager under the current Windows user. The
governed deployment entrypoint retrieves it only around the authorized
operation, exposes it only as process-scoped `SUPABASE_DB_PASSWORD`, and clears
that variable in `finally`. Enrollment, rotation, and revocation are exceptional
administrative actions:

```powershell
./scripts/invoke-forge-managed-credential.ps1 -Action Status
./scripts/invoke-forge-managed-credential.ps1 -Action Enroll -Authorization ENROLL-FORGE-DATABASE-CREDENTIAL
./scripts/invoke-forge-managed-credential.ps1 -Action Rotate -Authorization ENROLL-FORGE-DATABASE-CREDENTIAL
./scripts/invoke-forge-managed-credential.ps1 -Action Revoke -Authorization REVOKE-FORGE-DATABASE-CREDENTIAL
```

`Enroll` and `Rotate` read the existing password through a non-echoing secure
prompt. The secret is never accepted as an argument, printed, written to the
repository, or made available to PR jobs. `Status` reports presence only.
Deployment-specific wrappers must dot-source
`scripts/lib/forge-managed-credential.ps1` and call
`Invoke-WithForgeManagedDatabaseCredential` only after their project, migration,
recovery, and explicit owner-authorization checks pass. This credential provider
does not itself authorize or select a migration.

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

Governed hosted shared-tail applications use single-purpose entrypoints. The
Anvil recording-authority entrypoint is bounded to 418 to 419; the Hammer H2-C
entrypoint is bounded to 419 to 420. Each pins the Forge project and migration
bytes, requires fresh owner-reviewed recovery evidence, an enrolled managed
database password, exact operator authorization, and exactly one pending
version. Neither is a general hosted SQL or migration executor. See section 6
for their preflight and apply commands.

All other hosted T applications remain unimplemented and unauthorized. Do not
use `--include-all`, `migration repair`, direct history writes, or B1 to force
discovery.

**Not yet implemented/certified:** any unbounded or general historical-upgrade
executor. Only the version-specific entrypoints named here are governed.

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

Certification creates disposable databases, executes B1 plus T, runs catalog/ACL, RLS/isolation, signup/profile/workspace, Anvil, Bar Stock lifecycle, episode storage-tier parity, Storage bucket provisioning and cross-user isolation, Hammer H2-C inactivity, pairing, subscription/billing, Quench, Data API, and financial-inactivity tests, compares the normalized catalog and provisioning contract, and tears the databases down. The current Hammer H2-C successor must report 16,129 catalog entries and normalized contract hash `803e02df1c18228aee39f5e56b9158f74c6c370386fcd2cafd1552314a288807`. The earlier Gate 5F, Gate 6H, Gate 6O, Gate 6P, and recording-authority contracts remain frozen predecessors, not the current tail target.

Gate 6O predecessor continuity remains 15,903 entries with production-normalized
hash `766361f8b22a131952808335ca0719c8ddccff8f15ba50a0f348b32e88f489cd`
and local `wrappers` 0.5.7 hash
`37c7bb1483dfa11f7aaf32ce5071d8614074b64e488bad074e028935453714ef`.
The only approved environmental difference remains hosted `wrappers` 0.5.6
versus local 0.5.7.

For evidence continuity, Gate 5F recorded 15,901 entries at `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`. Gate 6H also recorded 15,901 entries after its three Bar Stock definition changes, with production-normalized hash `6953a105d5f7fbfe2813c5e3349cd5364ba9c273f3dc023f042f86c6e7c9c5d5` and approved local `wrappers` 0.5.7 hash `dd364abfe6fcdb726148d209431d2476461b040d17cfd1c8bc45e23c8785bb9e`.

## 6. Test an existing historical-database upgrade

The available read-only preflight is:

```powershell
./scripts/invoke-forge-database.ps1 -Lineage historical -Action HistoricalPreflight -Workdir (Get-Location)
```

Record its lineage result, hosted history range/digest, migration list, and dry-run order.

### Create private recovery-readiness evidence

Every governed hosted migration requires a fresh JSON document conforming to
`forge.hosted-recovery-readiness.v1`. The document is operational evidence, not
deployment authorization. Store it only under `.git/forge-private-evidence`,
which is outside Git tracking and application serving. Keep that directory
access-restricted to the Windows operator and never copy the document into a
tracked path, build artifact, support ticket, or command-line argument.

An authorized owner must first open the exact project in the Supabase Dashboard,
select **Database > Backups**, and inspect either **Scheduled backups** for a
daily backup or the PITR recovery window. Confirm the project reference, backup
kind, availability/status, and latest restorable UTC timestamp. Record the UTC
time at which the owner performed that inspection separately as `verified_at`.
Do not click **Restore**. Entering a backup timestamp is not evidence that this
Dashboard inspection occurred. Evidence expires 24 hours after `verified_at`.
The current platform behavior and recovery limitations are documented in the
[Supabase Database Backups guide](https://supabase.com/docs/guides/platform/backups).

The evidence fields are:

| Field | Required meaning |
| --- | --- |
| `schema` | Exact value `forge.hosted-recovery-readiness.v1`. |
| `project_ref` | Exact hosted project reviewed in the Dashboard. |
| `dashboard_verified` | `true` only after the authorized owner completes the Dashboard inspection. |
| `backup_kind` | `daily` or `pitr`, matching the reviewed recovery source. |
| `verified_at` | Current UTC time of the owner's Dashboard inspection, less than 24 hours old. |
| `latest_restorable_at` | Latest restorable UTC timestamp shown by the Dashboard; it is not the verification time. |
| `recovery_operator` | Named person responsible for executing and monitoring recovery if directed. |
| `restore_authorizer` | Named person authorized to approve a whole-database restore; naming them does not pre-authorize restoration. |
| `owner_approval_reference` | Traceable owner-approved change-window identifier or record. |
| `restore_scope_acknowledged` | Explicit acknowledgment that an in-place restore affects the whole hosted database. |
| `unrelated_data_impact_acknowledged` | Explicit acknowledgment that restoration can affect unrelated hosted data. |

After collecting those facts, generate the file with the credential-free local
helper. Replace every angle-bracketed value; do not reuse identities or a change
window from an earlier release:

```powershell
$recoveryEvidencePath = Join-Path (Get-Location) '.git\forge-private-evidence\hammer-h2c-20261028.json'
$operatorIdentity = '<named migration operator>'

pnpm prepare:db:recovery-evidence -- `
  --project-ref wtvdjndyxegudufrompx `
  --backup-kind daily `
  --verified-at '<UTC time owner inspected Database > Backups>' `
  --latest-restorable-at '2026-10-28T06:27:08.354Z' `
  --recovery-operator '<named recovery operator>' `
  --restore-authorizer '<named restore authorizer>' `
  --owner-approval-reference '<owner-approved change-window reference>' `
  --attest-dashboard-verified `
  --acknowledge-restore-scope `
  --acknowledge-unrelated-data-impact `
  --output-name 'hammer-h2c-20261028.json'
```

The helper validates the same evidence contract used by the H2-C wrapper,
creates the private directory with restrictive local permissions where the host
supports them, refuses path traversal and overwrite, and emits only a sanitized
path/hash receipt. It does not read credentials, contact Supabase, inspect a
backup, or perform a database operation. Its explicit
`--attest-dashboard-verified` flag records the human attestation; it never
infers verification from `--latest-restorable-at`.

The resulting structure is exactly:

```json
{
  "schema": "forge.hosted-recovery-readiness.v1",
  "project_ref": "wtvdjndyxegudufrompx",
  "dashboard_verified": true,
  "backup_kind": "daily",
  "verified_at": "<UTC time owner inspected Database > Backups>",
  "latest_restorable_at": "2026-10-28T06:27:08.354Z",
  "recovery_operator": "<named recovery operator>",
  "restore_authorizer": "<named restore authorizer>",
  "owner_approval_reference": "<owner-approved change-window reference>",
  "restore_scope_acknowledged": true,
  "unrelated_data_impact_acknowledged": true
}
```

Daily database backups do not restore deleted Storage objects and do not retain
custom-role passwords. Account for those limitations in the recovery plan. A
PITR add-on and a daily backup are different recovery sources; record only what
the Dashboard actually shows.

The release operations have these boundaries:

| Operation | Effect |
| --- | --- |
| Evidence helper and contract tests | Local private-file or temporary-file writes only; no credential or database access. |
| `Preflight` | Connected read-only lineage/history/contract queries plus `db push --dry-run`; applies no migration. |
| `Apply` | Connected schema write through the bounded normal `db push`; requires separate owner authorization and the exact migration token. |
| `PostVerify` | Connected read-only verification of the already-applied state; makes no new schema or data write. |

If evidence is absent, stale, contradictory, or names no authorities/change
window, stop before credential retrieval. If Preflight reports any lineage,
history, hash, or pending-version mismatch, do not Apply. If Apply or immediate
verification fails, do not retry, repair migration history, reverse DDL by hand,
or assume rollback. Preserve sanitized evidence and request owner direction for
a reviewed forward correction or recovery. A backup/PITR restore is a separate,
whole-database operation and always requires a new explicit authorization from
the named restore authorizer; migration approval and the Apply token do not
authorize restoration.

### Anvil recording-authority migration 419

Create and review the private recovery-readiness evidence using the procedure
above. Never commit this operational evidence file.

Confirm that the existing database password has already been enrolled for the
current Windows operator with `invoke-forge-managed-credential.ps1 -Action
Status`. The governed wrapper validates the local project, migration bytes,
recovery evidence, operator, and Apply authorization before it retrieves the
credential. It exposes the password only as process-scoped
`SUPABASE_DB_PASSWORD` around the authorized Supabase operation and clears it
afterward. Then run:

```powershell
./scripts/invoke-anvil-419-hosted-deployment.ps1 `
  -Action Preflight `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

After reviewing the sanitized preflight receipt and obtaining separate owner
authorization for the hosted write, the exact application command is:

```powershell
./scripts/invoke-anvil-419-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-ANVIL-419
```

The entrypoint rejects any project, lineage, installed count, hosted head,
migration hash, or pending-version mismatch. It uses only normal
password-authenticated `supabase db push --linked`, never retries silently, and
immediately verifies the 419-row lineage and venue-neutral decision columns.
For a later independent read-only check, run `-Action PostVerify` with the same
process-scoped password. Application failure or failed post-verification is a
hard stop: retain sanitized evidence, do not repair history, do not submit a
recording decision, and obtain owner direction for PITR/backup recovery or a
reviewed forward correction.

### Hammer H2-C inactive transcription migration 420

Migration 420 uses the same recovery-readiness evidence schema and managed
credential boundary described above. Before any hosted request, run the local
wrapper tests and verify the Dashboard backup/PITR evidence is less than 24
hours old, names both the recovery operator and restore authorizer, references
the owner-approved change window, and acknowledges whole-database restore
impact:

```powershell
pnpm test:db:hammer-h2c:hosted-deployment
./scripts/invoke-hammer-h2c-420-hosted-deployment.ps1 `
  -Action Preflight `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

This Preflight action is read-only. Review its sanitized receipt before seeking
the separate hosted-write authorization.

The preflight must report `historical-v1`, exactly 419 installed migrations,
hosted head `20261027030139`, and exactly one pending version,
`20261028092438`. After the owner separately authorizes the hosted schema
write, the exact application command is:

```powershell
./scripts/invoke-hammer-h2c-420-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-HAMMER-H2C-420
```

This Apply action is the only command in this procedure that changes the hosted
database. Owner authorization to prepare evidence or run Preflight is not Apply
authorization. After Apply returns its immediate verification receipt, run the
independent read-only verification again:

```powershell
./scripts/invoke-hammer-h2c-420-hosted-deployment.ps1 -Action PostVerify
```

The wrapper uses only normal password-authenticated `supabase db push
--linked`. Post-application verification requires 420 history rows, the exact
target as hosted head, five forced-RLS Hammer tables, zero newly installed
authority/operation rows, the `execution_authorized=false` hard stop, no
authenticated table writes, and a fail-closed transcript-prep route. Then the
operator must review Supabase Security and Performance Advisors and retain
sanitized results. A failed apply or post-verification is a hard stop: do not
repair migration history or manually reverse DDL. Preserve evidence and obtain
owner and recovery-operator direction for PITR/backup restoration or a reviewed
forward migration. Restoration can affect unrelated hosted data and therefore
requires a separate restore authorization.

Authentic-history H upgrade certification completed under the one-time Gate 5F owner authorization. The dedicated read-only endpoint returned the authentic 411-row six-column history into an encrypted local capsule; both disposable privilege lanes restored it transactionally, discovered exactly four migrations normally, applied them, and reached 415 rows plus `historical-v1` with the original records unchanged. See the [Gate 5F authentic closeout](baseline/v1-gate5f/AUTHENTIC_CERTIFICATION_CLOSEOUT.md).

The Gate 6H successor is certified locally, without another hosted export, by restoring the approved deterministic 411-row six-column history in both privilege lanes and applying the five ordered pending versions through `20261024164519`:

```powershell
pnpm certify:db:gate6h-successor
```

Success requires 416 rows, `historical-v1`, all seven original-prefix hashes unchanged, catalog equality with B1 at the versioned successor contract, Bar Stock positive/negative/rollback coverage, zero hosted requests and paid operations, and scoped teardown. This is synthetic-history successor certification layered on the prior authentic Gate 5F evidence; it is not a new authentic export or a production-data upgrade test.

Gate 6O extends that certified successor with the sixth pending version through `20261025070300` and a 417-row final history. Run the current two-lineage successor gate with:

```powershell
pnpm certify:db:gate6o-successor
```

It must preserve all seven authentic-prefix hashes, reach `historical-v1`, match the 15,903-entry Gate 6O catalog in both default-privilege lanes, and prove the exact episode deletion-lifecycle column and constraint contract. The Gate 6H command and evidence remain the frozen predecessor record.

Gate 6P extends that certified successor with the seventh pending version through `20261025080943` and a 418-row final history. Run the current two-lineage successor gate with:

```powershell
pnpm certify:db:gate6p-successor
```

It must preserve all seven authentic-prefix hashes, reach `historical-v1`, retain the unchanged 15,903-entry Gate 6O catalog contract, and prove exact, private, idempotent provisioning of `forge-workpieces` and `bellows-capture` without changing Storage objects, policies, RLS, ACLs, or existing compatible rows.

The recording-authority successor preserves the Gate 6P harness unchanged and
normally extends its certified historical chain from the authentic Gate 5F
foundation through the 418-row Gate 6P predecessor and then to 419 rows. Its
static tooling test is always safe to run:

```powershell
pnpm test:db:anvil-recording:historical-tooling
```

The normal two-lane successor command is credential-free and makes no hosted
request:

```powershell
pnpm certify:db:anvil-recording:historical
```

It reconstructs the protected 411-row Gate 5F foundation, verifies and applies
the seven immutable Gate 6H, Gate 6O, and Gate 6P successor versions to the
418-row predecessor, then applies only `20261027030139` and requires 419 rows
plus `historical-v1`. A newly authorized encrypted capsule is reserved for
exceptional re-anchoring with the explicit Authentic mode:

```powershell
pnpm certify:db:anvil-recording:historical -- `
  -Mode Authentic `
  -ProjectRef $projectRef `
  -ScopeAttestationPath $scopeAttestationPath `
  -AuthorizeAuthenticHistoryTransfer
```

Both modes restore only into isolated disposable databases, verify the certified
prefix and 418-row `historical-v1` predecessor, apply only `20261027030139`,
requires 419 rows, proves existing recording-receipt bytes unchanged, and runs
the authority, immutability, Hammer projection, catalog, rejection, rollback,
financial-isolation, and teardown checks. See the [recording-authority historical
successor contract](baseline/v1-recording-authority/HISTORICAL_UPGRADE_CERTIFICATION.md).

The Hammer H2-C successor preserves the recording-authority harness unchanged
and extends the certified chain from 419 to 420. Its safe static tooling and
credential-free two-lane certification commands are:

```powershell
pnpm test:db:hammer-h2c:historical-tooling
pnpm certify:db:hammer-h2c:historical
```

The successor replay reconstructs the protected 411-row Gate 5F foundation,
applies the eight predecessor versions through `20261027030139`, verifies the
419-row `historical-v1` predecessor, then discovers and applies only
`20261028092438`. Both privilege lanes must reach 420 rows with every original
history digest and existing recording receipt unchanged, catalog equality at
16,129 objects, forced RLS, authenticated write denial, zero Hammer H2-C data
rows, no provider or financial calls, and complete scoped teardown.

Migration 421 is admitted only as the explicit successor to the unchanged
Hammer H2-C contract. Its static tooling and credential-free two-lane replay
commands are:

```powershell
pnpm test:db:hammer-first-transcription:historical-tooling
pnpm certify:db:hammer-first-transcription:historical
```

The replay verifies the 420-row `historical-v1` predecessor, discovers and
applies only `20261029004958`, and requires 421 rows in both default-privilege
lanes. It compares the 16,269-object catalog against
`baseline/v1-hammer-first-transcription/successor-catalog-fingerprint.json`
(`a8e8be7eb110d520e29b61e552d76f0378b268cc50ff4ca59c7ed11d524173d5`,
normalized contract
`6d4c9fbea2f11e3562130384ea6da5d0ce95d561668f31dc317ae0a8e42bd293`),
preserves the frozen historical and predecessor anchors, verifies forced RLS,
ACLs, exact-recording authority, Test-funded provider denial, failure relief,
settlement ordering, and zero authority/data rows after migration alone.

Migration 422 is admitted only as the explicit successor to the 421-row Hammer
first-transcription state. Its static tooling and credential-free two-lane replay
commands are:

```powershell
pnpm test:db:hammer-scoped-live-funding:historical-tooling
pnpm certify:db:hammer-scoped-live-funding:historical
```

The replay applies only `20261029033827`, requires 422 `historical-v1` rows,
and compares the 16,332-object catalog against
`baseline/v1-hammer-scoped-live-funding/successor-catalog-fingerprint.json`
(`06440d61d53ec3858afa58acddf2808f68514e738fbd59dd3070c17b531e7f51`,
normalized contract
`930606ea7dd389ad15c519d1fb9a1b3692c328314c62ae6422af53b9e9430de8`).
It checks permissive and restrictive default privileges, forced RLS, ACLs,
Data API behavior, exact customer/workspace/workpiece scope, Live deposit and
processor-fee evidence, global Test preservation, and zero authority or
financial rows after migration alone. The command creates only task-owned
disposable Docker resources and makes no hosted request. Certification does not
authorize applying migration 422, publishing Checkout, taking payment, or
consuming the one-operation authority.

Migration 423 is admitted only as the explicit successor to the 422-row Hammer
scoped-Live-funding state. Its static tooling and credential-free two-lane replay
commands are:

```powershell
pnpm test:db:hammer-trigger-acl-hardening:historical-tooling
pnpm certify:db:hammer-trigger-acl-hardening:historical
```

The replay applies only `20261029110858`, requires 423 `historical-v1` rows,
and compares the 16,332-object catalog against
`baseline/v1-hammer-trigger-acl-hardening/successor-catalog-fingerprint.json`
(`a07a57421d39330de31170bc7046e72beb768fc6ef97dbe6350620839934c873`,
normalized contract
`47b134565e3c1ef88567dbee027fff6a5a0ab48e9c8126948ccd15ae145d6a0f`).
It proves under permissive and restrictive default privileges that the trigger
binding is unchanged, direct anonymous/authenticated execution is denied,
service-role execution remains available, Data API behavior is unchanged, and
no financial or provider state is created. The command uses only task-owned
disposable Docker resources and makes no hosted request. Certification does not
authorize applying migration 423 or installing operational funding authority.

The migration-421 hosted wrapper is locally contract-tested and remains
separately authorization-gated:

```powershell
pnpm test:db:hammer-first-transcription:hosted-deployment
pnpm preflight:db:hammer-first-transcription:hosted -- `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

Preflight is read-only apart from private temporary state: it requires exactly
420 installed rows headed by `20261028092438`, exactly one pending migration,
the certified hash, `historical-v1`, current recovery evidence, and a managed
credential; it then runs linked list and dry-run only. Apply requires a new,
exact owner authorization token and uses the same ordinary linked tail push:

```powershell
./scripts/invoke-hammer-first-transcription-421-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-HAMMER-FIRST-TRANSCRIPTION-421
```

PostVerify independently requires 421 rows, the exact hosted head, unchanged
`historical-v1`, four forced-RLS successor tables, zero successor authority
rows, authenticated write denial, and `halt_new`/inactive routing. Direct CLI
application, `--include-all`, history repair, and reuse of the H2-C 420 token
remain prohibited.

The migration-422 hosted wrapper is likewise version-specific and separately
authorization-gated:

```powershell
pnpm test:db:hammer-scoped-live-funding:hosted-deployment
pnpm preflight:db:hammer-scoped-live-funding:hosted -- `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

Preflight is read-only apart from private temporary state. It requires exactly
421 installed rows headed by `20261029004958`, `historical-v1`, the exact
`20261029033827` migration as the sole pending version, SHA-256
`d395a843a9ab29029404749d187236d3a40efddbf6eb96cd6560c3a46b20f0d2`,
fresh recovery evidence, the managed Windows Credential Manager credential,
and Supabase CLI 2.84.2. It then performs linked migration listing and an
ordinary linked-tail dry run only.

Apply is a hosted write and requires the exact, separately reviewed token:

```powershell
./scripts/invoke-hammer-scoped-live-funding-422-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-HAMMER-SCOPED-LIVE-FUNDING-422
```

PostVerify independently requires 422 rows headed by `20261029033827`,
unchanged `historical-v1`, forced RLS on both scoped-Live tables, no rows in
those tables, no direct Data API writes, service-only authority functions,
global Test preservation, zero Hammer authority/operation/attempt/transcript
rows, and `halt_new`/inactive routing. The wrapper prohibits `--include-all`,
history repair, and direct migration-history writes. A 420 or 421 Apply token
does not authorize migration 422.

The migration-423 trigger-ACL correction uses its own version-pinned hosted
wrapper and remains separately authorization-gated:

```powershell
pnpm test:db:hammer-trigger-acl-hardening:hosted-deployment
pnpm preflight:db:hammer-trigger-acl-hardening:hosted -- `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

Preflight requires exactly 422 installed rows headed by `20261029033827`,
`historical-v1`, the exact `20261029110858` migration as the sole pending
version, SHA-256
`e28ea66618cb681a06323174f6390cd8eeb7afb1d5c744d9ea6cd12290949a7a`,
fresh recovery evidence, the managed Windows Credential Manager credential,
and Supabase CLI 2.84.2. It performs only linked migration listing and the
ordinary linked-tail dry run.

Apply requires the exact, separately reviewed token:

```powershell
./scripts/invoke-hammer-trigger-acl-hardening-423-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-HAMMER-TRIGGER-ACL-HARDENING-423
```

PostVerify requires 423 rows headed by `20261029110858`, unchanged
`historical-v1`, the original trigger binding, denied direct execution for
PUBLIC/anonymous/authenticated roles, retained service-role execution, global
Test preservation, zero Hammer authority/operation/attempt/transcript rows,
and `halt_new`/inactive routing. The wrapper does not install funding authority
or authorize provider execution.

Migration 424 admits the service-only Brad first-transcription authority
installer as the explicit successor to migration 423. Local certification and
the hosted wrapper are:

```powershell
pnpm certify:db:hammer-brad-first-transcription-authority:historical
pnpm test:db:hammer-brad-first-transcription-authority:historical-tooling
pnpm test:db:hammer-brad-first-transcription-authority:hosted-deployment
pnpm preflight:db:hammer-brad-first-transcription-authority:hosted -- `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

Preflight requires exactly 423 installed rows headed by `20261029110858`,
`historical-v1`, the exact `20261029154824` migration as the sole pending
version, SHA-256
`b3699ef0f621f3630671402a278f9b178ebe9c42bdc746d3bf9e3ed8a3ee3850`,
fresh recovery evidence, the managed Windows Credential Manager credential,
and Supabase CLI 2.84.2. Apply uses only the reviewed wrapper and token:

```powershell
./scripts/invoke-hammer-brad-first-transcription-authority-424-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization AUTHORIZE-HAMMER-BRAD-FIRST-TRANSCRIPTION-AUTHORITY-424
```

PostVerify requires 424 rows headed by `20261029154824`, unchanged
`historical-v1`, a PostgreSQL-owned security-definer installer executable only
by `service_role`, global Test preservation, zero authority/funding/provider
rows, and inactive `halt_new` routing. Applying migration 424 installs the
function only. Invoking that function is a distinct production write and must
remain bounded to its exact reviewed Brad authority bundle.

Migration 426 is the explicit successor to the installed 425-row owner-funded
Hammer state. It corrects only the generic owner-budget reservation predicate
so that the exact, active Hammer sponsorship introduced by migration 425 may
reach the existing reservation, aggregate-exposure, and provider-attempt
guards. It installs no authority, funding, reservation, operation, attempt, or
transcript. Local certification and hosted checks are:

```powershell
pnpm certify:db:hammer-owner-sponsorship-reservation-compatibility:historical
pnpm test:db:hammer-owner-sponsorship-reservation-compatibility:hosted-deployment
pnpm preflight:db:hammer-owner-sponsorship-reservation-compatibility:hosted -- `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

Preflight requires exactly 425 installed rows headed by `20261029172356`,
`historical-v1`, migration `20261030090719` as the sole pending version, SHA-256
`de27e8ff38279fdb6c9d33cb45a4cd53d6e5189427fb6aab81ebfd120226b27c`,
fresh recovery evidence, the managed credential, and Supabase CLI 2.84.2.
Apply is a hosted write and requires the exact token:

```powershell
./scripts/invoke-hammer-owner-sponsorship-reservation-compatibility-426-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-HAMMER-OWNER-SPONSORSHIP-RESERVATION-COMPATIBILITY-426
```

PostVerify requires 426 rows headed by `20261030090719`, unchanged
`historical-v1`, both the ordinary owner-budget guard and exact Hammer
sponsorship guard, service-only execution, global Test preservation, and zero
Brad reservation, operation, provider-attempt, transcript, or customer charge
from the failed pre-426 attempts.

Migration 427 is the explicit successor to the installed 426-row Hammer
owner-sponsorship state. It adds an immutable, forced-RLS revocation ledger and
a service-only renewal RPC for an expired or explicitly revoked exact-recording
authority. The renewal contract serializes competing requests, forbids
overlapping active authorities, and preserves a consumed or ambiguous provider
attempt across every renewal. Applying migration 427 creates no authority,
reservation, operation, provider attempt, transcript, or customer charge.

```powershell
pnpm certify:db:hammer-owner-sponsorship-authority-renewal:historical
pnpm test:db:hammer-owner-sponsorship-authority-renewal:hosted-deployment
pnpm preflight:db:hammer-owner-sponsorship-authority-renewal:hosted -- `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity
```

Preflight requires exactly 426 installed rows headed by `20261030090719`,
`historical-v1`, migration `20261030224605` as the sole pending version,
SHA-256
`ae6bbd4c37407ef2c34dd4762827e27c41241c1e8801f328bf2d9aeb6ec330b1`,
fresh release-specific recovery evidence, the managed Windows Credential
Manager credential, and Supabase CLI 2.84.2. Apply is a hosted write and
requires the exact token:

```powershell
./scripts/invoke-hammer-owner-sponsorship-authority-renewal-427-hosted-deployment.ps1 `
  -Action Apply `
  -RecoveryEvidencePath $recoveryEvidencePath `
  -Operator $operatorIdentity `
  -Authorization APPLY-HAMMER-OWNER-SPONSORSHIP-AUTHORITY-RENEWAL-427
```

PostVerify requires 427 rows headed by `20261030224605`, unchanged
`historical-v1`, forced RLS and service-only execution, both exact-source
serialization guards, the absence of the obsolete source-uniqueness
constraint, global Test preservation, and zero migration-created revocations,
reservations, operations, provider attempts, transcripts, or customer charges.
Renewing Brad's authority through the RPC is a separate production write and
requires its own exact reviewed authority bundle after PostVerify.

### Automated Hammer capacity evidence and authority renewal

Migration 427 remains the only authority-renewal mechanism. The operator helper
does not add a second financial path: it obtains authenticated capacity facts,
creates the private SHA-256 evidence, and invokes that exact service-only RPC.
It never creates a quote, acceptance, reservation, provider attempt, customer
debit, or provider request.

One-time credential enrollment stores a Netlify account-read token and a
Supabase organization billing-read token in Windows Credential Manager. The
tokens must grant no write capability where the platform supports scoped
tokens. They are never command-line arguments, files, output, or Netlify
variables:

```powershell
./scripts/invoke-hammer-capacity-read-credentials.ps1 `
  -Action Enroll `
  -Authorization ENROLL-HAMMER-CAPACITY-READ-CREDENTIALS
```

Status is read-only and reveals no secret:

```powershell
./scripts/invoke-hammer-capacity-read-credentials.ps1 -Action Status
```

Collect a fresh private observation without changing hosted data:

```powershell
./scripts/invoke-hammer-capacity-authority-renewal.ps1 `
  -Action Collect `
  -Operator 42c3de1d-bd24-41fe-abd9-640f17518b2c
```

Collection requires hosted head `20261030224605`, Supabase CLI 2.84.2, the
managed database password, authenticated Pro-plan API responses, Spend Cap on,
the current billing-period uncached-egress counter, a current database-size
query, and zero active Hammer operations. Every source receipt must be within
five minutes of the evidence timestamp. Any missing metric, API/schema change,
stale response, concurrency, or insufficient resource bound stops before a
write. The evidence file is created with no-overwrite semantics under
`.git/forge-private-evidence` and contains response hashes rather than response
bodies or credentials.

After reviewing the sanitized collection receipt, the bounded production write
is a single invocation:

```powershell
./scripts/invoke-hammer-capacity-authority-renewal.ps1 `
  -Action Renew `
  -Operator 42c3de1d-bd24-41fe-abd9-640f17518b2c `
  -Authorization RENEW-HAMMER-BRAD-OWNER-SPONSORSHIP-AUTHORITY
```

The renewal uses fresh UUIDs and immutable rows, retains the exact Brad source,
44,589-micro owner ceiling, zero customer payment/debit, one cross-renewal
provider-attempt limit, and 24-hour maximum validity. It cannot reset consumed
or ambiguous execution authority; the migration-427 serialization and
revocation guards remain authoritative. The returned receipt contains IDs,
expiry, and the evidence digest only.

The authenticated browser route is certified against a uniquely isolated B1-plus-current-tail workdir with synthetic data and process-only local credentials:

```powershell
pnpm certify:db:gate6p-browser
```

This runs Gate 6P fresh missing-row provisioning through the normal B1-plus-tail path, repeated-provisioning idempotency, incompatible-configuration rollback, the bucket/RLS contract, browser fixture authority, and disposable-isolation tests before `pnpm gate:browser`, then removes only its task-created local stack and temporary files. It makes no hosted request and does not invoke a paid provider. The Gate 6O browser command remains predecessor evidence; use the Gate 6P command for the current tail.

The single-purpose Hammer H2-C hosted entrypoint in section 6 is preparation,
not deployment authorization. Gate 5F did not migrate production or exercise
production customer/financial rows. Schema-equivalent B1 certification,
synthetic history, SQL wrapped in a rollback, and linked dry-run remain distinct
evidence and are not substitutes for the recorded authentic-history run. Every
hosted migration still requires backup/PITR verification, read-only production
preflight, exact pending-version review, and separate owner authorization.

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
