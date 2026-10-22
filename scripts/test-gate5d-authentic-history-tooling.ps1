[CmdletBinding()]
param([string]$RepositoryRoot)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1') -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$runId = [guid]::NewGuid().ToString('N')
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-test-$runId"
$contract = Get-ForgeGate5DContract -RepositoryRoot $repo
$manifest = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json') -Raw | ConvertFrom-Json
$payload = $null
$roundTrip = $null
$savedToken = [Environment]::GetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN','Process')
$checks = [System.Collections.Generic.List[string]]::new()

function Expect-Failure([scriptblock]$Action,[string]$Pattern,[string]$Forbidden='gate5d-secret-sentinel') {
  try { & $Action | Out-Null; throw "Expected failure matching $Pattern" }
  catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
    if ($_.Exception.Message -match [regex]::Escape($Forbidden)) { throw 'Failure leaked confidential content.' }
  }
}

try {
  $versions = @($manifest.migrations | Select-Object -First 411 | ForEach-Object { [string]$_.version })
  $lines = for ($i=0; $i -lt $versions.Count; $i++) {
    $statements = if ($i -eq 7) { $null } else { @("select $i", "quoted ' value `" and unicode π", "line1`nline2") }
    $rollback = if ($i % 3 -eq 0) { $null } else { ,@("rollback $i") }
    $name = if ($i -eq 9) { 'gate5d-secret-sentinel' } else { "synthetic_$i" }
    $record = [object[]]::new(6)
    $record[0] = $versions[$i]
    $record[1] = $statements
    $record[2] = $name
    $record[3] = $null
    $record[4] = $null
    $record[5] = $rollback
    ConvertTo-Json -InputObject $record -Compress -Depth 10
  }
  $payloadText = $lines -join "`n"
  $payload = [Text.UTF8Encoding]::new($false).GetBytes($payloadText)
  $payloadHash = Get-ForgeGate5DSha256Hex -Bytes $payload
  $testContract = ($contract | ConvertTo-Json -Depth 20 | ConvertFrom-Json)
  $testContract.history.hashes.allColumns = $payloadHash
  foreach ($property in @('version','statements','name','createdBy','idempotencyKey','rollback')) {
    $testContract.history.hashes.$property = Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes("synthetic-$property"))
  }
  $envelope = [ordered]@{
    transaction_read_only='on'; columns=@($testContract.history.columns); row_count=411
    min_version=$testContract.history.minimumVersion; max_version=$testContract.history.maximumVersion
    all_columns_sha256=$testContract.history.hashes.allColumns; version_sha256=$testContract.history.hashes.version
    statements_sha256=$testContract.history.hashes.statements; name_sha256=$testContract.history.hashes.name
    created_by_sha256=$testContract.history.hashes.createdBy; idempotency_key_sha256=$testContract.history.hashes.idempotencyKey
    rollback_sha256=$testContract.history.hashes.rollback; payload_base64=[Convert]::ToBase64String($payload)
  }
  $response = ConvertTo-Json -InputObject @([ordered]@{gate5d_history_export=$envelope}) -Compress -Depth 20
  $parsed = ConvertFrom-ForgeGate5DResponse -ResponseJson $response -Contract $testContract
  $roundTrip = $parsed.Payload
  $validated = Test-ForgeGate5DPayload -Payload $roundTrip -Contract $testContract -RepositoryRoot $repo
  if ($validated.RowCount -ne 411) { throw 'Synthetic fidelity test lost records.' }
  $checks.Add('mock-api-parse-and-six-column-fidelity')

  New-ForgeGate5DRestrictedDirectory -Path $tempRoot | Out-Null
  $projectHash = Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes('synthetic-project-ref'))
  $capsule = Protect-ForgeGate5DCapsule -Payload $roundTrip -Directory $tempRoot -Contract $testContract -ProjectRefHash $projectHash
  $disk = [IO.File]::ReadAllBytes($capsule.CapsulePath)
  if ([Text.Encoding]::UTF8.GetString($disk) -match 'gate5d-secret-sentinel') { throw 'Plaintext appeared in the encrypted capsule.' }
  $unprotected = Unprotect-ForgeGate5DCapsule -Directory $tempRoot
  if ((Get-ForgeGate5DSha256Hex $unprotected.Payload) -ne $payloadHash) { throw 'DPAPI round-trip failed.' }
  [Array]::Clear($unprotected.Payload,0,$unprotected.Payload.Length)
  $acl = Get-Acl -LiteralPath $tempRoot
  $sids = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique)
  $expectedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18') | Sort-Object
  if (-not $acl.AreAccessRulesProtected -or ($sids -join ',') -ne ($expectedSids -join ',')) { throw 'Capsule ACL is broader than current user plus SYSTEM.' }
  $checks.Add('dpapi-current-user-encrypted-before-disk-and-restricted-acl')

  Expect-Failure { ConvertFrom-ForgeGate5DResponse -ResponseJson '{bad' -Contract $testContract } 'malformed'
  $extra = $response | ConvertFrom-Json -Depth 20; $extra[0].gate5d_history_export | Add-Member extra 'nope'
  Expect-Failure { ConvertFrom-ForgeGate5DResponse -ResponseJson ($extra | ConvertTo-Json -Compress -Depth 20) -Contract $testContract } 'unexpected'
  $wrong = $response | ConvertFrom-Json -Depth 20; $wrong[0].gate5d_history_export.row_count = 410
  Expect-Failure { ConvertFrom-ForgeGate5DResponse -ResponseJson ($wrong | ConvertTo-Json -Compress -Depth 20) -Contract $testContract } 'count or version'
  $checks.Add('malformed-extra-count-and-hash-rejection')

  $badLines = [System.Collections.Generic.List[string]]::new(); $badLines.AddRange([string[]]$lines); $badLines[10] = $badLines[9]
  $badPayload = [Text.Encoding]::UTF8.GetBytes(($badLines -join "`n"))
  Expect-Failure { Test-ForgeGate5DPayload -Payload $badPayload -Contract $testContract -RepositoryRoot $repo } 'duplicate|frozen'
  [Array]::Clear($badPayload,0,$badPayload.Length)
  $checks.Add('duplicate-missing-and-version-prefix-rejection')

  [Environment]::SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN','legacy-token','Process')
  Expect-Failure { & (Join-Path $repo 'scripts/export-gate5d-authentic-history.ps1') -ProjectRef ('a'*20) -ScopeAttestationPath (Join-Path $tempRoot 'none.json') -AuthorizeAuthenticExport -RepositoryRoot $repo } 'scoped Supabase PAT'
  $scoped = 'sbp_fc_synthetic_gate5d_token'
  [Environment]::SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',$scoped,'Process')
  $attestation = [ordered]@{
    schema='forge.gate5d-scoped-token-attestation.v1'
    tokenSha256=Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes($scoped))
    projectRefSha256=Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes(('a'*20)))
    projectRefSha256Allowlist=@(Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes(('a'*20))) )
    permissions=@('database_read','database_write')
    verifiedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')
  }
  $attestationPath = Join-Path $tempRoot 'scope.json'
  [IO.File]::WriteAllText($attestationPath,($attestation | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Expect-Failure { & (Join-Path $repo 'scripts/export-gate5d-authentic-history.ps1') -ProjectRef ('a'*20) -ScopeAttestationPath $attestationPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'attestation'
  $checks.Add('legacy-token-and-broad-permission-rejection-without-network')

  [IO.File]::WriteAllBytes((Join-Path $tempRoot 'history.dpapi'),[byte[]](1,2,3))
  Expect-Failure { Unprotect-ForgeGate5DCapsule -Directory $tempRoot } 'hash mismatch'
  $checks.Add('interrupted-or-corrupt-capsule-rejection')
}
finally {
  [Environment]::SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',$savedToken,'Process')
  if ($payload) { [Array]::Clear($payload,0,$payload.Length) }
  if ($roundTrip) { [Array]::Clear($roundTrip,0,$roundTrip.Length) }
  if (Test-Path -LiteralPath $tempRoot) { Remove-ForgeGate5DCapsule -Directory $tempRoot }
}

[pscustomobject]@{
  ok=$true; schema='forge.gate5d-stage1-tooling-test.v1'; syntheticOnly=$true
  authenticRequestMade=$false; checks=@($checks); cleanupVerified=(-not (Test-Path -LiteralPath $tempRoot))
} | ConvertTo-Json -Depth 5 -Compress
