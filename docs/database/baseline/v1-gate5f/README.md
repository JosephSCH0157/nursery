# Gate 5F authentic historical-upgrade certification

Status: **ACL and catalog-output reconciliation plus hardened synthetic certification passed. No authentic export is authorized by this record.**

The current non-confidential result is recorded in [`ACL_RECONCILIATION_RESULTS.md`](ACL_RECONCILIATION_RESULTS.md). The original [`STAGE_A_RESULTS.md`](STAGE_A_RESULTS.md) is retained as superseded execution evidence.

The owner-facing coordinator is `scripts/invoke-gate5f-authentic-history-certification.ps1`. It has two fail-closed modes:

- `StageASynthetic` uses synthetic six-column history, mock Management API responses, and two independently created disposable privilege lanes. It cannot accept authentic authorization inputs.
- `Authentic` is disabled unless a future owner authorization supplies the explicit switch, reviewed project reference, restricted owner attestation, and process-scoped `FORGE_GATE5D_DATABASE_READ_TOKEN`.

Both modes require Supabase CLI `2.84.2`, frozen migration and baseline evidence, an already-running Docker engine, unchanged protected paths, scoped resource identities, and verified teardown. The authentic mode may call only the dedicated endpoint adapter at `POST /v1/projects/{ref}/database/query/read-only` with the frozen single-SELECT query.

The adapter accepts at most 12 MiB of response content. The certified large synthetic response is approximately 7.18 MB and represents the expected 5.35 MB payload after base64 and JSON framing. A malformed, partial, oversized, truncated, incorrectly hashed, incorrectly ordered, or unexpectedly structured response is rejected before plaintext can be written.

## Stage A local certification

This is the only currently authorized coordinator invocation:

```powershell
./scripts/invoke-gate5f-authentic-history-certification.ps1 `
  -Mode StageASynthetic `
  -RepositoryRoot D:\nursery\nursery
```

It must report two passing lanes, 411 restored rows, the seven matching history hashes, exactly four pending migrations, 415 final rows, `historical-v1`, unchanged original history, catalog hash `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`, only the approved `wrappers` difference, no hosted request, and complete cleanup.

## Future owner-controlled authentic procedure

The following is documented but **not authorized by Stage A**. After separate owner authorization, use a fresh PowerShell 7 process with no transcript and disabled PSReadLine history:

```powershell
Set-Location D:\nursery\nursery
if (Get-Module -ListAvailable PSReadLine) {
  Import-Module PSReadLine
  Set-PSReadLineOption -HistorySaveStyle SaveNothing
}
$gate5f = ./scripts/prepare-gate5e-owner-attestation.ps1 | ConvertFrom-Json
```

The owner must independently review that the new PAT is restricted to the one Forge project, has exactly `database_read`, is not legacy, and has the reviewed expiration. The attestation is a local fingerprint record; it does not independently interrogate Supabase-side permissions.

Only after the separate authentic-transfer authorization, in the same PowerShell process:

```powershell
$gate5fResult = ./scripts/invoke-gate5f-authentic-history-certification.ps1 `
  -Mode Authentic `
  -ProjectRef $gate5f.projectRef `
  -ScopeAttestationPath $gate5f.attestationPath `
  -AuthorizeAuthenticHistoryTransfer `
  -RepositoryRoot D:\nursery\nursery |
  ConvertFrom-Json
$gate5fResult
```

The coordinator removes the process token, encrypted capsule, and attestation directory in `finally` after success or failure. It suppresses raw responses and confidential row values. The owner should revoke the PAT immediately afterward. These measures reduce retention but do not prove forensic erasure from RAM, paging files, backups, crash dumps, SSDs, or operating-system telemetry.

Authentic metadata certification remains narrower than a production upgrade with customer and financial rows. Integration and production deployment require later owner approval.
