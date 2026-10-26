# Gate 5E dedicated zero-row Management API probe

Status: **runner implemented and certified with synthetic credentials and mock responses only; no hosted request made**.

The runner is `scripts/invoke-gate5e-read-only-probe.ps1`. It is limited to the frozen query `supabase/tests/catalog/gate5d_read_only_endpoint_probe.sql` with SHA-256 `d9bf4e0257583e7c8ec865bac73d28f4fbd84ee59197e3867f75d844c6b248fb` and the fixed endpoint `POST /v1/projects/{ref}/database/query/read-only`. It does not import, invoke, or contain the full-history exporter or export query.

The probe returns only execution role, transaction mode, four compatibility Booleans, and a zero-row count. It selects no migration row and returns no statement, creator, application, customer, credential, or financial value. Success requires HTTP 201, exactly one result row, exactly one `gate5d_read_only_probe` column, `supabase_read_only_user`, `transaction_read_only=on`, all compatibility checks true, and a zero projection count.

## Owner preparation

Use a fresh PowerShell 7 session with no transcript. Run from `D:\nursery\nursery`. Do not use `setx`, User/Machine environment variables, `.env` files, source files, command arguments, terminal transcripts, or chat for the token.

```powershell
Set-Location D:\nursery\nursery
if (Get-Module -ListAvailable PSReadLine) {
  Import-Module PSReadLine
  Set-PSReadLineOption -HistorySaveStyle SaveNothing
}
$gate5e = ./scripts/prepare-gate5e-owner-attestation.ps1 |
  ConvertFrom-Json
```

The helper prompts for the reviewed project reference and Supabase-displayed UTC expiration, then uses a masked `Read-Host -AsSecureString` prompt for the scoped PAT. It requires the `sbp_fc` prefix, refuses broader credential environment variables, loads only `FORGE_GATE5D_DATABASE_READ_TOKEN` at Process scope, and writes a non-secret fingerprint attestation beneath a user-and-SYSTEM-only `forge-gate5d-attestation-*` temporary directory.

Before entering the token, the owner must confirm in the Supabase dashboard that it is restricted to exactly the intended Forge project, has only Database Read (`database_read`), is not Legacy, and has the shortest practical expiration. The attestation binds the token hash, exactly one project-reference hash, exact permission, review time, and token expiration. It does not independently query or prove Supabase-side scope.

Keep this PowerShell session open. Another process, an already-running Codex tool host, and a later terminal do not inherit its Process-scoped environment.

## Separately authorized hosted invocation

Only after explicit owner authorization for the one hosted request, run in the same prepared PowerShell process:

```powershell
$gate5eResult = ./scripts/invoke-gate5e-read-only-probe.ps1 `
  -ProjectRef $gate5e.projectRef `
  -ScopeAttestationPath $gate5e.attestationPath `
  -AuthorizeHostedProbe |
  ConvertFrom-Json
$gate5eResult
```

The runner revalidates the fixed endpoint, query hash, process token, exact attestation fields, fingerprint, one-project allowlist, exact `database_read` permission, review age, expiration, restricted ACL, response status, and response shape immediately before accepting success. It suppresses response bodies and authorization material on every failure. It clears `FORGE_GATE5D_DATABASE_READ_TOKEN` in `finally` on success, rejection, or interrupted transport.

This command is **not authorized by the presence of this document**. Gate 5E hosted execution requires an explicit owner instruction after local preparation review. It never authorizes authentic-history export.

## Cleanup

After success or failure, confirm the token is absent, remove only the task-created attestation directory, and revoke the PAT unless the owner expressly retains it for a separately approved next step:

```powershell
if (-not [string]::IsNullOrWhiteSpace(
  [Environment]::GetEnvironmentVariable(
    'FORGE_GATE5D_DATABASE_READ_TOKEN',
    'Process'
  )
)) {
  throw 'Gate 5E process token cleanup failed.'
}

Import-Module ./scripts/lib/ForgeGate5D.psm1 -Force
$gate5eAttestationDirectory = Split-Path -Parent $gate5e.attestationPath
Remove-ForgeGate5DCapsule -Directory $gate5eAttestationDirectory
if (Test-Path -LiteralPath $gate5eAttestationDirectory) {
  throw 'Gate 5E attestation cleanup failed.'
}
$gate5e = $null
$gate5eResult = $null
```

PowerShell and .NET variable clearing, BSTR zeroing, header disposal, environment removal, and file deletion reduce unnecessary retention. They do not prove forensic erasure from process memory, swap, crash dumps, SSDs, or operating-system telemetry.

## Local certification

The mock suite uses synthetic credentials and local response files only:

```powershell
./scripts/test-gate5e-read-only-probe.ps1 `
  -RepositoryRoot D:\nursery\nursery
./scripts/verify-gate5d-authentic-history-tooling.ps1 `
  -RepositoryRoot D:\nursery\nursery
```

It covers success, HTTP 401 and unexpected status, malformed and extra response fields, raw-body redaction, expired and stale attestations, wrong project, extra permission, bad fingerprint, legacy/missing/broader credentials, missing attestation, interrupted transport, process-token cleanup, and the absence of full-history, override, CLI, migration, or deployment paths. Synthetic mode requires the reserved fake project reference and can never set `hostedRequestMade=true`.
